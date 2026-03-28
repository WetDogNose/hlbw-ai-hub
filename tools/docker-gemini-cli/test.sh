#!/usr/bin/env bash
set -e

echo "=========================================="
echo "    Verifying Gemini CLI Container "
echo "=========================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

pass() {
  echo -e "${GREEN}✔ $1${NC}"
}

fail() {
  echo -e "${RED}✖ $1${NC}"
  exit 1
}

# 1. Check if the container is running
if [ $(docker inspect -f '{{.State.Running}}' gemini-cli-container 2>/dev/null) == "true" ]; then
  pass "Container 'gemini-cli-container' is running."
else
  fail "Container 'gemini-cli-container' is NOT running. Run ./build.sh and docker compose up -d first."
fi

# 2. Check SSH Port (2222)
if nc -z localhost 2222; then
  pass "SSH Daemon is listening on port 2222."
else
  fail "SSH Daemon is NOT listening on port 2222."
fi

# 3. Check WebSocket API Port (8765)
if nc -z localhost 8765; then
  pass "WebSocket API is listening on port 8765."
else
  fail "WebSocket API is NOT listening on port 8765."
fi

# 4. Check GEMINI_API_KEY injection
API_KEY=$(docker exec gemini-cli-container sh -c 'echo $GEMINI_API_KEY')
if [ -n "$API_KEY" ]; then
  pass "GEMINI_API_KEY successfully injected into container."
else
  fail "GEMINI_API_KEY is missing inside the container. Check your global .env file."
fi

# 5. Check 'gemini-cli' execution via Host Wrapper method
echo "Testing gemini-cli native execution via npx..."
if docker exec -u gemini_user gemini-cli-container sh -c 'npx @google/gemini-cli --version' > /dev/null 2>&1; then
  pass "gemini-cli executed successfully via npx @google/gemini-cli."
else
  fail "gemini-cli execution failed inside the container."
fi

echo "=========================================="
echo -e "${GREEN}All systems fully operational!${NC}"
echo "=========================================="
