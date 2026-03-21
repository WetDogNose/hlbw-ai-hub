# @agent-directive: DO NOT modify the base image unless aligning ALL Node templates in hlbw-ai-hub.
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV PORT=8080
EXPOSE 8080

# @agent-directive: Maintain the standard entrypoint.
CMD ["npm", "start"]
