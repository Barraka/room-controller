#!/bin/bash
# ============================================================
# Raspberry Pi 5 — Room Controller Setup Script
# ============================================================
# Run this AFTER flashing Raspberry Pi OS Lite (64-bit) and
# first SSH connection. Execute as:
#
#   bash setup-pi5.sh
#
# Prerequisites:
#   - Pi flashed with RPi Imager (hostname: room-controller,
#     user: escape, SSH enabled, timezone: Europe/Paris)
#   - Pi connected via Ethernet to router
#   - SSH'd in as 'escape' user
# ============================================================

set -e  # Exit on any error

echo "========================================"
echo "  Room Controller Pi 5 Setup"
echo "========================================"
echo ""

# ----------------------------------------------------------
# Step 1: System update
# ----------------------------------------------------------
echo "[1/7] Updating system packages..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y git
echo "  ✓ System updated"
echo ""

# ----------------------------------------------------------
# Step 2: Install Node.js 20 LTS
# ----------------------------------------------------------
echo "[2/7] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
echo "  ✓ Node.js $(node --version) installed"
echo "  ✓ npm $(npm --version) installed"
echo ""

# ----------------------------------------------------------
# Step 3: Install Mosquitto MQTT broker
# ----------------------------------------------------------
echo "[3/7] Installing Mosquitto MQTT broker..."
sudo apt install -y mosquitto mosquitto-clients
sudo systemctl enable mosquitto
sudo systemctl start mosquitto
echo "  ✓ Mosquitto installed and running"
echo ""

# ----------------------------------------------------------
# Step 4: Install pm2
# ----------------------------------------------------------
echo "[4/7] Installing pm2..."
sudo npm install -g pm2
echo "  ✓ pm2 installed"
echo ""

# ----------------------------------------------------------
# Step 5: Clone & install room-controller
# ----------------------------------------------------------
echo "[5/7] Cloning room-controller..."
cd ~
if [ -d "room-controller" ]; then
  echo "  → room-controller directory already exists, pulling latest..."
  cd room-controller
  git pull
else
  git clone https://github.com/Barraka/room-controller.git
  cd room-controller
fi
npm install
echo "  ✓ room-controller installed at ~/room-controller"
echo ""

# ----------------------------------------------------------
# Step 6: Set up pm2 auto-start
# ----------------------------------------------------------
echo "[6/7] Setting up pm2 with room-controller..."
pm2 start src/index.js --name room-controller
pm2 save

echo ""
echo "  → Run the following command to enable pm2 startup on boot:"
echo ""
PM2_STARTUP=$(pm2 startup 2>&1 | grep "sudo")
if [ -n "$PM2_STARTUP" ]; then
  echo "    $PM2_STARTUP"
  echo ""
  read -p "  Run this command now? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    eval "$PM2_STARTUP"
    echo "  ✓ pm2 startup configured"
  else
    echo "  → Skipped. Run the command above manually later."
  fi
else
  echo "  ⚠ Could not detect pm2 startup command. Run 'pm2 startup' manually."
fi

# ----------------------------------------------------------
# Step 7: Static IP
# ----------------------------------------------------------
echo ""
echo "[7/7] Configuring static IP..."

CURRENT_IP=$(hostname -I | awk '{print $1}')
read -p "  Set static IP? Current: $CURRENT_IP. Target: 192.168.1.10 (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  # Try dhcpcd first (Raspberry Pi OS default)
  if [ -f /etc/dhcpcd.conf ]; then
    echo "" | sudo tee -a /etc/dhcpcd.conf > /dev/null
    echo "interface eth0" | sudo tee -a /etc/dhcpcd.conf > /dev/null
    echo "static ip_address=192.168.1.10/24" | sudo tee -a /etc/dhcpcd.conf > /dev/null
    echo "static routers=192.168.1.1" | sudo tee -a /etc/dhcpcd.conf > /dev/null
    echo "static domain_name_servers=192.168.1.1 8.8.8.8" | sudo tee -a /etc/dhcpcd.conf > /dev/null
    echo "  ✓ Static IP configured via dhcpcd.conf"
  else
    # Fallback to NetworkManager
    sudo nmcli con mod "Wired connection 1" ipv4.addresses 192.168.1.10/24 \
      ipv4.gateway 192.168.1.1 ipv4.dns "192.168.1.1 8.8.8.8" ipv4.method manual 2>/dev/null \
      && echo "  ✓ Static IP configured via NetworkManager" \
      || echo "  ⚠ Could not set static IP. Set a DHCP reservation on your router instead."
  fi
  echo "  → Reboot required for IP change to take effect"
else
  echo "  → Skipped. Set a DHCP reservation on your router instead."
fi

echo ""
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "  Services running:"
echo "    - Mosquitto MQTT broker on port 1883"
echo "    - Room Controller WS on port 3001"
echo "    - Room Controller Admin on port 3002"
echo ""
echo "  Next steps:"
echo "    1. Set static IP to 192.168.1.10 (router DHCP reservation recommended)"
echo "    2. Edit ~/room-controller/room-config.json if needed"
echo "    3. Test MQTT:  mosquitto_pub -t test -m hello"
echo "    4. Test Admin: curl http://localhost:3002/api/config"
echo "    5. From dev PC: http://192.168.1.10:3002"
echo ""
echo "  SSH key setup (from dev PC):"
echo "    ssh-copy-id -i ~/.ssh/id_ed25519.pub escape@192.168.1.10"
echo ""
