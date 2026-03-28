#!/bin/bash
# // turbo-all
set -e
echo "Building hlbw-swarm-worker:latest..."
docker build -t hlbw-swarm-worker:latest -f scripts/swarm/Dockerfile.swarm-worker .
echo "Done!"
