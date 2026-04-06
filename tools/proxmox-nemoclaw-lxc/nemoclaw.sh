#!/usr/bin/env bash

# NemoClaw LXC Proxmox Setup Script
# This script creates an Ubuntu 24.04 LXC tailored for NVIDIA NemoClaw.

function msg_info() { echo -e "\e[1;34m[INFO]\e[0m $1"; }
function msg_ok() { echo -e "\e[1;32m[OK]\e[0m $1"; }
function msg_warn() { echo -e "\e[1;33m[WARN]\e[0m $1"; }
function msg_error() { echo -e "\e[1;31m[ERROR]\e[0m $1"; exit 1; }

# ==========================================
# [SECTION 1] User Configuration Prompts
# Collects VLAN IDs, Gateway IPs, and determines the target network isolation strategy.
# ==========================================
msg_info "Starting NemoClaw LXC Creation on Proxmox..."

CTID=""
STORAGE="local-lvm"
VLAN=""
GPU_PASSTHROUGH="n"

read -p "Enter Container ID (e.g. 200, leave blank for next available): " CTID
if [ -z "$CTID" ]; then
    CTID=$(pvesh get /cluster/nextid)
    msg_info "Using next available ID: $CTID"
fi

read -p "Enter Storage Pool (default: local-lvm): " STORAGE
STORAGE=${STORAGE:-local-lvm}

read -p "Enter VLAN ID (optional, leave blank for no VLAN): " VLAN
if [ -n "$VLAN" ]; then
    VLAN_STR=",tag=$VLAN"
    msg_info "VLAN Tag securely set to $VLAN"
else
    VLAN_STR=""
fi

read -p "Enable GPU Passthrough for NVIDIA? (y/N): " GPU_PASSTHROUGH
GPU_PASSTHROUGH=${GPU_PASSTHROUGH:-n}

read -p "Enable Native Proxmox Firewall Isolation? (y/N): " USE_FW
USE_FW=${USE_FW:-n}
if [[ "$USE_FW" =~ ^[Yy]$ ]]; then
    read -p "  -> Enter your Internet Gateway IP (e.g., 192.168.1.1): " GATEWAY_IP
    read -p "  -> Enter your Local Subnet to Block (e.g., 192.168.1.0/24): " BLOCK_SUBNET
    FW_STR=",firewall=1"
else
    FW_STR=""
fi

# ==========================================
# [SECTION 2] Template Fetching & Downloading
# Automatically locates and pulls the latest standard Ubuntu 24.04 image from local cache or internet.
# ==========================================
msg_info "Updating container templates..."
pveam update >/dev/null
TEMPLATE=$(pveam available -section system | grep "ubuntu-24.04-standard" | sort -V | tail -n 1 | awk '{print $2}')
if [ -z "$TEMPLATE" ]; then
    msg_error "Could not find Ubuntu 24.04 template. Please run 'pveam download local ubuntu-24.04-standard_..._amd64.tar.zst'"
fi

msg_info "Downloading template $TEMPLATE..."
pveam download local $TEMPLATE >/dev/null

# ==========================================
# [SECTION 3] LXC Container Creation
# Provisions the main unprivileged sandbox. Critically enables nesting=1 and keyctl=1 so Docker and K3s can run nested inside.
# ==========================================
msg_info "Creating LXC Container $CTID..."
# Features needed: nesting=1 for Docker/K3s, keyctl=1
# Core limits: min 4 cores, 8GB RAM, 40GB Disk per NemoClaw docs
pvesh create /nodes/localhost/lxc \
    -vmid $CTID \
    -ostemplate local:vztmpl/${TEMPLATE##*/} \
    -storage $STORAGE \
    -rootfs ${STORAGE}:40 \
    -cores 4 \
    -memory 8192 \
    -swap 8192 \
    -net0 name=eth0,bridge=vmbr0,ip=dhcp${VLAN_STR}${FW_STR} \
    -features nesting=1,keyctl=1 \
    -unprivileged 1 \
    -hostname nemoclaw

msg_ok "Created LXC Container $CTID"

# ==========================================
# [SECTION 4] Proxmox CGroups GPU Passthrough
# Dynamically binds Proxmox character devices directly into the unprivileged sandbox so Ollama can interface with CUDA natively.
# ==========================================
if [[ "$GPU_PASSTHROUGH" =~ ^[Yy]$ ]]; then
    msg_info "Configuring NVIDIA GPU Passthrough..."
    CONF_FILE="/etc/pve/lxc/${CTID}.conf"
    
    cat <<EOF >> $CONF_FILE
# NVIDIA GPU Passthrough mappings
lxc.cgroup2.devices.allow: c 195:* rwm
lxc.cgroup2.devices.allow: c 226:* rwm
lxc.cgroup2.devices.allow: c 242:* rwm
lxc.mount.entry: /dev/nvidia0 dev/nvidia0 none bind,optional,create=file
lxc.mount.entry: /dev/nvidiactl dev/nvidiactl none bind,optional,create=file
lxc.mount.entry: /dev/nvidia-uvm dev/nvidia-uvm none bind,optional,create=file
lxc.mount.entry: /dev/nvidia-modeset dev/nvidia-modeset none bind,optional,create=file
lxc.mount.entry: /dev/nvidia-uvm-tools dev/nvidia-uvm-tools none bind,optional,create=file
EOF
    msg_ok "GPU mapping appended to LXC Config."
    msg_warn "NOTE: Ensure unprivileged UID/GID mappings correspond correctly, or change unprivileged to 0 if permission issues arise."
fi

# ==========================================
# [SECTION 5] Zero-Trust Firewall Execution
# Dynamically creates a hypervisor-level micro-segmentation wrapper using Proxmox native .fw definitions if opted for over VLANs.
# ==========================================
if [[ "$USE_FW" =~ ^[Yy]$ ]]; then
    msg_info "Deploying Zero-Trust Proxmox Firewall rules..."
    FW_CONF="/etc/pve/firewall/${CTID}.fw"
    cat <<EOF > $FW_CONF
[OPTIONS]

enable: 1

[RULES]

OUT ACCEPT -dest ${GATEWAY_IP} -log nolog
OUT DROP -dest ${BLOCK_SUBNET} -log nolog
OUT ACCEPT -dest 0.0.0.0/0 -log nolog
EOF
    msg_ok "Firewall isolation enforced (dropped: $BLOCK_SUBNET)."
fi

# ==========================================
# [SECTION 6] Container Startup & Inject Scripts
# Boots the new LXC and explicitly passes the internal installer script down into the root filesystem.
# ==========================================
msg_info "Starting container..."
pct start $CTID
sleep 10 # Wait for network and OS to stabilize

msg_info "Pushing nemoclaw-install.sh to container..."
if [ -f "nemoclaw-install.sh" ]; then
    pct push $CTID ./nemoclaw-install.sh /root/nemoclaw-install.sh -perms 755
else
    msg_warn "nemoclaw-install.sh not found locally in the same directory. Please copy it into the LXC manually."
fi

msg_ok "Container setup complete!"
echo "--------------------------------------------------------"
echo "Connect to the container via Proxmox shell with:"
echo "   pct enter $CTID"
echo "Then complete installation by running:"
echo "   /root/nemoclaw-install.sh"
echo "--------------------------------------------------------"
