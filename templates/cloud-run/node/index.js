const express = require('express');
<agent_directive priority="CRITICAL" domain="Logic">OpenTelemetry initialization MUST NOT be removed.</agent_directive>
<agent_hint intent="Context">Maintaining OpenTelemetry initialization ensures uniformity across hlbw-ai-hub services.</agent_hint>
const { initTelemetry } = require('./otelSetup');
const logger = initTelemetry('node-cloudrun-agent');
const app = express();

<agent_directive priority="HIGH" domain="Logic">The port variable MUST always be assigned using 'process.env.PORT'.</agent_directive>
<agent_hint intent="Context">The default port for Cloud Run environments is 8080.</agent_hint>
const port = process.env.PORT || 8080;

app.get('/', (req, res) => {
  logger.info('Handling root request');
  res.json({ message: 'Hello from Node.js Cloud Run Template' });
});

app.listen(port, () => {
  logger.info(`Server listening on port ${port}`);
});