const EventEmitter = require('events');

class ClusterManager extends EventEmitter {
  constructor(configManager, systemStatsCollector) {
    super();
    this.configManager = configManager;
    this.systemStatsCollector = systemStatsCollector;
    this.telemetryStore = {};
    this.pullTimers = new Map();

    // Check offline threshold every 4s
    this.healthCheckTimer = setInterval(() => this.checkHealth(), 4000).unref();

    // Sync when config changes
    this.configManager.on('change', () => this.syncServers());
    this.syncServers();
  }

  getServers() {
    const config = this.configManager.getConfig() || {};
    if (!Array.isArray(config.servers) || config.servers.length === 0) {
      return [
        {
          id: 'local',
          name: 'Master Node (Local)',
          type: 'local',
          color: '#6366f1'
        }
      ];
    }
    return config.servers;
  }

  syncServers() {
    const servers = this.getServers();
    const currentIds = new Set(servers.map(s => s.id));

    // Cleanup removed server timers
    for (const [id, timer] of this.pullTimers.entries()) {
      if (!currentIds.has(id)) {
        clearInterval(timer);
        this.pullTimers.delete(id);
        delete this.telemetryStore[id];
      }
    }

    // Initialize or update each server
    servers.forEach(srv => {
      if (!this.telemetryStore[srv.id]) {
        this.telemetryStore[srv.id] = {
          id: srv.id,
          name: srv.name || srv.id,
          type: srv.type || 'local',
          color: srv.color || '#6366f1',
          status: srv.type === 'local' ? 'online' : 'pending',
          lastSeen: srv.type === 'local' ? Date.now() : 0,
          stats: null
        };
      } else {
        // Update metadata
        this.telemetryStore[srv.id].name = srv.name || srv.id;
        this.telemetryStore[srv.id].color = srv.color || '#6366f1';
        this.telemetryStore[srv.id].type = srv.type || 'local';
      }

      // Manage HTTP pull timers
      if (srv.type === 'http_pull' && srv.url) {
        if (!this.pullTimers.has(srv.id)) {
          const intervalMs = Math.max((parseInt(srv.interval, 10) || 5) * 1000, 2000);
          this.pullRemoteServer(srv);
          const timer = setInterval(() => this.pullRemoteServer(srv), intervalMs);
          this.pullTimers.set(srv.id, timer);
        }
      } else if (this.pullTimers.has(srv.id)) {
        clearInterval(this.pullTimers.get(srv.id));
        this.pullTimers.delete(srv.id);
      }
    });
  }

  checkHealth() {
    const now = Date.now();
    const servers = this.getServers();

    servers.forEach(srv => {
      const entry = this.telemetryStore[srv.id];
      if (!entry) return;

      if (srv.type === 'local') {
        entry.status = 'online';
        entry.lastSeen = now;
        return;
      }

      const timeoutMs = srv.type === 'agent_push' ? 15000 : ((parseInt(srv.interval, 10) || 5) * 2500);
      if (now - entry.lastSeen > timeoutMs) {
        entry.status = 'offline';
      }
    });
  }

  // --- Approach 1: Agent Push Handler ---
  handleAgentPush(serverId, payload, authToken) {
    const servers = this.getServers();
    const server = servers.find(s => s.id === serverId);

    if (!server) {
      return { success: false, status: 404, error: `Server '${serverId}' not registered in DimDash` };
    }

    if (server.type !== 'agent_push') {
      return { success: false, status: 400, error: `Server '${serverId}' is not configured for agent_push (current type: ${server.type})` };
    }

    // Verify token if configured
    if (server.token && server.token.trim() !== '') {
      if (!authToken || authToken !== server.token) {
        return { success: false, status: 401, error: 'Unauthorized: Invalid agent token' };
      }
    }

    const normalized = this.normalizeStats(payload, server.name);
    this.telemetryStore[serverId] = {
      id: server.id,
      name: server.name || server.id,
      type: server.type,
      color: server.color || '#10b981',
      status: 'online',
      lastSeen: Date.now(),
      stats: normalized
    };

    this.emit('telemetry_updated', serverId);
    return { success: true };
  }

  // --- Approach 2: HTTP Pull Handler ---
  async pullRemoteServer(server) {
    if (!server.url) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const headers = { 'User-Agent': 'DimDash-Cluster-Monitor/1.0' };
      if (server.token) {
        headers['Authorization'] = `Bearer ${server.token}`;
      }

      const res = await fetch(server.url, {
        signal: controller.signal,
        headers
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const contentType = res.headers.get('content-type') || '';
      let normalized = null;

      if (contentType.includes('application/json')) {
        const json = await res.json();
        normalized = this.normalizeStats(json, server.name);
      } else {
        const text = await res.text();
        // Check if Prometheus metrics
        if (text.includes('# HELP') || text.includes('node_')) {
          normalized = this.parsePrometheusMetrics(text, server.name);
        } else {
          try {
            const parsed = JSON.parse(text);
            normalized = this.normalizeStats(parsed, server.name);
          } catch (_) {
            throw new Error('Unsupported metric payload format');
          }
        }
      }

      this.telemetryStore[server.id] = {
        id: server.id,
        name: server.name || server.id,
        type: server.type,
        color: server.color || '#f59e0b',
        status: 'online',
        lastSeen: Date.now(),
        stats: normalized
      };

      this.emit('telemetry_updated', server.id);
    } catch (err) {
      if (this.telemetryStore[server.id]) {
        // Only mark offline if grace period expired
        const lastSeen = this.telemetryStore[server.id].lastSeen || 0;
        if (Date.now() - lastSeen > 12000) {
          this.telemetryStore[server.id].status = 'offline';
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  normalizeStats(raw, defaultHost = 'Remote Node') {
    if (!raw || typeof raw !== 'object') {
      return this.emptyStats(defaultHost);
    }

    // 1. DimDash standard format
    if (raw.cpu && typeof raw.cpu.percent === 'number') {
      return {
        timestamp: raw.timestamp || Date.now(),
        cpu: {
          percent: Math.min(100, Math.max(0, Math.round(raw.cpu.percent))),
          cores: raw.cpu.cores || 1,
          model: raw.cpu.model || 'Standard CPU',
          loadAvg: Array.isArray(raw.cpu.loadAvg) ? raw.cpu.loadAvg : [0, 0, 0]
        },
        ram: {
          totalGb: Number((raw.ram?.totalGb || 0).toFixed(1)),
          usedGb: Number((raw.ram?.usedGb || 0).toFixed(1)),
          freeGb: Number((raw.ram?.freeGb || 0).toFixed(1)),
          percent: Math.min(100, Math.max(0, Math.round(raw.ram?.percent || 0)))
        },
        disk: {
          totalGb: Number((raw.disk?.totalGb || 0).toFixed(1)),
          usedGb: Number((raw.disk?.usedGb || 0).toFixed(1)),
          freeGb: Number((raw.disk?.freeGb || 0).toFixed(1)),
          percent: Math.min(100, Math.max(0, Math.round(raw.disk?.percent || 0))),
          mount: raw.disk?.mount || '/'
        },
        net: {
          rxRateKb: Math.round(raw.net?.rxRateKb || 0),
          txRateKb: Math.round(raw.net?.txRateKb || 0),
          rxTotalMb: Number((raw.net?.rxTotalMb || 0).toFixed(1)),
          txTotalMb: Number((raw.net?.txTotalMb || 0).toFixed(1))
        },
        docker: {
          available: !!raw.docker?.available,
          total: raw.docker?.total || 0,
          running: raw.docker?.running || 0,
          stopped: raw.docker?.stopped || 0
        },
        host: {
          hostname: raw.host?.hostname || defaultHost,
          platform: raw.host?.platform || 'Linux',
          release: raw.host?.release || 'Remote Node',
          uptimeStr: raw.host?.uptimeStr || '0h 0m',
          uptimeSec: raw.host?.uptimeSec || 0
        }
      };
    }

    // 2. Glances format (/api/3/all or /api/3/quicklook)
    if (raw.quicklook || raw.mem) {
      const cpuPct = Math.round(raw.quicklook?.cpu || raw.cpu?.total || 0);
      const memPct = Math.round(raw.quicklook?.mem || raw.mem?.percent || 0);
      const diskPct = Math.round(raw.fs?.[0]?.percent || 0);
      const hostName = raw.system?.hostname || defaultHost;

      return {
        timestamp: Date.now(),
        cpu: {
          percent: cpuPct,
          cores: raw.quicklook?.cpu_count || 1,
          model: 'Glances Node',
          loadAvg: [raw.load?.min1 || 0, raw.load?.min5 || 0, raw.load?.min15 || 0]
        },
        ram: {
          totalGb: Number(((raw.mem?.total || 0) / 1073741824).toFixed(1)),
          usedGb: Number(((raw.mem?.used || 0) / 1073741824).toFixed(1)),
          freeGb: Number(((raw.mem?.free || 0) / 1073741824).toFixed(1)),
          percent: memPct
        },
        disk: {
          totalGb: Number(((raw.fs?.[0]?.size || 0) / 1073741824).toFixed(1)),
          usedGb: Number(((raw.fs?.[0]?.used || 0) / 1073741824).toFixed(1)),
          freeGb: Number(((raw.fs?.[0]?.free || 0) / 1073741824).toFixed(1)),
          percent: diskPct,
          mount: raw.fs?.[0]?.mnt_point || '/'
        },
        net: {
          rxRateKb: Math.round((raw.network?.[0]?.rx || 0) / 1024),
          txRateKb: Math.round((raw.network?.[0]?.tx || 0) / 1024),
          rxTotalMb: 0,
          txTotalMb: 0
        },
        docker: {
          available: Array.isArray(raw.docker?.containers),
          total: raw.docker?.containers?.length || 0,
          running: raw.docker?.containers?.filter(c => c.Status === 'running')?.length || 0,
          stopped: 0
        },
        host: {
          hostname: hostName,
          platform: raw.system?.os_name || 'Linux',
          release: raw.system?.os_version || 'Glances Monitored',
          uptimeStr: raw.uptime || 'Active',
          uptimeSec: 0
        }
      };
    }

    // 3. Generic minimal JSON (e.g. { cpu: 34, ram: 55, disk: 80, ... })
    const cpuVal = typeof raw.cpu === 'number' ? raw.cpu : (raw.cpu_percent || 0);
    const ramVal = typeof raw.ram === 'number' ? raw.ram : (raw.ram_percent || raw.memory || 0);
    const diskVal = typeof raw.disk === 'number' ? raw.disk : (raw.disk_percent || raw.storage || 0);

    return {
      timestamp: Date.now(),
      cpu: {
        percent: Math.round(cpuVal),
        cores: raw.cores || 1,
        model: raw.cpu_model || 'Generic Node',
        loadAvg: Array.isArray(raw.load) ? raw.load : [0, 0, 0]
      },
      ram: {
        totalGb: Number((raw.ram_total_gb || 0).toFixed(1)),
        usedGb: Number((raw.ram_used_gb || 0).toFixed(1)),
        freeGb: Number((raw.ram_free_gb || 0).toFixed(1)),
        percent: Math.round(ramVal)
      },
      disk: {
        totalGb: Number((raw.disk_total_gb || 0).toFixed(1)),
        usedGb: Number((raw.disk_used_gb || 0).toFixed(1)),
        freeGb: Number((raw.disk_free_gb || 0).toFixed(1)),
        percent: Math.round(diskVal),
        mount: '/'
      },
      net: {
        rxRateKb: Math.round(raw.rx_kb || raw.download_kb || 0),
        txRateKb: Math.round(raw.tx_kb || raw.upload_kb || 0),
        rxTotalMb: 0,
        txTotalMb: 0
      },
      docker: {
        available: !!raw.docker,
        total: raw.docker?.total || 0,
        running: raw.docker?.running || 0,
        stopped: raw.docker?.stopped || 0
      },
      host: {
        hostname: raw.hostname || defaultHost,
        platform: raw.platform || 'Linux',
        release: raw.release || 'Remote Server',
        uptimeStr: raw.uptime || 'Active',
        uptimeSec: 0
      }
    };
  }

  parsePrometheusMetrics(text, defaultHost) {
    const lines = text.split('\n');
    let memTotal = 0;
    let memAvail = 0;
    let fsSize = 0;
    let fsAvail = 0;

    for (const line of lines) {
      if (line.startsWith('#') || !line.trim()) continue;
      if (line.startsWith('node_memory_MemTotal_bytes')) {
        memTotal = parseFloat(line.split(' ')[1]) || 0;
      } else if (line.startsWith('node_memory_MemAvailable_bytes')) {
        memAvail = parseFloat(line.split(' ')[1]) || 0;
      } else if (line.startsWith('node_filesystem_size_bytes') && line.includes('mountpoint="/"')) {
        fsSize = parseFloat(line.split(' ')[1]) || 0;
      } else if (line.startsWith('node_filesystem_avail_bytes') && line.includes('mountpoint="/"')) {
        fsAvail = parseFloat(line.split(' ')[1]) || 0;
      }
    }

    const ramUsedBytes = Math.max(0, memTotal - memAvail);
    const ramPct = memTotal > 0 ? Math.round((ramUsedBytes / memTotal) * 100) : 0;
    const diskUsedBytes = Math.max(0, fsSize - fsAvail);
    const diskPct = fsSize > 0 ? Math.round((diskUsedBytes / fsSize) * 100) : 0;

    return {
      timestamp: Date.now(),
      cpu: {
        percent: 15, // Prom instantaneous requires rate calculation
        cores: 1,
        model: 'Prometheus Node',
        loadAvg: [0, 0, 0]
      },
      ram: {
        totalGb: Number((memTotal / 1073741824).toFixed(1)),
        usedGb: Number((ramUsedBytes / 1073741824).toFixed(1)),
        freeGb: Number((memAvail / 1073741824).toFixed(1)),
        percent: ramPct
      },
      disk: {
        totalGb: Number((fsSize / 1073741824).toFixed(1)),
        usedGb: Number((diskUsedBytes / 1073741824).toFixed(1)),
        freeGb: Number((fsAvail / 1073741824).toFixed(1)),
        percent: diskPct,
        mount: '/'
      },
      net: { rxRateKb: 0, txRateKb: 0, rxTotalMb: 0, txTotalMb: 0 },
      docker: { available: false, total: 0, running: 0, stopped: 0 },
      host: {
        hostname: defaultHost,
        platform: 'Prometheus Monitored',
        release: 'Node Exporter',
        uptimeStr: 'Live',
        uptimeSec: 0
      }
    };
  }

  emptyStats(hostname) {
    return {
      timestamp: Date.now(),
      cpu: { percent: 0, cores: 1, model: '-', loadAvg: [0, 0, 0] },
      ram: { totalGb: 0, usedGb: 0, freeGb: 0, percent: 0 },
      disk: { totalGb: 0, usedGb: 0, freeGb: 0, percent: 0, mount: '/' },
      net: { rxRateKb: 0, txRateKb: 0, rxTotalMb: 0, txTotalMb: 0 },
      docker: { available: false, total: 0, running: 0, stopped: 0 },
      host: { hostname, platform: 'Unknown', release: '-', uptimeStr: '-', uptimeSec: 0 }
    };
  }

  getAllTelemetry() {
    const servers = this.getServers();
    const localStats = this.systemStatsCollector.getStats();

    // Refresh local entry in store
    this.telemetryStore['local'] = {
      id: 'local',
      name: servers.find(s => s.id === 'local')?.name || 'Master Node (Local)',
      type: 'local',
      color: servers.find(s => s.id === 'local')?.color || '#6366f1',
      status: 'online',
      lastSeen: Date.now(),
      stats: localStats
    };

    const serversMap = {};
    let totalOnline = 0;
    let totalCpu = 0;
    let totalRam = 0;

    servers.forEach(srv => {
      let entry = this.telemetryStore[srv.id];
      if (!entry) {
        entry = {
          id: srv.id,
          name: srv.name || srv.id,
          type: srv.type || 'local',
          color: srv.color || '#6366f1',
          status: srv.type === 'local' ? 'online' : 'offline',
          lastSeen: srv.type === 'local' ? Date.now() : 0,
          stats: srv.type === 'local' ? localStats : this.emptyStats(srv.name)
        };
      }

      const isOnline = entry.status === 'online';
      if (isOnline) {
        totalOnline++;
        totalCpu += (entry.stats?.cpu?.percent || 0);
        totalRam += (entry.stats?.ram?.percent || 0);
      }

      serversMap[srv.id] = {
        id: srv.id,
        name: srv.name || srv.id,
        type: srv.type || 'local',
        color: srv.color || '#6366f1',
        status: entry.status,
        lastSeen: entry.lastSeen,
        stats: entry.stats || this.emptyStats(srv.name)
      };
    });

    const summary = {
      totalServers: servers.length,
      onlineServers: totalOnline,
      offlineServers: servers.length - totalOnline,
      avgCpu: totalOnline > 0 ? Math.round(totalCpu / totalOnline) : 0,
      avgRam: totalOnline > 0 ? Math.round(totalRam / totalOnline) : 0
    };

    return {
      ...localStats, // backwards compatibility
      servers: serversMap,
      summary
    };
  }
}

module.exports = ClusterManager;
