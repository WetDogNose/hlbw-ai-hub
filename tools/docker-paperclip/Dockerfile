FROM node:20-slim

# Install wait-for-it for optional dependencies, socat, and paperclipai globally
RUN apt-get update && apt-get install -y --no-install-recommends curl jq wget socat python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g paperclipai@latest @anthropic-ai/claude-code \
    && pip3 install --no-cache-dir aider-chat --break-system-packages \
    && python3 -m venv /opt/litellm \
    && /opt/litellm/bin/pip install --no-cache-dir "litellm[proxy]" \
    && mkdir -p /paperclip \
    && chown -R node:node /paperclip

# Escalate down to a non-root user so embedded Postgres accepts the runtime environment natively
USER node

# Configure default Environment Variables for Paperclip
ENV PAPERCLIP_HOME=/paperclip
ENV PAPERCLIP_DEPLOYMENT_MODE=local_trusted
# Run paperclip on loopback internally to pass doctor check
ENV HOST=127.0.0.1
# Ensure Ollama LLMs use the host's Ollama instance. This maps accurately for Docker Desktop or newer docker setups.
ENV OPENAI_BASE_URL=http://host.docker.internal:11434/v1
ENV OPENAI_API_KEY=ollama

# Mock Anthropic variables so Claude Code CLI works without credentials and routes to local proxy
ENV ANTHROPIC_BASE_URL=http://127.0.0.1:4000
ENV ANTHROPIC_API_KEY=sk-mock

# Database mounts and artifact persistence
VOLUME /paperclip
EXPOSE 3100

# The orchestrator gracefully handles new setups by forcing a silent onboard and kicking off the daemon.
# We also spool LiteLLM in the background to serve as an Anthropic-to-Ollama transcription proxy.
CMD ["sh", "-c", "socat TCP-LISTEN:3101,fork TCP:127.0.0.1:3100 & /opt/litellm/bin/litellm --model ollama_chat/qwen2.5-coder:32b --api_base http://host.docker.internal:11434 --port 4000 --drop_params & paperclipai onboard --yes -d /paperclip && paperclipai run -d /paperclip"]
