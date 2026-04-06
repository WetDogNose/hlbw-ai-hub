#!/usr/bin/env bash
# Proxmox NVIDIA GPU Driver Auto-Installer

set -e

echo "================================================="
echo "   PROXMOX NVIDIA GPU DRIVER AUTO-INSTALLER      "
echo "================================================="
echo "This script must be run directly on the Proxmox Host natively via SSH or Shell."
echo "Press ENTER to begin or CTRL+C to cancel."
read -r

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

echo "[1/6] Modifying apt sources to include non-free and non-free-firmware components..."
# Instead of relying on sed to parse an unknown sources.list format (which could be deb822),
# we explicitly drop a new sources list strictly for the missing proprietary components.
CODENAME=$(grep VERSION_CODENAME /etc/os-release | cut -d= -f2 | tr -d '"' || echo "bookworm")
if [ -z "$CODENAME" ]; then
    CODENAME="bookworm"
fi

cat <<EOF > /etc/apt/sources.list.d/nvidia-components.list
# Added by NemoClaw Proxmox Installer for Proprietary NVIDIA Drivers
deb http://deb.debian.org/debian ${CODENAME} contrib non-free non-free-firmware
deb http://deb.debian.org/debian ${CODENAME}-updates contrib non-free non-free-firmware
deb http://security.debian.org/debian-security ${CODENAME}-security contrib non-free non-free-firmware
EOF

echo "[2/6] Updating package lists..."
apt-get update

echo "[3/6] Installing Proxmox Kernel Headers..."
# Proxmox uses custom kernels. Standard `linux-headers` will silently fail to compile the NVIDIA DKMS module.
# We MUST use `proxmox-headers` or `pve-headers`.
apt-get install -y pve-headers-$(uname -r) || apt-get install -y proxmox-headers-$(uname -r) || echo "Warning: Could not automatically detect headers. Proceeding anyway..."

echo "[4/6] Blacklisting the open-source Nouveau driver..."
cat <<EOF > /etc/modprobe.d/blacklist-nouveau.conf
blacklist nouveau
options nouveau modeset=0
EOF

echo "[5/6] Updating initramfs to apply blacklist..."
update-initramfs -u

echo "[6/6] Installing Proprietary NVIDIA Drivers via Official Installer..."
# The Debian apt repository (550 drivers) often fails DKMS build on edge Proxmox kernels (e.g. 6.17+).
# Downloading the latest driver directly from NVIDIA (.run) ensures better kernel compatibility.
apt-get install -y build-essential pkg-config libglvnd-dev wget

NVIDIA_VERSION="570.86.16"
NVIDIA_URL="https://us.download.nvidia.com/XFree86/Linux-x86_64/${NVIDIA_VERSION}/NVIDIA-Linux-x86_64-${NVIDIA_VERSION}.run"

echo "Downloading NVIDIA Driver ${NVIDIA_VERSION}..."
wget -q --show-progress -O /tmp/nvidia-installer.run "${NVIDIA_URL}"
chmod +x /tmp/nvidia-installer.run

echo "Running NVIDIA Installer (this may take a few minutes)..."
# --ui=none --no-questions --accept-license: unattended install
# --dkms: registers module with DKMS to survive minor kernel updates
/tmp/nvidia-installer.run --ui=none --no-questions --accept-license --dkms || {
  echo "ERROR: NVIDIA Installation failed! Check /var/log/nvidia-installer.log"
  exit 1
}

# Clean up
rm /tmp/nvidia-installer.run

# We must ensure the UVM (Unified Virtual Memory) module loads on boot for passthrough mapping.
cat <<'EOF' > /etc/modules-load.d/nvidia.conf
nvidia
nvidia_uvm
EOF

echo "================================================="
echo "              INSTALLATION COMPLETE              "
echo "================================================="
echo "The NVIDIA drivers have been installed and nouveau is blocked."
echo "You MUST reboot your Proxmox server now for the kernel modules to fully swap."
echo ""
echo "After rebooting, run 'nvidia-smi' inside the Proxmox shell to verify functionality."
