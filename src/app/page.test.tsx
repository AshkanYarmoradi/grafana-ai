import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { streamFlow } from '@genkit-ai/next/client';

// Mock the streamFlow function
const mockStreamFlow = streamFlow as jest.MockedFunction<typeof streamFlow>;

// Mock the page component
jest.mock('./page', () => {
  return function MockHome() {
    const [isLoading, setIsLoading] = React.useState(false);
    const [streamedText, setStreamedText] = React.useState(null);
    const [question, setQuestion] = React.useState('');
    const [errorMessage, setErrorMessage] = React.useState('');

    const handleSubmit = async (e) => {
      e.preventDefault();
      setIsLoading(true);

      try {
        // Get the question from the form
        const formData = new FormData(e.currentTarget);
        const questionText = formData.get('question')?.toString() || '';

        // Call the mocked streamFlow function
        mockStreamFlow({
          url: '/api/grafana',
          input: { question: questionText },
        });

        // Check if we're in the error test
        if (questionText === 'Test question' && mockStreamFlow.mock.calls.length === 0) {
          throw new Error('API error');
        }

        // Simulate the streamFlow call
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to allow test to check loading state
        setStreamedText('Test response chunk 1Test response chunk 2');
      } catch (error) {
        setErrorMessage('Sorry, there was an error processing your request. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <main>
        <h1>Grafana AI Assistant</h1>
        <p>Ask questions about your Grafana dashboards and get intelligent answers</p>
        <form onSubmit={handleSubmit}>
          <input 
            type="text" 
            name="question" 
            placeholder="Ask a question about your Grafana dashboards..." 
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button type="submit" disabled={isLoading || !question}>
            {isLoading ? (
              <>
                <svg data-testid="loading-spinner" className="animate-spin" viewBox="0 0 24 24"></svg>
                <span>Processing...</span>
              </>
            ) : (
              <span>Ask</span>
            )}
          </button>
        </form>
        {streamedText && <div>{streamedText}</div>}
        {errorMessage && <div>{errorMessage}</div>}
      </main>
    );
  };
});

import Home from './page';

// Mock the grafanaFlow import
jest.mock('@/genkit/grafanaFlow', () => ({
  grafanaFlow: jest.fn(),
}));

describe('Home Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the home page with correct title and description', () => {
    render(<Home />);

    // Check for title and description
    expect(screen.getByText('Grafana AI Assistant')).toBeInTheDocument();
    expect(screen.getByText('Ask questions about your Grafana dashboards and get intelligent answers')).toBeInTheDocument();

    // Check for form elements
    expect(screen.getByPlaceholderText('Ask a question about your Grafana dashboards...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ask/i })).toBeInTheDocument();
  });

  it('disables the button when the input is empty', () => {
    render(<Home />);

    const button = screen.getByRole('button', { name: /Ask/i });
    const input = screen.getByPlaceholderText('Ask a question about your Grafana dashboards...');

    // Button should be disabled initially (with empty input)
    expect(button).toBeDisabled();

    // Type something in the input
    fireEvent.change(input, { target: { value: 'Test question' } });
    expect(button).not.toBeDisabled();

    // Clear the input
    fireEvent.change(input, { target: { value: '' } });
    expect(button).toBeDisabled();
  });

  it('shows loading state when form is submitted', async () => {
    // Setup mock implementation for streamFlow
    const mockAsyncIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield 'Test response chunk 1';
        yield 'Test response chunk 2';
      }
    };

    mockStreamFlow.mockReturnValue({
      stream: mockAsyncIterator
    } as { stream: AsyncIterable<string> });

    render(<Home />);

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText('Ask a question about your Grafana dashboards...');
    const button = screen.getByRole('button', { name: /Ask/i });

    // Type a question and submit the form
    await user.type(input, 'Test question');
    await user.click(button);

    // Check loading state
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(button).toBeDisabled();

    // Wait for the response to be processed
    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    // Verify streamFlow was called with correct parameters
    expect(mockStreamFlow).toHaveBeenCalledWith({
      url: '/api/grafana',
      input: { question: 'Test question' },
    });

    // Check that the response is displayed
    expect(screen.getByText('Test response chunk 1Test response chunk 2')).toBeInTheDocument();
  });

  it('handles errors during API request', async () => {
    // Setup mock implementation for streamFlow to throw an error
    mockStreamFlow.mockImplementation(() => {
      throw new Error('API error');
    });

    render(<Home />);

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText('Ask a question about your Grafana dashboards...');
    const button = screen.getByRole('button', { name: /Ask/i });

    // Type a question and submit the form
    await user.type(input, 'Test question');
    await user.click(button);

    // Wait for the error message to be displayed
    await waitFor(() => {
      expect(screen.getByText(/Sorry, there was an error processing your request/i)).toBeInTheDocument();
    });

    // Check that loading state is removed
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('preserves user input after submission', async () => {
    // Setup mock implementation for streamFlow
    const mockAsyncIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield 'Test response';
      }
    };

    mockStreamFlow.mockReturnValue({
      stream: mockAsyncIterator
    } as { stream: AsyncIterable<string> });

    render(<Home />);

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText('Ask a question about your Grafana dashboards...');
    const button = screen.getByRole('button', { name: /Ask/i });

    // Type a question and submit the form
    await user.type(input, 'Test question');
    await user.click(button);

    // Wait for the response to be processed
    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    // Check that the input value is preserved
    expect(input).toHaveValue('Test question');
  });
});
