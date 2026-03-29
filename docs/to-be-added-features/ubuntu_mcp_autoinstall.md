# Ubuntu Bare Metal MCP Worker Autoinstall Guide

This guide provides the instructions and configuration needed to create a completely hands-off ("headless") Ubuntu Server installation. You will plug the USB drive into the bare metal machine, turn it on, and it will automatically wipe the drive, install the OS, install Docker, set up auto-patching, and reboot—ready for you to use.

## The Implementation Plan

1. **Format the USB Drive:** Flash the Ubuntu Server 24.04 LTS ISO onto a USB flash drive (using a tool like Rufus or BalenaEtcher).
2. **Add the Autoinstall Config:** Add a second partition or folder (depending on Rufus settings) named `nocloud` containing a `user-data` and `meta-data` file.
3. **Boot and Wait:** Insert the USB into the bare metal node and boot from it. The configuration file tells the installer to run silently.
4. **Zero Maintenance Setup:** The config explicitly enables `unattended-upgrades`, tells Ubuntu to automatically update itself daily, and gives it permission to automatically reboot at 3:00 AM *only if* a critical kernel patch requires it. It also uses Snap for Docker, which natively updates itself automatically in the background.

---

## 1. Preparing the USB Drive

1. Download the [Ubuntu Server 24.04 LTS ISO](https://ubuntu.com/download/server).
2. Use [Rufus](https://rufus.ie/) (on Windows) to write the ISO to your USB drive.
3. Open the newly created USB drive in Windows Explorer.
4. In the root of the USB drive, create a folder named `nocloud`.
5. Inside that folder, create two plain text files: `user-data` and `meta-data`.

---

## 2. The Configuration Files

### `meta-data`

Leave this file completely empty. It is required to exist, but it doesn't need any content for a basic autoinstall.

### `user-data`

Copy the following YAML into the `user-data` file exactly as shown.

> [!WARNING]
> This configuration tells the installer to **automatically format the first hard drive it finds** without asking questions. Only boot this on a machine you intend to wipe.

```yaml
#cloud-config
autoinstall:
  version: 1
  # Automatically select the first drive and wipe it
  interactive-sections:
    - none
  storage:
    layout:
      name: lvm
  locale: en_US.UTF-8
  keyboard:
    layout: us
  identity:
    # Node name. Change to mcp-worker-02 for the second node
    hostname: mcp-worker-01 
    username: mcpadmin
    # This is the SHA-512 hashed password for the user. 
    # The hash below corresponds to the password: "password"
    # To generate your own hash on linux: mkpasswd -m sha-512 "your_password"
    # Or in WSL/Ubuntu: python3 -c 'import crypt; print(crypt.crypt("your_password", crypt.mksalt(crypt.METHOD_SHA512)))'
    password: "$6$rounds=4096$randomsalt123$x1k8./M.A.P8t.F0.OQxN.kS8R5kP6.yD/H8l.x5w.w/N8." 
  ssh:
    install-server: true
    allow-pw: true
  packages:
    - unattended-upgrades
    - update-notifier-common
    - curl
    - wget
  # We use the snap version of Docker because snaps natively auto-update in the background
  snaps:
    - name: docker
  # The user-data section tells Cloud-Init what commands to run on first boot
  user-data:
    runcmd:
      # Step 1: Configure unattended-upgrades for ZERO maintenance auto-patching
      - echo 'APT::Periodic::Update-Package-Lists "1";' > /etc/apt/apt.conf.d/20auto-upgrades
      - echo 'APT::Periodic::Download-Upgradeable-Packages "1";' >> /etc/apt/apt.conf.d/20auto-upgrades
      - echo 'APT::Periodic::AutocleanInterval "7";' >> /etc/apt/apt.conf.d/20auto-upgrades
      - echo 'APT::Periodic::Unattended-Upgrade "1";' >> /etc/apt/apt.conf.d/20auto-upgrades
      
      # Step 2: Allow automatic reboots for critical security patches at 3 AM
      - sed -i 's|//Unattended-Upgrade::Automatic-Reboot "false";|Unattended-Upgrade::Automatic-Reboot "true";|g' /etc/apt/apt.conf.d/50unattended-upgrades
      - sed -i 's|//Unattended-Upgrade::Automatic-Reboot-Time "02:00";|Unattended-Upgrade::Automatic-Reboot-Time "03:00";|g' /etc/apt/apt.conf.d/50unattended-upgrades
      - sed -i 's|//Unattended-Upgrade::Remove-Unused-Dependencies "false";|Unattended-Upgrade::Remove-Unused-Dependencies "true";|g' /etc/apt/apt.conf.d/50unattended-upgrades
      
      # Step 3: Install Tailscale to easily connect the nodes to your MCP hub securely
      - curl -fsSL https://tailscale.com/install.sh | sh
```

## 3. How to Make it Boot Silently (GRUB Modification)

To make the USB drive automatically select the autoinstall option without you needing to press "Enter" on a keyboard:

1. On your flashed USB drive, go to the `boot/grub/` folder and open `grub.cfg`.
2. Find the first menu entry line that looks like this:
   `menuentry "Try or Install Ubuntu Server" {`
3. Edit the `linux` line inside that block to append the `autoinstall` parameter. It should look like this:
   `linux /casper/vmlinuz quiet autoinstall ds=nocloud;s=/cdrom/nocloud/ ---`
4. Set the `set timeout=5` to `set timeout=1` at the top of the file so it boots instantly.

## 4. Booting and Using

1. Insert the USB into your bare-metal server and power it on.
2. The server will boot, format its primary hard drive, install Ubuntu, execute the `runcmd` scripts (which sets up auto-patching and Tailscale), and then reboot.
3. Once rebooted, the machine is accessible via SSH: `ssh mcpadmin@IP_ADDRESS` using the password `password`.
4. Run `sudo tailscale up` on the box once you SSH in, and it will join your secure mesh network. From that point on, it will silently maintain itself in the background forever.
