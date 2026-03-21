const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

<agent_directive priority="CRITICAL" domain="Security">OpenTelemetry initialization MUST NOT be removed.</agent_directive>
const { initTelemetry } = require('./otelSetup');

const logger = initTelemetry('adk-chat-interface');
const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mock ADK chat endpoint template
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    <agent_instruction execution_type="sequential" target_action="Integrate Chat Logic">
      <step order="1">Integrate actual ADK or Genkit logic into this chat endpoint.</step>
    </agent_instruction>
    <agent_directive priority="HIGH" domain="Logic">Standard Express or OpenTelemetry boilerplate MUST NOT be modified.</agent_directive>
    logger.info(`Processing chat message: "${message}"`);
    const reply = `Echo from ADK Chat Interface: You said "${message}"`;
    
    res.json({ reply });
  } catch (error) {
    logger.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  logger.info(`ADK Chat Interface running at http://localhost:${port}`);
});