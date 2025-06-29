// Mock the dependencies first, before importing the modules
import { grafanaFlow } from '@/genkit/grafanaFlow';
import appRoute from '@genkit-ai/next';

// Mock Request and Response if they're not defined in the test environment
if (typeof Request === 'undefined') {
  global.Request = class Request {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string | null;

    constructor(url: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
      this.url = url;
      this.method = options.method || 'GET';
      this.headers = options.headers || {};
      this.body = options.body || null;
    }

    async json() {
      return this.body ? JSON.parse(this.body) : null;
    }
  } as unknown as typeof Request;
}

if (typeof Response === 'undefined') {
  global.Response = class Response {
    status: number;
    headers: Record<string, string>;
    body: string;

    constructor(body: string, options: { status?: number; headers?: Record<string, string> } = {}) {
      this.body = body;
      this.status = options.status || 200;
      this.headers = options.headers || {};
    }

    async json() {
      return JSON.parse(this.body);
    }
  } as unknown as typeof Response;
}

jest.mock('@/genkit/grafanaFlow', () => ({
  grafanaFlow: jest.fn(),
}));

jest.mock('@genkit-ai/next', () => {
  return jest.fn((flow) => {
    // Return a mock function that simulates the behavior of appRoute
    return async (req: Request) => {
      // Extract the request body
      const body = await req.json();

      // Call the flow function with the request body
      const result = await flow(body, {
        sendChunk: jest.fn(),
      });

      // Return a Response with the result
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    };
  });
});

// Import the module under test after setting up the mocks
import { POST } from './route';

describe('Grafana API Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call appRoute with grafanaFlow', () => {
    // Force the module to be re-evaluated to ensure appRoute is called with grafanaFlow
    jest.isolateModules(() => {
      require('./route');
      expect(appRoute).toHaveBeenCalledWith(grafanaFlow);
    });
  });

  it('should process a request and return a response', async () => {
    // Mock the grafanaFlow implementation for this test
    const mockAnswer = { answer: 'This is a test answer' };
    (grafanaFlow as jest.Mock).mockResolvedValueOnce(mockAnswer);

    // Create a mock request
    const request = new Request('http://localhost:3000/api/grafana', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question: 'What is the CPU usage?' }),
    });

    // Call the POST handler
    const response = await POST(request);

    // Verify the response
    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData).toEqual(mockAnswer);

    // Verify grafanaFlow was called with the correct parameters
    expect(grafanaFlow).toHaveBeenCalledWith(
      { question: 'What is the CPU usage?' },
      expect.objectContaining({
        sendChunk: expect.any(Function),
      })
    );
  });

  it('should handle errors from grafanaFlow', async () => {
    // Mock grafanaFlow to throw an error
    (grafanaFlow as jest.Mock).mockRejectedValueOnce(new Error('Test error'));

    // Create a mock request
    const request = new Request('http://localhost:3000/api/grafana', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question: 'What is the CPU usage?' }),
    });

    // Call the POST handler and expect it to throw
    await expect(POST(request)).rejects.toThrow('Test error');
  });

  it('should handle malformed JSON in the request', async () => {
    // Create a mock request with invalid JSON
    const request = new Request('http://localhost:3000/api/grafana', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: 'not valid json',
    });

    // Call the POST handler and expect it to throw
    await expect(POST(request)).rejects.toThrow();
  });
});
