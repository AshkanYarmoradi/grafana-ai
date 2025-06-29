/**
 * Grafana API tools for the AI integration
 * Contains tool definitions for interacting with Grafana
 */
import {genkit, z} from 'genkit';
import {GrafanaApiError, grafanaApiRequest} from './grafanaApi';
import {logDebug} from './utils';

/**
 * Initialize genkit with plugins
 */
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
    plugins: [googleAI()],
});

/**
 * A tool to list all available datasources in Grafana.
 * The LLM will use this first to understand what data sources it can query.
 *
 * @returns {Promise<Array<DatasourceInfo>>} List of available datasources
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

            const result = datasources.map((datasource) => ({
                uid: datasource.uid,
                name: datasource.name,
                type: datasource.type,
            }));

            logDebug(`Found ${result.length} datasources`, result);
            return result;
        } catch (error) {
            if (error instanceof GrafanaApiError) {
                logDebug(`Failed to list Grafana datasources (Status: ${error.statusCode}, Endpoint: ${error.endpoint})`, error.message);
            } else {
                logDebug('Failed to list Grafana datasources', error);
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

        logDebug(`Executing query against datasource ${datasourceUid} (${datasourceType})`, {
            query: rawQuery,
            timeRange: {from, to}
        });

        // Determine the appropriate payload structure based on datasource type
        let querySpecificPayload;
        switch (datasourceType.toLowerCase()) {
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
                logDebug(`Unhandled datasource type '${datasourceType}'. Defaulting to 'expr' payload.`);
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

            logDebug('Query executed successfully', result.results);
            return result.results;
        } catch (error) {
            if (error instanceof GrafanaApiError) {
                logDebug(`Failed to query Grafana datasource (Status: ${error.statusCode}, Endpoint: ${error.endpoint})`, error.message);
            } else {
                logDebug('Failed to query Grafana datasource', error);
            }
            throw error; // Re-throw to allow proper error handling upstream
        }
    }
);
