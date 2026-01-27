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

## Future Considerations

- Session history query endpoint (dashboard requests past sessions)
- Prop auto-discovery (new prop on MQTT → prompt to configure)
- Multi-dashboard support (already works, just broadcast)
- Database storage instead of JSON file (for larger deployments)
