#!/bin/bash
set -e

echo "[BUILD] Preparing Containerized Gemini CLI Environment..."

# Ensure staged directory exists empty
mkdir -p staged_mcps
echo '{"mcpServers": {}}' > staged_mcps/mcp_config.json

# If modules are requested via arguments, inject them
if [ "$#" -gt 0 ]; then
    echo "[BUILD] Staging requested MCP modules..."
    for module in "$@"; do
        if [ -d "mcps/$module" ]; then
            echo " -> Staging $module"
            
            # Simple merge using jq
            if command -v jq &> /dev/null && [ -f "mcps/$module/config.json" ]; then
                jq -s '.[0] * .[1]' staged_mcps/mcp_config.json "mcps/$module/config.json" > tmp.json && mv tmp.json staged_mcps/mcp_config.json
            else
                echo "Warning: jq not found or config missing. Skipping automatic merge for $module."
            fi
            
            # Copy any assets unconditionally
            if [ -d "mcps/$module/assets" ]; then
                cp -r "mcps/$module/assets/"* staged_mcps/ 2>/dev/null || true
            fi
        else
            echo " -> Warning: MCP module '$module' not found."
        fi
    done
else
    echo "[BUILD] No modules specified. Building barebones environment."
fi

echo "[BUILD] Triggering Docker Compose orchestration..."
docker compose build

echo ""
echo "======================================================"
echo " Build complete."
echo " Start environment via: docker compose up -d"
echo " Zero-config active: Key mapped from global hub .env"
echo "======================================================"
