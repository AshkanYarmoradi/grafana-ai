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
  return formatTemplate(PROMPT_TEMPLATES.QUERY_GENERATION, {
    question,
    currentTime: new Date().toISOString(),
    datasources: JSON.stringify(datasources, null, 2),
  });
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
  return formatTemplate(PROMPT_TEMPLATES.RESULT_INTERPRETATION, {
    question,
    queryResult: JSON.stringify(queryResult, null, 2),
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
  
  // Default error message
  return ERROR_MESSAGES.GENERAL_ERROR;
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