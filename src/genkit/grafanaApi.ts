/**
 * Custom error class for Grafana API errors.
 * Provides more context about the API error including status code.
 */
export class GrafanaApiError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly endpoint: string,
        message: string
    ) {
        super(message);
        this.name = 'GrafanaApiError';
    }
}

/**
 * Helper function for making authenticated requests to the Grafana API.
 * This centralizes API call logic, error handling, and authentication.
 * 
 * @template T - The expected return type of the API response
 * @param {string} endpoint - The Grafana API endpoint to call
 * @param {RequestInit} options - Fetch API options
 * @returns {Promise<T>} - Promise resolving to the typed API response
 * @throws {Error} - If environment variables are missing
 * @throws {GrafanaApiError} - If the API request fails
 */
export async function grafanaApiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = process.env.GRAFANA_URL;
    const apiKey = process.env.GRAFANA_API_KEY;

    if (!url) {
        throw new Error('GRAFANA_URL environment variable is not set.');
    }

    if (!apiKey) {
        throw new Error('GRAFANA_API_KEY environment variable is not set.');
    }

    try {
        const response = await fetch(`${url}${endpoint}`, {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Grafana API Error (${response.status}): ${errorText}`);
            throw new GrafanaApiError(
                response.status,
                endpoint,
                `Request failed with status ${response.status}: ${errorText}`
            );
        }

        return await response.json() as T;
    } catch (error) {
        // Re-throw GrafanaApiError instances
        if (error instanceof GrafanaApiError) {
            throw error;
        }

        // Convert other errors to GrafanaApiError with appropriate message
        if (error instanceof Error) {
            console.error(`Network or parsing error for ${endpoint}:`, error);
            throw new GrafanaApiError(0, endpoint, `Network or parsing error: ${error.message}`);
        }

        // Handle unknown error types
        throw new GrafanaApiError(0, endpoint, `Unknown error occurred: ${String(error)}`);
    }
}
