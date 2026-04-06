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
# Proxmox 8 is Debian Bookworm. Proxmox 9 is Debian Trixie. Both use non-free-firmware.
# We append non-free and non-free-firmware robustly to any base debian sources.
for f in /etc/apt/sources.list /etc/apt/sources.list.d/*.list; do
  if [ -f "$f" ]; then
    sed -i -E 's/^(deb\s+.*\s+main).*$/\1 contrib non-free non-free-firmware/g' "$f"
  fi
done

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

echo "[6/6] Installing Proprietary NVIDIA Drivers via APT..."
# Using the Debian repository avoids kernel mismatch issues associated with downloading .run files manually.
apt-get install -y nvidia-driver nvidia-smi

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
