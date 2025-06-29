import { GrafanaApiError, GrafanaErrorType, grafanaApiRequest } from './grafanaApi';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock AbortController
class MockAbortController {
  signal = { aborted: false };
  abort() {
    this.signal.aborted = true;
  }
}
global.AbortController = MockAbortController as unknown as typeof AbortController;

// Mock setTimeout and clearTimeout
jest.useFakeTimers();

// Mock environment variables
const originalEnv = process.env;

describe('GrafanaApi', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockFetch.mockReset();

    // Reset environment variables
    process.env = { ...originalEnv };
    process.env.GRAFANA_URL = 'https://grafana.example.com';
    process.env.GRAFANA_API_KEY = 'test-api-key';
  });

  afterAll(() => {
    // Restore environment
    process.env = originalEnv;
  });

  describe('GrafanaApiError', () => {
    it('should create an error with the correct properties', () => {
      const error = new GrafanaApiError(
        404,
        '/api/dashboards',
        'Dashboard not found',
        GrafanaErrorType.NOT_FOUND
      );

      expect(error.statusCode).toBe(404);
      expect(error.endpoint).toBe('/api/dashboards');
      expect(error.message).toBe('Dashboard not found');
      expect(error.type).toBe(GrafanaErrorType.NOT_FOUND);
      expect(error.name).toBe('GrafanaApiError');
    });

    it('should use UNKNOWN as default error type', () => {
      const error = new GrafanaApiError(
        500,
        '/api/datasources',
        'Server error'
      );

      expect(error.type).toBe(GrafanaErrorType.UNKNOWN);
    });

    it('should capture stack trace if available', () => {
      // Store original captureStackTrace
      const originalCaptureStackTrace = Error.captureStackTrace;

      // Mock captureStackTrace
      Error.captureStackTrace = jest.fn();

      new GrafanaApiError(400, '/api/test', 'Test error');

      expect(Error.captureStackTrace).toHaveBeenCalled();

      // Restore original
      Error.captureStackTrace = originalCaptureStackTrace;
    });
  });

  describe('grafanaApiRequest', () => {
    it('should make a successful request', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: jest.fn().mockResolvedValue({ result: 'success' }),
        text: jest.fn().mockResolvedValue('success')
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = await grafanaApiRequest('/api/test');

      expect(result).toEqual({ result: 'success' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://grafana.example.com/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          })
        })
      );
    });

    it('should handle non-JSON responses', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('text/plain')
        },
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
        text: jest.fn().mockResolvedValue('plain text response')
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = await grafanaApiRequest('/api/test');

      expect(result).toBe('plain text response');
    });

    it('should throw GrafanaApiError for error responses', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        text: jest.fn().mockResolvedValue('Not found')
      };

      mockFetch.mockResolvedValue(mockResponse);

      await expect(grafanaApiRequest('/api/test')).rejects.toThrow(GrafanaApiError);
      await expect(grafanaApiRequest('/api/test')).rejects.toMatchObject({
        statusCode: 404,
        endpoint: 'api/test',
        type: GrafanaErrorType.NOT_FOUND
      });
    });

    it('should use basic auth if API key is not provided', async () => {
      // Remove API key and set username/password
      delete process.env.GRAFANA_API_KEY;
      process.env.GRAFANA_USERNAME = 'admin';
      process.env.GRAFANA_PASSWORD = 'password';

      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: jest.fn().mockResolvedValue({ result: 'success' }),
        text: jest.fn().mockResolvedValue('success')
      };

      mockFetch.mockResolvedValue(mockResponse);

      await grafanaApiRequest('/api/test');

      // Check that Basic auth header was used
      const base64Credentials = Buffer.from('admin:password').toString('base64');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Basic ${base64Credentials}`
          })
        })
      );
    });

    it('should throw error if no authentication credentials are provided', async () => {
      // Remove all auth credentials
      delete process.env.GRAFANA_API_KEY;
      delete process.env.GRAFANA_USERNAME;
      delete process.env.GRAFANA_PASSWORD;

      await expect(grafanaApiRequest('/api/test')).rejects.toThrow(GrafanaApiError);
      await expect(grafanaApiRequest('/api/test')).rejects.toMatchObject({
        statusCode: 401,
        type: GrafanaErrorType.AUTHENTICATION
      });
    });

    it('should throw error if GRAFANA_URL is not set', async () => {
      // Remove GRAFANA_URL
      delete process.env.GRAFANA_URL;

      await expect(grafanaApiRequest('/api/test')).rejects.toThrow('GRAFANA_URL must be set');
    });

    it('should normalize endpoint path', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: jest.fn().mockResolvedValue({ result: 'success' }),
        text: jest.fn().mockResolvedValue('success')
      };

      mockFetch.mockResolvedValue(mockResponse);

      // Test with leading slash
      await grafanaApiRequest('/api/test');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://grafana.example.com/api/test',
        expect.any(Object)
      );

      mockFetch.mockClear();

      // Test without leading slash
      await grafanaApiRequest('api/test');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://grafana.example.com/api/test',
        expect.any(Object)
      );
    });

    it('should normalize Grafana URL', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: jest.fn().mockResolvedValue({ result: 'success' }),
        text: jest.fn().mockResolvedValue('success')
      };

      mockFetch.mockResolvedValue(mockResponse);

      // Test URL without trailing slash
      process.env.GRAFANA_URL = 'https://grafana.example.com';
      await grafanaApiRequest('api/test');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://grafana.example.com/api/test',
        expect.any(Object)
      );

      mockFetch.mockClear();

      // Test URL with trailing slash
      process.env.GRAFANA_URL = 'https://grafana.example.com/';
      await grafanaApiRequest('api/test');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://grafana.example.com/api/test',
        expect.any(Object)
      );
    });

    it.skip('should handle timeout', async () => {
      // Mock fetch to never resolve
      mockFetch.mockImplementation(() => new Promise(() => {}));

      // Set a shorter timeout for the test
      const requestPromise = grafanaApiRequest('/api/test', { timeoutMs: 100 });

      // Run all timers immediately
      jest.runAllTimers();

      // Wait for all promises to resolve
      await Promise.resolve();

      await expect(requestPromise).rejects.toThrow(GrafanaApiError);
      await expect(requestPromise).rejects.toMatchObject({
        statusCode: 408,
        type: GrafanaErrorType.TIMEOUT
      });
    }, 10000); // Increase test timeout

    it.skip('should retry on server errors', async () => {
      // First call fails with 500, second succeeds
      const mockErrorResponse = {
        ok: false,
        status: 500,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        text: jest.fn().mockResolvedValue('Server error')
      };

      const mockSuccessResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: jest.fn().mockResolvedValue({ result: 'success' }),
        text: jest.fn().mockResolvedValue('success')
      };

      mockFetch.mockResolvedValueOnce(mockErrorResponse).mockResolvedValueOnce(mockSuccessResponse);

      // Use shorter retry delay for testing
      const resultPromise = grafanaApiRequest('/api/test', { maxRetries: 1, baseRetryDelayMs: 100 });

      // Run all timers immediately
      jest.runAllTimers();

      // Wait for all promises to resolve
      await Promise.resolve();

      const result = await resultPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ result: 'success' });
    }, 10000);

    it('should not retry on client errors', async () => {
      // 400 Bad Request should not be retried
      const mockErrorResponse = {
        ok: false,
        status: 400,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        text: jest.fn().mockResolvedValue('Bad request')
      };

      mockFetch.mockResolvedValue(mockErrorResponse);

      await expect(grafanaApiRequest('/api/test', { maxRetries: 3 })).rejects.toThrow(GrafanaApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it.skip('should retry on network errors', async () => {
      // First call fails with network error, second succeeds
      const networkError = new TypeError('Failed to fetch: network error');

      const mockSuccessResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: jest.fn().mockResolvedValue({ result: 'success' }),
        text: jest.fn().mockResolvedValue('success')
      };

      mockFetch.mockRejectedValueOnce(networkError).mockResolvedValueOnce(mockSuccessResponse);

      // Use shorter retry delay for testing
      const resultPromise = grafanaApiRequest('/api/test', { maxRetries: 1, baseRetryDelayMs: 100 });

      // Run all timers immediately
      jest.runAllTimers();

      // Wait for all promises to resolve
      await Promise.resolve();

      const result = await resultPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ result: 'success' });
    }, 10000);

    it.skip('should use exponential backoff for retries', async () => {
      // Mock setTimeout to track delay values
      const mockSetTimeout = jest.spyOn(global, 'setTimeout');

      // First two calls fail, third succeeds
      const mockErrorResponse = {
        ok: false,
        status: 500,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        text: jest.fn().mockResolvedValue('Server error')
      };

      const mockSuccessResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: jest.fn().mockResolvedValue({ result: 'success' }),
        text: jest.fn().mockResolvedValue('success')
      };

      mockFetch
        .mockResolvedValueOnce(mockErrorResponse)
        .mockResolvedValueOnce(mockErrorResponse)
        .mockResolvedValueOnce(mockSuccessResponse);

      // Use shorter retry delays for testing
      const resultPromise = grafanaApiRequest('/api/test', { 
        maxRetries: 2,
        baseRetryDelayMs: 100
      });

      // Run all timers immediately
      jest.runAllTimers();

      // Wait for all promises to resolve
      await Promise.resolve();

      const result = await resultPromise;

      // Check that setTimeout was called with exponential backoff
      expect(mockSetTimeout).toHaveBeenCalledTimes(4); // 2 for timeouts, 2 for retries

      // First retry should use baseRetryDelayMs
      expect(mockSetTimeout.mock.calls[1][1]).toBe(100);

      // Second retry should use baseRetryDelayMs * 2^1
      expect(mockSetTimeout.mock.calls[3][1]).toBe(200);

      expect(result).toEqual({ result: 'success' });
    }, 10000);
  });
});
