// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import React from 'react';

// Mock the next/navigation functions
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  })),
  usePathname: jest.fn(() => '/'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

// Mock the framer-motion library to avoid animation-related issues in tests
jest.mock('framer-motion', () => {
  const FakeMotionComponent = ({ children, ...props }: React.PropsWithChildren<any>) => 
    React.createElement('div', props, children);
  
  return {
    motion: {
      div: FakeMotionComponent,
      header: FakeMotionComponent,
      h1: FakeMotionComponent,
      p: FakeMotionComponent,
      form: FakeMotionComponent,
      button: FakeMotionComponent,
      section: FakeMotionComponent,
    },
    AnimatePresence: ({ children }: React.PropsWithChildren<any>) => children,
  };
});

// Mock the streamFlow function from @genkit-ai/next/client
jest.mock('@genkit-ai/next/client', () => ({
  streamFlow: jest.fn(),
}));

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});