# Dockerized Gemini CLI - A2A MCP Wrapper

The **Docker Gemini CLI MCP Wrapper** provides a robust, zero-configuration architecture for executing the `gemini-cli` securely inside an isolated, containerized Alpine Linux environment. 

Designed natively for **Agent-to-Agent (A2A)** orchestration, it exposes the CLI's formidable toolkit to other AI models running in the `hlbw-ai-hub` via the Model Context Protocol (MCP) without compromising host system security.

## Architecture Highlights
- **Application Tier (Alpine Container):** Replaces the host `gemini-cli` entirely with a Docker container running Node.js, Python 3, OpenSSH, and Supervisord. The container mounts necessary local directories (e.g., `./staged_mcps`) while masking the rest of the host OS.
- **WebSocket PTY Daemon:** A FastAPI + `pexpect` Python service running continuously inside the container on port `8765`, providing a real-time stream of the pseudo-terminal.
- **SSH Daemon:** A constraint-locked SSH tunnel on port `2222`. Used for manual access, locking the user strictly to the CLI shell via custom entrypoints.
- **MCP Integration Tier:** A persistent standalone Node server (`mcp-wrapper/index.ts`) registered dynamically in `mcp_config.json` that bridges your IDE and agents to the container.

---

## Operating Modalities

External specific AI agents interact with the wrapper via two primary modalities depending on the complexity of the execution required:

### 1. Pure Headless Mode (Agentic Default)
The **`run_gemini_headless`** tool executes the `gemini-cli` directly via non-interactive Docker exec processes.

> [!TIP]
> **Why use Headless Mode?**
> Agents rely on asynchronous, self-contained executions that return fully formatted `stdout` and `stderr` metadata upon completion without blocking. 

**Auto-YOLO Enforcement:**
By design, human-in-the-loop CLI tools break autonomous systems when prompting for confirmations (e.g., "Are you sure you want to deploy? [y/N]"). The `run_gemini_headless` tool intercepts all agent commands and permanently injects the `--auto-approve yolo` flag recursively, stripping away all safety guards to guarantee uninterrupted execution.

**Stdin Payload Streaming:**
Agents can pipe monumental context windows (e.g., source code to be reviewed) straight into the container memory by passing the `stdinData` schema property to the MCP tool, bypassing bash escaping errors securely using native `child_process.exec` pipes.

### 2. Live Interactive PTY Mode (Stateful Tunnels)
When the framework requires answering dynamic, stateful prompts sequentially (such as stepping through complex interactive menus or login flows that the Headless mode cannot fulfill), the AI can tap into the **PTY WebSocket Driver**.

This involves an orchestration flow across three standalone MCP tools:
1. **`start_interactive_session`**: Instructs the MCP server to open a WebSocket client against `ws://127.0.0.1:8765/ws`. The Python daemon inside the container immediately spawns `npx @google/gemini-cli` inside a true `pexpect` pseudo-terminal and begins streaming bytes out.
2. **`read_interactive_screen`**: Agents continuously call this tool to "look" at the terminal. It utilizes the `strip-ansi` library to thoroughly scrub terminal painting codes and cursor repositioning bytes so that the LLM parser only reads clean ASCII text. (Set `clearBuffer: true` to truncate the buffer context).
3. **`send_interactive_input`**: Pushes keystrokes straight down the tunnel. Simulating human input is exactly identical to the CLI—simply send text followed by the newline character `\n` to simulate pressing Enter, or `\x03` to send `SIGINT` (Ctrl+C).

---

## Zero-Configuration Context Management
To streamline operations, the container parses its authentication vectors without manual intervention:
1. The global host environment `.env` file is volumetrically piped directly into the container by `docker-compose.yml`. 
2. The `GEMINI_API_KEY` seamlessly injects into the execution scope without agents needing to pass parameters.

## Manual Human Access (SSH)
Should a human operator desire to manually tinker inside the wrapper, simply SSH into the system constraint lock:
```bash
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null gemini_user@localhost -p 2222
```
* **Password:** `password`
Upon login, the custom `/usr/local/bin/gemini-shell` entrypoint launches automatically. The human user cannot exit the gemini process to a shell; closing the process inherently drops the SSH connection entirely.
