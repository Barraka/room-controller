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
armRoom()                   // Arm props (maglocks ON, sensors stay off)

// History
getSessionHistory()         // Returns array of persisted session records

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
GET  /api/sessions            # Raw session history array
GET  /api/stats               # Computed aggregates (summary, propStats, stepStats)
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

### Admin UI Improvements (Latest)
- **Audio tab**: Removed role dropdown for music tracks (roles only apply to effects), added track duration display next to play button
- **Role badges**: Now display French labels ("Victoire" / "Défaite") instead of raw values
- **Toast notifications**: Moved from bottom-right to top-center with shadow for better visibility
- **Add buttons**: "Ajouter un Prop" and "Ajouter un Automatisme" buttons moved to top of their respective tabs
- **Input validation**:
  - Prop form: name required, propId format validation (alphanumeric/hyphens/underscores only), duplicate sensor ID check
  - Piece form: name required
  - Scenario form: name required, at least one action required, prop/sensor selection required for relevant triggers, timer must be > 0, audio actions require file selection, MQTT actions require prop and command

### Pièces (Physical Rooms) Feature
- **Data model**: `pieces` array in `room-config.json` with `{ id, name, order }`
- **Props**: Each prop has optional `pieceId` field linking to a pièce
- **State manager**: `getFullState()` includes `pieces`, `reloadConfig()` updates `config.pieces` and prop `pieceId`
- **WebSocket**: `full_state` message includes `pieces` array
- **Admin UI**: Pièces CRUD in General tab, pieceId dropdown in prop modal, pièce badge on prop cards
- **GM Dashboard**: Props grouped by pièce with amber title bars spanning full width

### Admin UI Local-Only Editing
- **Batch editing**: All config changes (props, pieces, scenarios, sensor types, room, mqtt) stay in browser memory (`localConfig`) until "Appliquer" is clicked
- **No immediate API calls**: Form handlers update `localConfig` directly instead of calling individual API endpoints
- **Full config save**: New `PUT /api/config` endpoint saves entire config at once
- **Sticky warning bar**: "Modifications non sauvegardées" bar fixed at top with "Sauvegarder & Appliquer" and "Annuler" buttons
- **Discard changes**: "Annuler" resets `localConfig` to last saved state

### Admin UI Styling
- **Modifier button**: Changed from gray (#444) to blue (#2563eb) to look active
- **Pièce badge**: Amber/orange color (#5c3d1e background, #fbbf24 text) distinct from cyan prop type badge

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

### Session Stats & History API
- `GET /api/sessions` returns raw session history array
- `GET /api/stats` returns computed aggregates: summary (totalSessions, winRate, avgDurationMs, avgHints), per-prop stats (solveRate, overrideRate, avg/fastest/slowest solve time), per-step avg durations
- `getSessionHistory()` added to state-manager's public API
- Admin UI (`admin/index.html`) includes a Statistiques section: summary cards, per-prop table, last 50 sessions list
- Dashboard `StatsModal` fetches from these endpoints in full mode, falls back to local IndexedDB

---

## Two-Phase Arm/Reset Design

Physical prop control follows a two-phase flow to separate room preparation from session start:

### Phase 1: "Activer Mecas" (Arm Room)
- GM clicks "Activer Mecas" button in dashboard (visible when no session active)
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

## Scenario Engine (Automation)

Event-driven automation system that reacts to game events and triggers actions.

### Architecture
- **`src/scenario-engine.js`**: Listens to state-manager events, evaluates triggers, executes actions
- **Scenarios stored in**: `room-config.json` under `scenarios` array
- **Admin UI**: Full CRUD editor in "Automatismes" tab of admin panel (renamed from "Scenarios" to avoid confusion with the room's story scenario)
- **Dashboard integration**: `automation` WebSocket messages trigger audio playback in the browser

### Trigger Types
| Type | Fields | Fires when |
|------|--------|------------|
| `prop_solved` | `propId` | Prop transitions unsolved → solved |
| `sensor_triggered` | `propId`, `sensorId` | Specific sensor triggered |
| `timer` | `atElapsedMs` | Session elapsed time reaches threshold |
| `session_start` | — | Session starts |
| `session_end` | — | Session ends |

### Action Types
| Type | Fields | Effect |
|------|--------|--------|
| `play_audio` | `file`, `delay` | WS → dashboard plays sound effect |
| `stop_music` | `delay` | WS → dashboard stops background music |
| `play_music` | `file`, `delay` | WS → dashboard plays background track |
| `mqtt_cmd` | `propId`, `command`, `payload`, `delay` | MQTT command to ESP32 |

### Key Behaviors
- Each scenario fires **once per session** (tracked in `firedSet`)
- `firedSet` resets on `session_started`
- Timer triggers checked every 1s during active session (paused time excluded)
- Actions execute with optional `delay` (ms) via `setTimeout`
- Hot-reloadable: scenarios reload on config change or `/api/reload`

### REST Endpoints
```
GET    /api/config/scenarios          # List all scenarios
POST   /api/config/scenarios          # Add scenario
PUT    /api/config/scenarios/:id      # Update scenario
DELETE /api/config/scenarios/:id      # Delete scenario
```

### State Manager Events
State manager emits events via `onEvent(fn)` callback:
- `prop_solved` — `{ propId, timestamp }`
- `sensor_triggered` — `{ propId, sensorId, timestamp }`
- `session_started` — `{ timestamp }`
- `session_ended` — `{ result, timestamp }`

---

### Admin UI Tabbed Layout

The admin UI (`admin/index.html`) is organized into 5 tabs:

| Tab | Content |
|-----|---------|
| **General** | Room info, MQTT settings, Sensor Types, Export/Import |
| **Props** | Props list with drag-and-drop ordering |
| **Automatismes** | Automation rules list with add/edit/delete |
| **Audio** | Sound effects & music manager (upload, rename, delete, role assignment, preview) |
| **Statistiques** | Stats summary cards, per-prop analytics, session history |

### Media Management

Audio files stored on the RC filesystem under `media/`:
```
media/
├── effects/          # Sound effects (.mp3)
├── music/            # Background music tracks (.mp3)
├── assets/           # Other assets (background image, hint sound)
└── media-index.json  # Index of all sounds with metadata
```

**REST API Endpoints (Media):**
```
GET    /api/media/sounds              # List all sounds (returns media-index entries)
POST   /api/media/sounds              # Upload sound (multipart: name, type, file)
PUT    /api/media/sounds/:key         # Update sound (name, role)
DELETE /api/media/sounds/:key         # Delete sound
POST   /api/media/assets/:key         # Upload asset (backgroundImage, hintSound)
GET    /api/media/assets/:key         # Check asset exists (HEAD) or get metadata
DELETE /api/media/assets/:key         # Delete asset
```

**Static serving:** `app.use('/media', express.static(MEDIA_DIR))` — files accessible at `/media/effects/<filename>`, `/media/music/<filename>`, `/media/assets/<filename>`.

**Important (multer field order):** When uploading via multipart FormData, text fields (`name`, `type`) must be appended **before** the `file` field. Multer processes fields in order — if `file` comes first, `req.body.type` is undefined in the `destination` callback and files land in the wrong directory.

---

## v1.1.0 — Audit Bug Fix Pass

- **WebSocket heartbeat**: Added ping/pong dead connection detection (30s interval), terminates stale clients
- **WebSocket message validation**: Rejects messages without `type` or `payload` fields
- **MQTT propId validation**: Regex check (`/^[a-zA-Z0-9_\-]+$/`) prevents topic injection
- **MQTT command name fix**: `force_solve` → `force_solved` to match MQTT Contract v1.0
- **Scenario engine**: Delayed actions now tracked and cancelled on session end (prevents orphaned timeouts)
- **State manager**: Session history capped at 500 entries (prevents unbounded growth), `endSession` validates result value, `abortSession` now emits `session_ended` event, added `reloadHistory()` method
- **Admin server**: Corrupt `media-index.json` recovery (try/catch with reset), config reload/save blocked during active sessions, history reloaded from disk after import
- **Process handlers**: Added `unhandledRejection` and `uncaughtException` handlers in `index.js`

---

## Known Issues / TODO

- ~~**No MQTT reset on session start**~~: Addressed by the two-phase arm/reset design above

---

## Future Considerations

- ~~Session history query endpoint~~ — Done: `GET /api/sessions` + `GET /api/stats` endpoints, consumed by both admin UI and Dashboard StatsModal
- ~~Prop auto-discovery~~ — Done: `discoverProp()` in state-manager auto-creates props from MQTT status messages, using `mqttStatus.name` for display name
- Admin UI: expose `timer`, `session_start`, `session_end`, `sensor_triggered` trigger types in automatisme editor (engine supports them, UI only shows `prop_solved`)
- Multi-dashboard support (already works, just broadcast)
- Database storage instead of JSON file (for larger deployments)
