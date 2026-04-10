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
apt-get install -y --no-install-recommends build-essential pkg-config libglvnd-dev dkms libelf-dev bc module-assistant nvidia-driver nvidia-kernel-dkms nvidia-smi || echo "Intercepting DKMS failure for patching..."

echo "Patching DKMS to accommodate DRM API changes on Edge kernels..."
# Proxmox 6.17 DRM API broke the nvidia-drm helper signatures, causing GCC-14 fatal pointer mismatch errors.
# We inject KCFLAGS to downgrade general pointer mismatch fatal errors to a warning.
sed -i 's/env NV_VERBOSE=1/env NV_VERBOSE=1 KCFLAGS="-Wno-error=incompatible-pointer-types"/g' /usr/src/nvidia-*/dkms.conf 2>/dev/null || true

# We also apply a community patch from Joan Bruguera Mico to fix the fb_create API mismatch:
cat << 'EOF_PATCH' > /tmp/nvidia-6-17.patch
From fd52e276f587394b9ae3ba7013b6a44cbdd526f2 Mon Sep 17 00:00:00 2001
From: Joan Bruguera Mico <joanbrugueram@gmail.com>
Date: Sat, 26 Jul 2025 21:19:03 +0000
Subject: [PATCH] Fix for NVIDIA 550.xx driver for Linux 6.17+

---
 nvidia-drm/nvidia-drm-drv.c | 8 ++++++++
 nvidia-drm/nvidia-drm-fb.c  | 9 +++++++++
 nvidia-drm/nvidia-drm-fb.h  | 6 ++++++
 3 files changed, 23 insertions(+)

diff --git a/nvidia-drm/nvidia-drm-drv.c b/nvidia-drm/nvidia-drm-drv.c
index b50b17a..9da3294 100644
--- a/nvidia-drm/nvidia-drm-drv.c
+++ b/nvidia-drm/nvidia-drm-drv.c
@@ -202,6 +202,10 @@ static void nv_drm_output_poll_changed(struct drm_device *dev)
 static struct drm_framebuffer *nv_drm_framebuffer_create(
     struct drm_device *dev,
     struct drm_file *file,
+#if LINUX_VERSION_CODE >= KERNEL_VERSION(6, 17, 0)
+    // Rel. commit. "drm: Pass the format info to .fb_create()" (Ville Syrjala, 1 Jul 2025)
+    const struct drm_format_info *info,
+#endif
     #if defined(NV_DRM_HELPER_MODE_FILL_FB_STRUCT_HAS_CONST_MODE_CMD_ARG)
     const struct drm_mode_fb_cmd2 *cmd
     #else
@@ -217,6 +221,10 @@ static struct drm_framebuffer *nv_drm_framebuffer_create(
     fb = nv_drm_internal_framebuffer_create(
             dev,
             file,
+#if LINUX_VERSION_CODE >= KERNEL_VERSION(6, 17, 0)
+            // Rel. commit. "drm: Allow the caller to pass in the format info to drm_helper_mode_fill_fb_struct()" (Ville Syrjala, 1 Jul 2025)
+            info,
+#endif
             &local_cmd);
 
     #if !defined(NV_DRM_HELPER_MODE_FILL_FB_STRUCT_HAS_CONST_MODE_CMD_ARG)
diff --git a/nvidia-drm/nvidia-drm-fb.c b/nvidia-drm/nvidia-drm-fb.c
index d119e7c..b84e026 100644
--- a/nvidia-drm/nvidia-drm-fb.c
+++ b/nvidia-drm/nvidia-drm-fb.c
@@ -33,6 +33,7 @@
 #include "nvidia-drm-format.h"
 
 #include <drm/drm_crtc_helper.h>
+#include <linux/version.h>
 
 static void __nv_drm_framebuffer_free(struct nv_drm_framebuffer *nv_fb)
 {
@@ -246,6 +247,10 @@ static int nv_drm_framebuffer_init(struct drm_device *dev,
 struct drm_framebuffer *nv_drm_internal_framebuffer_create(
     struct drm_device *dev,
     struct drm_file *file,
+#if LINUX_VERSION_CODE >= KERNEL_VERSION(6, 17, 0)
+    // Rel. commit. "drm: Allow the caller to pass in the format info to drm_helper_mode_fill_fb_struct()" (Ville Syrjala, 1 Jul 2025)
+    const struct drm_format_info *info,
+#endif
     struct drm_mode_fb_cmd2 *cmd)
 {
     struct nv_drm_device *nv_dev = to_nv_device(dev);
@@ -299,6 +304,10 @@ struct drm_framebuffer *nv_drm_internal_framebuffer_create(
         dev,
         #endif
         &nv_fb->base,
+#if LINUX_VERSION_CODE >= KERNEL_VERSION(6, 17, 0)
+        // Rel. commit. "drm: Allow the caller to pass in the format info to drm_helper_mode_fill_fb_struct()" (Ville Syrjala, 1 Jul 2025)
+        info,
+#endif
         cmd);
 
     /*
diff --git a/nvidia-drm/nvidia-drm-fb.h b/nvidia-drm/nvidia-drm-fb.h
index cf477cc..b61b309 100644
--- a/nvidia-drm/nvidia-drm-fb.h
+++ b/nvidia-drm/nvidia-drm-fb.h
@@ -35,6 +35,8 @@
 #include <drm/drm_framebuffer.h>
 #endif
 
+#include <linux/version.h>
+
 #include "nvidia-drm-gem-nvkms-memory.h"
 #include "nvkms-kapi.h"
 
@@ -59,6 +61,10 @@ static inline struct nv_drm_framebuffer *to_nv_framebuffer(
 struct drm_framebuffer *nv_drm_internal_framebuffer_create(
     struct drm_device *dev,
     struct drm_file *file,
+#if LINUX_VERSION_CODE >= KERNEL_VERSION(6, 17, 0)
+    // Rel. commit. "drm: Allow the caller to pass in the format info to drm_helper_mode_fill_fb_struct()" (Ville Syrjala, 1 Jul 2025)
+    const struct drm_format_info *info,
+#endif
     struct drm_mode_fb_cmd2 *cmd);
 
 #endif /* NV_DRM_ATOMIC_MODESET_AVAILABLE */
EOF_PATCH

for dkms_dir in /usr/src/nvidia-* ; do
    if [ -d "$dkms_dir" ]; then
        echo "Applying Linux 6.17 fb_create patch to $dkms_dir..."
        patch -p1 -d "$dkms_dir" < /tmp/nvidia-6-17.patch || echo "Patch failed or already applied."
    fi
done

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
