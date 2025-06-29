# Development Guide for Grafana AI Assistant

This guide provides detailed information for developers who want to contribute to the Grafana AI Assistant project. It
covers the codebase structure, development workflow, and technical details that will help you understand how the
application works.

## Codebase Structure

```
grafana-ai/
├── public/                  # Static assets
├── src/                     # Source code
│   ├── app/                 # Next.js App Router components
│   │   ├── api/             # API routes
│   │   │   └── grafana/     # Grafana API endpoint
│   │   ├── layout.tsx       # Root layout component
│   │   └── page.tsx         # Main page component
│   └── genkit/              # GenKit AI integration
│       ├── constants.ts     # Configuration constants
│       ├── grafanaApi.ts    # Grafana API client
│       ├── grafanaFlow.ts   # Main AI flow definition
│       ├── tools.ts         # GenKit tools for Grafana
│       └── utils.ts         # Utility functions
├── .env.local               # Environment variables (not in repo)
├── next.config.ts           # Next.js configuration
├── package.json             # Dependencies and scripts
├── tailwind.config.ts       # Tailwind CSS configuration
└── tsconfig.json            # TypeScript configuration
```

## Key Components

### 1. Frontend (src/app)

The frontend is built with Next.js 15 and React 19, using the App Router architecture. The main components are:

- **page.tsx**: The main page component that renders the UI and handles user interactions
- **layout.tsx**: The root layout component that wraps the entire application

The UI is styled with Tailwind CSS and uses Framer Motion for animations.

### 2. AI Integration (src/genkit)

The AI functionality is implemented using GenKit and Google's Gemini models:

- **grafanaFlow.ts**: Defines the main AI flow that processes user questions
- **tools.ts**: Defines tools for interacting with Grafana (listDatasources, queryDatasource)
- **grafanaApi.ts**: Implements the Grafana API client with error handling and retries
- **constants.ts**: Contains configuration constants and prompt templates
- **utils.ts**: Utility functions for formatting prompts and handling errors

### 3. API Routes (src/app/api)

The application exposes a single API endpoint:

- **grafana/route.ts**: Handles POST requests to /api/grafana, which processes user questions using the grafanaFlow

## Development Workflow

### 1. Setting Up Your Development Environment

1. Clone the repository
2. Install dependencies with `npm install`
3. Create a `.env.local` file with the required environment variables (see below)
4. Start the development server with `npm run dev`

### 2. Required Environment Variables

```
# Grafana Configuration
GRAFANA_URL=https://your-grafana-instance.com
GRAFANA_API_KEY=your-grafana-api-key

# Google AI Configuration
GOOGLE_API_KEY=your-google-ai-api-key

# Optional: Enable debug logging
DEBUG_LOGGING=true
```

### 3. Development Process

1. Create a new branch for your feature or bug fix
2. Make your changes
3. Test your changes locally
4. Submit a pull request

## Understanding the AI Flow

The main AI flow in `grafanaFlow.ts` follows these steps:

1. **Discover Datasources**: Fetches available datasources from Grafana
2. **Generate Query**: Uses AI to generate an appropriate query based on the user's question
3. **Execute Query**: Runs the generated query against the selected datasource
4. **Interpret Results**: Uses AI to interpret the query results and provide a human-readable answer

### Prompt Templates

The AI uses carefully crafted prompt templates (defined in `constants.ts`) to:

1. Generate appropriate queries based on the datasource type
2. Interpret query results in a human-readable way
3. Handle error cases with helpful messages

## Testing

### Manual Testing

1. Start the development server with `npm run dev`
2. Open http://localhost:3000 in your browser
3. Enter a question about Grafana metrics
4. Verify that the application generates an appropriate query and returns a helpful answer

### Debugging

- Enable debug logging by setting `DEBUG_LOGGING=true` in your `.env.local` file
- Check the console for detailed logs about the AI flow, API requests, and errors

## Common Issues and Solutions

### 1. Authentication Issues

If you encounter authentication errors when connecting to Grafana:

- Verify that your Grafana API key has the necessary permissions
- Check that the API key is correctly set in your `.env.local` file

### 2. AI Model Errors

If the AI model fails to generate appropriate queries:

- Check that your Google AI API key is valid and has access to the Gemini models
- Verify that the prompt templates in `constants.ts` are correctly formatted

### 3. Grafana API Errors

If you encounter errors when querying Grafana:

- Verify that your Grafana instance is accessible
- Check that the datasource you're trying to query exists and is properly configured
- Ensure that the generated query is valid for the selected datasource type

## Performance Considerations

- The application uses streaming responses to provide real-time feedback to users
- AI model calls can be expensive, so consider implementing caching for common queries
- Large query results may impact performance, so consider limiting the amount of data returned

## Security Best Practices

- Never commit your `.env.local` file or any API keys to the repository
- Use environment variables for all sensitive configuration
- Implement proper authentication and authorization for production deployments
- Validate and sanitize user input to prevent injection attacks

## Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [GenKit Documentation](https://genkit.ai/docs)
- [Google AI Documentation](https://ai.google.dev/docs)
- [Grafana API Documentation](https://grafana.com/docs/grafana/latest/developers/http_api/)