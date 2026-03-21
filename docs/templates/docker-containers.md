# Docker Container Templates

The `templates/docker/` directory contains standard, baseline container templates for Node.js and Python projects.

## When to Use
Use these templates when:
1. You are building an agent or backend service that needs to run in a standalone Docker container locally or on a standard non-serverless cluster (e.g., standard Kubernetes or VPS).
2. You need a fast, un-opinionated starting point for a brand new service.

## Structure

### Python (`templates/docker/python`)
- **Base Image**: `python:3.11-slim`
- **Capabilities**: A simple standard HTTP server listening on `$PORT` (default `8080`).
- **How to Use**:
  1. Copy the contents of the directory into your new agent/service folder.
  2. Add your Python dependencies to `requirements.txt`.
  3. Replace the logic in `main.py` with your implementation.
  4. Run `docker build -t my-python-agent .`

### Node.js (`templates/docker/node`)
- **Base Image**: `node:20-slim`
- **Capabilities**: Standard Node HTTP server with `package.json` pre-configured to listen on `$PORT` (default `8080`).
- **How to Use**:
  1. Copy the contents of the directory into your new service folder.
  2. Add required npm packages to `package.json`.
  3. Replace `index.js` with your core agent routing logic.
  4. Run `docker build -t my-node-agent .`

## Key Rules
- **Port Binding**: You must always bind your server to `0.0.0.0` and listen to the `PORT` environment variable. Standardizing this locally ensures that the container will transition easily to platforms like Cloud Run in the future.
- **Statelessness**: Build your containers assuming they will be destroyed and recreated. Use external object storage or databases for persistent data.
