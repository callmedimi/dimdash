const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const BoardManager = require('./boardManager');
const Prober = require('./prober');
const DEFAULT_ICONS = require('./defaultIcons');
const systemStats = require('./systemStats');
const zlib = require('zlib');
const ClusterManager = require('./clusterManager');
const { validate, PatchRequestSchema } = require('./schema');

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

// Initialize BoardManager (v2 Spatial Board + Persistence)
const boardManager = new BoardManager(dataDir);
const prober = new Prober(boardManager);
const clusterManager = new ClusterManager(boardManager, systemStats);
const MetricsHistoryCollector = require('./metricsHistory');
const metricsHistory = new MetricsHistoryCollector(dataDir);

// Fast non-blocking Gzip for large JSON responses
function sendGzipJson(req, res, data) {
  const enc = req.headers['accept-encoding'] || '';
  const jsonStr = JSON.stringify(data);
  if (enc.includes('gzip') && jsonStr.length > 2048) {
    zlib.gzip(jsonStr, (err, buf) => {
      if (!err && buf) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Length', buf.length);
        return res.end(buf);
      }
      res.json(data);
    });
  } else {
    res.json(data);
  }
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving with browser caching headers
const staticCacheOptions = {
  maxAge: '1d',
  etag: true,
  lastModified: true
};
app.use('/uploads', express.static(uploadsDir, staticCacheOptions));
app.use(express.static(path.resolve(__dirname, '../public'), staticCacheOptions));

// Server-Sent Events (SSE) clients
const sseClients = new Set();
const { monitorEventLoopDelay } = require('perf_hooks');

let elDelayHistogram = null;
try {
  elDelayHistogram = monitorEventLoopDelay({ resolution: 20 });
  elDelayHistogram.enable();
} catch (e) {}

function broadcastSSE(event, data, id = null) {
  const idLine = id !== null ? `id: ${id}\n` : '';
  const payloadStr = `${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const payloadBuf = Buffer.from(payloadStr);

  for (const client of sseClients) {
    try {
      // Backpressure check: drop telemetry/probe deltas if client write buffer > 256KB
      if (client.writableLength > 256 * 1024 && (event.includes('delta') || event.includes('telemetry'))) {
        continue;
      }
      client.write(payloadBuf);
    } catch (_) {
      sseClients.delete(client);
    }
  }
}

// BoardManager Event Listeners
boardManager.on('patch', (data) => {
  broadcastSSE('patch', data, data.rev);
});

boardManager.on('config_error', (data) => {
  broadcastSSE('config_error', data);
});

boardManager.on('reload', (data) => {
  broadcastSSE('reload', data);
  broadcastSSE('config', sanitizeConfig(boardManager.getConfig()));
});

boardManager.on('change', (cfg) => {
  broadcastSSE('config', sanitizeConfig(cfg));
});

// 15s Heartbeat comment to keep connections alive through proxies and firewalls
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': heartbeat\n\n');
    } catch (_) {
      sseClients.delete(client);
    }
  }
}, 15000).unref();

// Telemetry & Probe Delta Tracking
let prevTelemetryJson = '';
let prevProbesJson = '';
let lastFullPushTime = Date.now();

// Periodic SSE system telemetry push (every 2s delta, every 30s full)
setInterval(() => {
  if (sseClients.size === 0) return;
  const currentTelemetry = clusterManager.getAllTelemetry();
  const currentJson = JSON.stringify(currentTelemetry);
  const now = Date.now();

  if (now - lastFullPushTime > 30000 || !prevTelemetryJson) {
    broadcastSSE('system_telemetry', currentTelemetry);
    prevTelemetryJson = currentJson;
    lastFullPushTime = now;
  } else if (currentJson !== prevTelemetryJson) {
    // Send delta
    broadcastSSE('telemetry_delta', currentTelemetry);
    prevTelemetryJson = currentJson;
  }
}, 2000).unref();

// Periodic SSE probe status push (every 5s)
setInterval(() => {
  if (sseClients.size === 0) return;
  const currentProbes = prober.getAllResults();
  const currentJson = JSON.stringify(currentProbes);

  if (currentJson !== prevProbesJson) {
    broadcastSSE('probes', currentProbes);
    prevProbesJson = currentJson;
  }
}, 5000).unref();

// Instant push on remote agent telemetry updates
clusterManager.on('telemetry_updated', () => {
  if (sseClients.size > 0) {
    broadcastSSE('system_telemetry', clusterManager.getAllTelemetry());
  }
});

function sanitizeConfig(cfg) {
  const clone = JSON.parse(JSON.stringify(cfg || {}));
  clone.settings = clone.settings || {};
  clone.categories = Array.isArray(clone.categories) ? clone.categories : [];
  clone.widgets = Array.isArray(clone.widgets) ? clone.widgets : [];
  clone.servers = Array.isArray(clone.servers) && clone.servers.length > 0
    ? clone.servers.map(s => {
        const { token, ...safe } = s;
        return { ...safe, hasToken: !!token };
      })
    : [{ id: 'local', name: 'Master Node (Local)', type: 'local', color: '#6366f1' }];
  const effectiveAdminPin = boardManager.getEffectiveAdminPin();
  const effectiveUserPin = boardManager.getEffectiveUserPin();
  clone.is_pin_protected = !!effectiveAdminPin;
  clone.is_user_pin_protected = !!effectiveUserPin;
  // Mask admin and user PINs from client
  delete clone.settings.admin_pin;
  delete clone.settings.user_pin;
  return clone;
}

// --- API Routes ---

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'DimDash',
    version: '2.0.0',
    data_model: 'v2',
    air_gapped: true,
    uptime: Math.floor(process.uptime()),
    timestamp: Date.now()
  });
});

app.get('/api/self', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
    heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
    rss_mb: Math.round(mem.rss / 1024 / 1024),
    event_loop_delay_p50_ms: elDelayHistogram ? (elDelayHistogram.percentile(50) / 1e6).toFixed(2) : null,
    event_loop_delay_p99_ms: elDelayHistogram ? (elDelayHistogram.percentile(99) / 1e6).toFixed(2) : null,
    active_sse_clients: sseClients.size
  });
});

// v2 Board APIs
app.get('/api/board', (req, res) => {
  const auth = boardManager.authorize(req, 'read');
  const board = boardManager.getSanitizedBoard(auth.role);
  const etag = `"${board.rev}"`;

  res.setHeader('ETag', etag);
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  res.json(board);
});

app.post('/api/board/patch', (req, res) => {
  const auth = boardManager.authorize(req, 'patch');
  if (!auth.authorized) {
    return res.status(401).json({ error: 'Unauthorized: Admin privileges required to patch board' });
  }

  const valid = validate(PatchRequestSchema, req.body);
  if (!valid.ok) {
    return res.status(400).json({ error: 'Invalid patch payload', details: valid.errors });
  }

  try {
    const result = boardManager.applyPatch(req.body, auth.role);
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Failed to apply patch' });
  }
});

app.get('/api/board/since/:rev', (req, res) => {
  const fromRev = parseInt(req.params.rev, 10);
  if (isNaN(fromRev)) {
    return res.status(400).json({ error: 'Invalid rev parameter' });
  }

  if (boardManager.patchEngine.isPurged(fromRev)) {
    return res.status(410).json({ error: 'Requested rev has been purged from journal. Please fetch full /api/board snapshot.' });
  }

  const ops = boardManager.patchEngine.getOpsSince(fromRev);
  res.json({ headRev: boardManager.state.rev, ops });
});

app.get('/api/board/health', (req, res) => {
  res.json(boardManager.getHealth());
});

// Legacy /api/config Compatibility Routes
app.get('/api/config', (req, res) => {
  res.setHeader('Deprecation', '@deprecated Use /api/board');
  const v1Config = boardManager.getConfig();
  res.json(sanitizeConfig(v1Config));
});

app.post('/api/config', (req, res) => {
  res.setHeader('Deprecation', '@deprecated Use /api/board/patch');
  const { config, pin } = req.body;
  const currentPin = boardManager.getEffectiveAdminPin();

  if (currentPin && String(pin) !== String(currentPin)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Admin PIN' });
  }

  if (!config || typeof config !== 'object') {
    return res.status(400).json({ error: 'Invalid configuration payload' });
  }

  const result = boardManager.saveConfig(config);
  if (result.success) {
    prober.runCycle();
    res.json({ success: true });
  } else {
    res.status(500).json({ error: result.error });
  }
});

app.post('/api/verify-pin', (req, res) => {
  const { pin } = req.body;
  const currentPin = boardManager.getEffectiveAdminPin();

  if (!currentPin) {
    return res.json({ valid: true, role: 'admin' });
  }

  if (String(pin) === String(currentPin)) {
    return res.json({ valid: true, role: 'admin' });
  }

  return res.status(401).json({ valid: false, error: 'Incorrect Admin PIN' });
});

app.post('/api/verify-user-pin', (req, res) => {
  const { pin } = req.body;
  const userPin = boardManager.getEffectiveUserPin();
  const adminPin = boardManager.getEffectiveAdminPin();

  if (adminPin && String(pin) === String(adminPin)) {
    return res.json({ valid: true, role: 'admin' });
  }

  if (userPin && String(pin) === String(userPin)) {
    return res.json({ valid: true, role: 'user' });
  }

  if (!userPin && !adminPin) {
    return res.json({ valid: true, role: 'user' });
  }

  return res.status(401).json({ valid: false, error: 'Incorrect PIN' });
});

app.get('/api/probes', (req, res) => {
  res.json(prober.getAllResults());
});

app.get('/api/probes/:id', async (req, res) => {
  const tileId = req.params.id;
  const cfg = boardManager.getConfig();
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
  const currentPin = boardManager.getEffectiveAdminPin();

  if (currentPin && String(pin) !== String(currentPin)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Admin PIN' });
  }

  const currentConfig = boardManager.getConfig();
  const updatedCategories = (currentConfig.categories || [])
    .filter(cat => !categoryIds.includes(cat.id))
    .map(cat => ({
      ...cat,
      tiles: (cat.tiles || []).filter(t => !tileIds.includes(t.id))
    }));

  currentConfig.categories = updatedCategories;
  const result = boardManager.saveConfig(currentConfig);

  if (result.success) {
    prober.runCycle();
    res.json({ success: true, deletedTiles: tileIds.length, deletedCategories: categoryIds.length });
  } else {
    res.status(500).json({ error: result.error });
  }
});

app.get('/api/system-stats', (req, res) => {
  const cfg = boardManager.getConfig();
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

let cachedHeimdallApps = null;
app.get('/api/icons/heimdall', (req, res) => {
  if (!cachedHeimdallApps) {
    const filePath = path.join(__dirname, '../data/heimdall_apps.json');
    if (fs.existsSync(filePath)) {
      try {
        cachedHeimdallApps = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch (_) {
        cachedHeimdallApps = [];
      }
    } else {
      cachedHeimdallApps = [];
    }
  }
  return sendGzipJson(req, res, cachedHeimdallApps);
});

app.post('/api/upload', (req, res) => {
  try {
    const { filename, base64Data } = req.body;
    if (!filename || !base64Data) {
      return res.status(400).json({ error: 'Filename and base64Data are required' });
    }

    const safeName = Date.now() + '-' + filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const targetPath = path.join(uploadsDir, safeName);

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
  if (sseClients.size >= 200) {
    return res.status(503).json({ error: 'Server SSE client capacity reached (max 200)' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const auth = boardManager.authorize(req, 'read');
  const board = boardManager.getSanitizedBoard(auth.role);

  // Check Last-Event-ID for missed patch replay
  const lastEventId = req.headers['last-event-id'];
  let replayed = false;
  if (lastEventId) {
    const lastRev = parseInt(lastEventId, 10);
    const earliest = boardManager.patchEngine.getEarliestRev();
    if (!isNaN(lastRev) && lastRev >= earliest && lastRev < boardManager.state.rev) {
      const missed = boardManager.patchEngine.getOpsSince(lastRev);
      for (const entry of missed) {
        res.write(`id: ${entry.rev}\nevent: patch\ndata: ${JSON.stringify(entry)}\n\n`);
      }
      replayed = true;
    }
  }

  // Send initial snapshot if not replayed
  if (!replayed) {
    res.write(`id: ${board.rev}\nevent: snapshot\ndata: ${JSON.stringify(board)}\n\n`);
  }

  // Send legacy config event for backwards compatibility
  res.write(`event: config\ndata: ${JSON.stringify(sanitizeConfig(boardManager.getConfig()))}\n\n`);
  res.write(`event: probes\ndata: ${JSON.stringify(prober.getAllResults())}\n\n`);
  res.write(`event: system_telemetry\ndata: ${JSON.stringify(clusterManager.getAllTelemetry())}\n\n`);

  sseClients.add(res);

  // Per-client backpressure monitor
  let backpressureCount = 0;
  const backpressureInterval = setInterval(() => {
    if (res.writableLength > 256 * 1024) {
      backpressureCount++;
      if (backpressureCount >= 5) {
        // Slow client persistent for 5s: terminate
        clearInterval(backpressureInterval);
        sseClients.delete(res);
        try { res.end(); } catch (_) {}
      }
    } else {
      backpressureCount = 0;
    }
  }, 1000);

  req.on('close', () => {
    clearInterval(backpressureInterval);
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

// Fast 404 for missing assets or API calls
app.all(['/api/*', '/uploads/*', '/icons/*', '/fonts/*', '/wallpapers/*', '/css/*', '/js/*'], (req, res) => {
  res.status(404).end();
});

// Fallback to index.html for SPA page navigation
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../public/index.html'));
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================================`);
    console.log(`🚀 DimDash v2 Air-Gapped Dashboard running on port ${PORT}`);
    console.log(`🌐 Local Web UI: http://localhost:${PORT}`);
    console.log(`📁 Config: ${boardManager.configPath} (Rev: ${boardManager.state.rev})`);
    console.log(`=================================================`);
  });
}

module.exports = { app, boardManager, prober, clusterManager };
