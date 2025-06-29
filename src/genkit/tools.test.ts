import { listDatasources, queryDatasource, listDashboards, getDashboard, getDashboardPanelData } from './tools';
import { GrafanaApiError, GrafanaErrorType, grafanaApiRequest } from './grafanaApi';
import { logDebug } from './utils';

// Mock dependencies
jest.mock('./grafanaApi');
jest.mock('./utils');
jest.mock('genkit', () => {
  const mockDefineTool = jest.fn((config, implementation) => ({
    run: jest.fn(implementation),
    config
  }));

  return {
    z: {
      object: jest.fn().mockImplementation(() => ({
        passthrough: jest.fn().mockReturnThis(),
        optional: jest.fn().mockReturnThis(),
        default: jest.fn().mockReturnThis(),
        describe: jest.fn().mockReturnThis(),
        strict: jest.fn().mockReturnThis(),
      })),
      array: jest.fn().mockReturnThis(),
      string: jest.fn().mockReturnThis(),
      number: jest.fn().mockImplementation(() => ({
        min: jest.fn().mockReturnThis(),
        max: jest.fn().mockReturnThis(),
        optional: jest.fn().mockReturnThis(),
        default: jest.fn().mockReturnThis(),
        describe: jest.fn().mockReturnThis(),
      })),
      boolean: jest.fn().mockReturnThis(),
      optional: jest.fn().mockReturnThis(),
      default: jest.fn().mockReturnThis(),
      describe: jest.fn().mockReturnThis(),
      any: jest.fn().mockReturnThis(),
      enum: jest.fn().mockReturnThis(),
      union: jest.fn().mockReturnThis(),
    },
    genkit: jest.fn(() => ({
      defineTool: mockDefineTool,
      defineFlow: jest.fn(),
      generate: jest.fn(),
      generateStream: jest.fn(),
    })),
  };
});

// Mock grafanaApiRequest implementation
const mockGrafanaApiRequest = grafanaApiRequest as jest.MockedFunction<typeof grafanaApiRequest>;

describe('Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listDatasources', () => {
    it('should return datasources when API request succeeds', async () => {
      const mockDatasources = [
        { uid: 'ds1', name: 'Prometheus', type: 'prometheus', url: 'http://prometheus:9090' },
        { uid: 'ds2', name: 'MySQL', type: 'mysql', host: 'mysql-server' }
      ];

      mockGrafanaApiRequest.mockResolvedValueOnce(mockDatasources);

      const result = await listDatasources.run({});

      expect(mockGrafanaApiRequest).toHaveBeenCalledWith('/api/datasources');
      expect(result).toEqual([
        { uid: 'ds1', name: 'Prometheus', type: 'prometheus' },
        { uid: 'ds2', name: 'MySQL', type: 'mysql' }
      ]);
      expect(logDebug).toHaveBeenCalledWith(`Found ${mockDatasources.length} datasources`, expect.any(Array));
    });

    it('should return empty array when API request fails', async () => {
      const error = new GrafanaApiError(
        500,
        '/api/datasources',
        'Server error',
        GrafanaErrorType.SERVER
      );

      mockGrafanaApiRequest.mockRejectedValueOnce(error);

      const result = await listDatasources.run({});

      expect(mockGrafanaApiRequest).toHaveBeenCalledWith('/api/datasources');
      expect(result).toEqual([]);
      expect(logDebug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to list Grafana datasources'),
        expect.any(String)
      );
    });
  });

  describe('queryDatasource', () => {
    it('should query InfluxDB datasource correctly', async () => {
      const params = {
        datasourceUid: 'influx',
        datasourceType: 'influxdb',
        rawQuery: 'SELECT mean("usage_idle") FROM "cpu" WHERE time >= now() - 1h GROUP BY time(1m)',
        from: 'now-1h',
        to: 'now'
      };

      const mockResult = { results: { A: { series: [{ name: 'cpu', values: [[1, 95.5]] }] } } };
      mockGrafanaApiRequest.mockResolvedValueOnce(mockResult);

      const result = await queryDatasource.run(params);

      expect(mockGrafanaApiRequest).toHaveBeenCalledWith('/api/ds/query', {
        method: 'POST',
        body: JSON.stringify({
          from: 'now-1h',
          to: 'now',
          queries: [
            {
              query: params.rawQuery,
              datasource: { uid: params.datasourceUid },
              refId: 'A',
              maxDataPoints: 1000,
            },
          ],
        }),
      });

      expect(result).toEqual(mockResult.results);
    });

    it('should query Prometheus datasource correctly', async () => {
      const params = {
        datasourceUid: 'prom',
        datasourceType: 'prometheus',
        rawQuery: 'rate(node_cpu_seconds_total{mode="idle"}[5m])',
        from: 'now-1h',
        to: 'now'
      };

      const mockResult = { results: { A: { frames: [{ data: { values: [[1, 2, 3]] } }] } } };
      mockGrafanaApiRequest.mockResolvedValueOnce(mockResult);

      const result = await queryDatasource.run(params);

      expect(mockGrafanaApiRequest).toHaveBeenCalledWith('/api/ds/query', {
        method: 'POST',
        body: JSON.stringify({
          from: 'now-1h',
          to: 'now',
          queries: [
            {
              expr: params.rawQuery,
              datasource: { uid: params.datasourceUid },
              refId: 'A',
              maxDataPoints: 1000,
            },
          ],
        }),
      });

      expect(result).toEqual(mockResult.results);
    });

    it('should query SQL datasource correctly', async () => {
      const params = {
        datasourceUid: 'postgres',
        datasourceType: 'postgres',
        rawQuery: 'SELECT time, value FROM metrics WHERE time > now() - interval \'1 hour\'',
        from: 'now-1h',
        to: 'now'
      };

      const mockResult = { results: { A: { tables: [{ columns: ['time', 'value'], rows: [[1, 95.5]] }] } } };
      mockGrafanaApiRequest.mockResolvedValueOnce(mockResult);

      const result = await queryDatasource.run(params);

      expect(mockGrafanaApiRequest).toHaveBeenCalledWith('/api/ds/query', {
        method: 'POST',
        body: JSON.stringify({
          from: 'now-1h',
          to: 'now',
          queries: [
            {
              rawSql: params.rawQuery,
              datasource: { uid: params.datasourceUid },
              refId: 'A',
              maxDataPoints: 1000,
            },
          ],
        }),
      });

      expect(result).toEqual(mockResult.results);
    });

    it('should handle unknown datasource types', async () => {
      const params = {
        datasourceUid: 'unknown',
        datasourceType: 'unknown-type',
        rawQuery: 'some query',
        from: 'now-1h',
        to: 'now'
      };

      const mockResult = { results: { A: { data: [1, 2, 3] } } };
      mockGrafanaApiRequest.mockResolvedValueOnce(mockResult);

      const result = await queryDatasource.run(params);

      expect(mockGrafanaApiRequest).toHaveBeenCalledWith('/api/ds/query', {
        method: 'POST',
        body: expect.stringContaining('"expr":"some query"'),
      });

      expect(result).toEqual(mockResult.results);
      expect(logDebug).toHaveBeenCalledWith("Unhandled datasource type 'unknown-type'. Defaulting to 'expr' payload.");
    });

    it('should propagate errors from API request', async () => {
      const params = {
        datasourceUid: 'prom',
        datasourceType: 'prometheus',
        rawQuery: 'invalid query',
        from: 'now-1h',
        to: 'now'
      };

      const error = new GrafanaApiError(
        400,
        '/api/ds/query',
        'Invalid query',
        GrafanaErrorType.VALIDATION
      );

      mockGrafanaApiRequest.mockRejectedValueOnce(error);

      try {
        await queryDatasource.run(params);
        fail('Expected queryDatasource.run to throw an error');
      } catch (e) {
        expect(e).toBe(error);
      }
      expect(logDebug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to query Grafana datasource'),
        expect.any(String)
      );
    });
  });

  describe('listDashboards', () => {
    it('should list dashboards with default parameters', async () => {
      const mockDashboards = [
        { uid: 'dash1', title: 'System Metrics', url: '/d/dash1', tags: ['system'] },
        { uid: 'dash2', title: 'Application Metrics', url: '/d/dash2', folderUid: 'folder1', folderTitle: 'Applications' }
      ];

      mockGrafanaApiRequest.mockResolvedValueOnce(mockDashboards);

      const result = await listDashboards.run({});

      expect(mockGrafanaApiRequest).toHaveBeenCalledWith('/api/search?type=dash-db');
      expect(result).toEqual(mockDashboards);
      expect(logDebug).toHaveBeenCalledWith(`Found ${mockDashboards.length} dashboards`, expect.any(Array));
    });

    it('should apply query parameters correctly', async () => {
      const params = {
        folderUid: 'folder1',
        query: 'system',
        limit: 50
      };

      const mockDashboards = [
        { uid: 'dash1', title: 'System Metrics', url: '/d/dash1', tags: ['system'], folderUid: 'folder1' }
      ];

      mockGrafanaApiRequest.mockResolvedValueOnce(mockDashboards);

      const result = await listDashboards.run(params);

      expect(mockGrafanaApiRequest).toHaveBeenCalledWith(
        '/api/search?folderUid=folder1&query=system&limit=50&type=dash-db'
      );
      expect(result).toEqual(mockDashboards);
    });

    it('should return empty array when API request fails', async () => {
      const error = new GrafanaApiError(
        500,
        '/api/search',
        'Server error',
        GrafanaErrorType.SERVER
      );

      mockGrafanaApiRequest.mockRejectedValueOnce(error);

      const result = await listDashboards.run({});

      expect(mockGrafanaApiRequest).toHaveBeenCalledWith('/api/search?type=dash-db');
      expect(result).toEqual([]);
      expect(logDebug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to list Grafana dashboards'),
        expect.any(String)
      );
    });
  });

  describe('getDashboard', () => {
    it('should get dashboard details by uid', async () => {
      const params = { uid: 'dash1' };

      const mockDashboardResponse = {
        dashboard: {
          uid: 'dash1',
          title: 'System Metrics',
          description: 'Dashboard for system metrics',
          tags: ['system'],
          panels: [
            { id: 1, title: 'CPU Usage', type: 'graph', description: 'CPU usage over time' },
            { id: 2, title: 'Memory Usage', type: 'graph' }
          ],
          templating: {
            list: [
              { name: 'server', label: 'Server', type: 'query', description: 'Server to display metrics for' }
            ]
          },
          time: { from: 'now-6h', to: 'now' }
        },
        meta: {
          folderTitle: 'System',
          folderUid: 'folder1',
          url: '/d/dash1'
        }
      };

      mockGrafanaApiRequest.mockResolvedValueOnce(mockDashboardResponse);

      const result = await getDashboard.run(params);

      expect(mockGrafanaApiRequest).toHaveBeenCalledWith('/api/dashboards/uid/dash1');
      expect(result).toEqual({
        dashboard: {
          uid: 'dash1',
          title: 'System Metrics',
          description: 'Dashboard for system metrics',
          tags: ['system'],
          panels: [
            { id: 1, title: 'CPU Usage', type: 'graph', description: 'CPU usage over time' },
            { id: 2, title: 'Memory Usage', type: 'graph' }
          ],
          templating: {
            list: [
              { name: 'server', label: 'Server', type: 'query', description: 'Server to display metrics for' }
            ]
          },
          time: { from: 'now-6h', to: 'now' }
        },
        meta: {
          folderTitle: 'System',
          folderUid: 'folder1',
          url: '/d/dash1'
        }
      });
      expect(logDebug).toHaveBeenCalledWith(
        expect.stringContaining('Retrieved dashboard: System Metrics'),
        expect.any(Object)
      );
    });

    it('should propagate errors from API request', async () => {
      const params = { uid: 'nonexistent' };

      const error = new GrafanaApiError(
        404,
        '/api/dashboards/uid/nonexistent',
        'Dashboard not found',
        GrafanaErrorType.NOT_FOUND
      );

      mockGrafanaApiRequest.mockRejectedValueOnce(error);

      try {
        await getDashboard.run(params);
        fail('Expected getDashboard.run to throw an error');
      } catch (e) {
        expect(e).toBe(error);
      }
      expect(logDebug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get Grafana dashboard'),
        expect.any(String)
      );
    });
  });

  describe('getDashboardPanelData', () => {
    it('should get panel data with Prometheus datasource', async () => {
      const params = {
        dashboardUid: 'dash1',
        panelId: 1,
        from: 'now-1h',
        to: 'now'
      };

      // Mock dashboard response with panel that has Prometheus datasource
      const mockDashboardResponse = {
        dashboard: {
          panels: [
            {
              id: 1,
              title: 'CPU Usage',
              type: 'graph',
              datasource: { uid: 'prom', type: 'prometheus' },
              targets: [
                { datasource: { uid: 'prom', type: 'prometheus' }, expr: 'rate(node_cpu_seconds_total{mode="idle"}[5m])' }
              ]
            }
          ]
        }
      };

      // Mock query response
      const mockQueryResponse = {
        results: {
          A: { frames: [{ data: { values: [[1, 2, 3]] } }] }
        }
      };

      mockGrafanaApiRequest
        .mockResolvedValueOnce(mockDashboardResponse)
        .mockResolvedValueOnce(mockQueryResponse);

      const result = await getDashboardPanelData.run(params);

      expect(mockGrafanaApiRequest).toHaveBeenCalledWith('/api/dashboards/uid/dash1');
      expect(mockGrafanaApiRequest).toHaveBeenCalledWith('/api/ds/query', {
        method: 'POST',
        body: expect.stringContaining('"expr":"rate(node_cpu_seconds_total{mode=\\"idle\\"}[5m])"'),
      });

      expect(result).toEqual(mockQueryResponse.results);
    });

    it('should get panel data with SQL datasource', async () => {
      const params = {
        dashboardUid: 'dash1',
        panelId: 2,
        from: 'now-1h',
        to: 'now'
      };

      // Mock dashboard response with panel that has SQL datasource
      const mockDashboardResponse = {
        dashboard: {
          panels: [
            {
              id: 2,
              title: 'Database Metrics',
              type: 'table',
              datasource: { uid: 'postgres', type: 'postgres' },
              targets: [
                { 
                  datasource: { uid: 'postgres', type: 'postgres' }, 
                  rawSql: 'SELECT time, value FROM metrics WHERE time > now() - interval \'1 hour\''
                }
              ]
            }
          ]
        }
      };

      // Mock query response
      const mockQueryResponse = {
        results: {
          A: { tables: [{ columns: ['time', 'value'], rows: [[1, 95.5]] }] }
        }
      };

      mockGrafanaApiRequest
        .mockResolvedValueOnce(mockDashboardResponse)
        .mockResolvedValueOnce(mockQueryResponse);

      const result = await getDashboardPanelData.run(params);

      expect(mockGrafanaApiRequest).toHaveBeenCalledWith('/api/dashboards/uid/dash1');
      expect(mockGrafanaApiRequest).toHaveBeenCalledWith('/api/ds/query', {
        method: 'POST',
        body: expect.stringContaining('"rawSql":"SELECT time, value FROM metrics WHERE time > now() - interval \'1 hour\'"'),
      });

      expect(result).toEqual(mockQueryResponse.results);
    });

    it('should handle legacy datasource format', async () => {
      const params = {
        dashboardUid: 'dash1',
        panelId: 3,
        from: 'now-1h',
        to: 'now'
      };

      // Mock dashboard response with panel that has legacy datasource format
      const mockDashboardResponse = {
        dashboard: {
          panels: [
            {
              id: 3,
              title: 'Legacy Panel',
              type: 'graph',
              datasource: 'prometheus',
              targets: [
                { expr: 'up' }
              ]
            }
          ]
        }
      };

      // Mock query response
      const mockQueryResponse = {
        results: {
          A: { frames: [{ data: { values: [[1]] } }] }
        }
      };

      mockGrafanaApiRequest
        .mockResolvedValueOnce(mockDashboardResponse)
        .mockResolvedValueOnce(mockQueryResponse);

      const result = await getDashboardPanelData.run(params);

      expect(mockGrafanaApiRequest).toHaveBeenCalledWith('/api/dashboards/uid/dash1');
      expect(mockGrafanaApiRequest).toHaveBeenCalledWith('/api/ds/query', {
        method: 'POST',
        body: expect.stringContaining('"datasource":{"uid":"default"}'),
      });

      expect(result).toEqual(mockQueryResponse.results);
    });

    it('should throw error if panel not found', async () => {
      const params = {
        dashboardUid: 'dash1',
        panelId: 999, // Non-existent panel
        from: 'now-1h',
        to: 'now'
      };

      // Mock dashboard response with no matching panel
      const mockDashboardResponse = {
        dashboard: {
          panels: [
            { id: 1, title: 'CPU Usage' }
          ]
        }
      };

      mockGrafanaApiRequest.mockResolvedValueOnce(mockDashboardResponse);

      await expect(getDashboardPanelData.run(params)).rejects.toThrow('Panel with ID 999 not found');
      expect(logDebug).toHaveBeenCalledWith(
        'Failed to get panel data',
        expect.any(Error)
      );
    });

    it('should throw error if no targets found', async () => {
      const params = {
        dashboardUid: 'dash1',
        panelId: 1,
        from: 'now-1h',
        to: 'now'
      };

      // Mock dashboard response with panel that has no targets
      const mockDashboardResponse = {
        dashboard: {
          panels: [
            {
              id: 1,
              title: 'Empty Panel',
              type: 'graph',
              datasource: { uid: 'prom', type: 'prometheus' },
              targets: []
            }
          ]
        }
      };

      mockGrafanaApiRequest.mockResolvedValueOnce(mockDashboardResponse);

      await expect(getDashboardPanelData.run(params)).rejects.toThrow('No targets found for panel 1');
      expect(logDebug).toHaveBeenCalledWith(
        'Failed to get panel data',
        expect.any(Error)
      );
    });
  });
});
