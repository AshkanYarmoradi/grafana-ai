import { POST } from './route';
import { grafanaFlow } from '@/genkit/grafanaFlow';
import appRoute from '@genkit-ai/next';

// Mock the dependencies
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

describe('Grafana API Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  it('should call appRoute with grafanaFlow', () => {
    expect(appRoute).toHaveBeenCalledWith(grafanaFlow);
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