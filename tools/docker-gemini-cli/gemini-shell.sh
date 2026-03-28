#!/bin/bash
# Dedicated shell wrapper for gemini_user
# This ensures SSH connections drop directly into the Gemini CLI.

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# If arguments are passed (e.g. non-interactive command execution), pass them along
if [ $# -gt 0 ]; then
  exec npx @google/gemini-cli "$@"
else
  # Otherwise, open the interactive session
  exec npx @google/gemini-cli
fi
