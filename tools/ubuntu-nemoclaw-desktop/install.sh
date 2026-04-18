#!/usr/bin/env bash
# Standalone setup script for NemoClaw on a full fat Ubuntu Desktop
# Use this when running directly on bare-metal Ubuntu (e.g. 24.10, 25.10)

set -e

echo "====================================================="
echo "   NEMOCLAW UBUNTU DESKTOP INSTALLER (STANDALONE)    "
echo "====================================================="
echo ""
echo "This script will configure the NVIDIA Proprietary Drivers, Docker,"
echo "the NVIDIA Container Toolkit, Node.js (22.x), Ollama,"
echo "and NVIDIA NemoClaw for your native desktop."
echo "No firewall restrictions or VPN overlays will be applied."
echo ""
echo "A REBOOT will be required after this script completes to load the GPU driver!"
echo ""
read -p "Press ENTER to begin or CTRL+C to cancel."

# ==========================================
# [SECTION 1] Base Updates & Proprietary Drivers
# ==========================================
echo "Updating system..."
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl wget git jq unzip software-properties-common ubuntu-drivers-common

echo "Installing NVIDIA Proprietary Drivers..."
# This natively detects and installs the optimal proprietary driver for your specific GPU on Ubuntu
sudo ubuntu-drivers install

# ==========================================
# [SECTION 2] Core Execution Toolchain (Docker & Node)
# ==========================================
echo "Installing Docker Engine..."
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker

# ==========================================
# [SECTION 3] NVIDIA Container Toolkit
# Required for native Docker to pass GPUs directly into containers
# ==========================================
echo "Installing NVIDIA Container Toolkit..."
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --yes --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

echo "Adding current user to the 'docker' group..."
sudo usermod -aG docker $USER

echo "Installing Node.js 22.x..."
curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh
sudo bash nodesource_setup.sh
sudo apt-get install -y nodejs
rm -f nodesource_setup.sh

# ==========================================
# [SECTION 4] Local AI Inference Service
# ==========================================
echo "Installing Ollama (Local LLM Inference Engine)..."
curl -fsSL https://ollama.com/install.sh | sh

echo "Configuring Ollama to accept remote connections from Docker containers..."
sudo mkdir -p /etc/systemd/system/ollama.service.d
echo -e "[Service]\nEnvironment=\"OLLAMA_HOST=0.0.0.0:11434\"" | sudo tee /etc/systemd/system/ollama.service.d/override.conf
sudo systemctl daemon-reload
sudo systemctl restart ollama

# ==========================================
# [SECTION 5] Official NVIDIA SDK Fetch
# ==========================================
echo "Installing NVIDIA NemoClaw..."
# We wrap the installer in `sg docker` so it instantly inherits the new Docker 
# permissions without requiring you to log out or run newgrp manually!
sg docker -c "curl -fsSL https://www.nvidia.com/nemoclaw.sh | bash"

echo "=============================================="
echo "          INSTALLATION COMPLETE               "
echo "=============================================="
echo "NVIDIA Drivers and NemoClaw components are fully installed."
echo "You MUST reboot your desktop now to activate the proprietary NVIDIA drivers!"
