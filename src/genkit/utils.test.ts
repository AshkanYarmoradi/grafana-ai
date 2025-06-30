import {
  formatTemplate,
  simplifyDatasources,
  formatComprehensivePromptForSelection,
  formatComprehensivePromptForInterpretation,
  getErrorMessage,
  logDebug,
  DatasourceInfo
} from './utils';
import { PROMPT_TEMPLATES } from './constants';

// Mock console.log to avoid cluttering test output
jest.spyOn(console, 'log').mockImplementation(() => {});

describe('Utils', () => {
  describe('formatTemplate', () => {
    it('should replace placeholders in a template string', () => {
      const template = 'Hello {{name}}, welcome to {{place}}!';
      const replacements = {
        name: 'John',
        place: 'Grafana'
      };

      const result = formatTemplate(template, replacements);

      expect(result).toBe('Hello John, welcome to Grafana!');
    });

    it('should replace multiple occurrences of the same placeholder', () => {
      const template = 'Hello {{name}}, {{name}} is a nice name!';
      const replacements = {
        name: 'John'
      };

      const result = formatTemplate(template, replacements);

      expect(result).toBe('Hello John, John is a nice name!');
    });

    it('should handle empty replacements object', () => {
      const template = 'Hello {{name}}!';
      const replacements = {};

      const result = formatTemplate(template, replacements);

      expect(result).toBe('Hello {{name}}!');
    });
  });

  describe('simplifyDatasources', () => {
    it('should extract uid, name, and type from datasources', () => {
      const datasources: DatasourceInfo[] = [
        { uid: 'ds1', name: 'Prometheus', type: 'prometheus', extraField: 'value' } as DatasourceInfo & { extraField: string },
        { uid: 'ds2', name: 'MySQL', type: 'mysql', anotherField: 123 } as DatasourceInfo & { anotherField: number }
      ];

      const result = simplifyDatasources(datasources);

      expect(result).toEqual([
        { uid: 'ds1', name: 'Prometheus', type: 'prometheus' },
        { uid: 'ds2', name: 'MySQL', type: 'mysql' }
      ]);

      // Ensure extra fields are removed
      expect(result[0]).not.toHaveProperty('extraField');
      expect(result[1]).not.toHaveProperty('anotherField');
    });

    it('should handle empty array', () => {
      const result = simplifyDatasources([]);
      expect(result).toEqual([]);
    });
  });

  describe('formatComprehensivePromptForSelection', () => {
    it('should format comprehensive prompt for panel selection with question and dashboards', () => {
      const question = 'What is the CPU usage?';
      const dashboards = [
        { uid: 'dash1', title: 'System Metrics', url: '/d/dash1', tags: ['system'] }
      ];

      // Mock Date.toISOString to return a consistent value
      const originalDate = global.Date;
      const mockDate = new Date('2023-01-01T00:00:00Z');
      global.Date = jest.fn(() => mockDate) as unknown as typeof Date;
      global.Date.prototype.toISOString = jest.fn(() => '2023-01-01T00:00:00.000Z');

      const result = formatComprehensivePromptForSelection(question, dashboards);

      // Restore original Date
      global.Date = originalDate;

      // Verify the prompt contains the expected placeholders replaced with values
      expect(result).toContain(question);
      expect(result).toContain('2023-01-01T00:00:00.000Z');
      expect(result).toContain(JSON.stringify(dashboards));
      expect(result).toContain('""'); // Empty panel data for selection mode

      // Verify the prompt is based on the template
      const expectedPrompt = PROMPT_TEMPLATES.COMPREHENSIVE
        .replace('{{question}}', question)
        .replace('{{currentTime}}', '2023-01-01T00:00:00.000Z')
        .replace('{{dashboards}}', JSON.stringify(dashboards))
        .replace('{{panelData}}', '""');

      expect(result).toBe(expectedPrompt);
    });
  });

  describe('formatComprehensivePromptForInterpretation', () => {
    it('should format comprehensive prompt for data interpretation with question and panel data', () => {
      const question = 'What is the CPU usage?';
      const panelData = { 
        series: [
          { name: 'CPU', values: [10, 20, 30, 40, 50] }
        ]
      };

      // Mock Date.toISOString to return a consistent value
      const originalDate = global.Date;
      const mockDate = new Date('2023-01-01T00:00:00Z');
      global.Date = jest.fn(() => mockDate) as unknown as typeof Date;
      global.Date.prototype.toISOString = jest.fn(() => '2023-01-01T00:00:00.000Z');

      const result = formatComprehensivePromptForInterpretation(question, panelData);

      // Restore original Date
      global.Date = originalDate;

      // Verify the prompt contains the expected placeholders replaced with values
      expect(result).toContain(question);
      expect(result).toContain('2023-01-01T00:00:00.000Z');
      expect(result).toContain('[]'); // Empty dashboards for interpretation mode
      expect(result).toContain(JSON.stringify(panelData));

      // Verify the prompt is based on the template
      const expectedPrompt = PROMPT_TEMPLATES.COMPREHENSIVE
        .replace('{{question}}', question)
        .replace('{{currentTime}}', '2023-01-01T00:00:00.000Z')
        .replace('{{dashboards}}', '[]')
        .replace('{{panelData}}', JSON.stringify(panelData));

      expect(result).toBe(expectedPrompt);
    });

    it('should simplify large arrays in panel data', () => {
      const question = 'What is the CPU usage?';
      const largeArray = Array(30).fill(0).map((_, i) => i);
      const panelData = { 
        series: [
          { name: 'CPU', values: largeArray }
        ]
      };

      const result = formatComprehensivePromptForInterpretation(question, panelData);

      // The large array should be truncated in the result
      expect(result).not.toContain(JSON.stringify(largeArray));

      // The result should contain a note about omitted items
      expect(result).toContain('more items omitted');
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error object', () => {
      const error = new Error('Test error message');
      const result = getErrorMessage(error);

      expect(result).toBe('Error: Test error message');
    });

    it('should extract message from object with message property', () => {
      const error = { message: 'Test error message' };
      const result = getErrorMessage(error);

      expect(result).toBe('Error: Test error message');
    });

    it('should handle GrafanaApiError with status code', () => {
      const error = { 
        statusCode: 401,
        message: 'Unauthorized'
      };
      const result = getErrorMessage(error);

      expect(result).toBe(PROMPT_TEMPLATES.ERROR_MESSAGES.AUTH_ERROR);
    });

    it('should handle GrafanaApiError with 404 status code', () => {
      const error = { 
        statusCode: 404,
        message: 'Not Found'
      };
      const result = getErrorMessage(error);

      expect(result).toBe(PROMPT_TEMPLATES.ERROR_MESSAGES.NOT_FOUND_ERROR);
    });

    it('should handle GrafanaApiError with 500 status code', () => {
      const error = { 
        statusCode: 500,
        message: 'Server Error'
      };
      const result = getErrorMessage(error);

      expect(result).toBe(PROMPT_TEMPLATES.ERROR_MESSAGES.SERVER_ERROR);
    });

    it('should return general error message for unknown error', () => {
      const result = getErrorMessage(undefined);

      expect(result).toBe(PROMPT_TEMPLATES.ERROR_MESSAGES.GENERAL_ERROR);
    });
  });

  describe('logDebug', () => {
    it('should log message with data', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      const message = 'Test message';
      const data = { key: 'value' };

      logDebug(message, data);

      expect(consoleSpy).toHaveBeenCalledWith(`[Grafana AI] ${message}`, data);
    });

    it('should log message without data', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      const message = 'Test message';

      logDebug(message);

      expect(consoleSpy).toHaveBeenCalledWith(`[Grafana AI] ${message}`, '');
    });
  });
});
