#!/bin/bash
# // turbo-all
set -e
echo "Building hlbw-python-worker:latest..."
docker build -t hlbw-python-worker:latest -f scripts/swarm/Dockerfile.python-worker .
echo "Done!"
