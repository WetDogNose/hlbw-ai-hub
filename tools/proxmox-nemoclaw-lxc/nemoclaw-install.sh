#!/usr/bin/env bash
# Internal setup script to be run INSIDE the NemoClaw LXC

set -e

echo "=============================================="
echo "          NEMOCLAW LXC INSTALLER              "
echo "=============================================="
echo ""
echo "This script will configure Docker, Tailscale, UFW, Node.js and NVIDIA NemoClaw."
echo "I recommend using a Tailscale pre-authenticated key for headless setups."
echo "Keep it blank if you want to perform manual URL-based authentication."
read -p "Tailscale Auth Key (optional): " TS_AUTHKEY

# ==========================================
# [SECTION 1] Subsystem Base Updates
# Update native packages and install required dependencies.
# ==========================================
echo "Updating system..."
apt-get update && apt-get upgrade -y
apt-get install -y curl wget git jq ufw unzip ssh software-properties-common

# ==========================================
# [SECTION 2] Headless Tailscale Overlay Mesh
# Install the Tailscale agent to build the encrypted wireguard mesh, bypassing the router port forward requirements.
# ==========================================
echo "Installing Tailscale..."
curl -fsSL https://tailscale.com/install.sh | sh

# ==========================================
# [SECTION 3] Container Subsystem Firewalling
# Set up UFW inside the container. Explicitly blocking eth0 to prevent lateral access from compromised web tools, while leaving tailscale0 open.
# ==========================================
echo "Configuring UFW (Zero-Trust isolation)..."
# Default deny all inbound
ufw default deny incoming
ufw default allow outgoing

# Allow SSH locally if needed (optional) but we want Tailscale to be the main entry point
# We'll allow SSH primarily via Tailscale interface (tailscale0)
ufw allow in on tailscale0 to any port 22

# Allow NemoClaw/OpenShell API and management ports on Tailscale interface ONLY.
ufw allow in on tailscale0

# Deny ALL inbound on eth0 to protect from local network (except stateful traffic setup from outbound)
ufw deny in on eth0

echo "y" | ufw enable
echo "UFW configuration applied. Local isolation guaranteed."

# ==========================================
# [SECTION 4] Core Execution Toolchain (Docker & Node)
# Install Docker Engine and NodeJS natively so they are available to host the K3s/agent backend logic.
# ==========================================
echo "Installing Docker..."
# Installing docker per standard method
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

echo "Installing Node.js 22.x..."
curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh
bash nodesource_setup.sh
apt-get install -y nodejs
rm -f nodesource_setup.sh

# ==========================================
# [SECTION 5] Local AI Inference Service
# Fetches the Ollama binary. Because we mapped /dev/nvidia into the LXC, Ollama will automatically attach and expose localhost:11434.
# ==========================================
echo "Installing Ollama (Local LLM Inference Engine)..."
curl -fsSL https://ollama.com/install.sh | sh
# Ollama will automatically bind to localhost:11434 and detect passed-through /dev/nvidia* nodes.

# ==========================================
# [SECTION 6] Official NVIDIA SDK Fetch
# Pulls the NemoClaw setup logic which will eventually leverage OpenShell and map to our local Ollama inference port.
# ==========================================
echo "Installing NVIDIA NemoClaw..."
# Official NVIDIA OpenShell/NemoClaw installer
curl -fsSL https://www.nvidia.com/nemoclaw.sh | bash

# ==========================================
# [SECTION 7] Finalizing VPN Connectivity
# Connects the container to the tailnet using the user's provided Pre-Auth key (or directs manual connect).
# ==========================================
if [ -n "$TS_AUTHKEY" ]; then
    echo "Connecting to Tailscale using provided Auth Key..."
    tailscale up --authkey=$TS_AUTHKEY --ssh
else
    echo "Starting Tailscale manual authentication. Run the following command manually:"
    echo "   tailscale up --ssh"
fi

echo "=============================================="
echo "          INSTALLATION COMPLETE               "
echo "=============================================="
echo "NemoClaw is installed and sandboxed."
echo "Your UFW firewall ensures that this LXC cannot be accessed from the local LAN (eth0)."
echo "You must access the agent via your Tailscale network IP."
