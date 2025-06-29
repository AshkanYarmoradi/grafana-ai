# Testing Documentation for Grafana AI

This directory contains comprehensive tests for the Grafana AI application. The tests are designed to cover all aspects
of the application, including UI components, API services, utility functions, and integration tests.

## Testing Framework

The application uses the following testing tools:

- **Jest**: The main testing framework
- **React Testing Library**: For testing React components
- **Mock Service Worker (MSW)**: For mocking API requests
- **ts-jest**: For TypeScript support

## Test Structure

The tests are organized alongside the source code files they test, following the convention of naming test files with a
`.test.ts` or `.test.tsx` extension. This makes it easy to find the tests for a specific file and keeps the tests close
to the code they're testing.

### Main Test Categories

1. **UI Component Tests**: Tests for React components in the application
    - `src/app/page.test.tsx`: Tests for the main page component

2. **API Service Tests**: Tests for API-related functionality
    - `src/genkit/grafanaApi.test.ts`: Tests for the Grafana API client
    - `src/app/api/grafana/route.test.ts`: Tests for the API route handler

3. **Core Logic Tests**: Tests for the core business logic
    - `src/genkit/grafanaFlow.test.ts`: Tests for the main Grafana AI flow

4. **Utility Function Tests**: Tests for utility functions
    - `src/genkit/utils.test.ts`: Tests for utility functions
    - `src/genkit/constants.test.ts`: Tests for constants
    - `src/genkit/tools.test.ts`: Tests for Grafana API tools

## Running Tests

You can run the tests using the following npm scripts:

```bash
# Run all tests
npm test

# Run tests in watch mode (useful during development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Test Coverage

The tests aim to achieve high code coverage across the application. The coverage thresholds are set to 70% for:

- Statements
- Branches
- Functions
- Lines

You can view the coverage report by running `npm run test:coverage`. The report will be generated in the `coverage`
directory.

## Mocking Strategy

The tests use various mocking strategies to isolate the code being tested:

1. **API Mocks**: The `fetch` function is mocked to avoid actual API calls during testing.
2. **Environment Variables**: Environment variables are mocked to control the test environment.
3. **Component Mocks**: External components like `framer-motion` are mocked to simplify testing.
4. **Function Mocks**: Functions from dependencies are mocked to control their behavior during tests.

## Writing New Tests

When adding new features to the application, please follow these guidelines for writing tests:

1. Create a test file alongside the source file with a `.test.ts` or `.test.tsx` extension.
2. Write tests that cover both the happy path and error cases.
3. Use descriptive test names that explain what the test is checking.
4. Mock external dependencies to isolate the code being tested.
5. Aim for high code coverage, but prioritize testing critical functionality.

## Continuous Integration

The tests are run automatically as part of the CI/CD pipeline to ensure that all changes pass the tests before being
deployed.