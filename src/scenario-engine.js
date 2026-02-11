/**
 * Scenario Engine - Reacts to game events and triggers automated actions
 *
 * Trigger types: prop_solved, sensor_triggered, timer, session_start, session_end
 * Action types: play_audio, stop_music, play_music, mqtt_cmd
 */
export function createScenarioEngine(config, stateManager, mqttClient, wsServer) {
  let scenarios = config.scenarios || [];
  const firedSet = new Set(); // Track fired scenario IDs per session
  let timerInterval = null;
  const pendingTimeouts = []; // Track delayed action timeouts for cancellation

  // ─────────────────────────────────────────────────────────
  // Event handling
  // ─────────────────────────────────────────────────────────

  stateManager.onEvent((event, data) => {
    switch (event) {
      case 'prop_solved':
        evaluateTriggers('prop_solved', data);
        break;
      case 'sensor_triggered':
        evaluateTriggers('sensor_triggered', data);
        break;
      case 'session_started':
        resetFired();
        startTimerChecks();
        evaluateTriggers('session_start', data);
        break;
      case 'session_ended':
        cancelPendingActions();
        stopTimerChecks();
        evaluateTriggers('session_end', data);
        break;
    }
  });

  // ─────────────────────────────────────────────────────────
  // Trigger evaluation
  // ─────────────────────────────────────────────────────────

  function evaluateTriggers(eventType, data) {
    for (const scenario of scenarios) {
      if (!scenario.enabled) continue;
      if (firedSet.has(scenario.id)) continue;

      const trigger = scenario.trigger;
      if (!trigger || trigger.type !== eventType) continue;

      let match = false;
      switch (eventType) {
        case 'prop_solved':
          match = trigger.propId === data.propId;
          break;
        case 'sensor_triggered':
          match = trigger.propId === data.propId && trigger.sensorId === data.sensorId;
          break;
        case 'session_start':
        case 'session_end':
          match = true;
          break;
      }

      if (match) {
        firedSet.add(scenario.id);
        console.log(`[Scenario] Triggered: "${scenario.name}" (${scenario.id})`);
        executeActions(scenario.actions);
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Timer-based triggers
  // ─────────────────────────────────────────────────────────

  function startTimerChecks() {
    stopTimerChecks();
    timerInterval = setInterval(() => {
      const session = stateManager.getSession();
      if (!session.active) {
        stopTimerChecks();
        return;
      }

      // Calculate elapsed time (excluding pauses)
      let elapsedMs;
      if (session.pausedAt) {
        elapsedMs = session.pausedAt - session.startedAt - session.totalPausedMs;
      } else {
        elapsedMs = Date.now() - session.startedAt - session.totalPausedMs;
      }

      for (const scenario of scenarios) {
        if (!scenario.enabled) continue;
        if (firedSet.has(scenario.id)) continue;
        if (scenario.trigger?.type !== 'timer') continue;

        if (elapsedMs >= scenario.trigger.atElapsedMs) {
          firedSet.add(scenario.id);
          console.log(`[Scenario] Timer triggered: "${scenario.name}" at ${Math.round(elapsedMs / 1000)}s`);
          executeActions(scenario.actions);
        }
      }
    }, 1000);
  }

  function stopTimerChecks() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // ─────────────────────────────────────────────────────────
  // Action execution
  // ─────────────────────────────────────────────────────────

  function executeActions(actions) {
    if (!actions || actions.length === 0) return;

    for (const action of actions) {
      const delay = action.delay || 0;

      if (delay > 0) {
        const timeoutId = setTimeout(() => {
          // Remove from pending list once it fires
          const idx = pendingTimeouts.indexOf(timeoutId);
          if (idx !== -1) pendingTimeouts.splice(idx, 1);
          executeAction(action);
        }, delay);
        pendingTimeouts.push(timeoutId);
      } else {
        executeAction(action);
      }
    }
  }

  function cancelPendingActions() {
    for (const id of pendingTimeouts) {
      clearTimeout(id);
    }
    pendingTimeouts.length = 0;
  }

  function executeAction(action) {
    switch (action.type) {
      case 'play_audio':
        console.log(`[Scenario] Action: play_audio "${action.file}"`);
        wsServer.broadcastAutomation({ action: 'play_audio', file: action.file });
        break;

      case 'stop_music':
        console.log(`[Scenario] Action: stop_music`);
        wsServer.broadcastAutomation({ action: 'stop_music' });
        break;

      case 'play_music':
        console.log(`[Scenario] Action: play_music "${action.file}"`);
        wsServer.broadcastAutomation({ action: 'play_music', file: action.file });
        break;

      case 'mqtt_cmd':
        console.log(`[Scenario] Action: mqtt_cmd → ${action.propId} ${action.command}`);
        if (mqttClient) {
          mqttClient.sendCommand(action.propId, action.command, action.payload);
        }
        break;

      default:
        console.warn(`[Scenario] Unknown action type: ${action.type}`);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────

  function resetFired() {
    firedSet.clear();
  }

  function reloadScenarios(newScenarios) {
    scenarios = newScenarios || [];
    console.log(`[Scenario] Reloaded: ${scenarios.length} scenarios`);
  }

  console.log(`[Scenario] Engine initialized with ${scenarios.length} scenarios`);

  return {
    reloadScenarios
  };
}
