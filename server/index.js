const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ConfigManager = require('./configManager');
const Prober = require('./prober');
const DEFAULT_ICONS = require('./defaultIcons');
const systemStats = require('./systemStats');
const ClusterManager = require('./clusterManager');

const app = express();
const PORT = process.env.PORT || 3080;

// Setup directories
const dataDir = path.resolve(__dirname, '../data');
const uploadsDir = path.join(dataDir, 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (err) {
  console.warn(`[Server] Notice: Unable to create uploads directory: ${err.message}`);
}

// Initialize Config & Prober & ClusterManager & MetricsHistory
const configManager = new ConfigManager(path.join(dataDir, 'config.yaml'));
const prober = new Prober(configManager);
const clusterManager = new ClusterManager(configManager, systemStats);
const MetricsHistoryCollector = require('./metricsHistory');
const metricsHistory = new MetricsHistoryCollector(dataDir);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.resolve(__dirname, '../public')));

// Server-Sent Events (SSE) clients
const sseClients = new Set();

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (_) {
      sseClients.delete(client);
    }
  }
}

// Notify SSE on config change
configManager.on('change', (cfg) => {
  broadcastSSE('config', sanitizeConfig(cfg));
});

// Periodic SSE probe status push (every 5s)
setInterval(() => {
  if (sseClients.size > 0) {
    broadcastSSE('probes', prober.getAllResults());
  }
}, 5000);

// Periodic SSE system telemetry push (every 2s)
setInterval(() => {
  if (sseClients.size > 0) {
    broadcastSSE('system_telemetry', clusterManager.getAllTelemetry());
  }
}, 2000);

// Instant push on agent telemetry updates
clusterManager.on('telemetry_updated', () => {
  if (sseClients.size > 0) {
    broadcastSSE('system_telemetry', clusterManager.getAllTelemetry());
  }
});

function sanitizeConfig(cfg) {
  const clone = JSON.parse(JSON.stringify(cfg));
  clone.settings = clone.settings || {};
  clone.categories = Array.isArray(clone.categories) ? clone.categories : [];
  clone.widgets = Array.isArray(clone.widgets) ? clone.widgets : [];
  clone.servers = Array.isArray(clone.servers) && clone.servers.length > 0
    ? clone.servers.map(s => {
        const { token, ...safe } = s;
        return { ...safe, hasToken: !!token };
      })
    : [{ id: 'local', name: 'Master Node (Local)', type: 'local', color: '#6366f1' }];
  clone.is_pin_protected = !!clone.settings.admin_pin;
  // Mask admin PIN from client
  delete clone.settings.admin_pin;
  return clone;
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'DimDash',
    version: '1.0.0',
    air_gapped: true,
    uptime: Math.floor(process.uptime()),
    timestamp: Date.now()
  });
});

app.get('/api/config', (req, res) => {
  const cfg = configManager.getConfig();
  res.json(sanitizeConfig(cfg));
});

app.post('/api/verify-pin', (req, res) => {
  const { pin } = req.body;
  const cfg = configManager.getConfig();
  const currentPin = cfg.settings?.admin_pin;

  if (!currentPin) {
    return res.json({ valid: true });
  }

  if (String(pin) === String(currentPin)) {
    return res.json({ valid: true });
  }

  return res.status(401).json({ valid: false, error: 'Incorrect Admin PIN' });
});

app.post('/api/config', (req, res) => {
  const { config, pin } = req.body;
  const currentConfig = configManager.getConfig();
  const currentPin = currentConfig.settings?.admin_pin;

  // Validate PIN if configured
  if (currentPin && String(pin) !== String(currentPin)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Admin PIN' });
  }

  if (!config || typeof config !== 'object') {
    return res.status(400).json({ error: 'Invalid configuration payload' });
  }

  // Preserve admin PIN if client didn't supply a new one
  if (!config.settings) config.settings = {};
  if (!config.settings.admin_pin && currentPin) {
    config.settings.admin_pin = currentPin;
  }

  // Preserve server tokens if client didn't supply them
  if (Array.isArray(config.servers) && Array.isArray(currentConfig.servers)) {
    config.servers.forEach(srv => {
      if (!srv.token) {
        const existing = currentConfig.servers.find(s => s.id === srv.id);
        if (existing?.token) srv.token = existing.token;
      }
    });
  }

  const result = configManager.saveConfig(config);
  if (result.success) {
    // Run probe cycle right away for new/modified tiles
    prober.runCycle();
    res.json({ success: true });
  } else {
    res.status(500).json({ error: result.error });
  }
});

app.get('/api/probes', (req, res) => {
  res.json(prober.getAllResults());
});

app.get('/api/probes/:id', async (req, res) => {
  const tileId = req.params.id;
  const cfg = configManager.getConfig();
  let targetTile = null;

  for (const cat of cfg.categories || []) {
    const found = (cat.tiles || []).find(t => t.id === tileId);
    if (found) {
      targetTile = found;
      break;
    }
  }

  if (!targetTile) {
    return res.status(404).json({ error: 'Tile not found' });
  }

  const result = await prober.executeProbe(targetTile);
  res.json(result);
});

app.post('/api/probes/test-all', async (req, res) => {
  try {
    const results = await prober.runForceAll();
    broadcastSSE('probes', results);
    res.json({ success: true, count: Object.keys(results).length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/bulk-delete', (req, res) => {
  const { tileIds = [], categoryIds = [], pin } = req.body;
  const currentConfig = configManager.getConfig();
  const currentPin = currentConfig.settings?.admin_pin;

  if (currentPin && String(pin) !== String(currentPin)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Admin PIN' });
  }

  const updatedCategories = (currentConfig.categories || [])
    .filter(cat => !categoryIds.includes(cat.id))
    .map(cat => ({
      ...cat,
      tiles: (cat.tiles || []).filter(t => !tileIds.includes(t.id))
    }));

  currentConfig.categories = updatedCategories;
  const result = configManager.saveConfig(currentConfig);

  if (result.success) {
    prober.runCycle();
    res.json({ success: true, deletedTiles: tileIds.length, deletedCategories: categoryIds.length });
  } else {
    res.status(500).json({ error: result.error });
  }
});

app.get('/api/system-stats', (req, res) => {
  const cfg = configManager.getConfig();
  let totalTiles = 0;
  for (const cat of cfg.categories || []) {
    totalTiles += (cat.tiles || []).length;
  }
  const probeResults = prober.getAllResults();
  let onlineCount = 0;
  let offlineCount = 0;
  let warningCount = 0;

  for (const key of Object.keys(probeResults)) {
    const s = probeResults[key]?.status;
    if (s === 'online') onlineCount++;
    else if (s === 'offline') offlineCount++;
    else if (s === 'warning') warningCount++;
  }

  res.json({
    app: 'DimDash',
    version: '2.0.0',
    air_gapped: true,
    totalTiles,
    onlineCount,
    offlineCount,
    warningCount,
    uptime: Math.floor(process.uptime()),
    osUptime: Math.floor(os.uptime()),
    memoryUsageMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    cpuCount: os.cpus().length,
    loadAverage: os.loadavg()
  });
});

app.get('/api/icons', (req, res) => {
  res.json(DEFAULT_ICONS);
});

app.get('/api/icons/heimdall', (req, res) => {
  const filePath = path.join(__dirname, '../data/heimdall_apps.json');
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return res.json(data);
    } catch (_) {}
  }
  res.json([]);
});

app.post('/api/upload', (req, res) => {
  try {
    const { filename, base64Data } = req.body;
    if (!filename || !base64Data) {
      return res.status(400).json({ error: 'Filename and base64Data are required' });
    }

    const safeName = Date.now() + '-' + filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const targetPath = path.join(uploadsDir, safeName);

    // Strip data:image/...;base64, prefix if present
    const cleanBase64 = base64Data.replace(/^data:([A-Za-z-+/]+);base64,/, '');
    fs.writeFileSync(targetPath, Buffer.from(cleanBase64, 'base64'));

    res.json({
      success: true,
      url: `/uploads/${safeName}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/servers/:id/telemetry', (req, res) => {
  const serverId = req.params.id;
  const token = req.headers['x-server-token'] || (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  const result = clusterManager.handleAgentPush(serverId, req.body, token);
  if (result.success) {
    metricsHistory.recordRemoteSample(serverId, req.body);
    res.json({ success: true });
  } else {
    res.status(result.status || 400).json({ error: result.error });
  }
});

app.get('/api/servers', (req, res) => {
  res.json(clusterManager.getAllTelemetry().servers);
});

app.get('/api/system-telemetry', (req, res) => {
  res.json(clusterManager.getAllTelemetry());
});

app.get('/api/metrics/history', (req, res) => {
  const range = req.query.range || '1h';
  const server = req.query.server || 'local';
  res.json(metricsHistory.getHistory(server, range));
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial state
  res.write(`event: config\ndata: ${JSON.stringify(sanitizeConfig(configManager.getConfig()))}\n\n`);
  res.write(`event: probes\ndata: ${JSON.stringify(prober.getAllResults())}\n\n`);
  res.write(`event: system_telemetry\ndata: ${JSON.stringify(clusterManager.getAllTelemetry())}\n\n`);

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Admin panel route
app.get(['/admin', '/admin/*'], (req, res) => {
  const adminHtml = path.resolve(__dirname, '../public/admin/index.html');
  if (fs.existsSync(adminHtml)) {
    res.sendFile(adminHtml);
  } else {
    res.sendFile(path.resolve(__dirname, '../public/index.html'));
  }
});

// Fallback to index.html for SPA feel
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../public/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================================`);
  console.log(`🚀 DimDash Air-Gapped Dashboard running on port ${PORT}`);
  console.log(`🌐 Local Web UI: http://localhost:${PORT}`);
  console.log(`📁 Config File: ${configManager.configPath}`);
  console.log(`=================================================`);
});
