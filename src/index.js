import { readFileSync } from 'fs';
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

console.log(`[Server] Room Controller started`);
console.log(`[Server] WebSocket server listening on port ${config.websocket.port}`);
console.log(`[Server] MQTT connecting to ${config.mqtt.broker}`);
