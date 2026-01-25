import mqtt from 'mqtt';

/**
 * Creates an MQTT client that bridges props to the state manager
 */
export function createMqttClient(config, stateManager, wsServer) {
  const { broker, baseTopic } = config.mqtt;

  // Topics we subscribe to (using + wildcard for propId)
  const statusTopic = `${baseTopic}/prop/+/status`;
  const eventTopic = `${baseTopic}/prop/+/event`;
  const lwtTopic = `${baseTopic}/prop/+/lwt`;

  const client = mqtt.connect(broker, {
    clientId: `room-controller-${config.room.id}`,
    clean: true,
    reconnectPeriod: 5000
  });

  client.on('connect', () => {
    console.log(`[MQTT] Connected to ${broker}`);

    // Subscribe to all prop topics
    client.subscribe([statusTopic, eventTopic, lwtTopic], (err) => {
      if (err) {
        console.error('[MQTT] Subscribe error:', err);
      } else {
        console.log(`[MQTT] Subscribed to ${baseTopic}/prop/+/...`);
      }
    });
  });

  client.on('error', (err) => {
    console.error('[MQTT] Error:', err.message);
  });

  client.on('offline', () => {
    console.log('[MQTT] Offline');
  });

  client.on('reconnect', () => {
    console.log('[MQTT] Reconnecting...');
  });

  client.on('message', (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());
      handleMessage(topic, payload);
    } catch (err) {
      console.error('[MQTT] Failed to parse message:', err.message);
    }
  });

  /**
   * Route incoming MQTT messages to appropriate handlers
   */
  function handleMessage(topic, payload) {
    // Extract propId from topic: ey/site/room/prop/<propId>/status
    const parts = topic.split('/');
    const propId = parts[4]; // Index 4 is propId
    const messageType = parts[5]; // status, event, or lwt

    switch (messageType) {
      case 'status':
        handleStatus(propId, payload);
        break;
      case 'event':
        handleEvent(propId, payload);
        break;
      case 'lwt':
        handleLwt(propId, payload);
        break;
      default:
        console.log(`[MQTT] Unknown message type: ${messageType}`);
    }
  }

  /**
   * Handle prop status updates (retained)
   */
  function handleStatus(propId, payload) {
    if (payload.type !== 'status') return;

    const update = stateManager.updatePropFromMqtt(propId, payload);
    if (update) {
      // Broadcast to all connected dashboards
      wsServer.broadcast({
        type: 'prop_update',
        timestamp: Date.now(),
        payload: update
      });
    }
  }

  /**
   * Handle prop events (not retained)
   */
  function handleEvent(propId, payload) {
    if (payload.type !== 'event') return;

    console.log(`[MQTT] Event from ${propId}: ${payload.action}`);

    // Forward event to dashboards
    wsServer.broadcast({
      type: 'event',
      timestamp: Date.now(),
      payload: {
        propId,
        action: payload.action,
        source: payload.source,
        details: payload.meta || {}
      }
    });

    // Handle special events that affect state
    if (payload.action === 'force_solved' && payload.source === 'gm') {
      // GM bypass via physical button on prop
      const result = stateManager.forceSolve(propId);
      if (result.success && result.changes) {
        wsServer.broadcast({
          type: 'prop_update',
          timestamp: Date.now(),
          payload: { propId, changes: result.changes }
        });
      }
    }
  }

  /**
   * Handle Last Will and Testament (online/offline)
   */
  function handleLwt(propId, payload) {
    const online = payload.online === true;
    const update = stateManager.setPropOnline(propId, online);

    if (update) {
      wsServer.broadcast({
        type: online ? 'prop_online' : 'prop_offline',
        timestamp: Date.now(),
        payload: { propId }
      });
    }
  }

  /**
   * Send a command to a prop via MQTT
   */
  function sendCommand(propId, command, params = {}) {
    const topic = `${baseTopic}/prop/${propId}/cmd`;
    const payload = {
      type: 'cmd',
      propId,
      command,
      source: 'gm',
      timestamp: Date.now(),
      requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...params  // Flatten params at root level for ESP32 compatibility
    };

    client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
      if (err) {
        console.error(`[MQTT] Failed to send command to ${propId}:`, err.message);
      } else {
        console.log(`[MQTT] Sent ${command} to ${propId}`);
      }
    });

    return payload.requestId;
  }

  // Expose the client with additional methods
  return {
    // Original mqtt client methods
    end: () => client.end(),

    // Command methods
    sendForceSolve(propId) {
      return sendCommand(propId, 'force_solve');
    },

    sendReset(propId) {
      return sendCommand(propId, 'reset');
    },

    sendTriggerSensor(propId, sensorId) {
      return sendCommand(propId, 'set_output', { sensorId, value: true });
    }
  };
}
