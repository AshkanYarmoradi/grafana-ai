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
import {AI_MODELS, DEFAULT_TIME_RANGE} from './constants';
import {formatComprehensivePromptForSelection, formatComprehensivePromptForInterpretation, getErrorMessage, logDebug} from './utils';
import {ai, listDashboards, getDashboard, getDashboardPanelData} from './tools';

// Cache for dashboards to avoid redundant API calls
let dashboardsCache: Array<{ uid: string; title: string; url: string; folderUid?: string; folderTitle?: string; tags?: string[] }> | null = null;
let dashboardsCacheExpiry: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Main flow for processing Grafana queries using AI.
 * This flow dynamically decides whether to query Grafana dashboards or answer directly,
 * based on the nature of the user's question.
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
            // Step 1: Determine if the question requires dashboard data or can be answered directly
            const questionAnalysisResult = await analyzeQuestion(question, sendChunk);

            // If the question can be answered directly, return the answer without querying Grafana
            if (!questionAnalysisResult.requiresDashboardData) {
                logDebug('Question can be answered directly without querying Grafana');
                return {answer: questionAnalysisResult.directAnswer || ''};
            }

            logDebug('Question requires dashboard data, proceeding with Grafana queries');

            // Check if we already have dashboard and panel information from the question analysis
            if (questionAnalysisResult.dashboardUid && questionAnalysisResult.panelId) {
                logDebug('Using dashboard and panel information from question analysis');

                // Create panel parameters from the question analysis
                const panelParams = {
                    dashboardUid: questionAnalysisResult.dashboardUid,
                    panelId: questionAnalysisResult.panelId,
                    from: questionAnalysisResult.from || DEFAULT_TIME_RANGE.FROM,
                    to: questionAnalysisResult.to || DEFAULT_TIME_RANGE.TO
                };

                // Skip to Step 4: Get data from the selected dashboard panel
                const panelDataResult = await getPanelData(panelParams, sendChunk);
                if (!panelDataResult.success) {
                    return {answer: panelDataResult.message};
                }

                // Step 5: Interpret the results
                return await interpretResults(question, panelDataResult.data, sendChunk);
            }

            // Standard flow if we don't have dashboard and panel information yet

            // Step 2: Discover available dashboards
            const dashboardsResult = await discoverDashboards(sendChunk);
            if (!dashboardsResult.success) {
                return {answer: dashboardsResult.message};
            }

            // Step 3: Select the appropriate dashboard panel
            const panelSelectionResult = await selectDashboardPanel(question, dashboardsResult.dashboards!, sendChunk);
            if (!panelSelectionResult.success) {
                return {answer: panelSelectionResult.message};
            }

            // Step 4: Get data from the selected dashboard panel
            const panelDataResult = await getPanelData(panelSelectionResult.panelParams!, sendChunk);
            if (!panelDataResult.success) {
                return {answer: panelDataResult.message};
            }

            // Step 5: Interpret the results
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
        const prompt = formatComprehensivePromptForSelection(question, dashboards);

        logDebug('Selecting dashboard panel using model', AI_MODELS.REASONING);

        // First, have the AI select the most appropriate dashboard
        const dashboardSelectionResponse = await ai.generate({
            model: googleAI.model(AI_MODELS.REASONING),
            prompt,
            tools: [listDashboards, getDashboard],
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
        const prompt = formatComprehensivePromptForInterpretation(question, panelData);

        logDebug('Interpreting panel data using model', AI_MODELS.REASONING);

        // Generate a streaming response to interpret the results
        // Using the more cost-effective model for interpretation
        const streamResponse = ai.generateStream({
            model: googleAI.model(AI_MODELS.REASONING),
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
        return {answer: finalResponse.text || fullResponse};
    } catch (error) {
        logDebug('Error interpreting panel data', error);
        const errorMessage = getErrorMessage(error);
        sendChunk(errorMessage);
        return {answer: errorMessage};
    }
}

/**
 * Analyzes the user's question to determine if it requires dashboard data or can be answered directly
 * 
 * @param question - The user's question
 * @param sendChunk - Function to send streaming chunks to the client
 * @returns Object indicating if dashboard data is required and, if not, the direct answer
 */
async function analyzeQuestion(
    question: string,
    sendChunk: (chunk: string) => void
): Promise<{
    requiresDashboardData: boolean;
    directAnswer?: string;
    dashboardUid?: string;
    panelId?: number;
    from?: string;
    to?: string;
}> {
    try {
        // Create a special prompt for question analysis with empty dashboards
        // This allows the AI to decide if it needs dashboard data without actually fetching it
        const emptyDashboards: Array<{ uid: string; title: string; url: string }> = [];
        const prompt = formatComprehensivePromptForSelection(question, emptyDashboards);

        logDebug('Analyzing question to determine if dashboard data is needed', { question });

        // Use the reasoning model for this decision
        const analysisResponse = await ai.generate({
            model: googleAI.model(AI_MODELS.REASONING),
            prompt,
            output: {
                schema: z.object({
                    requiresDashboardData: z.boolean().describe('Whether the question requires dashboard data to be answered'),
                    directAnswer: z.string().optional().describe('The direct answer if no dashboard data is needed'),
                    dashboardUid: z.string().optional().describe('The uid of the selected dashboard if dashboard data is needed'),
                    panelId: z.number().optional().describe('The ID of the selected panel if dashboard data is needed'),
                    from: z.string().optional().describe("The start of the time range if specified in the user's question"),
                    to: z.string().optional().describe("The end of the time range if specified in the user's question"),
                }),
            },
        });

        // Handle potential null output
        if (!analysisResponse.output) {
            logDebug('Question analysis returned null output, assuming dashboard data is required');
            return { requiresDashboardData: true };
        }

        const { 
            requiresDashboardData, 
            directAnswer,
            dashboardUid,
            panelId,
            from,
            to
        } = analysisResponse.output;

        // If the AI determines that dashboard data is not needed, return the direct answer
        if (!requiresDashboardData) {
            if (directAnswer) {
                logDebug('Question can be answered directly', { directAnswer });
                // Stream the direct answer to the client
                sendChunk(directAnswer);
                return { 
                    requiresDashboardData: false, 
                    directAnswer 
                };
            } else {
                // If no direct answer is provided but requiresDashboardData is false,
                // this is an inconsistent state - default to requiring dashboard data
                logDebug('Question analysis inconsistent: requiresDashboardData=false but no directAnswer provided');
                return { requiresDashboardData: true };
            }
        }

        // If dashboard data is needed but we already have dashboard and panel info,
        // return it to potentially skip the dashboard selection step
        if (dashboardUid && panelId) {
            logDebug('Question analysis provided dashboard and panel info', { 
                dashboardUid, 
                panelId,
                from,
                to
            });
            return {
                requiresDashboardData: true,
                dashboardUid,
                panelId,
                from,
                to
            };
        }

        // Default case: dashboard data is needed but we don't have specific dashboard/panel info yet
        logDebug('Question requires dashboard data, proceeding with standard flow');
        return { requiresDashboardData: true };
    } catch (error) {
        logDebug('Error analyzing question', error);
        // In case of error, default to requiring dashboard data
        return { requiresDashboardData: true };
    }
}

// Re-export the googleAI object for use in other modules
export {googleAI};
