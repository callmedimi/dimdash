const net = require('net');
const http = require('http');
const https = require('https');

class Prober {
  constructor(configManager) {
    this.configManager = configManager;
    this.cache = new Map(); // tileId -> { status, latency, metric, lastChecked, error }
    this.timer = null;
    this.isRunning = false;

    // Listen to config changes and refresh active probes
    if (this.configManager) {
      this.configManager.on('change', () => {
        this.runCycle();
      });
    }

    // Start background probing cycle every 10 seconds
    this.startBackgroundLoop();
  }

  startBackgroundLoop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.runCycle();
    }, 10000).unref();
    // Initial run
    setTimeout(() => this.runCycle(), 1000).unref();
  }

  getAllResults() {
    const results = {};
    for (const [key, val] of this.cache.entries()) {
      results[key] = val;
    }
    return results;
  }

  getResult(tileId) {
    return this.cache.get(tileId) || { status: 'unknown', latency: null };
  }

  async runCycle() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const config = this.configManager ? this.configManager.getConfig() : null;
      if (!config || !Array.isArray(config.categories)) {
        this.isRunning = false;
        return;
      }

      const tasks = [];
      const now = Date.now();

      for (const cat of config.categories) {
        if (!Array.isArray(cat.tiles)) continue;
        for (const tile of cat.tiles) {
          if (!tile.probe || tile.probe.type === 'none') {
            this.cache.set(tile.id, { status: 'none', lastChecked: now });
            continue;
          }

          const existing = this.cache.get(tile.id);
          const intervalMs = (tile.probe.interval || 15) * 1000;
          if (existing && existing.lastChecked && (now - existing.lastChecked < intervalMs)) {
            continue; // Not yet time to check this tile
          }

          tasks.push(this.executeProbe(tile));
        }
      }

      if (tasks.length > 0) {
        // Run with concurrency limit of 5 to avoid socket exhaustion
        const CHUNK_SIZE = 5;
        for (let i = 0; i < tasks.length; i += CHUNK_SIZE) {
          const chunk = tasks.slice(i, i + CHUNK_SIZE);
          await Promise.allSettled(chunk);
        }
      }
    } catch (err) {
      console.error('[Prober] Error during probe cycle:', err.message);
    } finally {
      this.isRunning = false;
    }
  }

  async executeProbe(tile) {
    const probe = tile.probe;
    const now = Date.now();

    try {
      let result;
      if (probe.type === 'ping_tcp') {
        result = await this.probeTcp(probe.host, probe.port || 80, probe.timeout || 2000);
      } else if (probe.type === 'http_status') {
        result = await this.probeHttpStatus(probe.host, probe.port, probe.path, probe.ignore_ssl, probe.timeout || 2500);
      } else if (probe.type === 'json_metric') {
        result = await this.probeJsonMetric(probe.host, probe.port, probe.path, probe.json_path, probe.label, probe.unit, probe.ignore_ssl, probe.timeout || 2500);
      } else {
        result = { status: 'none' };
      }

      const prev = this.cache.get(tile.id);
      const history = Array.isArray(prev?.history) ? [...prev.history] : [];
      history.push({
        latency: typeof result.latency === 'number' ? result.latency : (result.status === 'online' ? 15 : null),
        status: result.status,
        time: now
      });
      if (history.length > 15) history.shift();

      const fullResult = {
        ...result,
        history,
        lastChecked: now
      };
      this.cache.set(tile.id, fullResult);
      return fullResult;
    } catch (err) {
      const prev = this.cache.get(tile.id);
      const history = Array.isArray(prev?.history) ? [...prev.history] : [];
      history.push({ latency: null, status: 'offline', time: now });
      if (history.length > 15) history.shift();

      const failure = {
        status: 'offline',
        latency: null,
        error: err.message,
        history,
        lastChecked: now
      };
      this.cache.set(tile.id, failure);
      return failure;
    }
  }

  async runForceAll() {
    const config = this.configManager ? this.configManager.getConfig() : null;
    if (!config || !Array.isArray(config.categories)) {
      return this.getAllResults();
    }
    const tasks = [];
    for (const cat of config.categories) {
      if (!Array.isArray(cat.tiles)) continue;
      for (const tile of cat.tiles) {
        if (tile.probe && tile.probe.type !== 'none') {
          tasks.push(this.executeProbe(tile));
        }
      }
    }
    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
    return this.getAllResults();
  }

  probeTcp(host, port, timeoutMs = 2000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const socket = new net.Socket();

      let resolved = false;
      const done = (status, error = null) => {
        if (resolved) return;
        resolved = true;
        socket.destroy();
        const latency = Date.now() - startTime;
        resolve({
          status,
          latency: status === 'online' ? latency : null,
          error
        });
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => done('online'));
      socket.once('timeout', () => done('offline', 'TCP Connection Timeout'));
      socket.once('error', (err) => done('offline', err.message));

      try {
        socket.connect(port, host);
      } catch (err) {
        done('offline', err.message);
      }
    });
  }

  probeHttpStatus(host, port, reqPath = '/', ignoreSsl = false, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const isHttps = port === 443 || String(port).endsWith('443') || String(host).startsWith('https');
      const client = isHttps ? https : http;

      // Clean host
      const cleanHost = host.replace(/^https?:\/\//, '');
      const actualPort = port || (isHttps ? 443 : 80);

      const options = {
        hostname: cleanHost,
        port: actualPort,
        path: reqPath || '/',
        method: 'GET',
        timeout: timeoutMs,
        headers: { 'User-Agent': 'DimDash/1.0 (Air-Gapped Health Probe)' },
        rejectUnauthorized: !ignoreSsl
      };

      let resolved = false;
      const done = (status, code = null, error = null) => {
        if (resolved) return;
        resolved = true;
        const latency = Date.now() - startTime;
        resolve({
          status,
          statusCode: code,
          latency: status === 'online' ? latency : null,
          error
        });
      };

      const req = client.request(options, (res) => {
        const isOk = res.statusCode >= 200 && res.statusCode < 400;
        // Drain response
        res.resume();
        done(isOk ? 'online' : 'warning', res.statusCode);
      });

      req.on('timeout', () => {
        req.destroy();
        done('offline', null, 'HTTP Request Timeout');
      });

      req.on('error', (err) => {
        done('offline', null, err.message);
      });

      req.end();
    });
  }

  probeJsonMetric(host, port, reqPath, jsonPath, label, unit = '', ignoreSsl = false, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const isHttps = port === 443 || String(port).endsWith('443') || String(host).startsWith('https');
      const client = isHttps ? https : http;

      const cleanHost = host.replace(/^https?:\/\//, '');
      const actualPort = port || (isHttps ? 443 : 80);

      const options = {
        hostname: cleanHost,
        port: actualPort,
        path: reqPath || '/',
        method: 'GET',
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'DimDash/1.0',
          'Accept': 'application/json'
        },
        rejectUnauthorized: !ignoreSsl
      };

      let resolved = false;
      const done = (status, metric = null, error = null) => {
        if (resolved) return;
        resolved = true;
        const latency = Date.now() - startTime;
        resolve({
          status,
          metric,
          latency: status === 'online' ? latency : null,
          error
        });
      };

      const req = client.request(options, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            let val = data;
            if (jsonPath) {
              const parts = jsonPath.split('.');
              for (const p of parts) {
                if (val && typeof val === 'object' && p in val) {
                  val = val[p];
                } else {
                  val = null;
                  break;
                }
              }
            }

            const metricText = val !== null ? `${val}${unit ? ' ' + unit : ''}` : null;
            done('online', {
              label: label || 'Metric',
              value: metricText || 'N/A'
            });
          } catch (e) {
            done('warning', null, 'Failed to parse JSON');
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        done('offline', null, 'Timeout');
      });

      req.on('error', (err) => {
        done('offline', null, err.message);
      });

      req.end();
    });
  }
}

module.exports = Prober;
