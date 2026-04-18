import express from 'express';
import { WebSocketServer } from 'ws';
import neo4j from 'neo4j-driver';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Set up Neo4j driver
// In docker, the host hlbw-neo4j should be accessible.
// Since the frontend is in the browser, providing the driver proxy here avoids CORS and exposure issues.
const neo4jUrl = process.env.NEO4J_URL || 'bolt://hlbw-neo4j:7687';
const neo4jUser = process.env.NEO4J_USERNAME || 'neo4j';
const neo4jPassword = process.env.NEO4J_PASSWORD || 'wotbox-swarm';

let driver;
try {
  driver = neo4j.driver(neo4jUrl, neo4j.auth.basic(neo4jUser, neo4jPassword));
} catch (err) {
  console.error('Failed to initialize Neo4j driver:', err.message);
}

// Health check endpoint for agents to verify if monitor is running
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Proxy endpoint to query the graph state
app.get('/api/graph', async (req, res) => {
  if (!driver) {
    return res.status(503).json({ error: 'Neo4j driver not initialized' });
  }

  const session = driver.session();
  try {
    // Basic query to fetch up to 1000 entities and their relations
    const result = await session.run(`
      MATCH (n:Memory)
      OPTIONAL MATCH (n)-[r]->(m:Memory)
      RETURN n, r, m
      LIMIT 1000
    `);

    const nodesMap = new Map();
    const edges = [];

    result.records.forEach((record) => {
      const n = record.get('n');
      if (n) {
        if (!nodesMap.has(n.identity.toString())) {
          nodesMap.set(n.identity.toString(), {
            id: n.identity.toString(),
            label: n.properties.name || 'Unknown',
            group: n.properties.type || 'default',
            properties: n.properties,
          });
        }
      }

      const r = record.get('r');
      const m = record.get('m');
      if (r && m) {
        if (!nodesMap.has(m.identity.toString())) {
          nodesMap.set(m.identity.toString(), {
            id: m.identity.toString(),
            label: m.properties.name || 'Unknown',
            group: m.properties.type || 'default',
            properties: m.properties,
          });
        }

        edges.push({
          id: r.identity.toString(),
          from: r.start.toString(),
          to: r.end.toString(),
          label: r.type,
          title: r.type,
        });
      }
    });

    const nodes = Array.from(nodesMap.values());
    console.log(`[GraphAPI] Sending ${nodes.length} nodes and ${edges.length} edges to client.`);
    
    res.json({
      nodes,
      edges,
    });
  } catch (err) {
    console.error('Neo4j Query Error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

const server = app.listen(port, () => {
    console.log(`Memory fragment monitor running on http://localhost:${port}`);
    console.log(`Neo4j URL: ${neo4jUrl}`);
});

// WebSocket Server for receiving logs
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log('Client connected to websocket');
    
    ws.on('message', (message) => {
        // Broadcast the message to all other connected clients
        wss.clients.forEach(client => {
            if (client !== ws && client.readyState === 1 /* WebSocket.OPEN */) {
                client.send(message.toString());
            }
        });
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});
