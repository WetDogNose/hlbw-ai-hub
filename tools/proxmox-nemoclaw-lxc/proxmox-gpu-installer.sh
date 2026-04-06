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

echo "[6/6] Installing Proprietary NVIDIA Drivers via Debian APT..."
# The official NVIDIA .run installer struggles severely with path traversal on Proxmox custom Edge/Trixie kernels (missing os-interface.h).
# Using the distribution-maintained DKMS package ensures proper Kbuild path patching for these kernels.
apt-get install -y build-essential pkg-config libglvnd-dev dkms libelf-dev bc module-assistant nvidia-driver nvidia-kernel-dkms firmware-misc-nonfree || {
  echo "ERROR: NVIDIA Installation failed!"
  exit 1
}

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
