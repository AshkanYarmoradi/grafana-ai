import {DEFAULT_TIME_RANGE, AI_MODELS, PROMPT_TEMPLATES} from './constants';

describe('Constants', () => {
  describe('DEFAULT_TIME_RANGE', () => {
    it('should define default time range values', () => {
      expect(DEFAULT_TIME_RANGE).toBeDefined();
      expect(DEFAULT_TIME_RANGE.FROM).toBe('now-1h');
      expect(DEFAULT_TIME_RANGE.TO).toBe('now');
    });
  });

  describe('AI_MODELS', () => {
    it('should define AI model configurations', () => {
      expect(AI_MODELS).toBeDefined();
      expect(AI_MODELS.REASONING).toBe('gemini-2.5-pro');
      expect(AI_MODELS.INTERPRETATION).toBe('gemini-2.5-flash');
    });
  });

  describe('PROMPT_TEMPLATES', () => {
    it('should define comprehensive prompt template', () => {
      expect(PROMPT_TEMPLATES.COMPREHENSIVE).toBeDefined();
      expect(typeof PROMPT_TEMPLATES.COMPREHENSIVE).toBe('string');
      expect(PROMPT_TEMPLATES.COMPREHENSIVE).toContain('{{question}}');
      expect(PROMPT_TEMPLATES.COMPREHENSIVE).toContain('{{currentTime}}');
      expect(PROMPT_TEMPLATES.COMPREHENSIVE).toContain('{{dashboards}}');
      expect(PROMPT_TEMPLATES.COMPREHENSIVE).toContain('{{panelData}}');
      expect(PROMPT_TEMPLATES.COMPREHENSIVE).toContain('SECURITY GUIDELINES');
    });

    it('should define error messages', () => {
      expect(PROMPT_TEMPLATES.ERROR_MESSAGES).toBeDefined();
      expect(PROMPT_TEMPLATES.ERROR_MESSAGES.NO_DATASOURCES).toBeDefined();
      expect(PROMPT_TEMPLATES.ERROR_MESSAGES.QUERY_GENERATION_FAILED).toBeDefined();
      expect(PROMPT_TEMPLATES.ERROR_MESSAGES.NO_DATA).toBeDefined();
      expect(PROMPT_TEMPLATES.ERROR_MESSAGES.GENERAL_ERROR).toBeDefined();
      expect(PROMPT_TEMPLATES.ERROR_MESSAGES.AUTH_ERROR).toBeDefined();
      expect(PROMPT_TEMPLATES.ERROR_MESSAGES.NOT_FOUND_ERROR).toBeDefined();
      expect(PROMPT_TEMPLATES.ERROR_MESSAGES.SERVER_ERROR).toBeDefined();
    });
  });
});
