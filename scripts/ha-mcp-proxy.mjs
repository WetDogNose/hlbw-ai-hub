import { createInterface } from 'readline';

const targetUrl = process.argv[2];

if (!targetUrl) {
  console.error("Usage: node ha-mcp-proxy.mjs <url>");
  process.exit(1);
}

// Remove any trailing /sse since stateless HTTP uses the base URL
const baseUrl = targetUrl.replace(/\/sse\/?$/, '');

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// For each JSON-RPC request from the agent (stdin), send a stateless POST to the HA-MCP server
rl.on('line', async (line) => {
  if (!line.trim()) return;
  
  try {
    const requestPayload = JSON.parse(line);
    
    // FastMCP Stateless HTTP uses a POST request for every MCP message.
    // The server streams the JSON-RPC response back as Server-Sent Events in the response body.
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: line
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'No body');
      console.error(`Proxy HTTP error: ${response.status} - ${errText}`);
      return;
    }

    // Process the returning SSE stream from the POST response
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the incomplete line in the buffer
      
      for (const sseLine of lines) {
        if (sseLine.startsWith('data: ')) {
          const dataContent = sseLine.slice(6).trim();
          if (dataContent) {
            try {
               // Ensure it's valid JSON before outputting to stdout
               JSON.parse(dataContent);
               console.log(dataContent);
            } catch (e) {
               console.error("Failed to parse SSE data line as JSON: " + dataContent);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`Proxy execution error: ${error.message}`);
  }
});
