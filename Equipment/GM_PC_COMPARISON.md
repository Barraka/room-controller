# GM PC — Windows vs Ubuntu Comparison

**Context:** The GM PC runs the GM Dashboard (React web app) in a browser. It is the audio source for the entire escape room — background music, sound effects, hint sounds, victory/defeat tracks — connected to an amplifier via 3.5mm (or USB DAC) to RCA.

In **Complet (full) mode**, the GM PC is just a browser client. The Room Controller Pi (192.168.1.99) runs everything (Node.js, MQTT, WebSocket, media storage). The GM PC connects to `http://<room-controller-ip>:<port>` and displays the dashboard. No server-side software runs on the GM PC.

In **Autonome (standalone) mode**, the GM PC stores everything locally in the browser's IndexedDB — media, hints, session history, settings. The workload remains light (IndexedDB reads/writes are fast local I/O).

---

## Hardware Options

### Option A: Windows Laptop (~350-450 EUR)

| Spec | Recommendation |
|------|----------------|
| CPU | AMD Ryzen 3/5 or Intel i3/i5 (entry-level is sufficient) |
| RAM | 8GB DDR4 |
| Storage | 256GB SSD |
| Screen | 15.6" Full HD (built-in) |
| Output | 1x HDMI (for player-facing secondary screen) |
| Audio | 3.5mm jack + built-in speakers (backup) |
| OS | Windows 11 |

### Option B: Mini PC + Monitor + Peripherals (~330-360 EUR)

Example: NiPoGi Pinova P1 (AMD Ryzen 3250U, 8GB, 256GB SSD, Windows 11 Pro) — ~220 EUR

| Additional Item | Estimated Price |
|-----------------|----------------|
| 22" Full HD monitor | ~90-110 EUR |
| Wireless keyboard + mouse combo | ~20-30 EUR |

### Option C: Raspberry Pi 5 8GB Kit (~200-210 EUR)

Example: Pi 5 Starter Kit (8GB, case, fan, PSU, HDMI cable, SD card) — ~186 EUR

| Additional Item | Estimated Price |
|-----------------|----------------|
| USB DAC (e.g., Behringer UCA222) | ~25 EUR |
| Monitor (if not using a laptop) | ~90-110 EUR |
| Keyboard + mouse (if not using a laptop) | ~20-30 EUR |

> **Note:** If you already have a monitor, keyboard, and mouse, the Pi 5 kit alone at ~186 EUR + USB DAC at ~25 EUR = ~210 EUR total.

---

## Windows vs Ubuntu — Pros & Cons

### Windows

| | Details |
|---|---|
| **+ Audio reliability** | Chrome on Windows + WASAPI = the most stable audio stack for web apps. Web Audio API (used for SFX layering without ducking background music) works flawlessly. Multiple simultaneous audio streams are handled reliably. This is the #1 reason to consider Windows. |
| **+ Zero audio config** | Plug in 3.5mm to amp, open Chrome, it works. No PipeWire tuning, no DAC driver concerns, no Chromium flags. |
| **+ Chrome (not Chromium)** | Full Google Chrome with all optimizations, automatic updates, best Web Audio API support. |
| **+ GM familiarity** | Most GMs know Windows. No learning curve for basic tasks (volume control, connecting to WiFi, opening Chrome). |
| **+ Laptop option** | Built-in screen + keyboard + speakers + battery. All-in-one, portable, less clutter. |
| **- Windows Update** | Can force restarts at the worst time. Mitigatable with Pro settings (see Workarounds below), but a real risk if not configured. |
| **- Background bloat** | Defender scans, telemetry, Cortana, OneDrive — all eat CPU/RAM in the background. Entry-level hardware can feel sluggish. |
| **- License cost** | ~30-40 EUR included in hardware price, wasted if you switch to Ubuntu later. |
| **- Slower boot** | 30-60 seconds to desktop vs ~15-20 seconds for a tuned Linux install. |
| **- Forced restarts** | Even with mitigations, Windows can occasionally override your settings after major updates. |

### Ubuntu / Linux

| | Details |
|---|---|
| **+ Lightweight** | Minimal background processes. All resources available for Chrome + audio. Entry-level hardware feels fast and responsive. |
| **+ No surprise restarts** | You control when updates happen. Zero risk of mid-session reboot. |
| **+ Fast boot** | ~15-20 seconds to a ready desktop. |
| **+ Free** | No license cost. On a mini PC, you're not paying for a Windows license you won't use. |
| **+ Ecosystem consistency** | If using Pi 5: same OS family (Debian/Pi OS) as your Room Controller and Hollywood Pis. Same tools, same commands, same knowledge. |
| **+ Kiosk mode** | Well-documented auto-login + Chromium fullscreen setup. Same pattern as your Hollywood screen Pis. |
| **- Audio requires setup** | PipeWire needs tuning for optimal low-latency multi-stream audio. Not hard, but not zero-config. |
| **- Web Audio API edge cases** | Chromium on Linux can occasionally behave differently than Chrome on Windows for Web Audio API (used by `audioContext.js` for SFX). Needs thorough testing. |
| **- 3.5mm on Pi** | Raspberry Pi's built-in 3.5mm uses PWM — audible hiss through an amplifier. Requires a USB DAC to fix (~15-25 EUR). Not an issue on mini PCs or laptops running Ubuntu. |
| **- Less GM-friendly** | Volume controls, WiFi settings, troubleshooting — less intuitive for a non-technical GM. |
| **- Chromium vs Chrome** | On Pi (ARM), you get Chromium, not full Chrome. On x86 Ubuntu, full Chrome is available. |

---

## Audio — Deep Dive

Audio is the most critical factor in this decision. The GM PC plays all room audio:
- Background music (continuous loop via `Audio()` elements)
- Sound effects (one-shot via Web Audio API / `AudioContext`)
- Hint notification sounds (via `playSfxFromUrl()`)
- Victory/defeat tracks
- Scenario automation sounds (triggered by Room Controller)

All audio goes through **one output** (3.5mm or USB DAC) → amplifier → room speakers.

### Audio Stack Comparison

| | Windows + Chrome | Ubuntu + Chromium/Chrome | Pi OS + Chromium |
|---|---|---|---|
| Audio backend | WASAPI (mature) | PipeWire (modern, good) | PipeWire/PulseAudio |
| Web Audio API (SFX) | Rock solid | Good (test needed) | Needs testing |
| Multiple streams | No issues | Usually fine | Can stutter under load |
| 3.5mm output quality | Proper DAC on PC/laptop | Proper DAC on PC/laptop | PWM — needs USB DAC |
| Audio ducking avoidance | Works perfectly | Usually works | Usually works |
| Dropout risk | Very low | Low | Low-moderate |

### Key Concern: SFX Layering

The dashboard uses a shared `AudioContext` singleton (`audioContext.js`) to play sound effects **without** triggering the browser's media session ducking of background music. This is a somewhat advanced Web Audio API usage pattern. It works perfectly in Chrome/Windows. On Chromium/Linux it should work but warrants thorough testing before the first live session.

---

## Workarounds

### Windows Update (if choosing Windows)

| Method | How |
|---|---|
| **Active Hours** | Settings → Windows Update → Active Hours → set 09:00-23:00 |
| **Pause Updates** | Settings → Windows Update → Pause for up to 5 weeks |
| **Group Policy (Pro)** | `gpedit.msc` → Computer Config → Admin Templates → Windows Update → "No auto-restart with logged-on users" |
| **Metered Connection** | Mark the Ethernet/WiFi as metered → blocks most updates |
| **Nuclear option** | `services.msc` → Windows Update → Disable (not recommended long-term, but works for a dedicated machine) |

### Audio on Linux (if choosing Ubuntu / Pi OS)

| Issue | Workaround | Cost | Effort |
|---|---|---|---|
| 3.5mm quality (Pi only) | USB DAC (e.g., Behringer UCA222 — has RCA output) | ~25 EUR | Plug and play |
| Web Audio quirks | Install Chrome instead of Chromium (x86 Ubuntu) or test with Chromium flags | Free | Medium |
| PipeWire tuning | Add config file for stable buffer size (see below) | Free | 5 minutes |
| CPU priority | Set governor to `performance` mode | Free | 1 command |
| Browser audio ducking | Launch with `--disable-features=AudioServiceSandbox,MediaSessionService` | Free | Chromium shortcut flag |
| Autoplay policy | Launch with `--autoplay-policy=no-user-gesture-required` | Free | Chromium shortcut flag |

**PipeWire config for escape room audio:**
```
# /etc/pipewire/pipewire.conf.d/escape-room.conf
context.properties = {
    default.clock.rate          = 48000
    default.clock.quantum       = 1024
    default.clock.min-quantum   = 512
}
```

**Chromium launch flags (all-in-one):**
```bash
chromium-browser \
  --kiosk \
  --autoplay-policy=no-user-gesture-required \
  --disable-features=AudioServiceSandbox,AudioServiceOutOfProcess,MediaSessionService \
  http://<room-controller-ip>:<port>
```

---

## Cost Comparison

### Scenario 1: Full setup (no existing peripherals)

| | Windows Laptop | Mini PC + Windows | Pi 5 + Ubuntu |
|---|---|---|---|
| Main unit | ~350-450 EUR | ~220 EUR | ~186 EUR |
| Monitor | — (built-in) | ~100 EUR | ~100 EUR |
| Keyboard + mouse | — (built-in) | ~25 EUR | ~25 EUR |
| USB DAC | Optional (~15 EUR) | Optional (~15 EUR) | Recommended (~25 EUR) |
| **Total** | **~350-450 EUR** | **~345-360 EUR** | **~336 EUR** |

### Scenario 2: You already have a monitor + keyboard + mouse

| | Windows Laptop | Mini PC + Windows | Pi 5 + Ubuntu |
|---|---|---|---|
| Main unit | ~350-450 EUR | ~220 EUR | ~186 EUR |
| USB DAC | Optional (~15 EUR) | Optional (~15 EUR) | Recommended (~25 EUR) |
| **Total** | **~350-450 EUR** | **~220-235 EUR** | **~211 EUR** |

> **Note:** In both scenarios, you also need a **second monitor** (player-facing screen for timer + hints) regardless of which option you choose. This cost is the same across all options.

---

## Decision Matrix

| Factor | Weight | Windows | Ubuntu (x86) | Pi 5 + Pi OS |
|---|---|---|---|---|
| Audio reliability | **Critical** | Best | Good (with config) | Good (with USB DAC + config) |
| No surprise restarts | **High** | Needs config | No risk | No risk |
| Cost | Medium | Highest | Medium | Lowest |
| GM usability | Medium | Best | Good | Requires setup |
| Ecosystem consistency | Low | Different from Pis | Similar | Same as other Pis |
| Portability | Low | Laptop: yes | No | No |
| Boot speed | Low | Slowest | Fast | Fast |
| Setup effort | Medium | Lowest | Medium | Medium-high |

---

## Recommendation

There is no single "right" answer. Choose based on your priority:

- **"I want zero audio risk on day one"** → Windows laptop. Pay more, worry less. Tame Windows Update via Group Policy.

- **"I want the best value and I'm comfortable with Linux"** → Pi 5 + USB DAC + Pi OS. Cheapest option, same ecosystem as your other Pis, all audio issues solvable. Invest 2 hours in setup and testing.

- **"I want a balance"** → Mini PC (NiPoGi or similar) + Ubuntu. Proper x86 hardware with full Chrome available, better built-in audio than Pi, no Windows overhead. Good middle ground.

Whichever you choose, **test all audio scenarios thoroughly before the first live session**: background music + SFX simultaneously, hint sound over music, victory/defeat sounds, and scenario automation audio triggers.

---

## Final Decision — Bmax B4 (Ordered)

**Chosen:** Bmax B4 Mini PC — ~182 € (AliExpress)

| Spec | Value |
|------|-------|
| CPU | Intel N95 (4 cores, up to 3.4 GHz) |
| RAM | 12 GB LPDDR5 |
| Storage | 256 GB SSD |
| Display | 2× HDMI 2.0 |
| Audio | 3.5mm jack |
| OS | Windows 11 Pro |

**Rationale:**
- Cheapest option that ticks all boxes (cheaper than Pi 5 kit + USB DAC at ~211 €)
- Windows 11 Pro for best audio reliability (Chrome + WASAPI) and Group Policy for update control
- 12 GB LPDDR5 — more RAM than any other option considered
- Dual HDMI 2.0 — GM screen + player-facing secondary screen without adapters
- Built-in 3.5mm jack — no USB DAC needed (unlike Pi 5)
- N95 is more than sufficient for a browser-only workload

**Rejected alternatives:**
- NiPoGi Pinova P1 (Ryzen 3250U, 8GB, 256GB) — ~220 €, more expensive for same role
- Raspberry Pi 5 8GB Kit — ~186 € + ~25 € USB DAC = ~211 €, needs audio config
- MLLSE M2 Air (N4000, 6GB, 128GB) — ~90 €, too weak (2-core CPU, only 6GB RAM)

---

*Last updated: February 2026*
