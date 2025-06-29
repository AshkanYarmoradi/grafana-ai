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
  // Main model for complex reasoning tasks
  REASONING: 'gemini-2.5-pro',
  
  // Model for data interpretation (can be the same or a smaller model if appropriate)
  INTERPRETATION: 'gemini-2.5-pro',
};

/**
 * Prompt templates for AI interactions
 */
export const PROMPT_TEMPLATES = {
  /**
   * Template for generating a query based on user question and available datasources
   */
  QUERY_GENERATION: `You are an expert in observability and query languages.
A user wants to answer the following question: "{{question}}"

The current time is {{currentTime}}.

Here are the available Grafana datasources:
{{datasources}}

Your task is to:
1. Choose the single most appropriate datasource to answer the question.
2. Based on the datasource's 'type', formulate a native query to answer the question.
   - For type 'influxdb', you MUST write a valid InfluxQL or Flux query.
   - For type 'prometheus', you MUST write a valid PromQL query.
   - For type 'loki', you MUST write a valid LogQL query.
   - For SQL types like 'postgres', you MUST write a valid SQL query.
3. If the user's question implies a time range (e.g., "in the last 3 hours", "yesterday"), determine the 'from' and 'to' values. Otherwise, you can omit them to use the default time range.
4. Respond with ONLY a valid JSON object containing the 'uid' and 'type' of the selected datasource, the generated 'query', and optional 'from' and 'to' fields.`,

  /**
   * Template for interpreting query results
   */
  RESULT_INTERPRETATION: `Original question: "{{question}}"

I executed a query and got the following raw data from Grafana:
{{queryResult}}

Please summarize this data and provide a clear, concise, human-readable answer to the original question.
Do not just repeat the data; interpret it. For example, instead of returning a single number,
say "The average CPU usage was 85%."`,

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