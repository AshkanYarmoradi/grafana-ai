/**
 * Grafana AI Flow
 * 
 * This module implements the main flow for processing Grafana queries using AI.
 * It discovers datasources, generates appropriate queries, executes them,
 * and provides a human-readable interpretation of the results.
 */
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { GrafanaApiError } from './grafanaApi';
import { AI_MODELS, DEFAULT_TIME_RANGE, PROMPT_TEMPLATES } from './constants';
import {
  formatQueryGenerationPrompt, 
  formatResultInterpretationPrompt, 
  getErrorMessage, 
  logDebug 
} from './utils';
import { ai, listDatasources, queryDatasource } from './tools';

/**
 * Main flow for processing Grafana queries using AI.
 * This flow discovers datasources, generates appropriate queries,
 * executes them, and provides a human-readable interpretation of the results.
 */
export const grafanaFlow = ai.defineFlow(
  {
    name: 'grafanaFlow',
    inputSchema: z.object({ question: z.string() }),
    outputSchema: z.object({ answer: z.string() }),
    streamSchema: z.string(),
  },
  async (
    input: { question: string },
    context: { sendChunk: (chunk: string) => void }
  ): Promise<{ answer: string }> => {
    const { question } = input;
    const { sendChunk } = context;

    logDebug('Starting Grafana AI flow', { question });

    try {
      // Step 1: Discover available datasources
      const datasourcesResult = await discoverDatasources(sendChunk);
      if (!datasourcesResult.success) {
        return { answer: datasourcesResult.message };
      }

      // Step 2: Generate a query for the appropriate datasource
      const queryGenerationResult = await generateQuery(question, datasourcesResult.datasources!, sendChunk);
      if (!queryGenerationResult.success) {
        return { answer: queryGenerationResult.message };
      }

      // Step 3: Execute the query against the selected datasource
      const queryExecutionResult = await executeQuery(queryGenerationResult.queryParams!, sendChunk);
      if (!queryExecutionResult.success) {
        return { answer: queryExecutionResult.message };
      }

      // Step 4: Interpret the results
      return await interpretResults(question, queryExecutionResult.data, sendChunk);
    } catch (error) {
      logDebug('Unexpected error in Grafana AI flow', error);
      const errorMessage = getErrorMessage(error);
      sendChunk(errorMessage);
      return { answer: errorMessage };
    }
  }
);

/**
 * Discovers available datasources in Grafana
 * 
 * @param sendChunk - Function to send streaming chunks to the client
 * @returns Object containing success status, message, and datasources if successful
 */
async function discoverDatasources(
  sendChunk: (chunk: string) => void
): Promise<{ 
  success: boolean; 
  message: string; 
  datasources?: Array<{ uid: string; name: string; type: string }> 
}> {
  try {
    const datasourcesResponse = await listDatasources.run({});
    const availableDatasources = datasourcesResponse?.result || [];

    if (availableDatasources.length === 0) {
      const message = PROMPT_TEMPLATES.ERROR_MESSAGES.NO_DATASOURCES;
      sendChunk(message);
      return { success: false, message };
    }

    logDebug(`Found ${availableDatasources.length} available datasources`, availableDatasources);
    return { 
      success: true, 
      message: 'Datasources found', 
      datasources: availableDatasources 
    };
  } catch (error) {
    logDebug('Error discovering datasources', error);
    const errorMessage = getErrorMessage(error);
    sendChunk(errorMessage);
    return { success: false, message: errorMessage };
  }
}

/**
 * Generates a query for the appropriate datasource based on the user's question
 * 
 * @param question - The user's question
 * @param datasources - Available Grafana datasources
 * @param sendChunk - Function to send streaming chunks to the client
 * @returns Object containing success status, message, and query parameters if successful
 */
async function generateQuery(
  question: string,
  datasources: Array<{ uid: string; name: string; type: string }>,
  sendChunk: (chunk: string) => void
): Promise<{ 
  success: boolean; 
  message: string; 
  queryParams?: { 
    datasourceUid: string; 
    datasourceType: string; 
    rawQuery: string; 
    from: string; 
    to: string; 
  } 
}> {
  try {
    // Format the prompt with the user's question and available datasources
    const prompt = formatQueryGenerationPrompt(question, datasources);

    // Generate a query using the AI model
    const generateResponse = await ai.generate({
      model: googleAI.model(AI_MODELS.REASONING),
      prompt,
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
      const message = PROMPT_TEMPLATES.ERROR_MESSAGES.QUERY_GENERATION_FAILED;
      sendChunk(message);
      return { success: false, message };
    }

    // Extract the query parameters
    const { uid, query, type, from = DEFAULT_TIME_RANGE.FROM, to = DEFAULT_TIME_RANGE.TO } = generateResponse.output;

    logDebug(`Generated query for datasource '${uid}'`, { 
      datasourceType: type, 
      query, 
      timeRange: { from, to } 
    });

    return { 
      success: true, 
      message: 'Query generated successfully', 
      queryParams: { 
        datasourceUid: uid, 
        datasourceType: type, 
        rawQuery: query, 
        from, 
        to 
      } 
    };
  } catch (error) {
    logDebug('Error generating query', error);
    const errorMessage = getErrorMessage(error);
    sendChunk(errorMessage);
    return { success: false, message: errorMessage };
  }
}

/**
 * Executes a query against the selected datasource
 * 
 * @param queryParams - Parameters for the query
 * @param sendChunk - Function to send streaming chunks to the client
 * @returns Object containing success status, message, and query results if successful
 */
async function executeQuery(
  queryParams: { 
    datasourceUid: string; 
    datasourceType: string; 
    rawQuery: string; 
    from: string; 
    to: string; 
  },
  sendChunk: (chunk: string) => void
): Promise<{ 
  success: boolean; 
  message: string; 
  data?: unknown 
}> {
  try {
    const queryResult = await queryDatasource.run(queryParams);

    if (!queryResult) {
      const message = PROMPT_TEMPLATES.ERROR_MESSAGES.NO_DATA;
      sendChunk(message);
      return { success: false, message };
    }

    logDebug('Query executed successfully', queryResult);
    return { success: true, message: 'Query executed successfully', data: queryResult };
  } catch (error) {
    logDebug('Error executing query', error);

    let errorMessage = PROMPT_TEMPLATES.ERROR_MESSAGES.GENERAL_ERROR;

    if (error instanceof GrafanaApiError) {
      logDebug(`Grafana API Error (Status: ${error.statusCode}, Endpoint: ${error.endpoint})`, error.message);

      // Provide more specific error messages based on status code
      if (error.statusCode === 401 || error.statusCode === 403) {
        errorMessage = PROMPT_TEMPLATES.ERROR_MESSAGES.AUTH_ERROR;
      } else if (error.statusCode === 404) {
        errorMessage = PROMPT_TEMPLATES.ERROR_MESSAGES.NOT_FOUND_ERROR;
      } else if (error.statusCode >= 500) {
        errorMessage = PROMPT_TEMPLATES.ERROR_MESSAGES.SERVER_ERROR;
      }
    }

    sendChunk(errorMessage);
    return { success: false, message: errorMessage };
  }
}

/**
 * Interprets the query results and provides a human-readable answer
 * 
 * @param question - The original user question
 * @param queryResult - The raw query result from Grafana
 * @param sendChunk - Function to send streaming chunks to the client
 * @returns Object containing the final answer
 */
async function interpretResults(
  question: string,
  queryResult: unknown,
  sendChunk: (chunk: string) => void
): Promise<{ answer: string }> {
  try {
    // Format the prompt with the original question and query results
    const prompt = formatResultInterpretationPrompt(question, queryResult);

    // Generate a streaming response to interpret the results
    const streamResponse = ai.generateStream({
      model: googleAI.model(AI_MODELS.INTERPRETATION),
      prompt,
    });

    // Stream the response chunks to the client
    let fullResponse = '';
    for await (const chunk of streamResponse.stream) {
      sendChunk(chunk.text);
      fullResponse += chunk.text;
    }

    // Get the final response
    const finalResponse = await streamResponse.response;
    return { answer: finalResponse.text || fullResponse };
  } catch (error) {
    logDebug('Error interpreting results', error);
    const errorMessage = getErrorMessage(error);
    sendChunk(errorMessage);
    return { answer: errorMessage };
  }
}

// Re-export the googleAI object for use in other modules
export { googleAI };
