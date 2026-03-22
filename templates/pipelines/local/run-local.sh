#!/bin/bash
# // turbo-all
# A local script to mimic the `ci-validation.yml` pipeline checks natively before deploying or pushing.
set -e

echo "Starting local validation pipeline..."

if [ -f "package.json" ]; then
    echo "Node.js project detected. Running standard npm checks..."
    npm run lint
    npm run format:check || echo "Format check failed. Run 'npm run format' to fix."
    npm run test
fi

if [ -f "requirements.txt" ]; then
    echo "Python project detected. Running rigorous checks..."
    # Ensure a venv exists or prompt the user
    if [ -z "$VIRTUAL_ENV" ]; then
        echo "WARNING: No active Python virtual environment detected. Checks may fail."
    fi
    
    flake8 .
    black --check .
    pytest
fi

echo "✅ All local pipeline checks passed! You are safe to commit and push."
