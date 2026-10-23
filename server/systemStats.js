const os = require('os');
const fs = require('fs');
const http = require('http');
const { exec } = require('child_process');

class SystemStatsCollector {
  constructor() {
    this.prevCpuTimes = this.getCpuTimes();
    this.prevNetBytes = this.getNetBytes();
    this.prevNetTime = Date.now();
    this.lastDiskCheck = 0;
    this.dockerCliCooldown = 0;

    this.currentStats = {
      timestamp: Date.now(),
      cpu: {
        percent: 5,
        cores: os.cpus().length,
        model: (os.cpus()[0]?.model || 'Standard CPU').trim(),
        loadAvg: os.loadavg().map(v => Number(v.toFixed(2)))
      },
      ram: {
        totalGb: 0,
        usedGb: 0,
        freeGb: 0,
        percent: 0
      },
      disk: {
        totalGb: 0,
        usedGb: 0,
        freeGb: 0,
        percent: 0,
        mount: '/'
      },
      net: {
        rxRateKb: 0,
        txRateKb: 0,
        rxTotalMb: 0,
        txTotalMb: 0
      },
      docker: {
        available: false,
        total: 0,
        running: 0,
        stopped: 0
      },
      host: {
        hostname: os.hostname(),
        platform: os.platform() === 'linux' ? 'Linux Homelab' : os.platform(),
        release: os.release(),
        uptimeStr: this.formatUptime(os.uptime()),
        uptimeSec: Math.floor(os.uptime())
      }
    };

    this.update();
    setInterval(() => this.update(), 2000).unref();
  }

  getCpuTimes() {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        total += cpu.times[type];
      }
      idle += cpu.times.idle;
    }
    return { idle, total };
  }

  getNetBytes() {
    let rx = 0;
    let tx = 0;
    try {
      if (fs.existsSync('/proc/net/dev')) {
        const lines = fs.readFileSync('/proc/net/dev', 'utf8').split('\n');
        for (const line of lines) {
          const match = line.trim().match(/^([a-zA-Z0-9_\-]+):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
          if (match && match[1] !== 'lo') {
            rx += parseInt(match[2], 10);
            tx += parseInt(match[3], 10);
          }
        }
      }
    } catch (_) {}
    return { rx, tx };
  }

  formatUptime(sec) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  update() {
    const now = Date.now();

    // 1. CPU Usage
    const currentCpu = this.getCpuTimes();
    const idleDelta = currentCpu.idle - this.prevCpuTimes.idle;
    const totalDelta = currentCpu.total - this.prevCpuTimes.total;
    let cpuPercent = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0;
    if (cpuPercent < 0) cpuPercent = 0;
    if (cpuPercent > 100) cpuPercent = 100;
    this.prevCpuTimes = currentCpu;

    this.currentStats.cpu = {
      percent: cpuPercent,
      cores: os.cpus().length,
      model: (os.cpus()[0]?.model || 'CPU').trim(),
      loadAvg: os.loadavg().map(v => Number(v.toFixed(2)))
    };

    // 2. RAM Usage
    let totalMem = os.totalmem();
    let freeMem = os.freemem();
    try {
      if (fs.existsSync('/proc/meminfo')) {
        const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
        const matchTotal = meminfo.match(/MemTotal:\s+(\d+)\s+kB/);
        const matchAvail = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
        if (matchTotal && matchAvail) {
          totalMem = parseInt(matchTotal[1], 10) * 1024;
          freeMem = parseInt(matchAvail[1], 10) * 1024;
        }
      }
    } catch (_) {}

    const usedMem = totalMem - freeMem;
    const ramPercent = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;
    this.currentStats.ram = {
      totalGb: Number((totalMem / (1024 * 1024 * 1024)).toFixed(1)),
      usedGb: Number((usedMem / (1024 * 1024 * 1024)).toFixed(1)),
      freeGb: Number((freeMem / (1024 * 1024 * 1024)).toFixed(1)),
      percent: ramPercent
    };

    // 3. Network I/O Rate
    const currentNet = this.getNetBytes();
    const timeDeltaSec = (now - this.prevNetTime) / 1000 || 2;
    const rxDiff = Math.max(0, currentNet.rx - this.prevNetBytes.rx);
    const txDiff = Math.max(0, currentNet.tx - this.prevNetBytes.tx);

    const rxRateKb = Math.round((rxDiff / 1024) / timeDeltaSec);
    const txRateKb = Math.round((txDiff / 1024) / timeDeltaSec);

    this.prevNetBytes = currentNet;
    this.prevNetTime = now;

    this.currentStats.net = {
      rxRateKb,
      txRateKb,
      rxTotalMb: Number((currentNet.rx / (1024 * 1024)).toFixed(1)),
      txTotalMb: Number((currentNet.tx / (1024 * 1024)).toFixed(1))
    };

    // 4. Host Info
    this.currentStats.host = {
      hostname: os.hostname(),
      platform: os.platform() === 'linux' ? 'Linux' : os.platform(),
      release: os.release(),
      uptimeStr: this.formatUptime(os.uptime()),
      uptimeSec: Math.floor(os.uptime())
    };

    this.currentStats.timestamp = now;

    // 5. Disk Usage (Throttled async execution of df -k every 30s)
    if (now - this.lastDiskCheck > 30000 || !this.lastDiskCheck) {
      this.lastDiskCheck = now;
      exec('df -k / | tail -1', { timeout: 1500 }, (err, stdout) => {
        if (!err && stdout) {
          const parts = stdout.trim().split(/\s+/);
          if (parts.length >= 5) {
            const totalKb = parseInt(parts[1], 10) || 0;
            const usedKb = parseInt(parts[2], 10) || 0;
            const availKb = parseInt(parts[3], 10) || 0;
            const percent = totalKb > 0 ? Math.round((usedKb / totalKb) * 100) : 0;
            this.currentStats.disk = {
              totalGb: Number((totalKb / (1024 * 1024)).toFixed(1)),
              usedGb: Number((usedKb / (1024 * 1024)).toFixed(1)),
              freeGb: Number((availKb / (1024 * 1024)).toFixed(1)),
              percent,
              mount: parts[5] || '/'
            };
          }
        }
      });
    }

    // 6. Docker Containers (Native Socket REST API first, fallback to CLI)
    this.collectDockerStats();
  }

  collectDockerStats() {
    const socketPath = '/var/run/docker.sock';
    if (fs.existsSync(socketPath)) {
      const req = http.request({
        socketPath,
        path: '/containers/json?all=1',
        method: 'GET',
        timeout: 2500
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              const containers = list.map(c => {
                const name = (Array.isArray(c.Names) && c.Names[0])
                  ? c.Names[0].replace(/^\//, '')
                  : (c.Id || '').slice(0, 12);
                const isRunning = c.State === 'running' || (c.Status && c.Status.toLowerCase().startsWith('up'));
                return {
                  id: (c.Id || '').slice(0, 12),
                  name,
                  image: c.Image || '',
                  state: isRunning ? 'running' : (c.State || 'stopped'),
                  status: c.Status || '',
                  created: c.Created || 0,
                  ports: Array.isArray(c.Ports)
                    ? c.Ports.map(p => `${p.PublicPort ? p.PublicPort + '->' : ''}${p.PrivatePort}/${p.Type || 'tcp'}`).filter(Boolean).join(', ')
                    : ''
                };
              });

              const total = containers.length;
              const running = containers.filter(c => c.state === 'running').length;
              this.currentStats.docker = {
                available: true,
                total,
                running,
                stopped: total - running,
                containers
              };
              return;
            }
          } catch (_) {}
          this.fallbackDockerCli();
        });
      });

      req.on('error', () => this.fallbackDockerCli());
      req.on('timeout', () => {
        req.destroy();
        this.fallbackDockerCli();
      });
      req.end();
    } else {
      this.fallbackDockerCli();
    }
  }

  fallbackDockerCli() {
    const now = Date.now();
    if (now < this.dockerCliCooldown) return;

    exec('docker ps -a --format "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.State}}\t{{.Status}}"', { timeout: 3000 }, (err, stdout) => {
      if (!err && stdout !== undefined) {
        const lines = stdout.trim().split('\n').filter(Boolean);
        const containers = lines.map(line => {
          const parts = line.split('\t');
          const isRunning = (parts[3] && parts[3].toLowerCase() === 'running') || (parts[4] && parts[4].toLowerCase().startsWith('up'));
          return {
            id: parts[0] || '',
            name: parts[1] || parts[0] || 'container',
            image: parts[2] || '',
            state: isRunning ? 'running' : (parts[3] || 'stopped'),
            status: parts[4] || ''
          };
        });

        const total = containers.length;
        const running = containers.filter(c => c.state === 'running').length;
        this.currentStats.docker = {
          available: true,
          total,
          running,
          stopped: total - running,
          containers
        };
      } else {
        this.currentStats.docker = {
          available: false,
          total: 0,
          running: 0,
          stopped: 0,
          containers: [],
          error: err ? err.message : 'Docker daemon not reachable'
        };
        // Cooldown for 15 seconds on failure before retrying
        this.dockerCliCooldown = now + 15000;
      }
    });
  }

  getStats() {
    return this.currentStats;
  }
}

module.exports = new SystemStatsCollector();
