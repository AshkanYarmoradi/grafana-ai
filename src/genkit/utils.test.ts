import {
  formatTemplate,
  formatQueryGenerationPrompt,
  formatResultInterpretationPrompt,
  getErrorMessage,
  logDebug,
  DatasourceInfo,
} from './utils';
import { PROMPT_TEMPLATES } from './constants';

// Mock the constants module
jest.mock('./constants', () => ({
  PROMPT_TEMPLATES: {
    QUERY_GENERATION: 'Generate a query for {{question}} using datasources: {{datasources}} at {{currentTime}}',
    RESULT_INTERPRETATION: 'Interpret results for {{question}} with data: {{queryResult}}',
    ERROR_MESSAGES: {
      GENERAL_ERROR: 'An error occurred',
      AUTH_ERROR: 'Authentication error',
      NOT_FOUND_ERROR: 'Resource not found',
      SERVER_ERROR: 'Server error',
    },
  },
}));

describe('Utils', () => {
  // Spy on console.log for logDebug tests
  const originalConsoleLog = console.log;
  beforeEach(() => {
    console.log = jest.fn();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  describe('formatTemplate', () => {
    it('should replace placeholders with actual values', () => {
      const template = 'Hello, {{name}}! Welcome to {{place}}.';
      const replacements = {
        name: 'John',
        place: 'Grafana',
      };

      const result = formatTemplate(template, replacements);

      expect(result).toBe('Hello, John! Welcome to Grafana.');
    });

    it('should replace multiple occurrences of the same placeholder', () => {
      const template = '{{name}} is using {{name}}\'s account.';
      const replacements = {
        name: 'Alice',
      };

      const result = formatTemplate(template, replacements);

      expect(result).toBe('Alice is using Alice\'s account.');
    });

    it('should handle empty replacements object', () => {
      const template = 'No replacements here.';
      const replacements = {};

      const result = formatTemplate(template, replacements);

      expect(result).toBe('No replacements here.');
    });

    it('should handle missing replacements', () => {
      const template = 'Hello, {{name}}! Welcome to {{place}}.';
      const replacements = {
        name: 'John',
        // place is missing
      };

      const result = formatTemplate(template, replacements);

      // Missing placeholders remain unchanged
      expect(result).toBe('Hello, John! Welcome to {{place}}.');
    });
  });

  describe('formatQueryGenerationPrompt', () => {
    it('should format the query generation prompt correctly', () => {
      const question = 'What is the CPU usage?';
      const datasources: DatasourceInfo[] = [
        { uid: 'ds1', name: 'Prometheus', type: 'prometheus' },
        { uid: 'ds2', name: 'Loki', type: 'loki' },
      ];

      // Mock Date.now() to return a fixed timestamp
      const mockDate = new Date('2023-01-01T12:00:00Z');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as unknown as Date);

      const result = formatQueryGenerationPrompt(question, datasources);

      // Verify the template was formatted correctly
      expect(result).toBe(
        'Generate a query for What is the CPU usage? using datasources: ' +
        '[{"uid":"ds1","name":"Prometheus","type":"prometheus"},{"uid":"ds2","name":"Loki","type":"loki"}] ' +
        'at 2023-01-01T12:00:00.000Z'
      );

      // Restore the original Date implementation
      jest.restoreAllMocks();
    });
  });

  describe('formatResultInterpretationPrompt', () => {
    it('should format the result interpretation prompt correctly with object data', () => {
      const question = 'What is the CPU usage?';
      const queryResult = {
        data: [
          { metric: 'cpu', value: 75 },
          { metric: 'memory', value: 50 },
        ],
      };

      const result = formatResultInterpretationPrompt(question, queryResult);

      // Verify the template was formatted correctly
      expect(result).toBe(
        'Interpret results for What is the CPU usage? with data: ' +
        '{"data":[{"metric":"cpu","value":75},{"metric":"memory","value":50}]}'
      );
    });

    it('should simplify large arrays in query results', () => {
      const question = 'What is the CPU usage over time?';
      const largeArray = Array.from({ length: 30 }, (_, i) => ({ time: i, value: i * 2 }));
      const queryResult = { data: largeArray };

      const result = formatResultInterpretationPrompt(question, queryResult);

      // Verify the result contains the truncation note
      expect(result).toContain('...10 more items omitted...');
      // The result should not contain all 30 items
      expect(result.match(/time/g)?.length).toBeLessThan(30);
    });

    it('should handle null or undefined query results', () => {
      const question = 'What is the CPU usage?';

      const resultWithNull = formatResultInterpretationPrompt(question, null);
      const resultWithUndefined = formatResultInterpretationPrompt(question, undefined);

      // Verify the template was formatted correctly
      expect(resultWithNull).toBe('Interpret results for What is the CPU usage? with data: null');
      expect(resultWithUndefined).toBe('Interpret results for What is the CPU usage? with data: null');
    });
  });

  describe('getErrorMessage', () => {
    it('should return auth error message for 401 status code', () => {
      const error = { statusCode: 401, message: 'Unauthorized' };
      const result = getErrorMessage(error);
      expect(result).toBe(PROMPT_TEMPLATES.ERROR_MESSAGES.AUTH_ERROR);
    });

    it('should return auth error message for 403 status code', () => {
      const error = { statusCode: 403, message: 'Forbidden' };
      const result = getErrorMessage(error);
      expect(result).toBe(PROMPT_TEMPLATES.ERROR_MESSAGES.AUTH_ERROR);
    });

    it('should return not found error message for 404 status code', () => {
      const error = { statusCode: 404, message: 'Not Found' };
      const result = getErrorMessage(error);
      expect(result).toBe(PROMPT_TEMPLATES.ERROR_MESSAGES.NOT_FOUND_ERROR);
    });

    it('should return server error message for 5xx status codes', () => {
      const error = { statusCode: 500, message: 'Internal Server Error' };
      const result = getErrorMessage(error);
      expect(result).toBe(PROMPT_TEMPLATES.ERROR_MESSAGES.SERVER_ERROR);
    });

    it('should return error message for Error objects', () => {
      const error = new Error('Some other error');
      const result = getErrorMessage(error);
      expect(result).toBe('Error: Some other error');
    });

    it('should handle non-object errors', () => {
      const result = getErrorMessage('string error');
      expect(result).toBe(PROMPT_TEMPLATES.ERROR_MESSAGES.GENERAL_ERROR);
    });
  });

  describe('logDebug', () => {
    it('should log a message with the correct prefix', () => {
      logDebug('Test message');
      expect(console.log).toHaveBeenCalledWith('[Grafana AI] Test message', '');
    });

    it('should log a message with data', () => {
      const data = { key: 'value' };
      logDebug('Test message with data', data);
      expect(console.log).toHaveBeenCalledWith('[Grafana AI] Test message with data', data);
    });
  });
});
