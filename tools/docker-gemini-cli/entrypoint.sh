#!/bin/bash
set -e

# The mounted staged_mcps volume might be owned by root on the host if run natively via Docker natively
chown -R gemini_user:gemini_user /home/gemini_user/.gemini 2>/dev/null || true

echo "Starting Gemini Container Services..."
exec /usr/bin/supervisord -c /etc/supervisord.conf
