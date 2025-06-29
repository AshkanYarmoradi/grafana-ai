# Docker Integration for Grafana AI Assistant

This document provides instructions for running the Grafana AI Assistant using Docker.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/) (optional, but recommended)

## Quick Start with Docker Compose

The easiest way to run the application is using Docker Compose:

1. Create a `.env` file in the project root with the following variables:

```
GRAFANA_URL=https://your-grafana-instance.com
GRAFANA_USERNAME=your-grafana-username
GRAFANA_PASSWORD=your-grafana-password
GOOGLE_API_KEY=your-google-ai-api-key
DEBUG_LOGGING=false
```

2. Run the application:

```bash
docker-compose up -d
```

3. Access the application at http://localhost:3000

## Building and Running with Docker

If you prefer to use Docker directly:

1. Build the Docker image:

```bash
docker build -t grafana-ai .
```

2. Run the container:

```bash
docker run -p 3000:3000 \
  -e GRAFANA_URL=https://your-grafana-instance.com \
  -e GRAFANA_USERNAME=your-grafana-username \
  -e GRAFANA_PASSWORD=your-grafana-password \
  -e GOOGLE_API_KEY=your-google-ai-api-key \
  -e DEBUG_LOGGING=false \
  grafana-ai
```

3. Access the application at http://localhost:3000

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| GRAFANA_URL | URL of your Grafana instance | Yes |
| GRAFANA_USERNAME | Username for Grafana authentication | Yes |
| GRAFANA_PASSWORD | Password for Grafana authentication | Yes |
| GOOGLE_API_KEY | API key for Google AI services | Yes |
| DEBUG_LOGGING | Enable debug logging (true/false) | No (defaults to false) |

## Development with Docker

For development purposes, you can use the following command to run the application in development mode:

```bash
docker-compose -f docker-compose.dev.yml up
```

This will mount your local source code into the container and enable hot reloading.

## Troubleshooting

### Connection Issues

If you're having trouble connecting to your Grafana instance:

- Ensure that the GRAFANA_URL is accessible from within the Docker container
- Check that your credentials (GRAFANA_USERNAME and GRAFANA_PASSWORD) are correct
- If your Grafana instance uses a self-signed certificate, you may need to add additional configuration

### Performance Issues

- The application is configured to use Node.js in production mode for optimal performance
- If you're experiencing memory issues, you can adjust the Node.js memory limit by setting the NODE_OPTIONS environment variable:

```bash
docker run -e NODE_OPTIONS="--max-old-space-size=4096" ... grafana-ai
```

## Security Considerations

- The Docker image runs as a non-root user for improved security
- Environment variables containing sensitive information (like API keys and passwords) should be handled securely
- Consider using Docker secrets or a secure environment variable management solution in production