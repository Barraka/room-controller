import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = join(__dirname, '..', 'session-history.json');

/**
 * Creates a state manager for room, props, and sessions
 */
export function createStateManager(config) {
  // Initialize props from config
  const props = new Map();
  for (const propConfig of config.props) {
    props.set(propConfig.propId, {
      propId: propConfig.propId,
      name: propConfig.name,
      order: propConfig.order,
      online: false,
      solved: false,
      override: false,
      startedAt: null,
      solvedAt: null,
      sensors: propConfig.sensors.map(s => ({
        sensorId: s.sensorId,
        label: s.label,
        triggered: false
      }))
    });
  }

  // Session state
  let session = {
    active: false,
    startedAt: null,
    endedAt: null,
    pausedAt: null,
    totalPausedMs: 0,
    hintsGiven: 0
  };

  // Load session history from file
  let sessionHistory = [];
  if (existsSync(HISTORY_FILE)) {
    try {
      sessionHistory = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
      console.log(`[State] Loaded ${sessionHistory.length} sessions from history`);
    } catch (err) {
      console.error('[State] Failed to load session history:', err.message);
    }
  }

  // Save session history to file
  function saveHistory() {
    try {
      writeFileSync(HISTORY_FILE, JSON.stringify(sessionHistory, null, 2));
    } catch (err) {
      console.error('[State] Failed to save session history:', err.message);
    }
  }

  return {
    // ─────────────────────────────────────────────────────────
    // Getters
    // ─────────────────────────────────────────────────────────

    getRoomInfo() {
      return config.room;
    },

    getSession() {
      return { ...session };
    },

    getProps() {
      return Array.from(props.values());
    },

    getProp(propId) {
      return props.get(propId) || null;
    },

    getFullState() {
      return {
        session: this.getSession(),
        props: this.getProps()
      };
    },

    // ─────────────────────────────────────────────────────────
    // Prop mutations
    // ─────────────────────────────────────────────────────────

    setPropOnline(propId, online) {
      const prop = props.get(propId);
      if (!prop) {
        console.warn(`[State] Unknown prop: ${propId}`);
        return null;
      }
      prop.online = online;
      console.log(`[State] Prop ${propId} is now ${online ? 'online' : 'offline'}`);
      return { propId, changes: { online } };
    },

    updatePropFromMqtt(propId, mqttStatus) {
      const prop = props.get(propId);
      if (!prop) {
        console.warn(`[State] Unknown prop: ${propId}`);
        return null;
      }

      const changes = {};
      const now = Date.now();

      // Update online status
      if (mqttStatus.online !== undefined && mqttStatus.online !== prop.online) {
        prop.online = mqttStatus.online;
        changes.online = prop.online;
      }

      // Update solved status
      if (mqttStatus.solved !== undefined && mqttStatus.solved !== prop.solved) {
        const wasSolved = prop.solved;
        prop.solved = mqttStatus.solved;
        changes.solved = prop.solved;

        // Track when solved
        if (prop.solved && !wasSolved) {
          prop.solvedAt = now;
          changes.solvedAt = prop.solvedAt;
        } else if (!prop.solved && wasSolved) {
          // Reset
          prop.solvedAt = null;
          changes.solvedAt = null;
        }
      }

      // Update override status
      if (mqttStatus.override !== undefined) {
        prop.override = mqttStatus.override;
        changes.override = prop.override;
      }

      // Update sensors from details
      if (mqttStatus.details?.sensors && prop.sensors.length > 0) {
        const sensorChanges = [];
        for (const sensorUpdate of mqttStatus.details.sensors) {
          const sensor = prop.sensors.find(s => s.sensorId === sensorUpdate.sensorId);
          if (sensor && sensorUpdate.triggered !== undefined) {
            const wasTriggered = sensor.triggered;
            sensor.triggered = sensorUpdate.triggered;

            // Track first interaction with prop
            if (sensor.triggered && !wasTriggered && !prop.startedAt && session.active) {
              prop.startedAt = now;
              changes.startedAt = prop.startedAt;
            }

            sensorChanges.push({
              sensorId: sensor.sensorId,
              triggered: sensor.triggered
            });
          }
        }
        if (sensorChanges.length > 0) {
          changes.sensors = sensorChanges;
        }
      }

      if (Object.keys(changes).length > 0) {
        console.log(`[State] Prop ${propId} updated:`, changes);
        return { propId, changes };
      }
      return null;
    },

    // GM command: force solve
    forceSolve(propId) {
      const prop = props.get(propId);
      if (!prop) return { success: false, error: 'Unknown prop' };

      const now = Date.now();
      const changes = {};

      if (!prop.solved) {
        prop.solved = true;
        prop.solvedAt = now;
        prop.override = true;
        changes.solved = true;
        changes.solvedAt = now;
        changes.override = true;
      }

      return { success: true, changes };
    },

    // GM command: reset prop
    resetProp(propId) {
      const prop = props.get(propId);
      if (!prop) return { success: false, error: 'Unknown prop' };

      const changes = {};
      prop.solved = false;
      prop.solvedAt = null;
      prop.override = false;
      prop.startedAt = null;
      changes.solved = false;
      changes.solvedAt = null;
      changes.override = false;
      changes.startedAt = null;

      // Reset sensors
      if (prop.sensors.length > 0) {
        for (const sensor of prop.sensors) {
          sensor.triggered = false;
        }
        changes.sensors = prop.sensors.map(s => ({
          sensorId: s.sensorId,
          triggered: false
        }));
      }

      return { success: true, changes };
    },

    // GM command: trigger sensor
    triggerSensor(propId, sensorId) {
      const prop = props.get(propId);
      if (!prop) return { success: false, error: 'Unknown prop' };

      const sensor = prop.sensors.find(s => s.sensorId === sensorId);
      if (!sensor) return { success: false, error: 'Unknown sensor' };

      const now = Date.now();
      const changes = {};

      sensor.triggered = true;
      changes.sensors = [{ sensorId, triggered: true }];

      // Track first interaction
      if (!prop.startedAt && session.active) {
        prop.startedAt = now;
        changes.startedAt = now;
      }

      return { success: true, changes };
    },

    // ─────────────────────────────────────────────────────────
    // Session mutations
    // ─────────────────────────────────────────────────────────

    startSession() {
      if (session.active) {
        return { success: false, error: 'Session already active' };
      }

      const now = Date.now();
      session = {
        active: true,
        startedAt: now,
        endedAt: null,
        pausedAt: null,
        totalPausedMs: 0,
        hintsGiven: 0
      };

      // Reset all props for new session
      for (const prop of props.values()) {
        prop.solved = false;
        prop.solvedAt = null;
        prop.override = false;
        prop.startedAt = null;
        for (const sensor of prop.sensors) {
          sensor.triggered = false;
        }
      }

      console.log('[State] Session started');
      return { success: true, session: this.getSession() };
    },

    pauseSession() {
      if (!session.active) {
        return { success: false, error: 'No active session' };
      }
      if (session.pausedAt) {
        return { success: false, error: 'Session already paused' };
      }

      session.pausedAt = Date.now();
      console.log('[State] Session paused');
      return { success: true, session: this.getSession() };
    },

    resumeSession() {
      if (!session.active) {
        return { success: false, error: 'No active session' };
      }
      if (!session.pausedAt) {
        return { success: false, error: 'Session not paused' };
      }

      const pauseDuration = Date.now() - session.pausedAt;
      session.totalPausedMs += pauseDuration;
      session.pausedAt = null;
      console.log(`[State] Session resumed (paused for ${pauseDuration}ms)`);
      return { success: true, session: this.getSession() };
    },

    endSession(result, comments = null) {
      if (!session.active) {
        return { success: false, error: 'No active session' };
      }

      const now = Date.now();

      // If paused, add final pause duration
      if (session.pausedAt) {
        session.totalPausedMs += now - session.pausedAt;
        session.pausedAt = null;
      }

      session.endedAt = now;
      session.active = false;

      const realDurationMs = session.endedAt - session.startedAt - session.totalPausedMs;

      // Build prop stats
      const propStats = Array.from(props.values()).map(prop => ({
        propId: prop.propId,
        solved: prop.solved,
        override: prop.override,
        startedAt: prop.startedAt,
        solvedAt: prop.solvedAt,
        timeToSolveMs: prop.solvedAt && prop.startedAt
          ? prop.solvedAt - prop.startedAt
          : null
      }));

      // Compute step durations (sequential timing per step group)
      const sortedProps = Array.from(props.values()).sort((a, b) => a.order - b.order);
      const steps = [];
      let currentOrder = null;
      for (const prop of sortedProps) {
        if (prop.order !== currentOrder) {
          steps.push({ order: prop.order, props: [prop] });
          currentOrder = prop.order;
        } else {
          steps[steps.length - 1].props.push(prop);
        }
      }

      const stepDurations = [];
      let prevStepSolvedAt = session.startedAt;
      for (const step of steps) {
        const allSolved = step.props.every(p => p.solved);
        if (!allSolved) {
          // Step not completed — record as null duration
          stepDurations.push({ step: step.order, durationMs: null, propIds: step.props.map(p => p.propId) });
          break; // Subsequent steps can't have started
        }
        const latestSolvedAt = Math.max(...step.props.map(p => p.solvedAt));
        const durationMs = latestSolvedAt - prevStepSolvedAt;
        stepDurations.push({ step: step.order, durationMs, propIds: step.props.map(p => p.propId) });
        prevStepSolvedAt = latestSolvedAt;
      }

      // Create session record
      const sessionRecord = {
        sessionId: `session-${session.startedAt}`,
        result,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        totalPausedMs: session.totalPausedMs,
        realDurationMs,
        hintsGiven: session.hintsGiven,
        comments,
        propStats,
        stepDurations
      };

      // Save to history
      sessionHistory.push(sessionRecord);
      saveHistory();

      console.log(`[State] Session ended: ${result} (${Math.round(realDurationMs / 1000)}s)`);
      return { success: true, sessionRecord };
    },

    abortSession() {
      if (!session.active) {
        return { success: false, error: 'No active session' };
      }

      session = {
        active: false,
        startedAt: null,
        endedAt: null,
        pausedAt: null,
        totalPausedMs: 0,
        hintsGiven: 0
      };

      console.log('[State] Session aborted');
      return { success: true, session: this.getSession() };
    },

    incrementHints() {
      if (!session.active) {
        return { success: false, error: 'No active session' };
      }

      session.hintsGiven++;
      console.log(`[State] Hint given (total: ${session.hintsGiven})`);
      return { success: true, session: this.getSession() };
    },

    // ─────────────────────────────────────────────────────────
    // Config reload (hot reload without restart)
    // ─────────────────────────────────────────────────────────

    reloadConfig(newConfig) {
      // Update room info
      config.room = newConfig.room;

      // Get current prop IDs and new prop IDs
      const currentPropIds = new Set(props.keys());
      const newPropIds = new Set(newConfig.props.map(p => p.propId));

      // Remove props that no longer exist
      for (const propId of currentPropIds) {
        if (!newPropIds.has(propId)) {
          props.delete(propId);
          console.log(`[State] Removed prop: ${propId}`);
        }
      }

      // Add or update props
      for (const propConfig of newConfig.props) {
        const existing = props.get(propConfig.propId);

        if (existing) {
          // Update config fields, preserve runtime state
          existing.name = propConfig.name;
          existing.order = propConfig.order;

          // Update sensors: preserve triggered state for existing sensors
          const existingSensors = new Map(existing.sensors.map(s => [s.sensorId, s]));
          existing.sensors = propConfig.sensors.map(s => {
            const existingSensor = existingSensors.get(s.sensorId);
            return {
              sensorId: s.sensorId,
              label: s.label,
              triggered: existingSensor ? existingSensor.triggered : false
            };
          });

          console.log(`[State] Updated prop: ${propConfig.propId}`);
        } else {
          // New prop - add with default runtime state
          props.set(propConfig.propId, {
            propId: propConfig.propId,
            name: propConfig.name,
            order: propConfig.order,
            online: false,
            solved: false,
            override: false,
            startedAt: null,
            solvedAt: null,
            sensors: propConfig.sensors.map(s => ({
              sensorId: s.sensorId,
              label: s.label,
              triggered: false
            }))
          });
          console.log(`[State] Added new prop: ${propConfig.propId}`);
        }
      }

      console.log(`[State] Config reloaded: ${props.size} props`);
      return { success: true };
    }
  };
}
