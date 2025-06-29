# Contributing to Grafana AI Assistant

Thank you for considering contributing to Grafana AI Assistant! This document provides guidelines and instructions for
contributing to this project.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful, inclusive, and
considerate in all interactions.

## How Can I Contribute?

### Reporting Bugs

If you find a bug, please create an issue with the following information:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Screenshots (if applicable)
- Environment details (OS, browser, etc.)

### Suggesting Enhancements

We welcome suggestions for enhancements! Please create an issue with:

- A clear, descriptive title
- A detailed description of the proposed enhancement
- Any relevant examples or mockups
- Explanation of why this enhancement would be useful

### Pull Requests

1. Fork the repository
2. Create a new branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests to ensure your changes don't break existing functionality
5. Commit your changes (`git commit -m 'Add some amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Development Setup

### Prerequisites

- Node.js 18.x or higher
- A Grafana instance with API access
- Google AI API key (for Gemini models)

### Environment Setup

Create a `.env.local` file in the root directory with the following variables:

```env
# Grafana Configuration
GRAFANA_URL=https://your-grafana-instance.com
GRAFANA_API_KEY=your-grafana-api-key

# Google AI Configuration
GOOGLE_API_KEY=your-google-ai-api-key

# Optional: Enable debug logging
DEBUG_LOGGING=true
```

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/grafana-ai.git
   cd grafana-ai
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

## Coding Guidelines

### JavaScript/TypeScript

- Use TypeScript for all new code
- Follow the existing code style
- Use meaningful variable and function names
- Add comments for complex logic
- Use async/await for asynchronous code

### React Components

- Use functional components with hooks
- Keep components small and focused
- Use proper prop types
- Follow the existing component structure

### Testing

- Write tests for new features
- Ensure all tests pass before submitting a PR
- Test your changes in different environments if possible

## Git Commit Messages

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line

## Documentation

- Update documentation when changing functionality
- Use clear, concise language
- Include examples where appropriate

## Review Process

All submissions require review. We use GitHub pull requests for this purpose.

## Thank You!

Your contributions are greatly appreciated. Together, we can make Grafana AI Assistant even better!