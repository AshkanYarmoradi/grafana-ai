/**
 * Constants for the Grafana AI integration
 * Contains prompt templates and configuration values
 */

/**
 * Default time range values for Grafana queries
 */
export const DEFAULT_TIME_RANGE = {
    FROM: 'now-1h',
    TO: 'now',
};

/**
 * Model configuration for different tasks
 */
export const AI_MODELS = {
    // Main model for complex reasoning tasks (query generation requires high reasoning capabilities)
    REASONING: 'gemini-2.5-pro',

    // Model for data interpretation (using a more cost-effective model)
    INTERPRETATION: 'gemini-1.5-flash',
};

/**
 * Prompt templates for AI interactions
 */
export const PROMPT_TEMPLATES = {
    /**
     * Template for generating a query based on user question and available datasources
     */
    QUERY_GENERATION: `You are an expert in observability and query languages.
Question: "{{question}}"
Current time: {{currentTime}}
Available datasources: {{datasources}}

Task:
1. Choose the most appropriate datasource
2. Write a native query for the datasource type:
   - 'influxdb': InfluxQL/Flux
   - 'prometheus': PromQL
   - 'loki': LogQL
   - SQL types: SQL
3. Include time range if specified in question
4. Return ONLY a JSON with: uid, type, query, from (optional), to (optional)`,

    /**
     * Template for interpreting query results
     */
    RESULT_INTERPRETATION: `Question: "{{question}}"
Data: {{queryResult}}

Provide a concise, human-readable interpretation of this data to answer the question.
Focus on insights rather than raw numbers (e.g., "Average CPU: 85%" instead of just "85%").`,

    /**
     * Error messages for different scenarios
     */
    ERROR_MESSAGES: {
        NO_DATASOURCES: "I couldn't find any datasources in your Grafana instance.",
        QUERY_GENERATION_FAILED: "I couldn't generate a valid query for your question.",
        NO_DATA: "I was able to generate a query, but it returned no data from Grafana.",
        GENERAL_ERROR: "I encountered an error while trying to query your Grafana instance.",
        AUTH_ERROR: "I couldn't access your Grafana instance due to authentication issues. Please check your API key.",
        NOT_FOUND_ERROR: "The requested resource was not found in your Grafana instance.",
        SERVER_ERROR: "Your Grafana instance is experiencing server issues. Please try again later.",
    },
};
