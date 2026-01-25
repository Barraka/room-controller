import express from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = join(__dirname, '..', 'room-config.json');
const ADMIN_DIR = join(__dirname, '..', 'admin');

/**
 * Creates an Express server for admin configuration UI
 */
export function createAdminServer(port, stateManager) {
  const app = express();

  app.use(express.json());

  // Serve static admin UI files
  app.use(express.static(ADMIN_DIR));

  // ─────────────────────────────────────────────────────────
  // API Routes
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

  // Add a new prop
  app.post('/api/config/props', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      const { propId, name, order, sensors } = req.body;

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
      const { name, order, sensors } = req.body;

      const propIndex = config.props.findIndex(p => p.propId === propId);
      if (propIndex === -1) {
        return res.status(404).json({ error: `Prop "${propId}" not found` });
      }

      const prop = config.props[propIndex];
      if (name !== undefined) prop.name = name;
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

  // Start the server
  const server = app.listen(port, () => {
    console.log(`[Admin] Server running at http://localhost:${port}`);
  });

  return {
    close: () => server.close()
  };
}
