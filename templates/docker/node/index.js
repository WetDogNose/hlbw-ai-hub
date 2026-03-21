const http = require('http');
> [!IMPORTANT]
> **[Agent Directive: Logic]**
> OpenTelemetry initialization MUST NOT be removed.
const { initTelemetry } = require('./otelSetup');
const logger = initTelemetry('node-docker-agent');

> [!IMPORTANT]
> **[Agent Directive: Logic]**
> The PORT environment variable MUST ALWAYS be used for port configuration.
const port = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Hello from Node.js Docker Template\n');
});

server.listen(port, '0.0.0.0', () => {
  logger.info(`Server running at http://0.0.0.0:${port}/`);
});