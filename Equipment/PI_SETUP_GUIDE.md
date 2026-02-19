# Raspberry Pi Setup Guide

Standard procedure for flashing and configuring any Pi in the Escape Yourself system.

---

## 1. Flash with Raspberry Pi Imager

1. Open **Raspberry Pi Imager** on your Windows PC
2. **Appareil**: Select your Pi model (Pi 4 or Pi 5)
3. **OS**: Raspberry Pi OS (other) > **Raspberry Pi OS Lite (64-bit)**
4. **Stockage**: Select your microSD card
5. Click **Suivant** > **Modifier réglages**

### Settings — Tab "Général"

| Setting | Value |
|---------|-------|
| Nom d'hote | `<hostname>` (e.g. `room-controller`, `cryptex`, `props-pi`) |
| Nom d'utilisateur | `escape` |
| Mot de passe | `escape` |
| Wi-Fi | Skip (use Ethernet) |
| Fuseau horaire | `Europe/Paris` |
| Disposition du clavier | `fr` |

### Settings — Tab "Services"

- **Activer SSH**: checked
- **Utiliser un mot de passe pour l'authentification**: selected

Click **Enregistrer** > **Oui** > wait for flash to complete.

---

## 2. First Boot

1. Insert microSD into Pi
2. Connect Ethernet cable to router
3. Plug in USB-C power supply
4. Wait ~60 seconds

---

## 3. Find the Pi's IP

Try mDNS first (from your Windows PC):

```
ssh escape@<hostname>.local
```

If that doesn't work, connect a screen to the Pi and run:

```
ip a
```

Look for the `eth0` > `inet` line (e.g. `192.168.1.71`).

---

## 4. SSH Key (passwordless login)

From your **Windows PC** PowerShell (not the Pi):

```powershell
Get-Content C:\Users\Manu\.ssh\id_ed25519.pub | ssh escape@<ip> "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

Enter password `escape` one last time.

Verify:

```
ssh escape@<ip>
```

Should connect without asking for a password.

---

## 5. Copy Files to the Pi

Use `scp` from your **Windows PC** terminal:

```
scp "C:/path/to/file.sh" escape@<ip>:~/
```

> **Note**: Use forward slashes `/` in paths, even on Windows.

---

## 6. Standard Pi Inventory

| Pi | Hostname | IP | Role |
|----|----------|-----|------|
| H | `room-controller` | 192.168.1.10 | Room Controller (MQTT + Node.js) |
| A | `cryptex` | 192.168.1.13 | Cryptex prop (touch display + maglock) |
| B | `props-pi` | 192.168.1.17 | World Map + Puzzles 1/2/5 |
| C | `villain-pi` | 192.168.1.14 | Villain screen |
| D | `timferris-pi` | 192.168.1.11 | Tim Ferris + Puzzle 3 |
| E | `immersion-pi` | 192.168.1.15 | Spy immersion screen |
| F | `vehicle-pi` | 192.168.1.12 | Vehicle screen + Puzzle 4 |
| G | `projector-pi` | 192.168.1.16 | Rollable screen / Projector |

All use: **user** `escape`, **password** `escape`, **SSH key** from dev PC.

---

## Quick Reference

```bash
# Flash: Raspberry Pi Imager > Pi OS Lite 64-bit > user escape > SSH enabled
# Find IP: ssh escape@<hostname>.local  OR  ip a (on Pi with screen)
# SSH key: ssh-copy-id -i ~/.ssh/id_ed25519.pub escape@<ip>
# Copy file: scp "C:/path/file" escape@<ip>:~/
# Run script: ssh escape@<ip> "bash ~/script.sh"
```
