import {listDatasources, queryDatasource} from './tools';
import {GrafanaApiError, grafanaApiRequest} from './grafanaApi';
import {logDebug} from './utils';

// Mock dependencies
jest.mock('./grafanaApi', () => ({
    grafanaApiRequest: jest.fn(),
    GrafanaApiError: class GrafanaApiError extends Error {
        constructor(public statusCode: number, public endpoint: string, message: string) {
            super(message);
            this.name = 'GrafanaApiError';
        }
    }
}));

jest.mock('./utils', () => ({
    logDebug: jest.fn(),
}));

jest.mock('genkit', () => ({
    genkit: jest.fn(() => ({
        defineTool: jest.fn((config, fn) => ({
            run: fn,
            config,
        })),
    })),
    z: {
        object: jest.fn(() => ({})),
        array: jest.fn(() => ({})),
        string: jest.fn(() => ({
            describe: jest.fn(() => ({})),
            optional: jest.fn(() => ({
                default: jest.fn(() => ({
                    describe: jest.fn(() => ({})),
                })),
            })),
        })),
        any: jest.fn(() => ({})),
    },
}));

jest.mock('@genkit-ai/googleai', () => ({
    googleAI: jest.fn(() => ({})),
}));

describe('Grafana API Tools', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('listDatasources', () => {
        it('should return a list of datasources when the API call is successful', async () => {
            // Mock successful API response
            const mockDatasources = [
                {uid: 'ds1', name: 'Prometheus', type: 'prometheus', url: 'http://prometheus:9090'},
                {uid: 'ds2', name: 'Loki', type: 'loki', url: 'http://loki:3100'},
            ];

            (grafanaApiRequest as jest.Mock).mockResolvedValueOnce(mockDatasources);

            // Call the tool
            const result = await listDatasources.run({});

            // Verify the API was called correctly
            expect(grafanaApiRequest).toHaveBeenCalledWith('/api/datasources');

            // Verify the result is formatted correctly (only uid, name, and type are returned)
            expect(result).toEqual([
                {uid: 'ds1', name: 'Prometheus', type: 'prometheus'},
                {uid: 'ds2', name: 'Loki', type: 'loki'},
            ]);

            // Verify logging
            expect(logDebug).toHaveBeenCalledWith('Found 2 datasources', expect.any(Array));
        });

        it('should return an empty array when the API call fails with GrafanaApiError', async () => {
            // Mock API error
            const error = new GrafanaApiError(500, '/api/datasources', 'Internal Server Error');
            (grafanaApiRequest as jest.Mock).mockRejectedValueOnce(error);

            // Call the tool
            const result = await listDatasources.run({});

            // Verify the result is an empty array
            expect(result).toEqual([]);

            // Verify error logging
            expect(logDebug).toHaveBeenCalledWith(
                'Failed to list Grafana datasources (Status: 500, Endpoint: /api/datasources)',
                'Internal Server Error'
            );
        });

        it('should return an empty array when the API call fails with a generic error', async () => {
            // Mock generic error
            const error = new Error('Network error');
            (grafanaApiRequest as jest.Mock).mockRejectedValueOnce(error);

            // Call the tool
            const result = await listDatasources.run({});

            // Verify the result is an empty array
            expect(result).toEqual([]);

            // Verify error logging
            expect(logDebug).toHaveBeenCalledWith('Failed to list Grafana datasources', error);
        });
    });

    describe('queryDatasource', () => {
        it('should execute a Prometheus query correctly', async () => {
            // Mock successful API response
            const mockResults = {
                results: {
                    A: {
                        frames: [
                            {
                                data: {
                                    values: [[1625000000, 1625000060], [10, 15]],
                                },
                            },
                        ],
                    },
                },
            };

            (grafanaApiRequest as jest.Mock).mockResolvedValueOnce(mockResults);

            // Call the tool with a Prometheus query
            const result = await queryDatasource.run({
                datasourceUid: 'ds1',
                datasourceType: 'prometheus',
                rawQuery: 'rate(http_requests_total[5m])',
                from: 'now-6h',
                to: 'now',
            });

            // Verify the API was called correctly
            expect(grafanaApiRequest).toHaveBeenCalledWith('/api/ds/query', {
                method: 'POST',
                body: JSON.stringify({
                    from: 'now-6h',
                    to: 'now',
                    queries: [
                        {
                            expr: 'rate(http_requests_total[5m])',
                            datasource: {uid: 'ds1'},
                            refId: 'A',
                            maxDataPoints: 1000,
                        },
                    ],
                }),
            });

            // Verify the result
            expect(result).toEqual(mockResults.results);

            // Verify logging
            expect(logDebug).toHaveBeenCalledWith('Executing query against datasource ds1 (prometheus)', {
                query: 'rate(http_requests_total[5m])',
                timeRange: {from: 'now-6h', to: 'now'},
            });
            expect(logDebug).toHaveBeenCalledWith('Query executed successfully', mockResults.results);
        });

        it('should execute an InfluxDB query correctly', async () => {
            // Mock successful API response
            const mockResults = {
                results: {
                    A: {
                        series: [
                            {
                                name: 'cpu',
                                columns: ['time', 'value'],
                                values: [[1625000000, 75], [1625000060, 80]],
                            },
                        ],
                    },
                },
            };

            (grafanaApiRequest as jest.Mock).mockResolvedValueOnce(mockResults);

            // Call the tool with an InfluxDB query
            const result = await queryDatasource.run({
                datasourceUid: 'ds3',
                datasourceType: 'influxdb',
                rawQuery: 'SELECT mean("usage_idle") FROM "cpu" WHERE time > now() - 1h GROUP BY time(1m)',
            });

            // Verify the API was called correctly with the appropriate payload structure
            expect(grafanaApiRequest).toHaveBeenCalledWith('/api/ds/query', {
                method: 'POST',
                body: expect.stringContaining('"query":"SELECT mean(\\"usage_idle\\") FROM \\"cpu\\" WHERE time > now() - 1h GROUP BY time(1m)"'),
            });

            // Verify the result
            expect(result).toEqual(mockResults.results);
        });

        it('should execute a SQL query correctly', async () => {
            // Mock successful API response
            const mockResults = {
                results: {
                    A: {
                        tables: [
                            {
                                columns: [{text: 'name'}, {text: 'value'}],
                                rows: [['server1', 75], ['server2', 80]],
                            },
                        ],
                    },
                },
            };

            (grafanaApiRequest as jest.Mock).mockResolvedValueOnce(mockResults);

            // Call the tool with a SQL query
            const result = await queryDatasource.run({
                datasourceUid: 'ds4',
                datasourceType: 'postgres',
                rawQuery: 'SELECT name, cpu_usage as value FROM servers',
            });

            // Verify the API was called correctly with the appropriate payload structure
            expect(grafanaApiRequest).toHaveBeenCalledWith('/api/ds/query', {
                method: 'POST',
                body: expect.stringContaining('"rawSql":"SELECT name, cpu_usage as value FROM servers"'),
            });

            // Verify the result
            expect(result).toEqual(mockResults.results);
        });

        it('should handle unknown datasource types by defaulting to expr payload', async () => {
            // Mock successful API response
            const mockResults = {
                results: {
                    A: {
                        data: [1, 2, 3],
                    },
                },
            };

            (grafanaApiRequest as jest.Mock).mockResolvedValueOnce(mockResults);

            // Call the tool with an unknown datasource type
            const result = await queryDatasource.run({
                datasourceUid: 'ds5',
                datasourceType: 'unknown',
                rawQuery: 'some query',
            });

            // Verify the API was called correctly with the default expr payload
            expect(grafanaApiRequest).toHaveBeenCalledWith('/api/ds/query', {
                method: 'POST',
                body: expect.stringContaining('"expr":"some query"'),
            });

            // Verify logging about unknown datasource type
            expect(logDebug).toHaveBeenCalledWith("Unhandled datasource type 'unknown'. Defaulting to 'expr' payload.");

            // Verify the result
            expect(result).toEqual(mockResults.results);
        });

        it('should throw an error when the API call fails', async () => {
            // Mock API error
            const error = new GrafanaApiError(500, '/api/ds/query', 'Internal Server Error');
            (grafanaApiRequest as jest.Mock).mockRejectedValueOnce(error);

            // Call the tool and expect it to throw
            await expect(queryDatasource.run({
                datasourceUid: 'ds1',
                datasourceType: 'prometheus',
                rawQuery: 'rate(http_requests_total[5m])',
            })).rejects.toThrow(error);

            // Verify error logging
            expect(logDebug).toHaveBeenCalledWith(
                'Failed to query Grafana datasource (Status: 500, Endpoint: /api/ds/query)',
                'Internal Server Error'
            );
        });
    });
});
