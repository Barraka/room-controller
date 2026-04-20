import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createMqttClient } from './mqtt-client.js';
import { createWebSocketServer } from './websocket-server.js';
import { createStateManager } from './state-manager.js';
import { createAdminServer } from './admin-server.js';
import { createScenarioEngine } from './scenario-engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load configuration
const configPath = join(__dirname, '..', 'room-config.json');
let config;
try {
  config = JSON.parse(readFileSync(configPath, 'utf-8'));
  console.log(`[Config] Loaded room: ${config.room.name} (${config.room.id})`);
} catch (err) {
  console.error(`[Config] Failed to load ${configPath}:`, err.message);
  process.exit(1);
}

// Initialize state manager
const stateManager = createStateManager(config, configPath);

// Initialize WebSocket server
const wsServer = createWebSocketServer(config, stateManager);

// Initialize MQTT client
const mqttClient = createMqttClient(config, stateManager, wsServer);

// Wire up MQTT client to WebSocket server (for sending commands)
wsServer.setMqttClient(mqttClient);

// Initialize Scenario Engine
const scenarioEngine = createScenarioEngine(config, stateManager, mqttClient, wsServer);

// Initialize Admin server
const adminPort = config.admin?.port || 3002;
const adminServer = createAdminServer(adminPort, stateManager, scenarioEngine);

// Wire up WebSocket server to Admin server (for config reload broadcasts)
adminServer.setWsServer(wsServer);

// ─────────────────────────────────────────────────────────
// Session checkpoint (crash recovery)
// ─────────────────────────────────────────────────────────

const CHECKPOINT_FILE = join(__dirname, '..', 'session-checkpoint.json');
let checkpointInterval = null;

function writeCheckpoint() {
  try {
    const data = {
      timestamp: Date.now(),
      ...stateManager.getSessionCheckpoint(),
      ...scenarioEngine.getCheckpointData()
    };
    writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[Checkpoint] Failed to write:', err.message);
  }
}

function deleteCheckpoint() {
  try {
    if (existsSync(CHECKPOINT_FILE)) {
      unlinkSync(CHECKPOINT_FILE);
    }
  } catch (err) {
    console.error('[Checkpoint] Failed to delete:', err.message);
  }
}

function loadCheckpoint() {
  try {
    if (!existsSync(CHECKPOINT_FILE)) return null;
    return JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8'));
  } catch (err) {
    console.warn('[Checkpoint] Corrupt checkpoint file, deleting:', err.message);
    deleteCheckpoint();
    return null;
  }
}

function startCheckpointInterval() {
  stopCheckpointInterval();
  checkpointInterval = setInterval(writeCheckpoint, 10_000);
}

function stopCheckpointInterval() {
  if (checkpointInterval) {
    clearInterval(checkpointInterval);
    checkpointInterval = null;
  }
}

// Restore session from checkpoint (if any)
const checkpoint = loadCheckpoint();
if (checkpoint && checkpoint.session?.active) {
  stateManager.restoreSession(checkpoint);
  scenarioEngine.restoreState(
    checkpoint.firedIds || [],
    checkpoint.lastFiredMap || {}
  );
  startCheckpointInterval();
  console.log(`[Recovery] Session restored from checkpoint (started at ${new Date(checkpoint.session.startedAt).toLocaleTimeString()})`);
} else if (checkpoint) {
  // Stale checkpoint (session not active) — clean up
  deleteCheckpoint();
}

// Subscribe to state events for checkpoint triggers
stateManager.onEvent((event) => {
  switch (event) {
    case 'session_started':
      writeCheckpoint();
      startCheckpointInterval();
      break;
    case 'session_paused':
    case 'session_resumed':
      writeCheckpoint();
      break;
    case 'session_ended':
      stopCheckpointInterval();
      deleteCheckpoint();
      break;
  }
});

// Graceful shutdown
const shutdown = () => {
  console.log('\n[Server] Shutting down...');
  mqttClient.end();
  wsServer.close();
  adminServer.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err);
  // Give time to flush logs, then exit
  setTimeout(() => process.exit(1), 1000);
});

console.log(`[Server] Room Controller started`);
console.log(`[Server] WebSocket server listening on port ${config.websocket.port}`);
console.log(`[Server] MQTT connecting to ${config.mqtt.broker}`);
