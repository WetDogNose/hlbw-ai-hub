const express = require('express');
// > [!IMPORTANT]
// > **[Agent Directive: Logic]**
// > OpenTelemetry initialization MUST NOT be removed.
// > [!TIP]
// > **[Agent Hint: Context]**
// > Maintaining OpenTelemetry initialization ensures uniformity across hlbw-ai-hub services.
const { initTelemetry } = require('./otelSetup');
const logger = initTelemetry('node-cloudrun-agent');
const app = express();

// > [!IMPORTANT]
// > **[Agent Directive: Logic]**
// > The port variable MUST always be assigned using 'process.env.PORT'.
// > [!TIP]
// > **[Agent Hint: Context]**
// > The default port for Cloud Run environments is 8080.
const port = process.env.PORT || 8080;

app.get('/', (req, res) => {
  logger.info('Handling root request');
  res.json({ message: 'Hello from Node.js Cloud Run Template' });
});

app.listen(port, () => {
  logger.info(`Server listening on port ${port}`);
});