import { grafanaFlow } from './grafanaFlow';
import { ai, listDatasources, queryDatasource } from './tools';
import { DEFAULT_TIME_RANGE } from './constants';

// Mock the tools module
jest.mock('./tools', () => ({
  ai: {
    defineFlow: jest.fn((config, fn) => fn),
    generateText: jest.fn(),
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
      
      // Mock ai.generateText to return a query
      (ai.generateText as jest.Mock).mockResolvedValueOnce({
        text: JSON.stringify({
          datasource: 'ds1',
          query: 'rate(http_requests_total[5m])',
          explanation: 'This query gets the rate of HTTP requests over 5 minutes'
        })
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
      
      // Mock ai.generateText for result interpretation
      (ai.generateText as jest.Mock).mockResolvedValueOnce({
        text: 'The HTTP request rate shows an increase over the 5-minute period.'
      });
      
      // Call the flow
      const result = await grafanaFlow(
        { question: 'What is the HTTP request rate?' },
        { sendChunk: mockSendChunk }
      );
      
      // Verify the flow executed all steps
      expect(listDatasources.run).toHaveBeenCalledTimes(1);
      expect(ai.generateText).toHaveBeenCalledTimes(2); // Once for query generation, once for interpretation
      expect(queryDatasource.run).toHaveBeenCalledTimes(1);
      
      // Verify the query parameters
      expect(queryDatasource.run).toHaveBeenCalledWith({
        datasourceUid: 'ds1',
        query: 'rate(http_requests_total[5m])',
        timeRange: DEFAULT_TIME_RANGE
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
      expect(result.answer).toContain('No datasources found');
      expect(ai.generateText).not.toHaveBeenCalled();
      expect(queryDatasource.run).not.toHaveBeenCalled();
    });
    
    it('should handle error during query generation', async () => {
      // Mock successful datasources response
      (listDatasources.run as jest.Mock).mockResolvedValue({
        result: [{ uid: 'ds1', name: 'Prometheus', type: 'prometheus' }]
      });
      
      // Mock error during query generation
      (ai.generateText as jest.Mock).mockRejectedValueOnce(new Error('AI model error'));
      
      // Call the flow
      const result = await grafanaFlow(
        { question: 'What is the HTTP request rate?' },
        { sendChunk: mockSendChunk }
      );
      
      // Verify error handling
      expect(result.answer).toContain('Error: AI model error');
      expect(queryDatasource.run).not.toHaveBeenCalled();
    });
    
    it('should handle error during query execution', async () => {
      // Mock successful datasources response
      (listDatasources.run as jest.Mock).mockResolvedValue({
        result: [{ uid: 'ds1', name: 'Prometheus', type: 'prometheus' }]
      });
      
      // Mock successful query generation
      (ai.generateText as jest.Mock).mockResolvedValueOnce({
        text: JSON.stringify({
          datasource: 'ds1',
          query: 'rate(http_requests_total[5m])',
          explanation: 'This query gets the rate of HTTP requests over 5 minutes'
        })
      });
      
      // Mock error during query execution
      (queryDatasource.run as jest.Mock).mockRejectedValueOnce(new Error('Query execution error'));
      
      // Call the flow
      const result = await grafanaFlow(
        { question: 'What is the HTTP request rate?' },
        { sendChunk: mockSendChunk }
      );
      
      // Verify error handling
      expect(result.answer).toContain('Error: Query execution error');
    });
    
    it('should handle error during result interpretation', async () => {
      // Mock successful datasources response
      (listDatasources.run as jest.Mock).mockResolvedValue({
        result: [{ uid: 'ds1', name: 'Prometheus', type: 'prometheus' }]
      });
      
      // Mock successful query generation
      (ai.generateText as jest.Mock).mockResolvedValueOnce({
        text: JSON.stringify({
          datasource: 'ds1',
          query: 'rate(http_requests_total[5m])',
          explanation: 'This query gets the rate of HTTP requests over 5 minutes'
        })
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
      (ai.generateText as jest.Mock).mockRejectedValueOnce(new Error('Interpretation error'));
      
      // Call the flow
      const result = await grafanaFlow(
        { question: 'What is the HTTP request rate?' },
        { sendChunk: mockSendChunk }
      );
      
      // Verify error handling
      expect(result.answer).toContain('Error: Interpretation error');
    });
  });
});