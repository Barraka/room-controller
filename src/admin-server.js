import express from 'express';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import archiver from 'archiver';
import AdmZip from 'adm-zip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = join(__dirname, '..', 'room-config.json');
const ADMIN_DIR = join(__dirname, '..', 'admin');
const MEDIA_DIR = join(__dirname, '..', 'media');
const MEDIA_INDEX = join(MEDIA_DIR, 'media-index.json');
const HISTORY_FILE = join(__dirname, '..', 'session-history.json');

// Ensure media directories exist
for (const sub of ['music', 'effects', 'assets']) {
  mkdirSync(join(MEDIA_DIR, sub), { recursive: true });
}

// Media index helpers
function readMediaIndex() {
  if (!existsSync(MEDIA_INDEX)) return { sounds: [], assets: {} };
  return JSON.parse(readFileSync(MEDIA_INDEX, 'utf-8'));
}
function writeMediaIndex(index) {
  writeFileSync(MEDIA_INDEX, JSON.stringify(index, null, 2));
}

/**
 * Creates an Express server for admin configuration UI
 */
export function createAdminServer(port, stateManager, scenarioEngine = null) {
  const app = express();

  // WebSocket server reference (set after initialization)
  let wsServer = null;

  app.use(express.json());

  // CORS - allow dashboard (different port) to call API
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Serve static admin UI files
  app.use(express.static(ADMIN_DIR));

  // Serve media files statically
  app.use('/media', express.static(MEDIA_DIR));

  // Multer for sound uploads (music or effects)
  const soundUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const subdir = req.body.type === 'music' ? 'music' : 'effects';
        cb(null, join(MEDIA_DIR, subdir));
      },
      filename: (req, file, cb) => {
        const ext = extname(file.originalname) || '.mp3';
        cb(null, `${Date.now()}${ext}`);
      }
    }),
    limits: { fileSize: 500 * 1024 * 1024 }
  });

  // Multer for asset uploads (backgroundImage, hintSound)
  const assetUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, join(MEDIA_DIR, 'assets'));
      },
      filename: (req, file, cb) => {
        const ext = extname(file.originalname) || '';
        cb(null, `${req.params.key}${ext}`);
      }
    }),
    limits: { fileSize: 500 * 1024 * 1024 }
  });

  // ─────────────────────────────────────────────────────────
  // Media API Routes
  // ─────────────────────────────────────────────────────────

  // List all sounds
  app.get('/api/media/sounds', (req, res) => {
    const index = readMediaIndex();
    res.json(index.sounds);
  });

  // Upload a sound
  app.post('/api/media/sounds', soundUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { name, type } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

    const subdir = type === 'music' ? 'music' : 'effects';
    const entry = {
      key: `sound-${Date.now()}`,
      name: name.trim(),
      type: type === 'music' ? 'music' : 'effect',
      role: null,
      filename: req.file.filename,
      mimeType: req.file.mimetype
    };

    const index = readMediaIndex();
    index.sounds.push(entry);
    writeMediaIndex(index);

    res.json({ success: true, sound: { ...entry, url: `/media/${subdir}/${entry.filename}` } });
  });

  // Update sound metadata (name or role)
  app.put('/api/media/sounds/:key', (req, res) => {
    const index = readMediaIndex();
    const sound = index.sounds.find(s => s.key === req.params.key);
    if (!sound) return res.status(404).json({ error: 'Sound not found' });

    const { name, role } = req.body;

    if (name !== undefined) {
      const trimmed = name.trim();
      if (!trimmed) return res.status(400).json({ error: 'Name cannot be empty' });
      if (index.sounds.some(s => s.name === trimmed && s.key !== req.params.key)) {
        return res.status(400).json({ error: 'Name already taken' });
      }
      sound.name = trimmed;
    }

    if (role !== undefined) {
      // Clear previous holder of this role
      if (role) {
        for (const s of index.sounds) {
          if (s.role === role) s.role = null;
        }
      }
      sound.role = role || null;
    }

    writeMediaIndex(index);
    res.json({ success: true, sound });
  });

  // Delete a sound
  app.delete('/api/media/sounds/:key', (req, res) => {
    const index = readMediaIndex();
    const soundIdx = index.sounds.findIndex(s => s.key === req.params.key);
    if (soundIdx === -1) return res.status(404).json({ error: 'Sound not found' });

    const sound = index.sounds[soundIdx];
    const subdir = sound.type === 'music' ? 'music' : 'effects';
    const filePath = join(MEDIA_DIR, subdir, sound.filename);
    if (existsSync(filePath)) unlinkSync(filePath);

    index.sounds.splice(soundIdx, 1);
    writeMediaIndex(index);
    res.json({ success: true });
  });

  // Upload an asset (backgroundImage, hintSound)
  app.post('/api/media/assets/:key', assetUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const key = req.params.key;
    const index = readMediaIndex();

    // Remove old asset file if it exists
    if (index.assets[key]?.filename) {
      const oldPath = join(MEDIA_DIR, 'assets', index.assets[key].filename);
      if (existsSync(oldPath)) unlinkSync(oldPath);
    }

    index.assets[key] = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype
    };
    writeMediaIndex(index);

    res.json({ success: true, url: `/media/assets/${req.file.filename}` });
  });

  // Get asset info
  app.get('/api/media/assets/:key', (req, res) => {
    const index = readMediaIndex();
    const asset = index.assets[req.params.key];
    if (!asset?.filename) return res.status(404).json({ error: 'Asset not found' });

    const filePath = join(MEDIA_DIR, 'assets', asset.filename);
    if (!existsSync(filePath)) return res.status(404).json({ error: 'Asset file not found' });

    res.sendFile(filePath);
  });

  // Delete an asset
  app.delete('/api/media/assets/:key', (req, res) => {
    const index = readMediaIndex();
    const asset = index.assets[req.params.key];
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    if (asset.filename) {
      const filePath = join(MEDIA_DIR, 'assets', asset.filename);
      if (existsSync(filePath)) unlinkSync(filePath);
    }

    delete index.assets[req.params.key];
    writeMediaIndex(index);
    res.json({ success: true });
  });

  // ─────────────────────────────────────────────────────────
  // Config API Routes
  // ─────────────────────────────────────────────────────────

  // Get current config
  app.get('/api/config', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      res.json(config);
    } catch (err) {
      res.status(500).json({ error: 'Failed to read config', details: err.message });
    }
  });

  // Get current runtime state (props with online/solved status)
  app.get('/api/state', (req, res) => {
    res.json({
      room: stateManager.getRoomInfo(),
      props: stateManager.getProps(),
      session: stateManager.getSession()
    });
  });

  // Reload config without restart (hot reload)
  app.post('/api/reload', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      const result = stateManager.reloadConfig(config);

      if (result.success) {
        // Reload scenarios
        if (scenarioEngine && config.scenarios) {
          scenarioEngine.reloadScenarios(config.scenarios);
        }

        // Broadcast updated state to all connected dashboards
        if (wsServer) {
          wsServer.broadcastFullState();
        }

        res.json({
          success: true,
          message: 'Config reloaded successfully',
          props: stateManager.getProps().length
        });
      } else {
        res.status(500).json({ error: 'Failed to reload config', details: result.error });
      }
    } catch (err) {
      res.status(500).json({ error: 'Failed to reload config', details: err.message });
    }
  });

  // Update room info
  app.put('/api/config/room', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      const { id, name, site } = req.body;

      if (!id || !name) {
        return res.status(400).json({ error: 'Room id and name are required' });
      }

      config.room = { id, name, site: site || 'default' };
      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

      res.json({ success: true, room: config.room, restartRequired: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update room', details: err.message });
    }
  });

  // Get all props
  app.get('/api/config/props', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      res.json(config.props || []);
    } catch (err) {
      res.status(500).json({ error: 'Failed to read props', details: err.message });
    }
  });

  // Reorder props (shift others to make room) - MUST be before POST /api/config/props
  app.post('/api/config/props/reorder', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      const { propId, targetOrder } = req.body;

      const prop = config.props.find(p => p.propId === propId);
      if (!prop) {
        return res.status(404).json({ error: `Prop "${propId}" not found` });
      }

      // Simple approach: shift ALL props at or after targetOrder by +1
      // This creates a gap for the moved prop and prevents accidental parallel grouping
      config.props.forEach(p => {
        if (p.propId === propId) return; // Skip the prop being moved
        if (p.order >= targetOrder) {
          p.order += 1;
        }
      });

      // Place the moved prop at the target position
      prop.order = targetOrder;

      // Normalize orders to be sequential (1, 2, 3, ...)
      normalizeOrders(config.props);

      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

      res.json({ success: true, props: config.props, restartRequired: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to reorder props', details: err.message });
    }
  });

  // Add a new prop
  app.post('/api/config/props', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      const { propId, name, type, order, sensors } = req.body;

      if (!propId || !name) {
        return res.status(400).json({ error: 'propId and name are required' });
      }

      // Check for duplicate propId
      if (config.props.some(p => p.propId === propId)) {
        return res.status(400).json({ error: `Prop with id "${propId}" already exists` });
      }

      const newProp = {
        propId,
        name,
        type: type || '',
        order: order || config.props.length + 1,
        sensors: sensors || []
      };

      config.props.push(newProp);
      config.props.sort((a, b) => a.order - b.order);

      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

      res.json({ success: true, prop: newProp, restartRequired: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to add prop', details: err.message });
    }
  });

  // Update a prop
  app.put('/api/config/props/:propId', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      const { propId } = req.params;
      const { name, type, order, sensors } = req.body;

      const propIndex = config.props.findIndex(p => p.propId === propId);
      if (propIndex === -1) {
        return res.status(404).json({ error: `Prop "${propId}" not found` });
      }

      const prop = config.props[propIndex];
      if (name !== undefined) prop.name = name;
      if (type !== undefined) prop.type = type;
      if (order !== undefined) prop.order = order;
      if (sensors !== undefined) prop.sensors = sensors;

      config.props.sort((a, b) => a.order - b.order);

      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

      res.json({ success: true, prop, restartRequired: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update prop', details: err.message });
    }
  });

  // Delete a prop
  app.delete('/api/config/props/:propId', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      const { propId } = req.params;

      const propIndex = config.props.findIndex(p => p.propId === propId);
      if (propIndex === -1) {
        return res.status(404).json({ error: `Prop "${propId}" not found` });
      }

      config.props.splice(propIndex, 1);

      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

      res.json({ success: true, restartRequired: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete prop', details: err.message });
    }
  });

  // Update prop order only
  app.put('/api/config/props/:propId/order', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      const { propId } = req.params;
      const { order } = req.body;

      const prop = config.props.find(p => p.propId === propId);
      if (!prop) {
        return res.status(404).json({ error: `Prop "${propId}" not found` });
      }

      prop.order = order;
      config.props.sort((a, b) => a.order - b.order);

      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

      res.json({ success: true, prop, restartRequired: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update prop order', details: err.message });
    }
  });

  // Helper to normalize orders to sequential numbers while preserving groups
  function normalizeOrders(props) {
    // Get unique orders sorted
    const uniqueOrders = [...new Set(props.map(p => p.order))].sort((a, b) => a - b);

    // Create mapping from old order to new sequential order
    const orderMap = {};
    uniqueOrders.forEach((order, index) => {
      orderMap[order] = index + 1;
    });

    // Apply new orders
    props.forEach(p => {
      p.order = orderMap[p.order];
    });

    // Sort props by order
    props.sort((a, b) => a.order - b.order);
  }

  // Update MQTT settings
  app.put('/api/config/mqtt', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      const { broker, baseTopic } = req.body;

      if (broker) config.mqtt.broker = broker;
      if (baseTopic) config.mqtt.baseTopic = baseTopic;

      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

      res.json({ success: true, mqtt: config.mqtt, restartRequired: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update MQTT settings', details: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // Sensor Types API
  // ─────────────────────────────────────────────────────────

  // Get all sensor types
  app.get('/api/config/sensor-types', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      res.json(config.sensorTypes || []);
    } catch (err) {
      res.status(500).json({ error: 'Failed to read sensor types', details: err.message });
    }
  });

  // Add a new sensor type
  app.post('/api/config/sensor-types', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      const { id, label } = req.body;

      if (!id || !label) {
        return res.status(400).json({ error: 'id and label are required' });
      }

      // Initialize array if it doesn't exist
      if (!config.sensorTypes) {
        config.sensorTypes = [];
      }

      // Check for duplicate id
      if (config.sensorTypes.some(t => t.id === id)) {
        return res.status(400).json({ error: `Sensor type "${id}" already exists` });
      }

      config.sensorTypes.push({ id, label });
      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

      res.json({ success: true, sensorType: { id, label } });
    } catch (err) {
      res.status(500).json({ error: 'Failed to add sensor type', details: err.message });
    }
  });

  // Update a sensor type
  app.put('/api/config/sensor-types/:id', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      const { id } = req.params;
      const { label } = req.body;

      if (!config.sensorTypes) {
        return res.status(404).json({ error: `Sensor type "${id}" not found` });
      }

      const typeIndex = config.sensorTypes.findIndex(t => t.id === id);
      if (typeIndex === -1) {
        return res.status(404).json({ error: `Sensor type "${id}" not found` });
      }

      if (label) config.sensorTypes[typeIndex].label = label;

      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

      res.json({ success: true, sensorType: config.sensorTypes[typeIndex] });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update sensor type', details: err.message });
    }
  });

  // Delete a sensor type
  app.delete('/api/config/sensor-types/:id', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      const { id } = req.params;

      if (!config.sensorTypes) {
        return res.status(404).json({ error: `Sensor type "${id}" not found` });
      }

      const typeIndex = config.sensorTypes.findIndex(t => t.id === id);
      if (typeIndex === -1) {
        return res.status(404).json({ error: `Sensor type "${id}" not found` });
      }

      config.sensorTypes.splice(typeIndex, 1);
      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete sensor type', details: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // Scenarios API
  // ─────────────────────────────────────────────────────────

  // Get all scenarios
  app.get('/api/config/scenarios', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      res.json(config.scenarios || []);
    } catch (err) {
      res.status(500).json({ error: 'Failed to read scenarios', details: err.message });
    }
  });

  // Add a new scenario
  app.post('/api/config/scenarios', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      if (!config.scenarios) config.scenarios = [];

      const scenario = req.body;
      if (!scenario.name || !scenario.trigger) {
        return res.status(400).json({ error: 'name and trigger are required' });
      }

      scenario.id = `sc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (scenario.enabled === undefined) scenario.enabled = true;
      if (!scenario.actions) scenario.actions = [];

      config.scenarios.push(scenario);
      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

      if (scenarioEngine) scenarioEngine.reloadScenarios(config.scenarios);

      res.json({ success: true, scenario });
    } catch (err) {
      res.status(500).json({ error: 'Failed to add scenario', details: err.message });
    }
  });

  // Update a scenario
  app.put('/api/config/scenarios/:id', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      if (!config.scenarios) return res.status(404).json({ error: 'Scenario not found' });

      const idx = config.scenarios.findIndex(s => s.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Scenario not found' });

      const updates = req.body;
      const scenario = config.scenarios[idx];
      if (updates.name !== undefined) scenario.name = updates.name;
      if (updates.enabled !== undefined) scenario.enabled = updates.enabled;
      if (updates.trigger !== undefined) scenario.trigger = updates.trigger;
      if (updates.actions !== undefined) scenario.actions = updates.actions;

      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

      if (scenarioEngine) scenarioEngine.reloadScenarios(config.scenarios);

      res.json({ success: true, scenario });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update scenario', details: err.message });
    }
  });

  // Delete a scenario
  app.delete('/api/config/scenarios/:id', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      if (!config.scenarios) return res.status(404).json({ error: 'Scenario not found' });

      const idx = config.scenarios.findIndex(s => s.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Scenario not found' });

      config.scenarios.splice(idx, 1);
      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

      if (scenarioEngine) scenarioEngine.reloadScenarios(config.scenarios);

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete scenario', details: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // Session History & Stats API
  // ─────────────────────────────────────────────────────────

  app.get('/api/sessions', (req, res) => {
    res.json(stateManager.getSessionHistory());
  });

  app.get('/api/stats', (req, res) => {
    try {
      const sessions = stateManager.getSessionHistory();
      const currentProps = stateManager.getProps();
      const propNameMap = {};
      for (const p of currentProps) {
        propNameMap[p.propId] = p.name;
      }

      // Summary
      const totalSessions = sessions.length;
      const victories = sessions.filter(s => s.result === 'victory').length;
      const defeats = sessions.filter(s => s.result === 'defeat').length;
      const winRate = totalSessions > 0 ? Math.round((victories / totalSessions) * 1000) / 10 : 0;

      const durationsMs = sessions.filter(s => s.realDurationMs > 0).map(s => s.realDurationMs);
      const avgDurationMs = durationsMs.length > 0 ? Math.round(durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length) : 0;

      const hintsArr = sessions.map(s => s.hintsGiven || 0);
      const avgHints = hintsArr.length > 0 ? Math.round((hintsArr.reduce((a, b) => a + b, 0) / hintsArr.length) * 10) / 10 : 0;

      const summary = { totalSessions, victories, defeats, winRate, avgDurationMs, avgHints };

      // Per-prop stats
      const propAccum = {};
      for (const sess of sessions) {
        if (!sess.propStats) continue;
        for (const ps of sess.propStats) {
          if (!propAccum[ps.propId]) {
            propAccum[ps.propId] = { sessionsWithData: 0, solved: 0, overrides: 0, solveTimes: [] };
          }
          const acc = propAccum[ps.propId];
          acc.sessionsWithData++;
          if (ps.solved) {
            acc.solved++;
            if (ps.override) acc.overrides++;
            if (ps.timeToSolveMs != null && !ps.override) {
              acc.solveTimes.push(ps.timeToSolveMs);
            }
          }
        }
      }

      const propStats = {};
      for (const [propId, acc] of Object.entries(propAccum)) {
        const solveRate = acc.sessionsWithData > 0 ? Math.round((acc.solved / acc.sessionsWithData) * 1000) / 10 : 0;
        const overrideRate = acc.solved > 0 ? Math.round((acc.overrides / acc.solved) * 1000) / 10 : 0;
        const avgSolveTimeMs = acc.solveTimes.length > 0 ? Math.round(acc.solveTimes.reduce((a, b) => a + b, 0) / acc.solveTimes.length) : null;
        const fastestSolveTimeMs = acc.solveTimes.length > 0 ? Math.min(...acc.solveTimes) : null;
        const slowestSolveTimeMs = acc.solveTimes.length > 0 ? Math.max(...acc.solveTimes) : null;

        propStats[propId] = {
          propId,
          name: propNameMap[propId] || propId,
          sessionsWithData: acc.sessionsWithData,
          solveRate,
          overrideRate,
          avgSolveTimeMs,
          fastestSolveTimeMs,
          slowestSolveTimeMs,
        };
      }

      // Per-step stats
      const stepAccum = {};
      for (const sess of sessions) {
        if (!sess.stepDurations) continue;
        for (const sd of sess.stepDurations) {
          if (sd.durationMs == null) continue;
          if (!stepAccum[sd.step]) stepAccum[sd.step] = { durations: [] };
          stepAccum[sd.step].durations.push(sd.durationMs);
        }
      }

      const stepStats = {};
      for (const [step, acc] of Object.entries(stepAccum)) {
        stepStats[step] = {
          avgDurationMs: Math.round(acc.durations.reduce((a, b) => a + b, 0) / acc.durations.length),
          sessionsWithData: acc.durations.length,
        };
      }

      res.json({ summary, propStats, stepStats });
    } catch (err) {
      res.status(500).json({ error: 'Failed to compute stats', details: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // Dashboard Config API (hints, roomDuration)
  // ─────────────────────────────────────────────────────────

  app.get('/api/config/dashboard', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      const dashboard = config.dashboard || { hints: [], roomDuration: 3600 };
      res.json(dashboard);
    } catch (err) {
      res.status(500).json({ error: 'Failed to read dashboard config', details: err.message });
    }
  });

  app.put('/api/config/dashboard', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      if (!config.dashboard) config.dashboard = { hints: [], roomDuration: 3600 };

      const { hints, roomDuration } = req.body;
      if (hints !== undefined) config.dashboard.hints = hints;
      if (roomDuration !== undefined) config.dashboard.roomDuration = roomDuration;

      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
      res.json({ success: true, dashboard: config.dashboard });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update dashboard config', details: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // Export / Import API
  // ─────────────────────────────────────────────────────────

  // Multer for import zip upload (disk storage to handle large files)
  const importUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const tmpDir = join(__dirname, '..', 'tmp');
        mkdirSync(tmpDir, { recursive: true });
        cb(null, tmpDir);
      },
      filename: (req, file, cb) => {
        cb(null, `import-${Date.now()}.zip`);
      }
    }),
    limits: { fileSize: 1024 * 1024 * 1024 } // 1GB
  });

  app.get('/api/export', (req, res) => {
    try {
      const includeHistory = req.query.history === 'true';
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));

      // Sanitize: strip network-specific config
      const exportConfig = { ...config };
      delete exportConfig.mqtt;
      delete exportConfig.websocket;
      delete exportConfig.admin;

      const roomId = config.room?.id || 'room';
      const date = new Date().toISOString().slice(0, 10);
      const filename = `room-export-${roomId}-${date}.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const archive = archiver('zip', { zlib: { level: 5 } });
      archive.on('error', (err) => {
        console.error('[Admin] Export error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Export failed' });
      });
      archive.pipe(res);

      // Add config
      archive.append(JSON.stringify(exportConfig, null, 2), { name: 'room-config.json' });

      // Add media index
      if (existsSync(MEDIA_INDEX)) {
        archive.file(MEDIA_INDEX, { name: 'media-index.json' });
      }

      // Add media directories
      for (const sub of ['music', 'effects', 'assets']) {
        const dir = join(MEDIA_DIR, sub);
        if (existsSync(dir)) {
          archive.directory(dir, `media/${sub}`);
        }
      }

      // Optionally add session history
      if (includeHistory && existsSync(HISTORY_FILE)) {
        archive.file(HISTORY_FILE, { name: 'session-history.json' });
      }

      archive.finalize();
    } catch (err) {
      console.error('[Admin] Export error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Export failed', details: err.message });
    }
  });

  app.post('/api/import', importUpload.single('archive'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No archive uploaded' });

    const zipPath = req.file.path;

    try {
      // Block during active session
      const session = stateManager.getSession();
      if (session.active) {
        unlinkSync(zipPath);
        return res.status(409).json({ error: 'Cannot import during active session' });
      }

      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();

      // Validate zip contains room-config.json
      const configEntry = entries.find(e => e.entryName === 'room-config.json');
      if (!configEntry) {
        unlinkSync(zipPath);
        return res.status(400).json({ error: 'Invalid archive: missing room-config.json' });
      }

      // Parse imported config
      const importedConfig = JSON.parse(configEntry.getData().toString('utf-8'));

      // Merge: take room content, preserve local network settings
      const currentConfig = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      const mergedConfig = {
        room: importedConfig.room || currentConfig.room,
        mqtt: currentConfig.mqtt,
        websocket: currentConfig.websocket,
        admin: currentConfig.admin,
        dashboard: importedConfig.dashboard || currentConfig.dashboard || { hints: [], roomDuration: 3600 },
        sensorTypes: importedConfig.sensorTypes || currentConfig.sensorTypes,
        props: importedConfig.props || currentConfig.props
      };
      writeFileSync(CONFIG_FILE, JSON.stringify(mergedConfig, null, 2));

      // Replace media index
      const mediaIndexEntry = entries.find(e => e.entryName === 'media-index.json');
      if (mediaIndexEntry) {
        writeFileSync(MEDIA_INDEX, mediaIndexEntry.getData().toString('utf-8'));
      }

      // Clear and replace media directories
      for (const sub of ['music', 'effects', 'assets']) {
        const dir = join(MEDIA_DIR, sub);
        if (existsSync(dir)) rmSync(dir, { recursive: true });
        mkdirSync(dir, { recursive: true });
      }

      // Extract media files
      for (const entry of entries) {
        if (entry.entryName.startsWith('media/') && !entry.isDirectory) {
          const relativePath = entry.entryName; // e.g. media/music/123.mp3
          const destPath = join(MEDIA_DIR, relativePath.slice('media/'.length));
          const destDir = dirname(destPath);
          mkdirSync(destDir, { recursive: true });
          writeFileSync(destPath, entry.getData());
        }
      }

      // Restore session history if present
      const historyEntry = entries.find(e => e.entryName === 'session-history.json');
      if (historyEntry) {
        writeFileSync(HISTORY_FILE, historyEntry.getData().toString('utf-8'));
      }

      // Clean up temp file
      unlinkSync(zipPath);

      // Hot reload
      stateManager.reloadConfig(mergedConfig);
      if (scenarioEngine && mergedConfig.scenarios) {
        scenarioEngine.reloadScenarios(mergedConfig.scenarios);
      }
      if (wsServer) wsServer.broadcastFullState();

      console.log(`[Admin] Import complete: ${mergedConfig.props.length} props, media replaced`);
      res.json({ success: true, message: 'Import complete', props: mergedConfig.props.length });
    } catch (err) {
      // Clean up temp file on error
      if (existsSync(zipPath)) unlinkSync(zipPath);
      console.error('[Admin] Import error:', err.message);
      res.status(500).json({ error: 'Import failed', details: err.message });
    }
  });

  // Start the server
  const server = app.listen(port, () => {
    console.log(`[Admin] Server running at http://localhost:${port}`);
  });

  return {
    // Set WebSocket server reference (called from index.js)
    setWsServer(ws) {
      wsServer = ws;
    },

    close: () => server.close()
  };
}
