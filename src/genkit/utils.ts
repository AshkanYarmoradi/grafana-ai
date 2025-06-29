/**
 * Utility functions for the Grafana AI integration
 */
import { PROMPT_TEMPLATES } from './constants';

/**
 * Interface for datasource information
 */
export interface DatasourceInfo {
  uid: string;
  name: string;
  type: string;
}

/**
 * Interface for query parameters
 */
export interface QueryParams {
  datasourceUid: string;
  datasourceType: string;
  rawQuery: string;
  from?: string;
  to?: string;
}

/**
 * Interface for query generation output
 */
export interface QueryGenerationOutput {
  uid: string;
  query: string;
  type: string;
  from?: string;
  to?: string;
}

/**
 * Replaces placeholders in a template string with actual values
 * 
 * @param template - The template string with placeholders
 * @param replacements - Object containing key-value pairs for replacements
 * @returns The template with placeholders replaced by actual values
 */
export function formatTemplate(
  template: string,
  replacements: Record<string, string>
): string {
  let result = template;

  // Replace each placeholder with its corresponding value
  Object.entries(replacements).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, 'g'), value);
  });

  return result;
}

/**
 * Simplifies datasource information to reduce token usage
 * 
 * @param datasources - Full datasource information
 * @returns Simplified datasource information with only essential fields
 */
function simplifyDatasources(datasources: DatasourceInfo[]): Pick<DatasourceInfo, 'uid' | 'name' | 'type'>[] {
  return datasources.map(({ uid, name, type }) => ({ uid, name, type }));
}

/**
 * Formats the query generation prompt with the provided data
 * 
 * @param question - The user's question
 * @param datasources - Available Grafana datasources
 * @returns Formatted prompt for query generation
 */
export function formatQueryGenerationPrompt(
  question: string,
  datasources: DatasourceInfo[]
): string {
  // Simplify datasources to reduce token usage
  const simplifiedDatasources = simplifyDatasources(datasources);

  return formatTemplate(PROMPT_TEMPLATES.QUERY_GENERATION, {
    question,
    currentTime: new Date().toISOString(),
    // Use compact JSON formatting to reduce token usage
    datasources: JSON.stringify(simplifiedDatasources),
  });
}

/**
 * Simplifies query results to reduce token usage
 * 
 * @param queryResult - The raw query result from Grafana
 * @returns Simplified query result with only essential data
 */
function simplifyQueryResult(queryResult: unknown): unknown {
  if (!queryResult) {
    return null;
  }

  // If it's an array, process each item
  if (Array.isArray(queryResult)) {
    // If it's a large array, limit the number of items
    if (queryResult.length > 20) {
      const omittedCount = queryResult.length - 20;
      return queryResult.slice(0, 20).concat([{ note: `...${omittedCount} more items omitted...` }]);
    }
    return queryResult;
  }

  // If it's an object, process its properties
  if (typeof queryResult === 'object' && queryResult !== null) {
    const result: Record<string, unknown> = {};

    // Process each property of the object
    for (const [key, value] of Object.entries(queryResult)) {
      // If a property is an array, apply the same truncation logic
      if (Array.isArray(value) && value.length > 20) {
        const omittedCount = value.length - 20;
        result[key] = value.slice(0, 20).concat([{ note: `...${omittedCount} more items omitted...` }]);
      } else {
        // Recursively process nested objects
        result[key] = simplifyQueryResult(value);
      }
    }

    return result;
  }

  return queryResult;
}

/**
 * Formats the result interpretation prompt with the provided data
 * 
 * @param question - The original user question
 * @param queryResult - The raw query result from Grafana
 * @returns Formatted prompt for result interpretation
 */
export function formatResultInterpretationPrompt(
  question: string,
  queryResult: unknown
): string {
  // Simplify query result to reduce token usage
  const simplifiedResult = simplifyQueryResult(queryResult);

  return formatTemplate(PROMPT_TEMPLATES.RESULT_INTERPRETATION, {
    question,
    // Use compact JSON formatting to reduce token usage
    queryResult: JSON.stringify(simplifiedResult),
  });
}

/**
 * Gets the appropriate error message based on the error
 * 
 * @param error - The error that occurred
 * @returns An appropriate error message for the user
 */
export function getErrorMessage(error: unknown): string {
  const { ERROR_MESSAGES } = PROMPT_TEMPLATES;

  // Extract error message if available
  let errorMessage = '';
  if (error instanceof Error) {
    errorMessage = `Error: ${error.message}`;
  } else if (error && typeof error === 'object' && 'message' in error) {
    errorMessage = `Error: ${(error as { message: string }).message}`;
  }

  // Handle GrafanaApiError specifically if it's imported and used
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = (error as { statusCode: number }).statusCode;

    if (statusCode === 401 || statusCode === 403) {
      return ERROR_MESSAGES.AUTH_ERROR;
    } else if (statusCode === 404) {
      return ERROR_MESSAGES.NOT_FOUND_ERROR;
    } else if (statusCode >= 500) {
      return ERROR_MESSAGES.SERVER_ERROR;
    }
  }

  // Return the error message if available, otherwise use the default error message
  return errorMessage || ERROR_MESSAGES.GENERAL_ERROR;
}

/**
 * Logs a message with optional data for debugging
 * 
 * @param message - The message to log
 * @param data - Optional data to include in the log
 */
export function logDebug(message: string, data?: unknown): void {
  console.log(`[Grafana AI] ${message}`, data || '');
}
