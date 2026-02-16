# Hardware Recommendations

This document provides hardware recommendations for deploying the Escape Yourself GM Manager system in a production escape room environment.

---

## System Components Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      ESCAPE ROOM                                 │
│                                                                  │
│   [ESP32 Props] ──WiFi──► [Router] ──Ethernet──► [Room Controller]
│                                          │
│                                          └──Ethernet──► [GM PC]
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Room Controller (MiniPC)

The Room Controller runs the Node.js middleware, MQTT broker (Mosquitto), and serves the admin UI. It needs to be reliable, silent, and always-on.

### Option A: Raspberry Pi 5 (Recommended for most rooms)

| Spec | Recommendation |
|------|----------------|
| **Model** | Raspberry Pi 5 (4GB or 8GB RAM) |
| **Storage** | 32GB+ microSD (Class A2) or NVMe SSD via HAT |
| **Power** | Official 27W USB-C power supply |
| **Case** | Official Active Cooler case (with fan) |
| **OS** | Raspberry Pi OS Lite (64-bit) |

**Pros:**
- Low power consumption (~5-15W)
- Silent operation (with passive cooling, or quiet fan)
- Small footprint, easy to hide
- Cost-effective (~100-150 EUR total)
- Great Node.js performance on Pi 5

**Cons:**
- microSD can fail over time (mitigate with NVMe SSD)
- Requires some Linux knowledge for setup

**Recommended suppliers (France):**
- Kubii.com
- LDLC.com
- Amazon.fr

### Option B: Mini PC (Alternative for higher reliability)

| Spec | Recommendation |
|------|----------------|
| **CPU** | Intel N100 or AMD Ryzen 3 |
| **RAM** | 8GB minimum |
| **Storage** | 128GB+ SSD |
| **Ports** | 2+ Ethernet ports preferred |
| **Form factor** | Fanless or quiet fan |

**Recommended models:**
- Beelink Mini S12 Pro (Intel N100)
- MeLE Quieter4C (fanless, Intel N100)
- Minisforum UN100C

**Pros:**
- More powerful, headroom for future features
- SSD more reliable than microSD
- Familiar Windows/Linux setup
- Multiple Ethernet ports available

**Cons:**
- Higher power consumption (~15-30W)
- Larger form factor
- Higher cost (~150-250 EUR)

### Recommendation

For a typical escape room, **Raspberry Pi 5 with NVMe SSD** offers the best balance of reliability, cost, and form factor. Use a Mini PC if you need Windows compatibility or anticipate running additional services.

---

## 2. WiFi Router

The router provides the WiFi network for ESP32 props and wired connections to the Room Controller and GM PC.

### Requirements

| Feature | Requirement |
|---------|-------------|
| **WiFi Standard** | WiFi 5 (802.11ac) or WiFi 6 (802.11ax) |
| **Band** | 2.4 GHz (required for ESP32) |
| **Ethernet Ports** | 4+ Gigabit ports |
| **DHCP** | Static IP assignment (DHCP reservation) |
| **Channel Control** | Manual channel selection |
| **Coverage** | Appropriate for room size |

### Recommended Models

**Budget option:**
- TP-Link Archer C6 (~40 EUR)
- TP-Link TL-WR841N (~20 EUR, 2.4 GHz only)

**Mid-range (recommended):**
- TP-Link Archer AX23 (~60 EUR)
- ASUS RT-AX53U (~70 EUR)
- Netgear R6700 (~80 EUR)

**Premium (large rooms / many props):**
- TP-Link Archer AX73 (~120 EUR)
- ASUS RT-AX86U (~200 EUR)

### Configuration Tips

1. **Use 2.4 GHz for props**: ESP32 only supports 2.4 GHz. Keep this band dedicated to props.

2. **Set a fixed channel**: Avoid auto-channel selection. Choose channel 1, 6, or 11 to minimize interference.

3. **Disable band steering**: If using dual-band, disable band steering so props stay on 2.4 GHz.

4. **Reserve static IPs**: Configure DHCP reservations for:
   - Room Controller (e.g., 192.168.1.10)
   - GM PC (e.g., 192.168.1.20)
   - Each ESP32 prop

5. **Disable power saving**: Some routers have "green" modes that can cause latency.

6. **Disable UPnP**: Not needed and reduces attack surface.

7. **Simple SSID/password**: ESP32 may have issues with special characters. Use alphanumeric only.

---

## 3. GM PC (Bmax B4 Mini PC)

The GM uses a dedicated mini PC to access the GM Dashboard via web browser. This machine is also the **audio source** for the entire escape room — background music, sound effects, hint sounds, victory/defeat tracks — connected to an amplifier via 3.5mm jack → RCA.

### Specs (Ordered)

| Spec | Detail |
|------|--------|
| **Model** | Bmax B4 |
| **CPU** | Intel N95 (4 cores, up to 3.4 GHz) |
| **RAM** | 12 GB LPDDR5 |
| **Storage** | 256 GB SSD |
| **Display outputs** | 2× HDMI 2.0 (GM screen + player-facing screen) |
| **Audio** | 3.5mm jack → amplifier → room speakers |
| **Network** | Ethernet (Gigabit) + WiFi |
| **OS** | Windows 11 Pro |
| **Price** | ~182 € (AliExpress) |

### Why This Choice

- **Dual HDMI**: one for GM dashboard, one for player-facing secondary screen (timer + hints)
- **Windows 11 Pro**: best audio reliability (Chrome + WASAPI), Group Policy to tame Windows Update
- **3.5mm jack**: direct connection to amplifier, no USB DAC needed
- **12 GB RAM**: comfortable headroom for Chrome + audio
- **Price**: cheapest option that ticks all boxes (cheaper than Pi 5 kit + USB DAC)

### Setup Notes

- Set Active Hours (09:00–23:00) and Group Policy "No auto-restart with logged-on users" to prevent surprise reboots
- Mark network as metered to block background updates during sessions
- Chrome auto-launches the GM Dashboard URL on startup
- See `Equipment/GM_PC_COMPARISON.md` for full Windows vs Ubuntu analysis

---

## 4. ESP32 Prop Hardware

Each prop consists of an ESP32 dev board, optional sensor modules, and optional output modules (MOSFETs for maglocks/relays), all mounted inside a project box.

### ESP32 Board

| Spec | Recommendation |
|------|----------------|
| **Board** | FM-DevKit or any ESP32 DevKit V1 |
| **Breakout** | Screw-terminal breakout board (recommended, avoids soldering) |
| **Power** | 5V via USB-C or screw terminal from a shared power supply |

### MOSFET Module (for maglocks, relays, solenoids)

Used to switch 5-36V loads (maglocks, electromagnetic locks, solenoids) from a 3.3V ESP32 GPIO pin.

**Recommended: HW-548 (IRF5305S, P-channel)**
- All 6 connections are **screw terminals** (no soldering needed)
- Signal voltage: 3V-20V (ESP32 3.3V compatible)
- Load voltage: DC 5-36V
- ~3-5 EUR for a pack of 2-3 on Amazon

> **Note:** The HW-548 is a P-channel MOSFET — it triggers **active-low** (LOW = output ON). Set `activeLow = true` in the prop config.

**Alternative: XY-MOS (N-channel)**
- Screw terminals for VIN/OUT only; signal pins (GND, TRIG) are bare through-holes requiring soldering or pin headers
- Triggers **active-high** (HIGH = output ON). Set `activeLow = false` in the prop config.

### Enclosure

| Item | Recommendation |
|------|----------------|
| **Project box** | ABS project box, 150x100x60mm or larger (~3 EUR) |
| **Cable entry** | PG7 cable glands for each cable entering/exiting the box (~3 EUR for pack of 10) |
| **Board mounting** | M3 nylon standoffs to secure ESP32 and MOSFET inside the box (~3 EUR) |
| **Labeling** | Label each box with prop name, IP address, and pin mapping |

### Wiring

| Connection | Method |
|------------|--------|
| ESP32 ↔ MOSFET (inside box) | Short 22AWG solid-core wire, screw terminals on both ends |
| Sensors (reed switches, RFID) | 2-conductor alarm cable through cable gland (~8 EUR for 25m) |
| Maglock / solenoid | 2-conductor cable through cable gland to MOSFET output terminals |
| Power | 5V USB-C adapter or shared 5V power supply, secured with cable tie |

### Assembly Diagram

```
┌─ Project Box ─────────────────────────────┐
│                                           │
│   [ESP32 + screw-terminal breakout]       │
│       │ GPIO pin ── wire ──► [MOSFET]     │
│       │ GND ─────── wire ──►    │         │
│       │                         │         │
│       │ Sensor GPIOs         OUT+/OUT-    │
│       │ GND                     │         │
└───────┼─────────────────────────┼─────────┘
        │                         │
   cable gland               cable gland
        │                         │
   alarm cable               alarm cable
   to sensor                 to maglock
   (in wall/furniture)       (on door)
```

### Per-Prop Budget

| Item | Price |
|------|-------|
| ESP32 DevKit + screw-terminal breakout | ~8 EUR |
| HW-548 MOSFET module (if needed) | ~3 EUR |
| ABS project box 150x100x60mm | ~3 EUR |
| Cable glands PG7 (x3) | ~1 EUR |
| M3 nylon standoffs | ~1 EUR |
| 2-conductor alarm cable (5m per prop) | ~2 EUR |
| **Total per prop** | **~18 EUR** (without maglock/sensor) |

---

## 5. Network Topology

### Simple Setup (Recommended)

```
Internet ─┬─► [Main Router] ─► to building network
          │
          └─► [Escape Room Router] (isolated network)
                    │
                    ├── Ethernet ──► Room Controller (192.168.1.10)
                    ├── Ethernet ──► GM PC (192.168.1.20)
                    │
                    └── WiFi ──► ESP32 Props
                                  ├── prop-coffre (192.168.1.101)
                                  ├── prop-roue (192.168.1.102)
                                  └── prop-miroir (192.168.1.103)
```

### IP Address Scheme

| Device | IP Address |
|--------|------------|
| Router | 192.168.1.1 |
| Room Controller | 192.168.1.10 |
| GM PC | 192.168.1.20 |
| Props | 192.168.1.101 - 192.168.1.199 |

### Isolation Considerations

- The escape room network should be **isolated** from the building's main network
- If internet access is needed (for updates), use a separate VLAN or guest network
- Props should not have internet access (security)

---

## 6. Power and Reliability

### UPS (Uninterruptible Power Supply)

Recommended for the Room Controller to prevent corruption during power outages.

- APC Back-UPS 400VA (~50 EUR) - sufficient for Pi or Mini PC
- Provides 10-15 minutes of runtime for graceful shutdown

### Auto-start Configuration

Configure the Room Controller to:
1. Boot automatically on power restore
2. Auto-start the room-controller service (systemd on Linux)
3. Auto-connect to MQTT broker

---

## 7. Remote Access

### SSH (Command Line)

SSH is the primary way to manage the Room Controller remotely.

**From the Room Controller (one-time setup):**
```bash
# Enable SSH if not already
sudo systemctl enable ssh
sudo systemctl start ssh
```

**From your dev machine (Windows/Mac/Linux):**
```bash
ssh manu@192.168.1.99
```

#### Passwordless SSH (Recommended)

Set up SSH key authentication to avoid typing the password every time:

```bash
# 1. Generate a key pair (skip if you already have one)
ssh-keygen -t ed25519

# 2. Copy your public key to the Pi
ssh-copy-id manu@192.168.1.99
# (enter the Pi password one last time)

# 3. Verify passwordless login
ssh manu@192.168.1.99
# Should connect without asking for password
```

> **Note:** On Windows, if `ssh-copy-id` is not available, you can manually append your public key:
> ```powershell
> type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh manu@192.168.1.99 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
> ```

### VNC (Remote Desktop)

VNC provides a full graphical desktop view of the Pi. Useful for debugging or when a GUI is needed.

**Raspberry Pi OS with Desktop** comes with `wayvnc` pre-installed and running on port **5900**.

**Connecting from Windows:**
1. Install a VNC viewer (e.g., RealVNC Viewer, TightVNC, or UltraVNC)
2. Connect to: `192.168.1.99:5900`
3. Log in with the Pi credentials (same username/password as SSH)

**Connecting from Mac:**
1. Open Finder > Go > Connect to Server (Cmd+K)
2. Enter: `vnc://192.168.1.99:5900`

**If VNC is not running (Pi OS Lite or disabled):**
```bash
# Install wayvnc (Wayland) or TigerVNC (X11)
sudo apt install -y wayvnc

# Start manually
wayvnc 0.0.0.0 5900

# Or enable at boot via raspi-config
sudo raspi-config
# Navigate to: Interface Options > VNC > Enable
```

> **Tip:** For day-to-day management, SSH is sufficient. Use VNC only when you need to see the desktop (e.g., debugging a browser, viewing logs in a GUI terminal).

---

## 8. Software Setup

### Operating System

**Raspberry Pi:**
- **Raspberry Pi OS Lite (64-bit)** - Recommended. Minimal, optimized for Pi hardware.
- Download from: https://www.raspberrypi.com/software/
- Use Raspberry Pi Imager to flash the SD card/SSD

**Mini PC:**
- **Ubuntu Server 24.04 LTS** - Familiar, well-documented, 5 years of support.
- Download from: https://ubuntu.com/download/server

> **Note:** Avoid desktop versions. You don't need a GUI - access is via SSH and web browser.

### Initial System Setup

After first boot, connect via SSH or keyboard:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Set hostname (optional)
sudo hostnamectl set-hostname room-controller

# Set timezone
sudo timedatectl set-timezone Europe/Paris

# Enable SSH if not already (Pi OS)
sudo systemctl enable ssh
sudo systemctl start ssh
```

### Install Node.js 20 LTS

```bash
# Add NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs

# Verify installation
node --version   # Should show v20.x.x
npm --version
```

### Install Mosquitto MQTT Broker

```bash
# Install Mosquitto
sudo apt install -y mosquitto mosquitto-clients

# Enable and start service
sudo systemctl enable mosquitto
sudo systemctl start mosquitto

# Verify it's running
sudo systemctl status mosquitto
```

Default config listens on port 1883 (no authentication). For a local network this is fine.

### Install Room Controller

```bash
# Create app directory
sudo mkdir -p /opt/room-controller
sudo chown $USER:$USER /opt/room-controller

# Clone repository
cd /opt
git clone https://github.com/Barraka/room-controller.git

# Install dependencies
cd room-controller
npm install

# Test run (Ctrl+C to stop)
npm start
```

### Create Systemd Service

Create a service file so Room Controller starts automatically on boot:

```bash
sudo nano /etc/systemd/system/room-controller.service
```

Paste the following:

```ini
[Unit]
Description=Escape Room Controller
After=network.target mosquitto.service

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/room-controller
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

> **Note:** Change `User=pi` to your username if different (e.g., `User=ubuntu` on Ubuntu).

Enable and start the service:

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable on boot
sudo systemctl enable room-controller

# Start now
sudo systemctl start room-controller

# Check status
sudo systemctl status room-controller

# View logs
sudo journalctl -u room-controller -f
```

### Configure Static IP (Optional)

If not using DHCP reservation on the router, set a static IP on the Pi/Mini PC:

**Raspberry Pi OS / Debian:**

Edit `/etc/dhcpcd.conf`:
```bash
sudo nano /etc/dhcpcd.conf
```

Add at the end:
```
interface eth0
static ip_address=192.168.1.10/24
static routers=192.168.1.1
static domain_name_servers=192.168.1.1 8.8.8.8
```

**Ubuntu Server (netplan):**

Edit `/etc/netplan/00-installer-config.yaml`:
```yaml
network:
  version: 2
  ethernets:
    eth0:
      addresses:
        - 192.168.1.10/24
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses:
          - 192.168.1.1
          - 8.8.8.8
```

Apply: `sudo netplan apply`

### Verify Installation

After setup, verify everything works:

```bash
# Check services
sudo systemctl status mosquitto
sudo systemctl status room-controller

# Test MQTT locally
mosquitto_sub -t "test" &
mosquitto_pub -t "test" -m "hello"
# Should print "hello"

# Check Room Controller is listening
curl http://localhost:3002/api/props
```

From the GM PC browser:
- Admin UI: `http://192.168.1.10:3002`
- Dashboard: `http://192.168.1.10:5173` (if serving built dashboard)

### Serving the GM Dashboard (Production)

For production, build the dashboard and serve it from the Room Controller:

```bash
# On your dev machine, build the dashboard
cd escapeRoomManager
npm run build

# Copy dist folder to Room Controller
scp -r dist/* pi@192.168.1.10:/opt/room-controller/public/
```

Or install a simple static server on the Room Controller:

```bash
sudo npm install -g serve
serve -s /opt/room-controller/public -l 5173
```

Add this as another systemd service if needed.

---

## 9. Checklist Before Deployment

- [ ] Room Controller boots and runs room-controller service
- [ ] MQTT broker (Mosquitto) running on Room Controller
- [ ] Router configured with static IPs
- [ ] WiFi SSID/password set (2.4 GHz, fixed channel)
- [ ] All ESP32 props connect to WiFi
- [ ] GM PC can access Dashboard (http://192.168.1.10:5173)
- [ ] GM PC can access Admin UI (http://192.168.1.10:3002)
- [ ] Props appear online in Admin UI
- [ ] SSH access works from dev machine (preferably passwordless)
- [ ] VNC access works from dev machine (optional)
- [ ] Audio plays correctly on GM PC
- [ ] Test full session (start, hints, solve props, end)

---

## 10. Estimated Budget

| Component | Budget Option | Recommended | Premium |
|-----------|--------------|-------------|---------|
| Room Controller | Pi 4 (4GB) ~70 EUR | Pi 5 (8GB) + NVMe ~150 EUR | Mini PC ~250 EUR |
| Router | TP-Link basic ~30 EUR | TP-Link Archer ~60 EUR | ASUS RT-AX ~150 EUR |
| UPS | - | APC 400VA ~50 EUR | APC 700VA ~80 EUR |
| Cables/misc | ~20 EUR | ~30 EUR | ~50 EUR |
| **Total** | **~120 EUR** | **~290 EUR** | **~530 EUR** |

*Prices are approximate and may vary. Does not include GM PC or ESP32 props.*
