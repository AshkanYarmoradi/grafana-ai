const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    // Handle module aliases (this will be automatically configured for you soon)
    '^@/(.*)$': '<rootDir>/src/$1',
    // Mock specific modules for tests
    '^react-markdown$': '<rootDir>/__mocks__/react-markdown.js',
    '^framer-motion$': '<rootDir>/__mocks__/framer-motion.js',
    '^@genkit-ai/next/client$': '<rootDir>/__mocks__/@genkit-ai/next/client.js',
    '^@/genkit/grafanaFlow$': '<rootDir>/__mocks__/@/genkit/grafanaFlow.js',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!react-markdown|mdast-util-.*|micromark.*|unist.*|vfile.*|unified|bail|is-plain-obj|trough|remark.*|decode-named-character-reference|character-entities|property-information|hast-util-whitespace|space-separated-tokens|comma-separated-tokens|mdast-util-to-hast|mdast-util-to-string|trim-lines|markdown-table|escape-string-regexp)',
  ],
  testMatch: [
    '**/__tests__/**/*.ts?(x)',
    '**/?(*.)+(spec|test).ts?(x)'
  ],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/_*.{js,jsx,ts,tsx}',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/app/api/**/*.{js,jsx,ts,tsx}', // Exclude API routes from coverage
    '!**/node_modules/**',
    '!**/.next/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  // Add worker configuration to handle async iterators better
  workerIdleMemoryLimit: '512MB',
  maxWorkers: '50%',
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);
