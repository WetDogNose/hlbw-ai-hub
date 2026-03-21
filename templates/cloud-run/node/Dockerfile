# @agent-directive: DO NOT modify the base image unless aligning ALL Node Cloud Run templates in hlbw-ai-hub.
FROM node:20-slim

WORKDIR /app

# Copy application dependency manifests to the container image.
COPY package*.json ./

# Install production dependencies.
RUN npm ci --only=production

# Copy local code to the container image.
COPY . ./

# Run the web service on container startup.
# @agent-directive: Maintain the standard entrypoint.
CMD [ "npm", "start" ]
