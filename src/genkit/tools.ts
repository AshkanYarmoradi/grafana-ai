/**
 * Grafana API tools for the AI integration
 * Contains tool definitions for interacting with Grafana
 * 
 * Based on: https://last9.io/blog/getting-started-with-the-grafana-api/
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

/**
 * A tool to list all available dashboards in Grafana.
 * The LLM will use this to understand what dashboards are available.
 *
 * @returns {Promise<Array<DashboardInfo>>} List of available dashboards
 */
export const listDashboards = ai.defineTool(
    {
        name: 'grafanaListDashboards',
        description: 'Lists all available dashboards in Grafana to find their title, uid, and other metadata.',
        inputSchema: z.object({
            folderUid: z.string().optional().describe('Optional folder UID to filter dashboards by folder.'),
            query: z.string().optional().describe('Optional search query to filter dashboards by title.'),
            limit: z.number().optional().default(100).describe('Maximum number of dashboards to return. Defaults to 100.'),
        }),
        outputSchema: z.array(z.object({
            uid: z.string(),
            title: z.string(),
            url: z.string(),
            folderUid: z.string().optional(),
            folderTitle: z.string().optional(),
            tags: z.array(z.string()).optional(),
        })),
    },
    async (params: {
        folderUid?: string;
        query?: string;
        limit?: number;
    }) => {
        // API Reference: https://grafana.com/docs/grafana/latest/developers/http_api/dashboard/#search-dashboards
        try {
            // Build query parameters
            const queryParams = new URLSearchParams();
            if (params.folderUid) queryParams.append('folderUid', params.folderUid);
            if (params.query) queryParams.append('query', params.query);
            if (params.limit) queryParams.append('limit', params.limit.toString());
            queryParams.append('type', 'dash-db'); // Only return dashboards, not folders

            const endpoint = `/api/search?${queryParams.toString()}`;

            const dashboards = await grafanaApiRequest<Array<{
                uid: string;
                title: string;
                url: string;
                folderUid?: string;
                folderTitle?: string;
                tags?: string[];
                [key: string]: unknown;
            }>>(endpoint);

            const result = dashboards.map((dashboard) => ({
                uid: dashboard.uid,
                title: dashboard.title,
                url: dashboard.url,
                folderUid: dashboard.folderUid,
                folderTitle: dashboard.folderTitle,
                tags: dashboard.tags,
            }));

            logDebug(`Found ${result.length} dashboards`, result);
            return result;
        } catch (error) {
            if (error instanceof GrafanaApiError) {
                logDebug(`Failed to list Grafana dashboards (Status: ${error.statusCode}, Endpoint: ${error.endpoint})`, error.message);
            } else {
                logDebug('Failed to list Grafana dashboards', error);
            }
            return [];
        }
    }
);

/**
 * A tool to get detailed information about a specific dashboard.
 *
 * @returns {Promise<DashboardDetail>} Detailed information about the dashboard
 */
export const getDashboard = ai.defineTool(
    {
        name: 'grafanaGetDashboard',
        description: 'Gets detailed information about a specific Grafana dashboard by its uid.',
        inputSchema: z.object({
            uid: z.string().describe('The unique identifier (uid) of the dashboard to retrieve.'),
        }),
        outputSchema: z.object({
            dashboard: z.object({
                uid: z.string(),
                title: z.string(),
                description: z.string().optional(),
                tags: z.array(z.string()).optional(),
                panels: z.array(z.object({
                    id: z.number(),
                    title: z.string(),
                    type: z.string(),
                    description: z.string().optional(),
                })).optional(),
                templating: z.object({
                    list: z.array(z.object({
                        name: z.string(),
                        label: z.string().optional(),
                        type: z.string(),
                        description: z.string().optional(),
                    })).optional(),
                }).optional(),
                time: z.object({
                    from: z.string().optional(),
                    to: z.string().optional(),
                }).optional(),
            }),
            meta: z.object({
                folderTitle: z.string().optional(),
                folderUid: z.string().optional(),
                url: z.string().optional(),
            }).optional(),
        }),
    },
    async (params: {
        uid: string;
    }) => {
        // API Reference: https://grafana.com/docs/grafana/latest/developers/http_api/dashboard/#get-dashboard-by-uid
        try {
            const { uid } = params;

            const response = await grafanaApiRequest<{
                dashboard: {
                    uid: string;
                    title: string;
                    description?: string;
                    tags?: string[];
                    panels?: Array<{
                        id: number;
                        title: string;
                        type: string;
                        description?: string;
                        [key: string]: unknown;
                    }>;
                    templating?: {
                        list?: Array<{
                            name: string;
                            label?: string;
                            type: string;
                            description?: string;
                            [key: string]: unknown;
                        }>;
                    };
                    time?: {
                        from?: string;
                        to?: string;
                    };
                    [key: string]: unknown;
                };
                meta?: {
                    folderTitle?: string;
                    folderUid?: string;
                    url?: string;
                    [key: string]: unknown;
                };
            }>(`/api/dashboards/uid/${uid}`);

            // Extract and simplify the dashboard data
            const result = {
                dashboard: {
                    uid: response.dashboard.uid,
                    title: response.dashboard.title,
                    description: response.dashboard.description,
                    tags: response.dashboard.tags,
                    panels: response.dashboard.panels?.map(panel => ({
                        id: panel.id,
                        title: panel.title,
                        type: panel.type,
                        description: panel.description,
                    })),
                    templating: response.dashboard.templating,
                    time: response.dashboard.time,
                },
                meta: response.meta,
            };

            logDebug(`Retrieved dashboard: ${result.dashboard.title}`, result);
            return result;
        } catch (error) {
            if (error instanceof GrafanaApiError) {
                logDebug(`Failed to get Grafana dashboard (Status: ${error.statusCode}, Endpoint: ${error.endpoint})`, error.message);
            } else {
                logDebug('Failed to get Grafana dashboard', error);
            }
            throw error; // Re-throw to allow proper error handling upstream
        }
    }
);

/**
 * A tool to get panel data from a specific dashboard.
 *
 * @returns {Promise<unknown>} Panel data from the dashboard
 */
export const getDashboardPanelData = ai.defineTool(
    {
        name: 'grafanaGetDashboardPanelData',
        description: 'Gets data from a specific panel in a Grafana dashboard.',
        inputSchema: z.object({
            dashboardUid: z.string().describe('The unique identifier (uid) of the dashboard.'),
            panelId: z.number().describe('The ID of the panel to get data from.'),
            from: z.string().optional().default('now-1h').describe("The start of the time range (e.g., 'now-6h'). Defaults to 'now-1h'."),
            to: z.string().optional().default('now').describe("The end of the time range (e.g., 'now'). Defaults to 'now'."),
        }),
        outputSchema: z.any(), // The output structure varies based on the panel type
    },
    async (params: {
        dashboardUid: string;
        panelId: number;
        from?: string;
        to?: string;
    }): Promise<unknown> => {
        const { dashboardUid, panelId, from = 'now-1h', to = 'now' } = params;

        logDebug(`Getting data for panel ${panelId} in dashboard ${dashboardUid}`, {
            timeRange: { from, to }
        });

        try {
            // First, get the dashboard to retrieve panel details
            const dashboardResponse = await grafanaApiRequest<{
                dashboard: {
                    panels?: Array<{
                        id: number;
                        datasource?: {
                            uid: string;
                            type: string;
                        } | string;
                        targets?: Array<{
                            datasource?: {
                                uid: string;
                                type: string;
                            } | string;
                            expr?: string;
                            query?: string;
                            rawSql?: string;
                            [key: string]: unknown;
                        }>;
                        [key: string]: unknown;
                    }>;
                    [key: string]: unknown;
                };
            }>(`/api/dashboards/uid/${dashboardUid}`);

            // Find the specified panel
            const panel = dashboardResponse.dashboard.panels?.find(p => p.id === panelId);

            if (!panel) {
                throw new Error(`Panel with ID ${panelId} not found in dashboard ${dashboardUid}`);
            }

            // Extract datasource and query information from the panel
            const targets = panel.targets || [];
            if (targets.length === 0) {
                throw new Error(`No targets found for panel ${panelId}`);
            }

            // Build queries for each target
            const queries = targets.map((target, index) => {
                // Determine datasource from target or panel
                const datasource = target.datasource || panel.datasource;
                let datasourceUid: string;

                // Handle different datasource formats
                if (typeof datasource === 'string') {
                    // Legacy format - assume default datasource
                    datasourceUid = 'default';
                } else if (datasource && typeof datasource === 'object') {
                    datasourceUid = datasource.uid;
                } else {
                    // Fallback to default
                    datasourceUid = 'default';
                }

                // Determine query based on datasource type
                let queryPayload: Record<string, unknown> = {};

                if (target.expr) {
                    // Prometheus/Loki style
                    queryPayload = { expr: target.expr };
                } else if (target.query) {
                    // InfluxDB style
                    queryPayload = { query: target.query };
                } else if (target.rawSql) {
                    // SQL style
                    queryPayload = { rawSql: target.rawSql };
                } else {
                    // Use the entire target as the payload
                    queryPayload = { ...target };
                    delete queryPayload.datasource;
                }

                return {
                    ...queryPayload,
                    datasource: { uid: datasourceUid },
                    refId: String.fromCharCode(65 + index), // A, B, C, ...
                };
            });

            // Execute the query
            const queryBody = {
                from,
                to,
                queries,
            };

            const result = await grafanaApiRequest<{ results: unknown }>('/api/ds/query', {
                method: 'POST',
                body: JSON.stringify(queryBody),
            });

            logDebug(`Panel data retrieved successfully for panel ${panelId}`, result.results);
            return result.results;
        } catch (error) {
            if (error instanceof GrafanaApiError) {
                logDebug(`Failed to get panel data (Status: ${error.statusCode}, Endpoint: ${error.endpoint})`, error.message);
            } else {
                logDebug('Failed to get panel data', error);
            }
            throw error; // Re-throw to allow proper error handling upstream
        }
    }
);
