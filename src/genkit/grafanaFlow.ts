/**
 * Grafana AI Flow
 *
 * This module implements the main flow for processing Grafana queries using AI.
 * It discovers dashboards, retrieves dashboard details, gets panel data,
 * and provides a human-readable interpretation of the results.
 *
 * Based on: https://last9.io/blog/getting-started-with-the-grafana-api/
 *
 * Optimized for cost efficiency with:
 * - Dashboard caching to reduce API calls
 * - Model selection based on task complexity
 * - Optimized prompts to reduce token usage
 */
import {z} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import {GrafanaApiError} from './grafanaApi';
import {AI_MODELS, DEFAULT_TIME_RANGE, PROMPT_TEMPLATES} from './constants';
import {formatPanelSelectionPrompt, formatResultInterpretationPrompt, getErrorMessage, logDebug} from './utils';
import {ai, listDashboards, getDashboard, getDashboardPanelData} from './tools';

// Cache for dashboards to avoid redundant API calls
let dashboardsCache: Array<{ uid: string; title: string; url: string; folderUid?: string; folderTitle?: string; tags?: string[] }> | null = null;
let dashboardsCacheExpiry: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Cache for dashboard details to avoid redundant API calls
const dashboardDetailsCache = new Map<string, any>();
let dashboardDetailsCacheExpiry: number = 0;

/**
 * Main flow for processing Grafana queries using AI.
 * This flow discovers dashboards, selects appropriate panels,
 * retrieves panel data, and provides a human-readable interpretation of the results.
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

        logDebug('Starting Grafana AI flow', {question});

        try {
            // Step 1: Discover available dashboards
            const dashboardsResult = await discoverDashboards(sendChunk);
            if (!dashboardsResult.success) {
                return {answer: dashboardsResult.message};
            }

            // Step 2: Select the appropriate dashboard panel
            const panelSelectionResult = await selectDashboardPanel(question, dashboardsResult.dashboards!, sendChunk);
            if (!panelSelectionResult.success) {
                return {answer: panelSelectionResult.message};
            }

            // Step 3: Get data from the selected dashboard panel
            const panelDataResult = await getPanelData(panelSelectionResult.panelParams!, sendChunk);
            if (!panelDataResult.success) {
                return {answer: panelDataResult.message};
            }

            // Step 4: Interpret the results
            return await interpretResults(question, panelDataResult.data, sendChunk);
        } catch (error) {
            logDebug('Unexpected error in Grafana AI flow', error);
            const errorMessage = getErrorMessage(error);
            sendChunk(errorMessage);
            return {answer: errorMessage};
        }
    }
);

/**
 * Discovers available dashboards in Grafana
 * Uses caching to avoid redundant API calls
 *
 * @param sendChunk - Function to send streaming chunks to the client
 * @returns Object containing success status, message, and dashboards if successful
 */
async function discoverDashboards(
    sendChunk: (chunk: string) => void
): Promise<{
    success: boolean;
    message: string;
    dashboards?: Array<{ uid: string; title: string; url: string; folderUid?: string; folderTitle?: string; tags?: string[] }>
}> {
    try {
        // Check if we have a valid cache
        const now = Date.now();
        if (dashboardsCache && now < dashboardsCacheExpiry) {
            logDebug(`Using cached dashboards (${dashboardsCache.length} items)`);

            if (dashboardsCache.length === 0) {
                const message = "I couldn't find any dashboards in your Grafana instance.";
                sendChunk(message);
                return {success: false, message};
            }

            return {
                success: true,
                message: 'Dashboards found (cached)',
                dashboards: dashboardsCache
            };
        }

        // Cache miss or expired, fetch from API
        const dashboardsResponse = await listDashboards.run({});
        const availableDashboards = dashboardsResponse?.result || [];

        // Update cache
        dashboardsCache = availableDashboards;
        dashboardsCacheExpiry = now + CACHE_TTL_MS;

        if (availableDashboards.length === 0) {
            const message = "I couldn't find any dashboards in your Grafana instance.";
            sendChunk(message);
            return {success: false, message};
        }

        logDebug(`Found ${availableDashboards.length} available dashboards`, availableDashboards);
        return {
            success: true,
            message: 'Dashboards found',
            dashboards: availableDashboards
        };
    } catch (error) {
        logDebug('Error discovering dashboards', error);
        const errorMessage = getErrorMessage(error);
        sendChunk(errorMessage);
        return {success: false, message: errorMessage};
    }
}

/**
 * Selects the appropriate dashboard panel based on the user's question
 *
 * @param question - The user's question
 * @param dashboards - Available Grafana dashboards
 * @param sendChunk - Function to send streaming chunks to the client
 * @returns Object containing success status, message, and panel parameters if successful
 */
async function selectDashboardPanel(
    question: string,
    dashboards: Array<{ uid: string; title: string; url: string; folderUid?: string; folderTitle?: string; tags?: string[] }>,
    sendChunk: (chunk: string) => void
): Promise<{
    success: boolean;
    message: string;
    panelParams?: {
        dashboardUid: string;
        panelId: number;
        from: string;
        to: string;
    }
}> {
    try {
        // Format the prompt with the user's question and available dashboards
        const prompt = formatPanelSelectionPrompt(question, dashboards);

        logDebug('Selecting dashboard panel using model', AI_MODELS.INTERPRETATION);

        // First, have the AI select the most appropriate dashboard
        const dashboardSelectionResponse = await ai.generate({
            model: googleAI.model(AI_MODELS.INTERPRETATION),
            prompt,
            tools: [listDashboards, getDashboard],
            // Set a reasonable maximum output tokens to control costs
            maxOutputTokens: 1500,
            output: {
                schema: z.object({
                    dashboardUid: z.string().describe('The uid of the selected dashboard.'),
                    dashboardTitle: z.string().optional().describe('The title of the selected dashboard.'),
                    panelId: z.number().describe('The ID of the selected panel within the dashboard.'),
                    panelTitle: z.string().optional().describe('The title of the selected panel.'),
                    from: z.string().optional().describe("The start of the time range if specified in the user's question."),
                    to: z.string().optional().describe("The end of the time range if specified in the user's question."),
                }),
            },
        });

        // Handle potential null output
        if (!dashboardSelectionResponse.output) {
            const message = "I couldn't determine which dashboard panel would best answer your question.";
            sendChunk(message);
            return {success: false, message};
        }

        // Extract the dashboard and panel parameters
        const {
            dashboardUid, 
            dashboardTitle,
            panelId, 
            panelTitle,
            from = DEFAULT_TIME_RANGE.FROM, 
            to = DEFAULT_TIME_RANGE.TO
        } = dashboardSelectionResponse.output;

        logDebug(`Selected panel ${panelId} (${panelTitle || 'Unnamed'}) from dashboard '${dashboardUid}' (${dashboardTitle || 'Unnamed'})`, {
            timeRange: {from, to}
        });

        return {
            success: true,
            message: 'Dashboard panel selected successfully',
            panelParams: {
                dashboardUid,
                panelId,
                from,
                to
            }
        };
    } catch (error) {
        logDebug('Error selecting dashboard panel', error);
        const errorMessage = getErrorMessage(error);
        sendChunk(errorMessage);
        return {success: false, message: errorMessage};
    }
}

/**
 * Gets data from the selected dashboard panel
 *
 * @param panelParams - Parameters for the panel
 * @param sendChunk - Function to send streaming chunks to the client
 * @returns Object containing success status, message, and panel data if successful
 */
async function getPanelData(
    panelParams: {
        dashboardUid: string;
        panelId: number;
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
        const panelData = await getDashboardPanelData.run(panelParams);

        if (!panelData) {
            const message = "I was able to find the dashboard panel, but it returned no data.";
            sendChunk(message);
            return {success: false, message};
        }

        logDebug('Panel data retrieved successfully', panelData);
        return {success: true, message: 'Panel data retrieved successfully', data: panelData};
    } catch (error) {
        logDebug('Error getting panel data', error);

        let errorMessage = "I encountered an error while trying to get data from the dashboard panel.";

        if (error instanceof GrafanaApiError) {
            logDebug(`Grafana API Error (Status: ${error.statusCode}, Endpoint: ${error.endpoint})`, error.message);

            // Provide more specific error messages based on status code
            if (error.statusCode === 401 || error.statusCode === 403) {
                errorMessage = "I couldn't access your Grafana instance due to authentication issues. Please check your API key.";
            } else if (error.statusCode === 404) {
                errorMessage = "The requested dashboard or panel was not found in your Grafana instance.";
            } else if (error.statusCode >= 500) {
                errorMessage = "Your Grafana instance is experiencing server issues. Please try again later.";
            }
        }

        sendChunk(errorMessage);
        return {success: false, message: errorMessage};
    }
}

/**
 * Interprets the dashboard panel data and provides a human-readable answer
 *
 * @param question - The original user question
 * @param panelData - The data from the dashboard panel
 * @param sendChunk - Function to send streaming chunks to the client
 * @returns Object containing the final answer
 */
async function interpretResults(
    question: string,
    panelData: unknown,
    sendChunk: (chunk: string) => void
): Promise<{ answer: string }> {
    try {
        // Format the prompt with the original question and panel data
        // The formatting function simplifies the data to reduce token usage
        const prompt = formatResultInterpretationPrompt(question, panelData);

        logDebug('Interpreting panel data using model', AI_MODELS.REASONING);

        // Generate a streaming response to interpret the results
        // Using the more cost-effective model for interpretation
        const streamResponse = ai.generateStream({
            model: googleAI.model(AI_MODELS.REASONING),
            prompt,
            // Set a reasonable maximum output length to control costs
            maxOutputTokens: 1000,
        });

        // Stream the response chunks to the client
        let fullResponse = '';
        for await (const chunk of streamResponse.stream) {
            sendChunk(chunk.text);
            fullResponse += chunk.text;
        }

        // Get the final response
        const finalResponse = await streamResponse.response;
        return {answer: finalResponse.text || fullResponse};
    } catch (error) {
        logDebug('Error interpreting panel data', error);
        const errorMessage = getErrorMessage(error);
        sendChunk(errorMessage);
        return {answer: errorMessage};
    }
}

// Re-export the googleAI object for use in other modules
export {googleAI};
