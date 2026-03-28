FROM alpine:latest

# Install base dependencies: Node, Python, SSH daemon, Supervisor, plus build tools
RUN apk update && \
    apk add --no-cache \
    nodejs npm \
    python3 py3-pip \
    openssh supervisor \
    bash vim curl jq coreutils \
    build-base linux-headers python3-dev

# Prepare the custom shell wrapper for the interactive SSH sessions
COPY gemini-shell.sh /usr/local/bin/gemini-shell
RUN chmod +x /usr/local/bin/gemini-shell

# Create a non-root user that defaults right into the custom Gemini shell
RUN adduser -D -s /usr/local/bin/gemini-shell gemini_user && \
    echo "gemini_user:password" | chpasswd

# Setup SSH daemon
RUN ssh-keygen -A && \
    mkdir -p /run/sshd && \
    sed -i s/#PermitRootLogin.*/PermitRootLogin\ no/ /etc/ssh/sshd_config

WORKDIR /home/gemini_user

# Install gemini-cli globally
RUN npm install -g @google/gemini-cli

# Copy Python requirements and install
COPY src/requirements.txt ./
# We use --break-system-packages because we are in an isolated container context
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages

# Copy application tier and supervisor config
COPY src/ ./src/
COPY supervisord.conf /etc/supervisord.conf
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

# Ensure .gemini folder exists for the volumes
RUN mkdir -p /home/gemini_user/.gemini && \
    chown -R gemini_user:gemini_user /home/gemini_user

# Switch back to root so entrypoint can launch supervisor (which will drop privileges for python)
USER root
EXPOSE 22 8765

CMD ["./entrypoint.sh"]
