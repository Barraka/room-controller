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

  // Per-prop digit buffers for props that have a `codeValidator.expected` field.
  // The ESP32 publishes each keypress with a "digit" field; we accumulate and
  // compare. On match, we force_solve (which signals the ESP32 to send RF UP).
  const codeBuffers = new Map();

  // Independent sliding-window buffers for `codeValidator.resetCode`. Lets a GM
  // roll a screen back down via the IR remote (e.g. "12121212") without using
  // the dashboard. Runs in parallel to the strict expected-code logic.
  const resetBuffers = new Map();

  // Per-prop projector state machine for props with `codeValidator.triggeredBy`.
  // States: 'idle' (default) → 'code_entry' (when triggering prop solves) →
  // 'success' (correct code) or 'wrong_code' (incorrect, auto-returns to
  // code_entry after WRONG_CODE_RESET_MS). Broadcast over WS so a Pi-driven
  // projector UI can render the correct screen.
  const projectorStates = new Map();
  const wrongCodeTimers = new Map();
  const WRONG_CODE_RESET_MS = 2000;

  // Per-prop tracking for `hqAudioTrigger` gating. solvedAt records when a prop
  // entered the solved state (so we can enforce postSolveLockoutMs). fired
  // tracks whether the trigger already fired this session (for oneShotPerSession).
  const hqAudioSolvedAt = new Map();
  const hqAudioFired = new Map();

  function broadcastProjectorState(propId, state, buffer = '') {
    wsServer.broadcast({
      type: 'screen_reveal_state',
      timestamp: Date.now(),
      payload: { propId, state, buffer }
    });
  }

  function setProjectorState(propId, state, buffer = '') {
    projectorStates.set(propId, state);
    broadcastProjectorState(propId, state, buffer);
  }

  function clearWrongCodeTimer(propId) {
    const t = wrongCodeTimers.get(propId);
    if (t) {
      clearTimeout(t);
      wrongCodeTimers.delete(propId);
    }
  }

  function resetProjectorToIdle(propId) {
    codeBuffers.set(propId, '');
    clearWrongCodeTimer(propId);
    setProjectorState(propId, 'idle');
  }

  // Initialize projector state for any prop with triggeredBy
  for (const p of config.props || []) {
    if (p.codeValidator?.triggeredBy) {
      projectorStates.set(p.propId, 'idle');
    }
  }

  // React to state-manager events: solve of a triggering prop opens code entry,
  // session boundaries reset projector state.
  stateManager.onEvent((event, data) => {
    if (event === 'prop_solved') {
      for (const p of config.props || []) {
        if (p.codeValidator?.triggeredBy === data.propId) {
          codeBuffers.set(p.propId, '');
          clearWrongCodeTimer(p.propId);
          setProjectorState(p.propId, 'code_entry', '');
          console.log(`[Projector] ${p.propId}: code_entry (triggered by ${data.propId})`);
        }
      }
      // Record solve timestamp for hqAudioTrigger gating
      const solvedProp = config.props?.find((p) => p.propId === data.propId);
      if (solvedProp?.hqAudioTrigger) {
        hqAudioSolvedAt.set(data.propId, Date.now());
      }
    } else if (event === 'session_started' || event === 'session_ended') {
      for (const propId of projectorStates.keys()) {
        resetProjectorToIdle(propId);
      }
      resetBuffers.clear();
      hqAudioSolvedAt.clear();
      hqAudioFired.clear();
    }
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

    // Unknown prop → auto-discover from its first status message
    if (!update && !stateManager.getProp(propId)) {
      const discovered = stateManager.discoverProp(propId, payload);
      if (discovered) {
        wsServer.broadcastFullState();
        return;
      }
    }

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
    // Extra data may be in payload.meta (contract spec) or at top level (ESP32 actual)
    const { type: _t, propId: _p, action: _a, source: _s, timestamp: _ts, meta, ...extraFields } = payload;
    const details = meta || (Object.keys(extraFields).length > 0 ? extraFields : {});
    wsServer.broadcast({
      type: 'event',
      timestamp: Date.now(),
      payload: {
        propId,
        action: payload.action,
        source: payload.source,
        details
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

    // Code-validator: accumulate digits from `keypress` events and compare
    // against the expected code configured on the prop. Power/clear resets.
    handleCodeValidation(propId, payload);

    // HQ-audio trigger: publish to hq/audio/play when a configured event fires.
    handleHqAudioTrigger(propId, payload);
  }

  /**
   * Publish to the HQ audio topic when a prop emits an event matching its
   * `hqAudioTrigger` config. Supports gating: requireSolved, postSolveLockoutMs,
   * oneShotPerSession. The Pi C audio-host subscribes to this topic.
   */
  function handleHqAudioTrigger(propId, payload) {
    const prop = config.props?.find((p) => p.propId === propId);
    const trigger = prop?.hqAudioTrigger;
    if (!trigger) return;
    if (payload.action !== trigger.event) return;

    if (trigger.requireSolved) {
      const solvedAt = hqAudioSolvedAt.get(propId);
      if (!solvedAt) {
        console.log(`[HQ Audio] ${propId}/${trigger.event}: ignored (prop not solved yet)`);
        return;
      }
      const lockout = trigger.postSolveLockoutMs ?? 0;
      if (lockout > 0 && Date.now() - solvedAt < lockout) {
        console.log(`[HQ Audio] ${propId}/${trigger.event}: ignored (within ${lockout}ms post-solve lockout)`);
        return;
      }
    }

    if (trigger.oneShotPerSession && hqAudioFired.get(propId)) {
      return; // silently ignore repeat triggers
    }
    hqAudioFired.set(propId, true);

    const topic = `${baseTopic}/hq/audio/play`;
    const body = JSON.stringify({ file: trigger.file });
    client.publish(topic, body, { qos: 1 }, (err) => {
      if (err) {
        console.error('[HQ Audio] Publish error:', err.message);
      } else {
        console.log(`[HQ Audio] ${propId}/${trigger.event} → ${trigger.file}`);
      }
    });
  }

  function handleCodeValidation(propId, payload) {
    const prop = config.props?.find((p) => p.propId === propId);
    const expected = prop?.codeValidator?.expected;
    if (!expected) return;

    const usesProjector = !!prop.codeValidator.triggeredBy;
    const resetCode = prop.codeValidator.resetCode;

    // Power button = clear buffer. Always honored.
    if (payload.action === 'code_clear') {
      const had = codeBuffers.get(propId);
      if (had) console.log(`[CodeValidator] ${propId}: buffer cleared`);
      codeBuffers.set(propId, '');
      resetBuffers.set(propId, '');
      clearWrongCodeTimer(propId);
      if (usesProjector && projectorStates.get(propId) !== 'idle') {
        setProjectorState(propId, 'code_entry', '');
      }
      return;
    }

    if (payload.action !== 'keypress') return;
    const digit = payload.digit;
    if (typeof digit !== 'string' || digit.length === 0) return;

    // Sliding-window match for resetCode. Runs regardless of projector state so
    // the GM can always roll the screen back down via the IR remote.
    if (resetCode) {
      const tail = ((resetBuffers.get(propId) || '') + digit).slice(-resetCode.length);
      resetBuffers.set(propId, tail);
      if (tail === resetCode) {
        console.log(`[CodeValidator] ${propId}: resetCode MATCH — resetting prop`);
        resetBuffers.set(propId, '');
        codeBuffers.set(propId, '');
        clearWrongCodeTimer(propId);
        const result = stateManager.resetProp(propId);
        if (usesProjector) {
          const triggerProp = stateManager.getProp(prop.codeValidator.triggeredBy);
          setProjectorState(propId, triggerProp?.solved ? 'code_entry' : 'idle', '');
        }
        sendCommand(propId, 'reset');
        if (result.success && result.changes) {
          wsServer.broadcast({
            type: 'prop_update',
            timestamp: Date.now(),
            payload: { propId, changes: result.changes }
          });
        }
        return;
      }
    }

    // For projector-managed props, only accept digits while in code_entry
    // (prevents typing during idle / wrong_code / success states).
    if (usesProjector && projectorStates.get(propId) !== 'code_entry') {
      console.log(`[CodeValidator] ${propId}: digit ignored (state=${projectorStates.get(propId)})`);
      return;
    }

    let buffer = (codeBuffers.get(propId) || '') + digit;
    // Hard cap at expected length (defensive — should validate before this).
    if (buffer.length > expected.length) {
      buffer = buffer.slice(-expected.length);
    }
    codeBuffers.set(propId, buffer);
    console.log(`[CodeValidator] ${propId}: buffer="${buffer}"`);

    // Broadcast buffer growth so projector UI updates digit-by-digit
    if (usesProjector) {
      broadcastProjectorState(propId, 'code_entry', buffer);
    }

    // Validate only when buffer reaches the expected length (strict, not sliding)
    if (buffer.length < expected.length) return;

    if (buffer === expected) {
      console.log(`[CodeValidator] ${propId}: MATCH — force solving`);
      codeBuffers.set(propId, '');
      if (usesProjector) {
        setProjectorState(propId, 'success', '');
      }
      const result = stateManager.forceSolve(propId);
      if (result.success) {
        sendCommand(propId, 'force_solved');
        if (result.changes) {
          wsServer.broadcast({
            type: 'prop_update',
            timestamp: Date.now(),
            payload: { propId, changes: result.changes }
          });
        }
      }
    } else {
      console.log(`[CodeValidator] ${propId}: WRONG buffer="${buffer}", expected="${expected}"`);
      if (usesProjector) {
        setProjectorState(propId, 'wrong_code', buffer);
      }
      // Clear buffer immediately so next keypress (after timer) starts fresh.
      // For projector props, ignore further digits until timer fires.
      codeBuffers.set(propId, '');
      clearWrongCodeTimer(propId);
      wrongCodeTimers.set(propId, setTimeout(() => {
        wrongCodeTimers.delete(propId);
        if (usesProjector) {
          setProjectorState(propId, 'code_entry', '');
        }
      }, WRONG_CODE_RESET_MS));
    }
  }

  /**
   * Handle Last Will and Testament (online/offline)
   */
  function handleLwt(propId, payload) {
    const online = payload.online === true;

    // Skip LWT for unknown props (status message handles discovery)
    if (!stateManager.getProp(propId)) return;

    const update = stateManager.setPropOnline(propId, online);

    if (update) {
      wsServer.broadcast({
        type: online ? 'prop_online' : 'prop_offline',
        timestamp: Date.now(),
        payload: { propId }
      });
    }
  }

  // Validate propId contains only safe characters for MQTT topics
  const VALID_PROP_ID = /^[a-zA-Z0-9_\-]+$/;

  /**
   * Send a command to a prop via MQTT
   */
  function sendCommand(propId, command, params = {}) {
    if (!VALID_PROP_ID.test(propId)) {
      console.error(`[MQTT] Invalid propId rejected: ${propId}`);
      return null;
    }
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

    // Generic command (used by scenario engine)
    sendCommand,

    // Command methods
    sendForceSolve(propId) {
      return sendCommand(propId, 'force_solved');
    },

    sendReset(propId) {
      codeBuffers.delete(propId);
      clearWrongCodeTimer(propId);
      // If this prop has a projector state, reset it sensibly: if its trigger
      // prop is currently solved, jump straight to code_entry; otherwise idle.
      if (projectorStates.has(propId)) {
        const prop = config.props?.find((p) => p.propId === propId);
        const trigger = prop?.codeValidator?.triggeredBy;
        const triggerProp = trigger ? stateManager.getProp(trigger) : null;
        const nextState = triggerProp?.solved ? 'code_entry' : 'idle';
        setProjectorState(propId, nextState, '');
      }
      return sendCommand(propId, 'reset');
    },

    sendTriggerSensor(propId, sensorId) {
      return sendCommand(propId, 'set_output', { sensorId, value: true });
    },

    sendArm(propId) {
      return sendCommand(propId, 'arm');
    },

    // Send a command to all configured props
    sendCommandAll(command, propIds) {
      for (const propId of propIds) {
        sendCommand(propId, command);
      }
    },

    // Snapshot of current projector state for newly-connected WS clients
    getProjectorStates() {
      const out = [];
      for (const [propId, state] of projectorStates.entries()) {
        out.push({ propId, state, buffer: codeBuffers.get(propId) || '' });
      }
      return out;
    }
  };
}
