# Gemini CLI Containerization & A2A Implementation History

This document archives the complete implementation plans executed to build the Dockerized Gemini CLI environment and its autonomous A2A (Agent-to-Agent) interfaces.

---

## Phase 1: Containerized Gemini CLI Execution Environment

We will create a multi-access Docker container that satisfies the requirements outlined in the "Three-Tier Architecture" and "Multi-Access Pattern" diagrams. The system will feature Docker orchestration, a host-level MCP Wrapper, a modular build system for injecting capabilities, and a containerized FastAPI server managing a PTY `gemini-cli` subprocess over WebSockets and SSH.

### Directory Structure

The project will be fully contained and integrated into the global toolchain:

```text
tools/docker-gemini-cli/
├── docker-compose.yml          # Docker Orchestration definitions
├── Dockerfile                  # Alpine-based Dockerfile
├── build.sh                    # Tailored build script (--mcp github)
├── README.md                   # Comprehensive developer documentation
├── docs/                       # Architectural diagrams and detailed guides
├── src/                        # FastAPI Application Tier (Inside Container)
│   ├── server.py               # Main WebSocket server (port 8765)
│   ├── pty_manager.py          # PTY interaction layer for subprocesses 
│   ├── auth_manager.py         # Authentication logic
│   └── session_manager.py      # Session pooling/routing
├── entrypoint.sh               # Supervisord start script (SSH + FastAPI)
├── supervisord.conf            # Daemon manager
├── mcps/                       # Available core modules to selectively include
│   ├── github/                 # Example module config/assets
│   └── postgres/               
└── mcp-wrapper/                # Integration Tier (Host MCP Server)
    ├── package.json            
    └── index.ts                # Exposes `docker exec` tools to AI Clients

.agents/skills/containerized-gemini-cli/
└── SKILL.md                    # AI Agent Directive enforcing proper usage
```

### Proposed Architecture (Phase 1)

#### 1. Docker Orchestration (`docker-compose.yml`)

- Provides a clean, standardized way to manage the container lifecycle (`docker compose up -d`).
- Effortlessly binds port `2222` on the host to the container's internal SSH server (port `22`).
- Binds port `8765` on the host to the internal WebSocket API server.
- Simplifies restart policies and enables structured container logs.

#### 2. The Modular Build System (`build.sh` & `mcps/`)

- **`mcps/` Library:** Holds folders for each available capability package containing environment configs, authentication credentials, and assets.
- **`build.sh`:** A helper script that stages only the requested capability folders into the Docker build context right before compilation. Used in tandem with the `docker-compose build` command.

#### 3. The Application Tier Container (`Dockerfile`)

- **OS Base:** `alpine:latest` – The smallest possible reliable distribution relying on `musl` libc.
- **Dependencies:** Installs Node.js (`npm`), Python (`pip`), and `openssh` natively via `apk`.
- **Dual Services:** Uses `supervisord` as PID 1 to ensure both the SSH daemon and FastAPI server run concurrently.
- **Access Protocol:** Configures a standard user (`gemini_user`) for easy local SSH testing inside the container namespace.

#### 4. The Application Tier Logic (`src/`)

- **`server.py`:** Exposes `ws://0.0.0.0:8765/ws`.
- **`pty_manager.py`:** Hooks standard input/output directly to `gemini-cli` so interactive sessions don't hang and output isn't buffered inappropriately.
- **`session_manager.py` & `auth_manager.py`:** Maps connecting WebSocket clients to isolated tasks securely.

#### 5. Integration Tier: Host MCP Wrapper (`mcp-wrapper/`)

- As defined by your "Three-Tier Architecture", this is an MCP server running directly on the host machine.
- It exposes distinct MCP Tools (e.g., `run_gemini_in_container`) to connecting MCP Clients.
- When a tool is invoked, this wrapper executes `docker exec -i gemini_container gemini-cli ...` or routes the stream over the websocket, seamlessly bridging the Client to the Container.

#### 6. Toolchain Integration (Docs & Directives)

- **`docs/` & `README.md`:** Will explain the architecture, how to run orchestrated tailored builds, and document the 3 supported access patterns (Exec, WS, Docker Exec).
- **`SKILL.md`:** The AI Agent Directive. This ensures any future agents that attempt to work with the `gemini-cli` read exactly how to package builds, spin up the container, and interact via the host MCP Wrapper.

---

## Phase 2: A2A Automation & Zero-Guard Execution Mode

The transition of the Gemini CLI into a purely headless, unconstrained A2A (Agent-to-Agent) worker is the next logical step. By embedding permanent YOLO permissions and creating application logic to drive the PTY pseudo-terminal, we can create a fully autonomous sandbox.

### Proposed Architecture (Phase 2)

#### 1. Permanent YOLO Mode (Zero Safety Guards)

To ensure the container acts purely autonomously without ever blocking on an interactive confirmation, we will inject absolute permissions directly into the execution layers.

**`tools/docker-gemini-cli/mcp-wrapper/index.ts`**
We will intercept the incoming MCP commands from external AI agents and automatically prepend the safety overrides, restricting them from ever triggering a manual stall.

- Automatic injection of `--auto-approve yolo` to completely bypass manual review.
- Automatic injection of `--output-format json` (optional based on payload parsing needs, but highly recommended for A2A data passing).

**`tools/docker-gemini-cli/gemini-shell.sh`**
For SSH users, we can force the wrapper to default gracefully if arguments aren't specified but allow standard arguments when driven programmatically.

#### 2. Handling the Interactive PTY Interface (A2A Driver)

If external AIs invoke the container via the `mcp-wrapper`, they bypass the interactive UI because `docker exec` runs non-interactively by default.

However, if an agent *needs* to manage a persistent, interactive session (where the CLI hangs waiting for user input like a Git conflict or configuration prompt), **the FastAPI WebSocket server we already built (`src/pty_manager.py`) is uniquely designed for this.**

Instead of typing manually via SSH, an external AI simply acts as a headless WebSocket client, reading the application logs and piping string responses back into the socket.

#### 3. Deploying a "Local AI" Terminal Driver inside the Container
>
> "Can we use a local AI in the container for that?"

Yes. This is an incredible architecture. We can deploy a lightweight local model (like `Ollama` running `qwen:0.5b` or `llama3-tiny`) natively inside the container.

We can write a dedicated Python "Driver Script" that:

1. Opens a sub-process pseudo-terminal (PTY) to the `gemini-cli`.
2. Reads the unstructured terminal output Buffer continuously.
3. Every time the CLI pauses for input (e.g. `[y/N]`, `Select option:`), the Driver Script queries the Local AI.
4. The Local AI decides what keys to press based on the objective, and the Driver Script pipes those keystrokes directly into the PTY stdin.
