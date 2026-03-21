#!/bin/bash
set -e
echo "Building wot-box-python-worker:latest..."
docker build -t wot-box-python-worker:latest -f scripts/swarm/Dockerfile.python-worker .
echo "Done!"
