import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from './page';
import { streamFlow } from '@genkit-ai/next/client';

// Mock the streamFlow function
const mockStreamFlow = streamFlow as jest.MockedFunction<typeof streamFlow>;

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
    } as any);
    
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
    } as any);
    
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