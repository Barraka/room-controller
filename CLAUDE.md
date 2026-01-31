# Room Controller - Project Context for Claude Code

## Project Overview

**Room Controller** is a Node.js middleware that bridges ESP32 props (via MQTT) with the GM Dashboard (via WebSocket). It serves as the **single source of truth** for session state, prop states, and analytics. One Room Controller runs per escape room.

## Architecture

```
ESP32 Props ←──MQTT──→ Room Controller ←──WebSocket──→ GM Dashboard
                         (this project)

┌─────────────────────────────────────────────────────────────┐
│                      ESCAPE ROOM                            │
│                                                             │
│   ESP32 Props ──WiFi──→ Router ──Wired──→ Room Controller   │
│                                                 │           │
└─────────────────────────────────────────────────┼───────────┘
                                                  │ Wired
                                           GM Dashboard PC
```

## Tech Stack

- **Runtime**: Node.js (ES Modules)
- **MQTT Client**: mqtt.js (v5)
- **WebSocket Server**: ws (v8)
- **Admin Server**: Express (v4)
- **Storage**: JSON file (session-history.json)
- **Language**: JavaScript only - **NO TYPESCRIPT**

---

## Project Structure

```
room-controller/
├── package.json
├── room-config.json          # Room and prop configuration
├── session-history.json      # Persisted session records (auto-created)
├── CLAUDE.md                 # This file
├── admin/
│   └── index.html            # Admin UI (static HTML/CSS/JS)
└── src/
    ├── index.js              # Entry point, wires everything together
    ├── state-manager.js      # Central state for props and sessions
    ├── mqtt-client.js        # MQTT connection to props
    ├── websocket-server.js   # WebSocket server for dashboard
    └── admin-server.js       # Express server for admin UI
```

---

## Core Components

### 1. State Manager (`src/state-manager.js`)

Central state management for:
- **Props**: online/offline, solved, sensors, timing
- **Session**: active, paused, hints, duration
- **History**: persisted session records

Key methods:
```javascript
// Getters
getFullState()              // Returns { session, props[] }
getSession()                // Current session state
getProps()                  // All props
getProp(propId)             // Single prop

// Prop mutations
setPropOnline(propId, online)
updatePropFromMqtt(propId, mqttStatus)
forceSolve(propId)          // GM override
resetProp(propId)           // Reset to unsolved
triggerSensor(propId, sensorId)  // GM trigger

// Session mutations
startSession()
pauseSession()
resumeSession()
endSession(result, comments)
abortSession()
incrementHints()

// Config hot reload
reloadConfig(newConfig)     // Updates props without restart
```

### 2. MQTT Client (`src/mqtt-client.js`)

Connects to MQTT broker, handles prop communication:
- Subscribes to: `ey/<site>/<room>/prop/+/status`, `/event`, `/lwt`
- Publishes to: `ey/<site>/<room>/prop/<propId>/cmd`

Follows **MQTT Contract v1.0** (see `../MQTT_CONTRACT_v1.md` in EY_Prop_Base_PIO)

### 3. WebSocket Server (`src/websocket-server.js`)

Handles dashboard connections:
- Sends `hello` + `full_state` on connect
- Receives commands (`cmd`, `session_cmd`, `hint_given`)
- Broadcasts state updates to all connected dashboards
- `broadcastFullState()` - sends current state to all clients (used for hot reload)

Follows **WebSocket Contract v1.0** (see `../WEBSOCKET_CONTRACT_v1.md`)

### 4. Admin Server (`src/admin-server.js`)

Web-based configuration UI for managing props without editing JSON files.

- **URL**: `http://localhost:3002` (configurable via `admin.port`)
- **Features**:
  - View/edit room info
  - View/edit MQTT settings
  - Add/edit/delete props and sensors
  - Real-time prop status display (online/offline, solved)
  - **Drag & drop reordering** of props with step grouping

**Prop Ordering & Steps:**
- Props are grouped into "steps" (Etape 1, Etape 2, etc.) based on their `order` value
- Props with the **same order** are displayed as **parallel** (can be solved in any order)
- Drag & drop zones:
  - **Top 25%** of step card: Insert as new step BEFORE
  - **Middle 50%**: Add as parallel to this step
  - **Bottom 25%**: Insert as new step AFTER

**REST API Endpoints:**
```
GET  /api/config              # Full configuration
GET  /api/state               # Runtime state (props, session)
POST /api/reload              # Hot reload config (no restart needed)
PUT  /api/config/room         # Update room info
GET  /api/config/props        # List all props
POST /api/config/props        # Add new prop
PUT  /api/config/props/:id    # Update prop
DELETE /api/config/props/:id  # Delete prop
PUT  /api/config/props/:id/order  # Update prop order only
POST /api/config/props/reorder    # Reorder prop (shifts others)
PUT  /api/config/mqtt         # Update MQTT settings
GET  /api/config/sensor-types # List sensor types
POST /api/config/sensor-types # Add sensor type
PUT  /api/config/sensor-types/:id  # Update sensor type
DELETE /api/config/sensor-types/:id  # Delete sensor type
GET  /api/config/dashboard    # Get dashboard config (hints, roomDuration)
PUT  /api/config/dashboard    # Update dashboard config
GET  /api/export?history=true # Export room as .zip (config + media + optional history)
POST /api/import              # Import room .zip (multipart upload, field: "archive")
```

**Hot Reload**: Click "Appliquer" button after config changes to apply without restart. The admin server reloads the config, updates state manager, and broadcasts `full_state` to all connected dashboards.

---

## Configuration

### room-config.json

```json
{
  "room": {
    "id": "salle-1",
    "name": "Le Manoir Hanté",
    "site": "paris"
  },
  "mqtt": {
    "broker": "mqtt://localhost:1883",
    "baseTopic": "ey/paris/salle-1"
  },
  "websocket": {
    "port": 3001
  },
  "admin": {
    "port": 3002
  },
  "dashboard": {
    "hints": [],
    "roomDuration": 3600
  },
  "props": [
    {
      "propId": "coffre-5-sceaux",
      "name": "Coffre aux 5 Sceaux",
      "order": 1,
      "sensors": [
        { "sensorId": "rfid-1", "label": "Sceau Rouge" }
      ]
    }
  ]
}
```

**Important**: `propId` must match the ESP32's configured propId exactly.

---

## Data Flow

### Prop → Dashboard (status update)

1. ESP32 publishes to `ey/paris/salle-1/prop/coffre-5-sceaux/status`
2. MQTT client receives message
3. State manager updates prop state
4. WebSocket server broadcasts `prop_update` to dashboards

### Dashboard → Prop (command)

1. Dashboard sends `cmd` via WebSocket
2. WebSocket server calls state manager
3. State manager updates local state
4. MQTT client publishes command to prop
5. WebSocket server sends `cmd_ack` and broadcasts state change

### Session Lifecycle

1. Dashboard sends `session_cmd: start`
2. State manager resets all props, starts timer
3. Props are played, state updates flow
4. Dashboard sends `session_cmd: end` with result
5. State manager saves session record to history file
6. WebSocket broadcasts `session_ended` with full stats

---

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Development with auto-reload (--watch)
npm start            # Production start
```

---

## Related Contracts

- **MQTT Contract v1.0**: `../EY_Prop_Base_PIO/MQTT_CONTRACT_v1.md` - ESP32 ↔ Room Controller
- **WebSocket Contract v1.0**: `../WEBSOCKET_CONTRACT_v1.md` - Room Controller ↔ Dashboard

---

## Important Notes for Claude

- **NO TYPESCRIPT** - Keep everything as .js with ES modules
- Room Controller is **source of truth** - dashboard is just a UI
- Props must be configured in `room-config.json` before they're recognized
- Session history persists to `session-history.json` (JSON array)
- One Room Controller per room (not shared across rooms)
- MQTT broker must be running separately (e.g., Mosquitto)

---

## Recent Changes

### Export / Import
- **Export** (`GET /api/export`): Streams a `.zip` via `archiver` containing sanitized `room-config.json` (no mqtt/ports), `media-index.json`, `media/` directories, and optionally `session-history.json`
- **Import** (`POST /api/import`): Accepts a `.zip` via multer, validates contents, merges config (preserves local network settings), replaces media, hot-reloads state. Blocked during active sessions.
- **Dashboard config** (`GET/PUT /api/config/dashboard`): Stores `hints` and `roomDuration` in `room-config.json` so they're included in exports. Dashboard syncs these via `syncDashboardConfig()`.
- **Dependencies**: `archiver` (export), `adm-zip` (import)

### Prop Auto-Discovery with DEVICE_NAME
- `discoverProp()` in state-manager creates props from MQTT status messages
- Uses `mqttStatus.name` (from ESP32 `DEVICE_NAME`) as display name, falls back to `propId`

### Step Durations in Session Records
- `endSession()` in state-manager now computes `stepDurations` — sequential per-step timing based on prop `order` grouping
- Each entry: `{ step, durationMs, propIds }`. Step N's duration = time from previous step solved to this step solved. Unsolved steps get `durationMs: null`.
- `stepDurations` is included in the session record saved to `session-history.json`
- WebSocket `cmd_ack` for session end now includes `stepDurations` (via extra data param in `sendAck`)

### sendAck Extended
- `sendAck()` in websocket-server now accepts optional `extra` object that gets spread into the ack payload

---

## Two-Phase Arm/Reset Design (Planned)

Physical prop control follows a two-phase flow to separate room preparation from session start:

### Phase 1: "Armer la salle" (Arm Room)
- GM clicks "Armer la salle" button in dashboard (visible when no session active)
- Dashboard sends `session_cmd: arm` via WebSocket
- Room Controller broadcasts MQTT `arm` command to all props
- ESP32 props: power ON maglocks (GPIO output pins via relays), sensors stay disabled
- GM physically resets room (closes doors, places objects, etc.)

### Phase 2: "Débuter Session" (Start Session)
- GM clicks "Débuter Session" in dashboard
- Dashboard sends `session_cmd: start` via WebSocket
- Room Controller calls `startSession()` (resets logical state) + broadcasts MQTT `reset` to all props
- ESP32 props: re-arm sensors with 2s ignore window (maglocks stay powered)
- Timer starts

### Session End
- Only saves stats — no physical changes to props
- Maglocks remain powered until next `arm` command cycle

### Implementation Details
- **New session_cmd**: `arm` — broadcasts `arm` MQTT command to all configured props
- **Modified session_cmd `start`**: now also broadcasts `reset` MQTT command to all props
- **New MQTT command**: `arm` — ESP32 powers output pins (maglocks) but does NOT re-arm sensors
- **State tracking**: `roomArmed` boolean in state manager (informational, not blocking)

---

## Known Issues / TODO

- ~~**No MQTT reset on session start**~~: Addressed by the two-phase arm/reset design above

---

## Future Considerations

- Session history query endpoint (dashboard requests past sessions)
- ~~Prop auto-discovery~~ — Done: `discoverProp()` in state-manager auto-creates props from MQTT status messages, using `mqttStatus.name` for display name
- Multi-dashboard support (already works, just broadcast)
- Database storage instead of JSON file (for larger deployments)
