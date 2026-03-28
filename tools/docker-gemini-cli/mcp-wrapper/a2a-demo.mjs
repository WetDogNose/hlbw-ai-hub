import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// This is a minimal AI Agent orchestration simulator 
// demonstrating how the tools we just built are consumed by an A2A Hub.
async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["c:/Users/Jason/repos/hlbw-ai-hub/tools/docker-gemini-cli/mcp-wrapper/dist/index.js"],
  });

  const client = new Client(
    { name: "demo-client", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  await client.connect(transport);
  
  console.log("==> Connected to the newly built docker-gemini-cli-mcp server natively!\n");

  // Step 1: Start the dynamic stateful PTY tunnel directly via the MCP Tool
  console.log("1. Executing Tool: `start_interactive_session`...");
  const startRes = await client.callTool({
    name: "start_interactive_session",
    arguments: {}
  });
  console.log("   API Response:", startRes.content[0].text);

  // Give the tunnel a heartbeat to connect
  await new Promise(r => setTimeout(r, 1000));

  // Step 2: Inject raw keystrokes to mimic keyboard input
  console.log("\n2. Executing Tool: `send_interactive_input` => sending 'gemini-cli --help\\n'");
  await client.callTool({
    name: "send_interactive_input",
    arguments: { text: "gemini-cli --help\n" }
  });

  // Give the internal container Python daemon time to render and strip ANSI codes.
  console.log("   ...waiting 3 seconds for the PTY buffer to render in Docker...");
  await new Promise(r => setTimeout(r, 3000));

  // Step 3: Scrape the cleaned screen
  console.log("\n3. Executing Tool: `read_interactive_screen`...");
  const readRes = await client.callTool({
    name: "read_interactive_screen",
    arguments: { clearBuffer: true }
  });
  console.log("\n↓↓↓ THIS IS EXACTLY WHAT THE AI \"SEES\" VIA A2A ↓↓↓");
  console.log(readRes.content[0].text.trim());
  console.log("↑↑↑ ---------------------------------------- ↑↑↑");

  console.log("\n==> Interactive Demo flow complete. The Headless tools can also be run alongside this! Closing.");
  await transport.close();
}

main().catch(console.error);
