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

  // Start the server
  const server = app.listen(port, () => {
    console.log(`[Admin] Server running at http://localhost:${port}`);
  });

  return {
    close: () => server.close()
  };
}
