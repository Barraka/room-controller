import { WebSocketServer } from 'ws';

const CONTRACT_VERSION = '1.0';
const SERVER_VERSION = '1.0.0';

/**
 * Creates a WebSocket server for dashboard communication
 */
export function createWebSocketServer(config, stateManager) {
  const wss = new WebSocketServer({ port: config.websocket.port });
  const clients = new Set();

  // MQTT client reference (set after initialization to avoid circular deps)
  let mqttClient = null;

  wss.on('connection', (ws) => {
    console.log('[WS] Dashboard connected');
    clients.add(ws);

    // Send hello
    send(ws, {
      type: 'hello',
      timestamp: Date.now(),
      payload: {
        room: stateManager.getRoomInfo(),
        serverVersion: SERVER_VERSION,
        contractVersion: CONTRACT_VERSION
      }
    });

    // Send full state
    send(ws, {
      type: 'full_state',
      timestamp: Date.now(),
      payload: stateManager.getFullState()
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(ws, message);
      } catch (err) {
        console.error('[WS] Failed to parse message:', err.message);
      }
    });

    ws.on('close', () => {
      console.log('[WS] Dashboard disconnected');
      clients.delete(ws);
    });

    ws.on('error', (err) => {
      console.error('[WS] Client error:', err.message);
      clients.delete(ws);
    });
  });

  /**
   * Send a message to a specific client
   */
  function send(ws, message) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send acknowledgement to a client
   */
  function sendAck(ws, requestId, success, error = null) {
    send(ws, {
      type: 'cmd_ack',
      timestamp: Date.now(),
      payload: { requestId, success, error }
    });
  }

  /**
   * Broadcast a message to all connected clients
   */
  function broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(data);
      }
    }
  }

  /**
   * Handle incoming messages from dashboard
   */
  function handleMessage(ws, message) {
    const { type, payload } = message;

    switch (type) {
      case 'cmd':
        handlePropCommand(ws, payload);
        break;
      case 'session_cmd':
        handleSessionCommand(ws, payload);
        break;
      case 'hint_given':
        handleHintGiven(ws, payload);
        break;
      default:
        console.log(`[WS] Unknown message type: ${type}`);
    }
  }

  /**
   * Handle prop control commands
   */
  function handlePropCommand(ws, payload) {
    const { requestId, command, propId, sensorId } = payload;

    let result;
    switch (command) {
      case 'force_solve':
        result = stateManager.forceSolve(propId);
        if (result.success && mqttClient) {
          mqttClient.sendForceSolve(propId);
        }
        break;

      case 'reset':
        result = stateManager.resetProp(propId);
        if (result.success && mqttClient) {
          mqttClient.sendReset(propId);
        }
        break;

      case 'trigger_sensor':
        result = stateManager.triggerSensor(propId, sensorId);
        if (result.success && mqttClient) {
          mqttClient.sendTriggerSensor(propId, sensorId);
        }
        break;

      default:
        result = { success: false, error: `Unknown command: ${command}` };
    }

    sendAck(ws, requestId, result.success, result.error);

    // Broadcast state change if successful
    if (result.success && result.changes) {
      broadcast({
        type: 'prop_update',
        timestamp: Date.now(),
        payload: { propId, changes: result.changes }
      });

      // Also send event for logging
      broadcast({
        type: 'event',
        timestamp: Date.now(),
        payload: {
          propId,
          action: command === 'trigger_sensor' ? 'sensor_triggered' : command,
          source: 'gm',
          details: sensorId ? { sensorId } : {}
        }
      });
    }
  }

  /**
   * Handle session control commands
   */
  function handleSessionCommand(ws, payload) {
    const { requestId, command, result: sessionResult, comments } = payload;

    let result;
    switch (command) {
      case 'start':
        result = stateManager.startSession();
        break;

      case 'pause':
        result = stateManager.pauseSession();
        break;

      case 'resume':
        result = stateManager.resumeSession();
        break;

      case 'end':
        result = stateManager.endSession(sessionResult, comments);
        break;

      case 'abort':
        result = stateManager.abortSession();
        break;

      default:
        result = { success: false, error: `Unknown session command: ${command}` };
    }

    sendAck(ws, requestId, result.success, result.error);

    // Broadcast session change
    if (result.success) {
      if (command === 'end' && result.sessionRecord) {
        // Send session_ended with full record
        broadcast({
          type: 'session_ended',
          timestamp: Date.now(),
          payload: result.sessionRecord
        });
      } else {
        // Send session_update
        broadcast({
          type: 'session_update',
          timestamp: Date.now(),
          payload: result.session || stateManager.getSession()
        });
      }

      // On session start, also broadcast prop resets
      if (command === 'start') {
        broadcast({
          type: 'full_state',
          timestamp: Date.now(),
          payload: stateManager.getFullState()
        });
      }
    }
  }

  /**
   * Handle hint given notification
   */
  function handleHintGiven(ws, payload) {
    const { requestId } = payload;

    const result = stateManager.incrementHints();
    sendAck(ws, requestId, result.success, result.error);

    if (result.success) {
      broadcast({
        type: 'session_update',
        timestamp: Date.now(),
        payload: result.session
      });
    }
  }

  return {
    // Set MQTT client reference (called from index.js after both are created)
    setMqttClient(client) {
      mqttClient = client;
    },

    // Broadcast to all clients
    broadcast,

    // Close server
    close() {
      for (const client of clients) {
        client.close();
      }
      wss.close();
    }
  };
}
