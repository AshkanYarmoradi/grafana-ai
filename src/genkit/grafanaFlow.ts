import {googleAI} from '@genkit-ai/googleai';
import {genkit, z} from 'genkit';
import {GrafanaApiError, grafanaApiRequest} from '@/genkit/grafanaApi';

const ai = genkit({
    plugins: [googleAI()],
});

/**
 * A tool to list all available datasources in Grafana.
 * The LLM will use this first to understand what data sources it can query.
 *
 * @returns {Promise<Array<{uid: string, name: string, type: string}>>} List of available datasources
 */
export const listDatasources = ai.defineTool(
    {
        name: 'grafanaListDatasources',
        description: 'Lists all available datasources in Grafana to find their name, type, and unique identifier (uid).',
        inputSchema: z.object({}), // No input needed
        outputSchema: z.array(z.object({
            uid: z.string(),
            name: z.string(),
            type: z.string(),
        })),
    },
    async () => {
        // API Reference: https://grafana.com/docs/grafana/latest/developers/http_api/data_source/#get-all-data-sources
        try {
            const datasources = await grafanaApiRequest<Array<{
                uid: string;
                name: string;
                type: string;
                [key: string]: unknown;
            }>>('/api/datasources');

            return datasources.map((datasource) => ({
                uid: datasource.uid,
                name: datasource.name,
                type: datasource.type,
            }));
        } catch (error) {
            if (error instanceof GrafanaApiError) {
                console.error(`Failed to list Grafana datasources (Status: ${error.statusCode}, Endpoint: ${error.endpoint}):`, error.message);
            } else {
                console.error('Failed to list Grafana datasources:', error);
            }
            return [];
        }
    }
);

/**
 * A tool to execute a query against a specific Grafana datasource.
 * The LLM will generate the `rawQuery` based on the datasource type.
 *
 * @returns {Promise<unknown>} Query results from the datasource
 */
export const queryDatasource = ai.defineTool(
    {
        name: 'grafanaQueryDatasource',
        description: 'Executes a query against a specific Grafana datasource using its uid. The query must be in the native language of the datasource (e.g., PromQL for Prometheus, SQL for PostgreSQL).',
        inputSchema: z.object({
            datasourceUid: z.string().describe('The unique identifier (uid) of the datasource to query.'),
            datasourceType: z.string().describe("The type of the datasource (e.g., 'influxdb', 'prometheus', 'postgres')."),
            rawQuery: z.string().describe('The native query string to execute (e.g., a valid PromQL or SQL query).'),
            from: z.string().optional().default('now-1h').describe("The start of the time range (e.g., 'now-6h', '2024-06-28T10:00:00.000Z'). Defaults to 'now-1h'."),
            to: z.string().optional().default('now').describe("The end of the time range (e.g., 'now'). Defaults to 'now'."),
        }),
        outputSchema: z.any(), // The output structure varies wildly between datasources.
    },
    async (params: {
        datasourceUid: string;
        datasourceType: string;
        rawQuery: string;
        from?: string;
        to?: string;
    }): Promise<unknown> => {
        const {datasourceUid, datasourceType, rawQuery, from, to} = params;

        let querySpecificPayload;
        switch (datasourceType) {
            case 'influxdb':
                querySpecificPayload = {query: rawQuery};
                break;
            case 'prometheus':
            case 'loki':
                querySpecificPayload = {expr: rawQuery};
                break;
            case 'postgres':
            case 'mysql':
            case 'mssql':
                querySpecificPayload = {rawSql: rawQuery};
                break;
            default:
                console.warn(`[queryDatasource] Unhandled datasource type '${datasourceType}'. Defaulting to 'expr' payload.`);
                querySpecificPayload = {expr: rawQuery};
                break;
        }

        // API Reference: https://grafana.com/docs/grafana/latest/developers/http_api/data_source/#query-a-data-source
        const queryBody = {
            from,
            to,
            queries: [
                {
                    ...querySpecificPayload,
                    datasource: {uid: datasourceUid},
                    expr: rawQuery,
                    rawSql: rawQuery,
                    refId: 'A',
                    maxDataPoints: 1000,
                },
            ],
        };

        try {
            const result = await grafanaApiRequest<{ results: unknown }>('/api/ds/query', {
                method: 'POST',
                body: JSON.stringify(queryBody),
            });

            return result.results;
        } catch (error) {
            if (error instanceof GrafanaApiError) {
                console.error(`Failed to query Grafana datasource (Status: ${error.statusCode}, Endpoint: ${error.endpoint}):`, error.message);
            } else {
                console.error('Failed to query Grafana datasource:', error);
            }
            throw error; // Re-throw to allow proper error handling upstream
        }
    }
);

/**
 * Main flow for processing Grafana queries using AI.
 * This flow discovers datasources, generates appropriate queries,
 * executes them, and provides a human-readable interpretation of the results.
 */
export const grafanaFlow = ai.defineFlow(
    {
        name: 'grafanaFlow',
        inputSchema: z.object({question: z.string()}),
        outputSchema: z.object({answer: z.string()}),
        streamSchema: z.string(),
    },
    async (
        input: { question: string },
        context: { sendChunk: (chunk: string) => void }
    ): Promise<{ answer: string }> => {
        const {question} = input;
        const {sendChunk} = context;

        // Step 1: Discover available datasources
        const datasourcesResponse = await listDatasources.run({});
        const availableDatasources = datasourcesResponse?.result || [];

        if (availableDatasources.length === 0) {
            sendChunk("I couldn't find any datasources in your Grafana instance.");
            return {answer: "No datasources available in your Grafana instance."};
        }

        console.log(`[Flow] Found ${availableDatasources.length} available datasources:`, availableDatasources);

        // Step 2: Use an LLM to reason about which datasource to use and generate a query
        // We provide the LLM with the user's question and the list of datasources
        // We ask it to output a structured JSON object, which Genkit validates with Zod
        const generateResponse = await ai.generate({
            model: googleAI.model('gemini-2.5-pro'),
            prompt: [
                `You are an expert in observability and query languages.
                A user wants to answer the following question: "${question}"
                
                The current time is ${new Date().toISOString()}.
                
                Here are the available Grafana datasources:
                ${JSON.stringify(availableDatasources, null, 2)}
                
                Your task is to:
                1. Choose the single most appropriate datasource to answer the question.
                2. Based on the datasource's 'type', formulate a native query to answer the question.
                   - For type 'influxdb', you MUST write a valid InfluxQL or Flux query.
                   - For type 'prometheus', you MUST write a valid PromQL query.
                   - For type 'loki', you MUST write a valid LogQL query.
                   - For SQL types like 'postgres', you MUST write a valid SQL query.
                3. If the user's question implies a time range (e.g., "in the last 3 hours", "yesterday"), determine the 'from' and 'to' values. Otherwise, you can omit them to use the default time range.
                4. Respond with ONLY a valid JSON object containing the 'uid' and 'type' of the selected datasource, the generated 'query', and optional 'from' and 'to' fields.`
            ].join('\n'),
            tools: [listDatasources, queryDatasource],
            output: {
                schema: z.object({
                    uid: z.string().describe('The uid of the selected datasource.'),
                    query: z.string().describe('The generated native query string.'),
                    type: z.string().describe("The type of the datasource (e.g., 'influxdb', 'prometheus', 'postgres')."),
                    from: z.string().optional().describe("The start of the time range if specified in the user's question."),
                    to: z.string().optional().describe("The end of the time range if specified in the user's question."),
                }),
            },
        });

        // Handle potential null output
        if (!generateResponse.output) {
            sendChunk("I couldn't generate a valid query for your question.");
            return {answer: "Failed to generate a query for your question."};
        }

        const {uid, query, type, from = 'now-1h', to = 'now'} = generateResponse.output;

        console.log(`[Flow] LLM decided to use datasource '${uid}' with query: ${query} (type: ${type})`);

        // Step 3: Execute the query against the selected datasource
        try {
            const queryResult = await queryDatasource.run({
                datasourceUid: uid,
                datasourceType: type,
                rawQuery: query,
                from,
                to,
            });

            if (!queryResult) {
                const noDataMessage = "I was able to generate a query, but it returned no data from Grafana.";
                sendChunk(noDataMessage);
                return {answer: noDataMessage};
            }

            // Step 4: Use the LLM to summarize the raw data into a human-readable answer
            const streamResponse = ai.generateStream({
                model: googleAI.model('gemini-2.5-pro'),
                prompt: [
                    `Original question: "${question}"`,
                    ``,
                    `I executed a query and got the following raw data from Grafana:`,
                    `${JSON.stringify(queryResult, null, 2)}`,
                    ``,
                    `Please summarize this data and provide a clear, concise, human-readable answer to the original question.`,
                    `Do not just repeat the data; interpret it. For example, instead of returning a single number,`,
                    `say "The average CPU usage was 85%."`
                ].join('\n'),
            });

            // Stream the response chunks to the client
            for await (const chunk of streamResponse.stream) {
                sendChunk(chunk.text);
            }

            const finalResponse = await streamResponse.response;
            return {answer: finalResponse.text};
        } catch (error) {
            let errorMessage = "I encountered an error while trying to query your Grafana instance.";

            if (error instanceof GrafanaApiError) {
                console.error(`Grafana API Error (Status: ${error.statusCode}, Endpoint: ${error.endpoint}):`, error.message);

                // Provide more specific error messages based on status code
                if (error.statusCode === 401 || error.statusCode === 403) {
                    errorMessage = "I couldn't access your Grafana instance due to authentication issues. Please check your API key.";
                } else if (error.statusCode === 404) {
                    errorMessage = "The requested resource was not found in your Grafana instance.";
                } else if (error.statusCode >= 500) {
                    errorMessage = "Your Grafana instance is experiencing server issues. Please try again later.";
                }
            } else {
                console.error('Error executing Grafana query:', error);
            }

            sendChunk(errorMessage);
            return {answer: errorMessage};
        }
    }
);
