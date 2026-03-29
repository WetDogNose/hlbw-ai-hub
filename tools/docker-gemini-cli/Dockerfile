FROM alpine:latest

# Install base dependencies
RUN apk update && \
    apk add --no-cache \
    nodejs npm \
    python3 py3-pip \
    openssh supervisor \
    bash vim curl jq coreutils \
    build-base linux-headers python3-dev

# Install mission-critical tools globally to prevent boot delays
RUN npm install -g tsx @modelcontextprotocol/sdk neo4j-driver

WORKDIR /home/gemini_user

# Copy requirements and install
COPY src/requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages

# Copy application tier
COPY src/ ./src/
COPY supervisord.conf /etc/supervisord.conf
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

USER root
EXPOSE 22 8765 8000

CMD ["./entrypoint.sh"]
