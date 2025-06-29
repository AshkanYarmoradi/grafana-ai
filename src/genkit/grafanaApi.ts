/**
 * Enum representing different types of Grafana API errors
 */
export enum GrafanaErrorType {
  AUTHENTICATION = 'AUTHENTICATION_ERROR',
  AUTHORIZATION = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND_ERROR',
  VALIDATION = 'VALIDATION_ERROR',
  SERVER = 'SERVER_ERROR',
  NETWORK = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT_ERROR',
  UNKNOWN = 'UNKNOWN_ERROR',
}

/**
 * Custom error class for Grafana API errors.
 * Provides detailed context about the API error including status code, endpoint, and error type.
 */
export class GrafanaApiError extends Error {
  /**
   * Creates a new GrafanaApiError instance
   * 
   * @param statusCode - HTTP status code of the error response
   * @param endpoint - The API endpoint that was called
   * @param message - Detailed error message
   * @param type - Type of error that occurred
   * @param cause - The original error that caused this error (if any)
   */
  constructor(
    public readonly statusCode: number,
    public readonly endpoint: string,
    message: string,
    public readonly type: GrafanaErrorType = GrafanaErrorType.UNKNOWN,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'GrafanaApiError';

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GrafanaApiError);
    }
  }
}

/**
 * Configuration options for Grafana API requests
 */
export interface GrafanaApiOptions extends RequestInit {
  /**
   * Request timeout in milliseconds (default: 30000ms)
   */
  timeoutMs?: number;

  /**
   * Maximum number of retry attempts for failed requests (default: 3)
   */
  maxRetries?: number;

  /**
   * Base delay between retries in milliseconds (default: 1000ms)
   * Actual delay uses exponential backoff: baseRetryDelayMs * (2 ^ retryAttempt)
   */
  baseRetryDelayMs?: number;

  /**
   * Whether to log request details (default: false)
   */
  enableLogging?: boolean;
}

/**
 * Default configuration for Grafana API requests
 */
const DEFAULT_API_OPTIONS: Required<Pick<GrafanaApiOptions, 'timeoutMs' | 'maxRetries' | 'baseRetryDelayMs' | 'enableLogging'>> = {
  timeoutMs: 30000,
  maxRetries: 3,
  baseRetryDelayMs: 1000,
  enableLogging: false,
};

/**
 * Validates that required environment variables are set
 * 
 * @returns Object containing validated environment variables
 * @throws Error if required environment variables are missing
 */
function validateEnvironment(): { 
  url: string; 
  authHeader: string;
} {
  const url = process.env.GRAFANA_URL?.trim();
  const apiKey = process.env.GRAFANA_API_KEY?.trim();
  const username = process.env.GRAFANA_USERNAME?.trim();
  const password = process.env.GRAFANA_PASSWORD?.trim();

  // Validate URL
  if (!url) {
    throw new Error('GRAFANA_URL must be set in your environment.');
  }

  // Ensure URL ends with a slash if it doesn't already
  const normalizedUrl = url.endsWith('/') ? url : `${url}/`;

  // Determine authentication method
  let authHeader: string;

  if (apiKey) {
    // Priority 1: Use API Key if it exists
    authHeader = `Bearer ${apiKey}`;
  } else if (username && password) {
    // Priority 2: Use Basic Auth if username and password exist
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    authHeader = `Basic ${credentials}`;
  } else {
    // No valid authentication method found
    throw new GrafanaApiError(
      401,
      'authentication',
      'Grafana authentication credentials not found. Please set either GRAFANA_API_KEY or both GRAFANA_USERNAME and GRAFANA_PASSWORD in your environment.',
      GrafanaErrorType.AUTHENTICATION
    );
  }

  return { url: normalizedUrl, authHeader };
}

/**
 * Safely logs API request information if logging is enabled
 * 
 * @param message - The message to log
 * @param data - Additional data to log (will be sanitized)
 * @param enableLogging - Whether logging is enabled
 */
function safeLog(message: string, data: Record<string, any> = {}, enableLogging = false): void {
  if (!enableLogging) return;

  // Create a sanitized copy of the data to avoid logging sensitive information
  const sanitizedData = { ...data };

  // Remove sensitive information from headers if present
  if (sanitizedData.headers) {
    const sanitizedHeaders = { ...sanitizedData.headers };
    if (sanitizedHeaders.Authorization) {
      sanitizedHeaders.Authorization = '[REDACTED]';
    }
    if (sanitizedHeaders.authorization) {
      sanitizedHeaders.authorization = '[REDACTED]';
    }
    sanitizedData.headers = sanitizedHeaders;
  }

  // Log the message and sanitized data
  console.log(`[Grafana API] ${message}`, sanitizedData);
}

/**
 * Determines if a request should be retried based on the error and attempt count
 * 
 * @param error - The error that occurred
 * @param attemptCount - The current attempt count
 * @param maxRetries - The maximum number of retries allowed
 * @returns Whether the request should be retried
 */
function shouldRetry(error: Error, attemptCount: number, maxRetries: number): boolean {
  // Don't retry if we've reached the maximum number of retries
  if (attemptCount >= maxRetries) {
    return false;
  }

  // Retry network errors
  if (error instanceof TypeError && error.message.includes('network')) {
    return true;
  }

  // Retry timeout errors
  if (error.name === 'AbortError') {
    return true;
  }

  // Retry certain HTTP status codes
  if (error instanceof GrafanaApiError) {
    // Retry server errors (5xx) and rate limiting (429)
    return error.statusCode >= 500 || error.statusCode === 429;
  }

  return false;
}

/**
 * Helper function for making authenticated requests to the Grafana API with improved error handling,
 * request timeouts, and retry logic.
 *
 * @template T - The expected return type of the API response
 * @param endpoint - The Grafana API endpoint to call (should not include the base URL)
 * @param options - Extended fetch API options including timeout and retry configuration
 * @returns Promise resolving to the typed API response
 * @throws GrafanaApiError - If the API request fails after all retry attempts
 */
export async function grafanaApiRequest<T>(
  endpoint: string, 
  options: GrafanaApiOptions = {}
): Promise<T> {
  // Validate endpoint parameter
  if (!endpoint || typeof endpoint !== 'string') {
    throw new Error('Endpoint must be a non-empty string');
  }

  // Normalize endpoint to ensure it starts with a slash if it doesn't already
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;

  // Extract and merge options with defaults
  const {
    timeoutMs = DEFAULT_API_OPTIONS.timeoutMs,
    maxRetries = DEFAULT_API_OPTIONS.maxRetries,
    baseRetryDelayMs = DEFAULT_API_OPTIONS.baseRetryDelayMs,
    enableLogging = DEFAULT_API_OPTIONS.enableLogging,
    ...fetchOptions
  } = options;

  try {
    // Validate environment variables and get authentication header
    const { url, authHeader } = validateEnvironment();

    // Prepare full request URL
    const requestUrl = `${url}${normalizedEndpoint}`;

    // Log request details if logging is enabled
    safeLog('Making request', { 
      url: requestUrl, 
      method: fetchOptions.method || 'GET',
      timeout: timeoutMs,
      maxRetries
    }, enableLogging);

    // Implement retry logic
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        // If this is a retry, log the retry attempt
        if (attempt > 0) {
          const delay = baseRetryDelayMs * Math.pow(2, attempt - 1);
          safeLog(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay`, {}, enableLogging);

          // Wait before retrying with exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Make the request with timeout
        const response = await fetch(requestUrl, {
          ...fetchOptions,
          headers: {
            ...fetchOptions.headers,
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });

        // Clear the timeout
        clearTimeout(timeoutId);

        // Handle error responses
        if (!response.ok) {
          const errorText = await response.text();

          // Determine error type based on status code
          let errorType = GrafanaErrorType.UNKNOWN;
          if (response.status === 401) {
            errorType = GrafanaErrorType.AUTHENTICATION;
          } else if (response.status === 403) {
            errorType = GrafanaErrorType.AUTHORIZATION;
          } else if (response.status === 404) {
            errorType = GrafanaErrorType.NOT_FOUND;
          } else if (response.status === 400 || response.status === 422) {
            errorType = GrafanaErrorType.VALIDATION;
          } else if (response.status >= 500) {
            errorType = GrafanaErrorType.SERVER;
          }

          // Log error details if logging is enabled
          safeLog(`Request failed with status ${response.status}`, { 
            endpoint: normalizedEndpoint, 
            status: response.status,
            error: errorText
          }, enableLogging);

          throw new GrafanaApiError(
            response.status,
            normalizedEndpoint,
            `Request failed with status ${response.status}: ${errorText}`,
            errorType
          );
        }

        // Parse and return the response
        const data = await response.json();

        // Log success if logging is enabled
        safeLog('Request successful', { endpoint: normalizedEndpoint }, enableLogging);

        return data as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // If this is a timeout error, convert it to a GrafanaApiError
        if (lastError.name === 'AbortError') {
          lastError = new GrafanaApiError(
            408, // Request Timeout
            normalizedEndpoint,
            `Request timed out after ${timeoutMs}ms`,
            GrafanaErrorType.TIMEOUT,
            lastError
          );
        }

        // If this is a network error, convert it to a GrafanaApiError
        if (lastError instanceof TypeError && lastError.message.includes('network')) {
          lastError = new GrafanaApiError(
            0, // No status code for network errors
            normalizedEndpoint,
            `Network error: ${lastError.message}`,
            GrafanaErrorType.NETWORK,
            lastError
          );
        }

        // Check if we should retry
        if (shouldRetry(lastError, attempt, maxRetries)) {
          // Continue to next iteration for retry
          continue;
        }

        // If we shouldn't retry, rethrow the error
        throw lastError;
      }
    }

    // This should never be reached due to the throw in the loop,
    // but TypeScript requires a return statement
    throw lastError;
  } catch (error) {
    // Ensure all errors are properly wrapped as GrafanaApiError
    if (error instanceof GrafanaApiError) {
      throw error;
    }

    // Convert generic errors to GrafanaApiError
    throw new GrafanaApiError(
      500,
      normalizedEndpoint,
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      GrafanaErrorType.UNKNOWN,
      error instanceof Error ? error : undefined
    );
  }
}
