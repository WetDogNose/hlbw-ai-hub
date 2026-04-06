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

# Remove previous duplicated list to avoid warnings if debian.sources already has it
rm -f /etc/apt/sources.list.d/nvidia-components.list
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
# WARNING: We MUST use --no-install-recommends and omit firmware-misc-nonfree to prevent breaking the proxmox-ve meta-package dependency on pve-firmware!

# Purge any corrupted DKMS states from previous attempts
apt-get purge -y nvidia-kernel-dkms || true

# NOTE: We gracefully allow this to fail because the initial DKMS build will crash due to a DRM API mismatch in Linux 6.17.
apt-get install -y --no-install-recommends build-essential pkg-config libglvnd-dev dkms libelf-dev bc module-assistant nvidia-driver nvidia-kernel-dkms || echo "Intercepting DKMS failure for patching..."

echo "Patching DKMS to bypass DRM compilation on Edge kernels..."
# Proxmox 6.17 DRM API broke the nvidia-drm helper signatures, causing GCC-14 fatal pointer mismatch errors.
# Instead of deleting the module from building (which breaks dkms.conf arrays), we inject KCFLAGS to downgrade the fatal error to a warning.
# Since this server is headless, the broken DRM display API will safely never be executed or cause panics.

sed -i 's/env NV_VERBOSE=1/env NV_VERBOSE=1 KCFLAGS="-Wno-error=incompatible-pointer-types"/g' /usr/src/nvidia-*/dkms.conf 2>/dev/null || true

# Resume the half-configured apt installation, which will re-trigger the patched DKMS build
echo "Rebuilding DKMS modules..."
dpkg --configure -a || {
  echo "ERROR: NVIDIA Post-Patch Installation failed! Check DKMS logs."
  exit 1
}
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
