import { DEFAULT_TIME_RANGE, AI_MODELS, PROMPT_TEMPLATES } from './constants';

describe('Constants', () => {
  describe('DEFAULT_TIME_RANGE', () => {
    it('should have the correct structure and values', () => {
      expect(DEFAULT_TIME_RANGE).toEqual({
        FROM: 'now-1h',
        TO: 'now',
      });
    });
  });

  describe('AI_MODELS', () => {
    it('should have the correct structure and values', () => {
      expect(AI_MODELS).toEqual({
        REASONING: 'gemini-2.5-pro',
        INTERPRETATION: 'gemini-1.5-flash',
      });
    });
  });

  describe('PROMPT_TEMPLATES', () => {
    it('should have the correct structure', () => {
      expect(PROMPT_TEMPLATES).toHaveProperty('QUERY_GENERATION');
      expect(PROMPT_TEMPLATES).toHaveProperty('RESULT_INTERPRETATION');
      expect(PROMPT_TEMPLATES).toHaveProperty('ERROR_MESSAGES');
    });

    it('should have the correct error messages', () => {
      expect(PROMPT_TEMPLATES.ERROR_MESSAGES).toHaveProperty('NO_DATASOURCES');
      expect(PROMPT_TEMPLATES.ERROR_MESSAGES).toHaveProperty('QUERY_GENERATION_FAILED');
      expect(PROMPT_TEMPLATES.ERROR_MESSAGES).toHaveProperty('NO_DATA');
      expect(PROMPT_TEMPLATES.ERROR_MESSAGES).toHaveProperty('GENERAL_ERROR');
      expect(PROMPT_TEMPLATES.ERROR_MESSAGES).toHaveProperty('AUTH_ERROR');
      expect(PROMPT_TEMPLATES.ERROR_MESSAGES).toHaveProperty('NOT_FOUND_ERROR');
      expect(PROMPT_TEMPLATES.ERROR_MESSAGES).toHaveProperty('SERVER_ERROR');
    });

    it('should have the correct query generation template', () => {
      expect(PROMPT_TEMPLATES.QUERY_GENERATION).toContain('{{question}}');
      expect(PROMPT_TEMPLATES.QUERY_GENERATION).toContain('{{currentTime}}');
      expect(PROMPT_TEMPLATES.QUERY_GENERATION).toContain('{{datasources}}');
    });

    it('should have the correct result interpretation template', () => {
      expect(PROMPT_TEMPLATES.RESULT_INTERPRETATION).toContain('{{question}}');
      expect(PROMPT_TEMPLATES.RESULT_INTERPRETATION).toContain('{{queryResult}}');
    });
  });
});