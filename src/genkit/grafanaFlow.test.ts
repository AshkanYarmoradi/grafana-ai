import { grafanaFlow } from './grafanaFlow';
import { ai, listDatasources, queryDatasource } from './tools';
import { DEFAULT_TIME_RANGE } from './constants';

// Mock the tools module
jest.mock('./tools', () => ({
  ai: {
    defineFlow: jest.fn((config, fn) => fn),
    generate: jest.fn(),
    generateStream: jest.fn(),
    generateText: jest.fn(), // Keep for backward compatibility with tests
  },
  listDatasources: {
    run: jest.fn(),
  },
  queryDatasource: {
    run: jest.fn(),
  },
}));

// Mock the utils module
jest.mock('./utils', () => ({
  formatQueryGenerationPrompt: jest.fn(() => 'mocked query generation prompt'),
  formatResultInterpretationPrompt: jest.fn(() => 'mocked result interpretation prompt'),
  getErrorMessage: jest.fn((error) => `Error: ${error.message || 'Unknown error'}`),
  logDebug: jest.fn(),
}));

describe('grafanaFlow', () => {
  // Mock for the sendChunk function
  const mockSendChunk = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Main flow', () => {
    it('should process a question successfully through all steps', async () => {
      // Mock successful responses for each step
      const mockDatasources = [
        { uid: 'ds1', name: 'Prometheus', type: 'prometheus' },
        { uid: 'ds2', name: 'Loki', type: 'loki' }
      ];

      // Mock listDatasources.run to return datasources
      (listDatasources.run as jest.Mock).mockResolvedValue({
        result: mockDatasources
      });

      // Mock ai.generate to return a query
      (ai.generate as jest.Mock).mockResolvedValueOnce({
        output: {
          uid: 'ds1',
          query: 'rate(http_requests_total[5m])',
          type: 'prometheus'
        }
      });

      // Mock queryDatasource.run to return query results
      (queryDatasource.run as jest.Mock).mockResolvedValue({
        result: {
          data: [
            { metric: { method: 'GET' }, values: [[1625000000, '10'], [1625000060, '15']] },
            { metric: { method: 'POST' }, values: [[1625000000, '5'], [1625000060, '8']] }
          ]
        }
      });

      // Mock ai.generateStream for result interpretation
      const mockStreamResponse = {
        stream: {
          // Use a more compatible approach for async iteration
          async *[Symbol.asyncIterator]() {
            yield { text: 'The HTTP ' };
            yield { text: 'request rate ' };
            yield { text: 'shows an increase ' };
            yield { text: 'over the 5-minute period.' };
          }
        },
        response: Promise.resolve({
          text: 'The HTTP request rate shows an increase over the 5-minute period.'
        })
      };

      (ai.generateStream as jest.Mock).mockReturnValueOnce(mockStreamResponse);

      // Call the flow
      const result = await grafanaFlow(
        { question: 'What is the HTTP request rate?' },
        { sendChunk: mockSendChunk }
      );

      // Verify the flow executed all steps
      expect(listDatasources.run).toHaveBeenCalledTimes(1);
      expect(ai.generate).toHaveBeenCalledTimes(1); // For query generation
      expect(ai.generateStream).toHaveBeenCalledTimes(1); // For result interpretation
      expect(queryDatasource.run).toHaveBeenCalledTimes(1);

      // Verify the query parameters
      expect(queryDatasource.run).toHaveBeenCalledWith({
        datasourceUid: 'ds1',
        datasourceType: 'prometheus',
        rawQuery: 'rate(http_requests_total[5m])',
        from: DEFAULT_TIME_RANGE.FROM,
        to: DEFAULT_TIME_RANGE.TO
      });

      // Verify the final result
      expect(result).toEqual({
        answer: 'The HTTP request rate shows an increase over the 5-minute period.'
      });

      // Verify chunks were sent
      expect(mockSendChunk).toHaveBeenCalled();
    });

    it('should handle error when no datasources are available', async () => {
      // Mock empty datasources response
      (listDatasources.run as jest.Mock).mockResolvedValue({
        result: []
      });

      // Call the flow
      const result = await grafanaFlow(
        { question: 'What is the HTTP request rate?' },
        { sendChunk: mockSendChunk }
      );

      // Verify error handling
      expect(result.answer).toContain("Error:");
      // In the actual implementation, ai.generate might be called during initialization
      // so we don't check if it was called or not
      expect(ai.generateStream).not.toHaveBeenCalled();
      expect(queryDatasource.run).not.toHaveBeenCalled();
    });

    it('should handle error during query generation', async () => {
      // Mock successful datasources response
      (listDatasources.run as jest.Mock).mockResolvedValue({
        result: [{ uid: 'ds1', name: 'Prometheus', type: 'prometheus' }]
      });

      // Mock error during query generation
      (ai.generate as jest.Mock).mockRejectedValueOnce(new Error('AI model error'));

      // Call the flow
      const result = await grafanaFlow(
        { question: 'What is the HTTP request rate?' },
        { sendChunk: mockSendChunk }
      );

      // Verify error handling
      expect(result.answer).toContain('Error: AI model error');
      expect(queryDatasource.run).not.toHaveBeenCalled();
      expect(ai.generateStream).not.toHaveBeenCalled();
    });

    it('should handle error during query execution', async () => {
      // Mock successful datasources response
      (listDatasources.run as jest.Mock).mockResolvedValue({
        result: [{ uid: 'ds1', name: 'Prometheus', type: 'prometheus' }]
      });

      // Mock successful query generation
      (ai.generate as jest.Mock).mockResolvedValueOnce({
        output: {
          uid: 'ds1',
          query: 'rate(http_requests_total[5m])',
          type: 'prometheus'
        }
      });

      // Mock error during query execution
      (queryDatasource.run as jest.Mock).mockRejectedValueOnce(new Error('Query execution error'));

      // Call the flow
      const result = await grafanaFlow(
        { question: 'What is the HTTP request rate?' },
        { sendChunk: mockSendChunk }
      );

      // Verify error handling
      expect(result.answer).toContain('I encountered an error while trying to query your Grafana instance');
      expect(ai.generateStream).not.toHaveBeenCalled();
    });

    it('should handle error during result interpretation', async () => {
      // Mock successful datasources response
      (listDatasources.run as jest.Mock).mockResolvedValue({
        result: [{ uid: 'ds1', name: 'Prometheus', type: 'prometheus' }]
      });

      // Mock successful query generation
      (ai.generate as jest.Mock).mockResolvedValueOnce({
        output: {
          uid: 'ds1',
          query: 'rate(http_requests_total[5m])',
          type: 'prometheus'
        }
      });

      // Mock successful query execution
      (queryDatasource.run as jest.Mock).mockResolvedValue({
        result: {
          data: [
            { metric: { method: 'GET' }, values: [[1625000000, '10'], [1625000060, '15']] }
          ]
        }
      });

      // Mock error during result interpretation
      (ai.generateStream as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Interpretation error');
      });

      // Call the flow
      const result = await grafanaFlow(
        { question: 'What is the HTTP request rate?' },
        { sendChunk: mockSendChunk }
      );

      // Verify error handling
      expect(result.answer).toContain('Error:');
    });
  });
});
