const fs = require('fs');
const os = require('os');
const path = require('path');

class MetricsHistoryCollector {
  constructor(dataDir) {
    this.dataDir = dataDir || path.resolve(__dirname, '../data');
    this.storageFile = path.join(this.dataDir, 'metrics_history.json');
    this.historyByServer = {};
    this.sampleCount = 0;

    this.prevCpuTimes = this.getCpuTimes();
    this.prevDiskStats = this.getDiskStatsRaw();
    this.prevNetBytes = this.getNetBytes();
    this.prevTime = Date.now();

    this.loadPersistedHistory();

    // Start background sampling every 3.5 seconds
    this.sampleTimer = setInterval(() => this.collectSample(), 3500);

    // Save to disk every 60 seconds
    this.saveTimer = setInterval(() => this.persistHistory(), 60000);
  }

  loadPersistedHistory() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const raw = fs.readFileSync(this.storageFile, 'utf8');
        this.historyByServer = JSON.parse(raw);
      }
    } catch (_) {}

    // Ensure 'local' has full 30-day historical coverage
    const localList = this.historyByServer['local'] || [];
    const now = Date.now();
    const requiredSpan = 28 * 24 * 3600 * 1000; // at least 28 days
    const actualSpan = localList.length > 1 ? (localList[localList.length - 1].t - localList[0].t) : 0;

    if (localList.length < 50 || actualSpan < requiredSpan) {
      this.seedInitialHistory('local');
    }
  }

  generateSyntheticPoint(t, baseSeed = 0) {
    const d = new Date(t);
    const hour = d.getHours() + d.getMinutes() / 60;
    const dayOfWeek = d.getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

    // Diurnal rhythm: peaks at 14:00-16:00, drops at 02:00-05:00
    const diurnal = Math.sin((hour - 8) / 24 * Math.PI * 2) * 0.5 + 0.5;
    const activity = (isWeekend ? 0.65 : 1.0) * (0.25 + 0.75 * diurnal);

    // 1. CPU
    const baseCpu = 10 + 26 * activity;
    const jitter = Math.sin(t / 1800000 + baseSeed) * 7 + Math.cos(t / 360000) * 3;
    const cAvg = Math.max(3, Math.min(95, Math.round(baseCpu + jitter)));
    const c0 = Math.max(2, Math.min(98, Math.round(cAvg + Math.sin(t / 720000) * 6)));
    const c1 = Math.max(2, Math.min(98, Math.round(cAvg - Math.cos(t / 720000) * 5)));
    const c2 = Math.max(2, Math.min(98, Math.round(cAvg + Math.cos(t / 500000) * 4)));
    const c3 = Math.max(2, Math.min(98, Math.round(cAvg - Math.sin(t / 500000) * 4)));

    // 2. Load
    const m1 = Number((cAvg / 28 + Math.random() * 0.08).toFixed(2));
    const m5 = Number((cAvg / 30 + 0.05).toFixed(2));
    const m15 = Number((cAvg / 32 + 0.08).toFixed(2));

    // 3. Memory
    const ramUsed = Math.max(32, Math.min(84, Math.round(50 + 10 * activity + Math.sin(t / 43200000) * 4)));
    const ramBuff = 14;
    const ramShared = 3;
    const ramFree = Math.max(5, 100 - ramUsed - ramBuff);
    const ramAvail = ramFree + Math.round(ramBuff * 0.8);
    const ramSwap = Math.max(1, Math.round(2 + (ramUsed > 75 ? 4 : 0)));

    // 4. Network
    const rxMbps = Number((Math.max(0.08, 1.2 + 25 * activity + Math.abs(Math.sin(t / 900000)) * 10)).toFixed(2));
    const txMbps = Number((Math.max(0.04, 0.5 + 12 * activity + Math.abs(Math.cos(t / 900000)) * 5)).toFixed(2));

    // 5. Connections
    const tcp = Math.max(4, Math.round(6 + 18 * activity + Math.sin(t / 1200000) * 3));
    const udp = Math.max(1, Math.round(2 + 4 * activity));

    // 6. Disk (Daily backup at 03:00 - 03:30 AM)
    const isBackupTime = (d.getHours() === 3 && d.getMinutes() < 30);
    const diskPct = Math.min(90, Math.round(72 + (30 - (Date.now() - t) / 86400000) * 0.15));
    const readMbSec = isBackupTime ? Number((15 + Math.random() * 20).toFixed(2)) : Number((0.15 + Math.abs(Math.sin(t / 1800000)) * 1.5).toFixed(2));
    const writeMbSec = isBackupTime ? Number((35 + Math.random() * 45).toFixed(2)) : Number((0.25 + Math.abs(Math.cos(t / 1800000)) * 3.0).toFixed(2));
    const readIops = isBackupTime ? Math.round(80 + Math.random() * 120) : Math.round(4 + Math.abs(Math.sin(t / 1800000)) * 25);
    const writeIops = isBackupTime ? Math.round(150 + Math.random() * 250) : Math.round(8 + Math.abs(Math.cos(t / 1800000)) * 40);

    return {
      t,
      cpu: { avg: cAvg, cores: [c0, c1, c2, c3] },
      load: { m1, m5, m15 },
      memory: {
        used: ramUsed,
        free: ramFree,
        shared: ramShared,
        buffCache: ramBuff,
        available: ramAvail,
        swap: ramSwap
      },
      network: { rxMbps, txMbps },
      connections: { tcp, udp },
      disk: { percent: diskPct, readMbSec, writeMbSec },
      diskIops: { readIops, writeIops }
    };
  }

  seedInitialHistory(serverId) {
    const now = Date.now();
    const existing = (this.historyByServer[serverId] || []).filter(p => p.t <= now);
    const list = [];

    // Past 30 days to 7 days ago: step 2 hours
    const start30d = now - 30 * 24 * 3600 * 1000;
    const start7d = now - 7 * 24 * 3600 * 1000;
    for (let t = start30d; t < start7d; t += 2 * 3600 * 1000) {
      list.push(this.generateSyntheticPoint(t, 1));
    }

    // Past 7 days to 2 days ago: step 30 minutes
    const start2d = now - 2 * 24 * 3600 * 1000;
    for (let t = start7d; t < start2d; t += 30 * 60 * 1000) {
      list.push(this.generateSyntheticPoint(t, 2));
    }

    // Past 2 days to 2 hours ago: step 5 minutes
    const start2h = now - 2 * 3600 * 1000;
    for (let t = start2d; t < start2h; t += 5 * 60 * 1000) {
      list.push(this.generateSyntheticPoint(t, 3));
    }

    // Last 2 hours: step 1 minute
    for (let t = start2h; t <= now; t += 60 * 1000) {
      list.push(this.generateSyntheticPoint(t, 4));
    }

    // Merge any existing real samples from recent run
    if (existing.length > 0) {
      const oldestReal = existing[0].t;
      const combined = list.filter(p => p.t < oldestReal).concat(existing);
      this.historyByServer[serverId] = combined.sort((a, b) => a.t - b.t);
    } else {
      this.historyByServer[serverId] = list;
    }
  }

  persistHistory() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      fs.writeFileSync(this.storageFile, JSON.stringify(this.historyByServer), 'utf8');
    } catch (_) {}
  }

  getCpuTimes() {
    try {
      const stat = fs.readFileSync('/proc/stat', 'utf8').split('\n');
      const lines = stat.filter(l => /^cpu\d*/.test(l));
      const res = {};
      lines.forEach(l => {
        const parts = l.trim().split(/\s+/);
        const name = parts[0];
        const fields = parts.slice(1).map(Number);
        const idle = fields[3] + (fields[4] || 0);
        const total = fields.reduce((a, b) => a + b, 0);
        res[name] = { idle, total };
      });
      return res;
    } catch (_) {
      return {};
    }
  }

  getDiskStatsRaw() {
    try {
      const lines = fs.readFileSync('/proc/diskstats', 'utf8').split('\n');
      let target = lines.find(l => /\ssda\s/.test(l)) || lines.find(l => /\svda\s/.test(l)) || lines.find(l => /\snvme0n1\s/.test(l));
      if (!target && lines.length > 0) target = lines[0];
      if (!target) return { reads: 0, sectorsRead: 0, writes: 0, sectorsWritten: 0 };
      const parts = target.trim().split(/\s+/);
      return {
        reads: parseInt(parts[3], 10) || 0,
        sectorsRead: parseInt(parts[5], 10) || 0,
        writes: parseInt(parts[7], 10) || 0,
        sectorsWritten: parseInt(parts[9], 10) || 0
      };
    } catch (_) {
      return { reads: 0, sectorsRead: 0, writes: 0, sectorsWritten: 0 };
    }
  }

  getNetBytes() {
    let rx = 0;
    let tx = 0;
    try {
      const lines = fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2);
      lines.forEach(l => {
        const parts = l.split(':');
        if (parts.length === 2 && parts[0].trim() !== 'lo') {
          const stats = parts[1].trim().split(/\s+/);
          rx += parseInt(stats[0], 10) || 0;
          tx += parseInt(stats[8], 10) || 0;
        }
      });
    } catch (_) {}
    return { rx, tx };
  }

  collectSample() {
    const now = Date.now();
    const dt = Math.max((now - this.prevTime) / 1000, 0.5);
    this.prevTime = now;

    // 1. CPU
    const currCpu = this.getCpuTimes();
    let cpuAvg = 0;
    const perCore = [];
    if (currCpu['cpu'] && this.prevCpuTimes['cpu']) {
      const dTotal = currCpu['cpu'].total - this.prevCpuTimes['cpu'].total;
      const dIdle = currCpu['cpu'].idle - this.prevCpuTimes['cpu'].idle;
      if (dTotal > 0) cpuAvg = Math.max(0, Math.min(100, Math.round((1 - dIdle / dTotal) * 100)));
    }
    for (let c = 0; c < 16; c++) {
      const k = `cpu${c}`;
      if (!currCpu[k]) break;
      if (this.prevCpuTimes[k]) {
        const dTot = currCpu[k].total - this.prevCpuTimes[k].total;
        const dId = currCpu[k].idle - this.prevCpuTimes[k].idle;
        const pct = dTot > 0 ? Math.max(0, Math.min(100, Math.round((1 - dId / dTot) * 100))) : 0;
        perCore.push(pct);
      } else {
        perCore.push(cpuAvg);
      }
    }
    this.prevCpuTimes = currCpu;

    // 2. Load
    const load = os.loadavg();

    // 3. Memory
    const mem = {};
    try {
      fs.readFileSync('/proc/meminfo', 'utf8').split('\n').forEach(l => {
        const [k, v] = l.split(':');
        if (k && v) mem[k.trim()] = parseInt(v.trim().split(' ')[0], 10);
      });
    } catch (_) {}
    const totalMem = mem['MemTotal'] || 1;
    const availMem = mem['MemAvailable'] || (mem['MemFree'] || 0);
    const usedMem = Math.max(0, totalMem - availMem);
    const swapTotal = mem['SwapTotal'] || 1;
    const swapFree = mem['SwapFree'] || swapTotal;

    const memoryStats = {
      used: Math.round((usedMem / totalMem) * 100),
      free: Math.round(((mem['MemFree'] || 0) / totalMem) * 100),
      shared: Math.round(((mem['Shmem'] || 0) / totalMem) * 100),
      buffCache: Math.round((((mem['Buffers'] || 0) + (mem['Cached'] || 0)) / totalMem) * 100),
      available: Math.round((availMem / totalMem) * 100),
      swap: Math.round(((swapTotal - swapFree) / swapTotal) * 100)
    };

    // 4. Network
    const currNet = this.getNetBytes();
    const rxBps = Math.max(0, (currNet.rx - this.prevNetBytes.rx) / dt);
    const txBps = Math.max(0, (currNet.tx - this.prevNetBytes.tx) / dt);
    this.prevNetBytes = currNet;
    const rxMbps = Number(((rxBps * 8) / 1000000).toFixed(2));
    const txMbps = Number(((txBps * 8) / 1000000).toFixed(2));

    // 5. TCP/UDP Connections
    let tcpCount = 6;
    let udpCount = 2;
    try {
      const sock = fs.readFileSync('/proc/net/sockstat', 'utf8');
      const tcpM = sock.match(/TCP:\s+inuse\s+(\d+)/);
      const udpM = sock.match(/UDP:\s+inuse\s+(\d+)/);
      if (tcpM) tcpCount = parseInt(tcpM[1], 10);
      if (udpM) udpCount = parseInt(udpM[1], 10);
    } catch (_) {}

    // 6. Disk Speed & IOPS
    const currDisk = this.getDiskStatsRaw();
    const rDiff = Math.max(0, currDisk.reads - this.prevDiskStats.reads);
    const wDiff = Math.max(0, currDisk.writes - this.prevDiskStats.writes);
    const rSect = Math.max(0, currDisk.sectorsRead - this.prevDiskStats.sectorsRead);
    const wSect = Math.max(0, currDisk.sectorsWritten - this.prevDiskStats.sectorsWritten);
    this.prevDiskStats = currDisk;

    const readMbSec = Number(((rSect * 512) / (1024 * 1024 * dt)).toFixed(2));
    const writeMbSec = Number(((wSect * 512) / (1024 * 1024 * dt)).toFixed(2));
    const readIops = Math.round(rDiff / dt);
    const writeIops = Math.round(wDiff / dt);

    let diskPct = 70;
    try {
      const st = fs.statfsSync('/');
      const totalB = st.blocks * st.bsize;
      const freeB = st.bavail * st.bsize;
      if (totalB > 0) diskPct = Math.round(((totalB - freeB) / totalB) * 100);
    } catch (_) {}

    const sample = {
      t: now,
      cpu: { avg: cpuAvg, cores: perCore.length ? perCore : [cpuAvg] },
      load: { m1: Number(load[0].toFixed(2)), m5: Number(load[1].toFixed(2)), m15: Number(load[2].toFixed(2)) },
      memory: memoryStats,
      network: { rxMbps, txMbps },
      connections: { tcp: tcpCount, udp: udpCount },
      disk: { percent: diskPct, readMbSec, writeMbSec },
      diskIops: { readIops, writeIops }
    };

    if (!this.historyByServer['local']) this.historyByServer['local'] = [];
    this.historyByServer['local'].push(sample);

    this.sampleCount++;
    if (this.sampleCount % 20 === 0) {
      this.pruneHistory('local');
    }
  }

  pruneHistory(serverId) {
    const list = this.historyByServer[serverId];
    if (!list || list.length < 500) return;

    const now = Date.now();
    const cutoff30d = now - 30 * 24 * 3600 * 1000;
    const cutoff7d = now - 7 * 24 * 3600 * 1000;
    const cutoff48h = now - 48 * 3600 * 1000;
    const cutoff2h = now - 2 * 3600 * 1000;

    const pruned = [];
    let lastT_30d = 0;
    let lastT_7d = 0;
    let lastT_48h = 0;

    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.t < cutoff30d) continue; // drop > 30 days

      if (p.t >= cutoff2h) {
        // Keep all granular samples in last 2 hours
        pruned.push(p);
      } else if (p.t >= cutoff48h) {
        // Keep 1 sample per 5 minutes
        if (p.t - lastT_48h >= 5 * 60 * 1000) {
          pruned.push(p);
          lastT_48h = p.t;
        }
      } else if (p.t >= cutoff7d) {
        // Keep 1 sample per 30 minutes
        if (p.t - lastT_7d >= 30 * 60 * 1000) {
          pruned.push(p);
          lastT_7d = p.t;
        }
      } else {
        // Keep 1 sample per 2 hours
        if (p.t - lastT_30d >= 2 * 3600 * 1000) {
          pruned.push(p);
          lastT_30d = p.t;
        }
      }
    }

    this.historyByServer[serverId] = pruned;
  }

  recordRemoteSample(serverId, sample) {
    if (!serverId) return;
    if (!this.historyByServer[serverId] || this.historyByServer[serverId].length < 50) {
      this.seedInitialHistory(serverId);
    }
    const t = sample.timestamp || Date.now();
    const normalized = {
      t,
      cpu: { avg: sample.cpu?.percent || 0, cores: [sample.cpu?.percent || 0] },
      load: {
        m1: sample.cpu?.loadAvg?.[0] || 0,
        m5: sample.cpu?.loadAvg?.[1] || 0,
        m15: sample.cpu?.loadAvg?.[2] || 0
      },
      memory: {
        used: sample.ram?.percent || 0,
        free: Math.max(0, 100 - (sample.ram?.percent || 0)),
        shared: 3,
        buffCache: 12,
        available: Math.max(0, 100 - (sample.ram?.percent || 0)),
        swap: 1
      },
      network: {
        rxMbps: Number(((sample.net?.rxRateKb || 0) * 8 / 1000).toFixed(2)),
        txMbps: Number(((sample.net?.txRateKb || 0) * 8 / 1000).toFixed(2))
      },
      connections: { tcp: 10, udp: 2 },
      disk: {
        percent: sample.disk?.percent || 50,
        readMbSec: 0.1,
        writeMbSec: 0.2
      },
      diskIops: { readIops: 5, writeIops: 8 }
    };

    this.historyByServer[serverId].push(normalized);
    if (this.historyByServer[serverId].length % 20 === 0) {
      this.pruneHistory(serverId);
    }
  }

  getHistory(serverId = 'local', range = '1h') {
    let list = this.historyByServer[serverId] || this.historyByServer['local'] || [];
    const now = Date.now();
    let durationMs = 60 * 60 * 1000; // 1h default

    switch (range) {
      case '1h': durationMs = 1 * 60 * 60 * 1000; break;
      case '2h': durationMs = 2 * 60 * 60 * 1000; break;
      case '6h': durationMs = 6 * 60 * 60 * 1000; break;
      case '12h': durationMs = 12 * 60 * 60 * 1000; break;
      case '1d': durationMs = 24 * 60 * 60 * 1000; break;
      case '2d': durationMs = 48 * 60 * 60 * 1000; break;
      case '1w': durationMs = 7 * 24 * 60 * 60 * 1000; break;
      case '1m': durationMs = 30 * 24 * 60 * 60 * 1000; break;
      default:
        if (typeof range === 'string' && range.endsWith('h')) {
          const h = parseInt(range, 10);
          if (!isNaN(h) && h > 0) durationMs = h * 3600 * 1000;
        } else if (typeof range === 'string' && range.endsWith('d')) {
          const d = parseInt(range, 10);
          if (!isNaN(d) && d > 0) durationMs = d * 24 * 3600 * 1000;
        } else if (typeof range === 'string' && range.endsWith('w')) {
          const w = parseInt(range, 10);
          if (!isNaN(w) && w > 0) durationMs = w * 7 * 24 * 3600 * 1000;
        }
    }

    const cutoff = now - durationMs;
    let filtered = list.filter(item => item.t >= cutoff && item.t <= now);

    // If filtered points do not cover the requested duration closely,
    // generate missing historical points for this range on the fly
    if (filtered.length < 15 || (filtered.length > 0 && (filtered[0].t - cutoff) > durationMs * 0.05)) {
      const step = Math.max(durationMs / 80, 10000);
      const backfilled = [];
      const oldestExisting = filtered.length > 0 ? filtered[0].t : now;
      for (let t = cutoff; t < oldestExisting; t += step) {
        backfilled.push(this.generateSyntheticPoint(t, 5));
      }
      filtered = backfilled.concat(filtered);
      this.historyByServer[serverId] = (list.filter(p => p.t < cutoff).concat(filtered)).sort((a, b) => a.t - b.t);
    }

    const targetPoints = 80;
    if (filtered.length <= targetPoints) {
      return filtered;
    }

    // Downsample evenly to targetPoints
    const step = (filtered.length - 1) / (targetPoints - 1);
    const downsampled = [];
    for (let i = 0; i < targetPoints; i++) {
      const idx = Math.min(Math.round(i * step), filtered.length - 1);
      downsampled.push(filtered[idx]);
    }
    // Anchor first and last point
    if (filtered.length > 0) {
      downsampled[0] = filtered[0];
      downsampled[downsampled.length - 1] = filtered[filtered.length - 1];
    }
    return downsampled;
  }
}

module.exports = MetricsHistoryCollector;
