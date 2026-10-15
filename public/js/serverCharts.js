/**
 * DimDash Server-Monitor Charts Engine
 * Inspired by morezaGeek/Server-Monitor
 * Zero External Dependencies — Pure HTML5 Canvas 2D, Retina Ready, High FPS
 */

const ServerMonitorState = {
  activeServer: 'local',
  activeRange: '1h',
  smoothing: 'light', // 'none', 'light', 'medium'
  autoRefreshInterval: 10, // seconds
  autoRefreshTimer: null,
  historyData: [],
  charts: {},
  initialized: false
};

class MicroCanvasChart {
  constructor(canvasId, config) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.config = config || {};
    this.series = config.series || [];
    this.title = config.title || '';
    this.yUnit = config.yUnit || '';
    this.yMin = config.yMin !== undefined ? config.yMin : 0;
    this.yMax = config.yMax !== undefined ? config.yMax : null;
    this.hoverIndex = -1;
    this.cursorX = -1;
    this.cursorY = -1;

    this.setupRetina();
    this.setupEvents();
  }

  setupRetina() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width || this.canvas.parentElement?.clientWidth || 500;
    this.height = 200; // standard chart height
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
  }

  setupEvents() {
    if (!this.canvas) return;
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.cursorX = e.clientX - rect.left;
      this.cursorY = e.clientY - rect.top;
      this.updateHoverIndex();
      this.draw();
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverIndex = -1;
      this.cursorX = -1;
      this.cursorY = -1;
      this.draw();
      this.hideTooltip();
    });

    window.addEventListener('resize', () => {
      this.setupRetina();
      this.draw();
    });
  }

  updateHoverIndex() {
    const data = ServerMonitorState.historyData;
    if (!data || !data.length || this.cursorX < 0) {
      this.hoverIndex = -1;
      return;
    }

    const padding = { top: 20, right: 25, bottom: 30, left: 45 };
    const chartW = this.width - padding.left - padding.right;

    if (this.cursorX < padding.left || this.cursorX > this.width - padding.right) {
      this.hoverIndex = -1;
      return;
    }

    const ratio = (this.cursorX - padding.left) / chartW;
    const idx = Math.round(ratio * (data.length - 1));
    this.hoverIndex = Math.max(0, Math.min(data.length - 1, idx));
  }

  draw() {
    if (!this.ctx || !this.canvas) return;
    const data = ServerMonitorState.historyData;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    const padding = { top: 20, right: 25, bottom: 30, left: 45 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    if (!data || data.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Loading telemetry data...', w / 2, h / 2);
      return;
    }

    // Determine Y range
    let minVal = this.yMin;
    let maxVal = this.yMax;

    if (maxVal === null) {
      maxVal = 0;
      this.series.forEach(s => {
        data.forEach(d => {
          const v = s.getValue(d);
          if (v > maxVal) maxVal = v;
        });
      });
      maxVal = maxVal === 0 ? 10 : Math.ceil(maxVal * 1.25);
    }

    if (minVal === maxVal) maxVal = minVal + 1;

    // Draw Grid Lines & Y labels
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter, Vazirmatn, sans-serif';
    ctx.textAlign = 'right';

    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const yVal = minVal + (maxVal - minVal) * (i / yTicks);
      const yPos = padding.top + chartH - (i / yTicks) * chartH;

      ctx.beginPath();
      ctx.moveTo(padding.left, yPos);
      ctx.lineTo(w - padding.right, yPos);
      ctx.stroke();

      const label = (yVal >= 10 || Number.isInteger(yVal)) ? Math.round(yVal) : yVal.toFixed(1);
      ctx.fillText(`${label}${this.yUnit}`, padding.left - 6, yPos + 3);
    }

    // Draw X Grid & Time labels
    ctx.textAlign = 'center';
    const xTicks = Math.min(6, data.length);
    const range = ServerMonitorState.activeRange || '1h';
    for (let i = 0; i < xTicks; i++) {
      const dataIdx = Math.round((i / (xTicks - 1)) * (data.length - 1));
      const pt = data[dataIdx];
      if (!pt) continue;

      const xPos = padding.left + (dataIdx / (data.length - 1)) * chartW;

      ctx.beginPath();
      ctx.moveTo(xPos, padding.top);
      ctx.lineTo(xPos, padding.top + chartH);
      ctx.stroke();

      const dateObj = new Date(pt.t);
      let timeStr = '';
      if (range === '1w' || range === '1m' || (typeof range === 'string' && range.endsWith('d') && parseInt(range, 10) >= 7)) {
        timeStr = dateObj.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
      } else if (range === '1d' || range === '2d' || (typeof range === 'string' && range.endsWith('d'))) {
        const timePart = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dayPart = dateObj.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
        timeStr = `${dayPart} ${timePart}`;
      } else {
        timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      ctx.fillText(timeStr, xPos, h - 8);
    }

    // Helper: calculate point coordinates
    const getPoint = (dataIndex, s) => {
      const x = padding.left + (dataIndex / (data.length - 1)) * chartW;
      const val = Math.max(minVal, Math.min(maxVal, s.getValue(data[dataIndex])));
      const y = padding.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;
      return { x, y, val };
    };

    // Draw Series Lines and Gradient Fills
    this.series.forEach(s => {
      const color = s.color || '#6366f1';
      const pts = [];
      for (let i = 0; i < data.length; i++) {
        pts.push(getPoint(i, s));
      }

      // Draw Gradient Area below curve
      const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
      grad.addColorStop(0, this.hexToRgba(color, 0.22));
      grad.addColorStop(1, this.hexToRgba(color, 0.0));

      ctx.beginPath();
      ctx.moveTo(pts[0].x, padding.top + chartH);
      ctx.lineTo(pts[0].x, pts[0].y);

      if (ServerMonitorState.smoothing === 'none') {
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
      } else {
        this.drawBezierCurve(ctx, pts);
      }

      ctx.lineTo(pts[pts.length - 1].x, padding.top + chartH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Draw Curve Stroke
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      if (ServerMonitorState.smoothing === 'none') {
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
      } else {
        this.drawBezierCurve(ctx, pts);
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0; // reset
    });

    // Draw Crosshair and Hover Dots
    if (this.hoverIndex >= 0 && this.hoverIndex < data.length) {
      const hoverX = padding.left + (this.hoverIndex / (data.length - 1)) * chartW;

      // Vertical guideline
      ctx.beginPath();
      ctx.moveTo(hoverX, padding.top);
      ctx.lineTo(hoverX, padding.top + chartH);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Highlight dots on each curve
      this.series.forEach(s => {
        const pt = getPoint(this.hoverIndex, s);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = s.color || '#6366f1';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#0f172a';
        ctx.stroke();
      });

      this.renderTooltip(data[this.hoverIndex], hoverX);
    }
  }

  drawBezierCurve(ctx, pts) {
    const tension = ServerMonitorState.smoothing === 'medium' ? 0.32 : 0.18;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? i : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;

      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;

      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }

  renderTooltip(item, hoverX) {
    let tooltip = document.getElementById('chartGlobalTooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'chartGlobalTooltip';
      tooltip.className = 'chart-hover-tooltip';
      document.body.appendChild(tooltip);
    }

    const rect = this.canvas.getBoundingClientRect();
    const dateObj = new Date(item.t);
    const dateFormatted = dateObj.toLocaleDateString([], { month: '2-digit', day: '2-digit', year: 'numeric' });
    const timeFormatted = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let rowsHtml = '';
    this.series.forEach(s => {
      const val = s.getValue(item);
      const valFormatted = s.format ? s.format(val) : `${val}${this.yUnit}`;
      rowsHtml += `
        <div class="tooltip-series-row">
          <span class="tooltip-color-box" style="background: ${s.color};"></span>
          <span class="tooltip-series-name">${s.name}:</span>
          <span class="tooltip-series-val">${valFormatted}</span>
        </div>
      `;
    });

    tooltip.innerHTML = `
      <div class="tooltip-header">${dateFormatted}, ${timeFormatted}</div>
      <div class="tooltip-body">${rowsHtml}</div>
    `;

    tooltip.style.display = 'block';

    const ttWidth = 180;
    let pageX = rect.left + hoverX + 15;
    if (pageX + ttWidth > window.innerWidth - 20) {
      pageX = rect.left + hoverX - ttWidth - 15;
    }
    const pageY = rect.top + window.scrollY + 30;

    tooltip.style.left = `${pageX}px`;
    tooltip.style.top = `${pageY}px`;
  }

  hideTooltip() {
    const tooltip = document.getElementById('chartGlobalTooltip');
    if (tooltip) tooltip.style.display = 'none';
  }

  hexToRgba(hex, alpha) {
    let c;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
      c = hex.substring(1).split('');
      if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
      c = '0x' + c.join('');
      return `rgba(${[(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',')}, ${alpha})`;
    }
    return `rgba(99, 102, 241, ${alpha})`;
  }
}

// --------------------------------------------------------------------------
// Chart Definitions (The 7 Graphs Matching Server-Monitor)
// --------------------------------------------------------------------------

function initServerCharts() {
  if (ServerMonitorState.initialized) {
    applyChartsOrderAndVisibility();
    fetchServerMonitorMetrics();
    return;
  }
  ServerMonitorState.initialized = true;

  // 1. CPU Usage Chart
  ServerMonitorState.charts.cpu = new MicroCanvasChart('canvasCpuChart', {
    title: 'CPU Usage',
    yUnit: '%',
    yMin: 0,
    yMax: 100,
    series: [
      { name: 'CPU Avg', color: '#818cf8', getValue: d => d.cpu?.avg || 0 },
      { name: 'Core 0', color: '#f97316', getValue: d => d.cpu?.cores?.[0] !== undefined ? d.cpu.cores[0] : d.cpu?.avg || 0 },
      { name: 'Core 1', color: '#06b6d4', getValue: d => d.cpu?.cores?.[1] !== undefined ? d.cpu.cores[1] : d.cpu?.avg || 0 },
      { name: 'Core 2', color: '#ec4899', getValue: d => d.cpu?.cores?.[2] !== undefined ? d.cpu.cores[2] : d.cpu?.avg || 0 },
      { name: 'Core 3', color: '#10b981', getValue: d => d.cpu?.cores?.[3] !== undefined ? d.cpu.cores[3] : d.cpu?.avg || 0 }
    ]
  });

  // 2. Load Average Chart
  ServerMonitorState.charts.load = new MicroCanvasChart('canvasLoadChart', {
    title: 'Load Average',
    yUnit: '',
    yMin: 0,
    yMax: null,
    series: [
      { name: '1 Min', color: '#ef4444', getValue: d => d.load?.m1 || 0 },
      { name: '5 Min', color: '#38bdf8', getValue: d => d.load?.m5 || 0 },
      { name: '15 Min', color: '#10b981', getValue: d => d.load?.m15 || 0 }
    ]
  });

  // 3. Memory Usage Chart
  ServerMonitorState.charts.memory = new MicroCanvasChart('canvasMemoryChart', {
    title: 'Memory Usage',
    yUnit: '%',
    yMin: 0,
    yMax: 100,
    series: [
      { name: 'Used %', color: '#a855f7', getValue: d => d.memory?.used || 0 },
      { name: 'Free %', color: '#10b981', getValue: d => d.memory?.free || 0 },
      { name: 'Shared %', color: '#eab308', getValue: d => d.memory?.shared || 0 },
      { name: 'Buff/Cache %', color: '#06b6d4', getValue: d => d.memory?.buffCache || 0 },
      { name: 'Available %', color: '#14b8a6', getValue: d => d.memory?.available || 0 },
      { name: 'Swap %', color: '#ec4899', getValue: d => d.memory?.swap || 0 }
    ]
  });

  // 4. Network I/O Chart
  ServerMonitorState.charts.network = new MicroCanvasChart('canvasNetChart', {
    title: 'Network I/O',
    yUnit: 'M',
    yMin: 0,
    yMax: null,
    series: [
      { name: 'Download (RX)', color: '#10b981', getValue: d => d.network?.rxMbps || 0, format: v => `${v} Mbps` },
      { name: 'Upload (TX)', color: '#06b6d4', getValue: d => d.network?.txMbps || 0, format: v => `${v} Mbps` }
    ]
  });

  // 5. TCP / UDP Connections Chart
  ServerMonitorState.charts.connections = new MicroCanvasChart('canvasConnChart', {
    title: 'TCP / UDP Connections',
    yUnit: '',
    yMin: 0,
    yMax: null,
    series: [
      { name: 'TCP', color: '#f59e0b', getValue: d => d.connections?.tcp || 0 },
      { name: 'UDP', color: '#ef4444', getValue: d => d.connections?.udp || 0 }
    ]
  });

  // 6. Disk Usage & Speed Chart
  ServerMonitorState.charts.disk = new MicroCanvasChart('canvasDiskChart', {
    title: 'Disk Usage & Speed',
    yUnit: '',
    yMin: 0,
    yMax: null,
    series: [
      { name: 'Usage %', color: '#f97316', getValue: d => d.disk?.percent || 0, format: v => `${v}%` },
      { name: 'Read MB/s', color: '#06b6d4', getValue: d => d.disk?.readMbSec || 0, format: v => `${v} MB/s` },
      { name: 'Write MB/s', color: '#ef4444', getValue: d => d.disk?.writeMbSec || 0, format: v => `${v} MB/s` }
    ]
  });

  // 7. Disk IOPS Chart
  ServerMonitorState.charts.diskIops = new MicroCanvasChart('canvasIopsChart', {
    title: 'Disk IOPS',
    yUnit: '',
    yMin: 0,
    yMax: null,
    series: [
      { name: 'Read IOPS', color: '#8b5cf6', getValue: d => d.diskIops?.readIops || 0, format: v => `${v} IOPS` },
      { name: 'Write IOPS', color: '#f59e0b', getValue: d => d.diskIops?.writeIops || 0, format: v => `${v} IOPS` }
    ]
  });

  setupServerMonitorControls();
  fetchServerMonitorMetrics();

  // Setup periodic refresh
  if (ServerMonitorState.autoRefreshTimer) clearInterval(ServerMonitorState.autoRefreshTimer);
  ServerMonitorState.autoRefreshTimer = setInterval(() => {
    fetchServerMonitorMetrics(true);
  }, ServerMonitorState.autoRefreshInterval * 1000);
}

async function fetchServerMonitorMetrics(silent = false) {
  try {
    const srv = ServerMonitorState.activeServer || 'local';
    const range = ServerMonitorState.activeRange || '1h';
    const res = await fetch(`/api/metrics/history?server=${srv}&range=${range}`);
    if (!res.ok) return;

    const data = await res.json();
    ServerMonitorState.historyData = data;

    updateChartBadges(data);

    // Redraw all 7 charts
    Object.values(ServerMonitorState.charts).forEach(c => {
      c.setupRetina();
      c.draw();
    });
  } catch (_) {}
}

function updateChartBadges(data) {
  if (!data || !data.length) return;
  const latest = data[data.length - 1];

  // Avg CPU
  const avgCpu = Math.round(data.reduce((acc, d) => acc + (d.cpu?.avg || 0), 0) / data.length);
  const badgeCpu = document.getElementById('badgeCpuAvg');
  if (badgeCpu) badgeCpu.textContent = `Avg: ${avgCpu}%`;

  // Avg Load
  const badgeLoad = document.getElementById('badgeLoadAvg');
  if (badgeLoad && latest.load) {
    badgeLoad.textContent = `Avg: ${latest.load.m1} / ${latest.load.m5} / ${latest.load.m15}`;
  }

  // Avg Memory
  const avgMem = Math.round(data.reduce((acc, d) => acc + (d.memory?.used || 0), 0) / data.length);
  const badgeMem = document.getElementById('badgeMemAvg');
  if (badgeMem) badgeMem.textContent = `Avg: ${avgMem}%`;

  // Net Speed
  const badgeNet = document.getElementById('badgeNetSpeed');
  if (badgeNet && latest.network) {
    badgeNet.textContent = `⬇️ ${latest.network.rxMbps} Mbps | ⬆️ ${latest.network.txMbps} Mbps`;
  }

  // TCP / UDP
  const badgeConn = document.getElementById('badgeConnCount');
  if (badgeConn && latest.connections) {
    badgeConn.textContent = `TCP: ${latest.connections.tcp} | UDP: ${latest.connections.udp}`;
  }

  // Disk Avg
  const badgeDisk = document.getElementById('badgeDiskAvg');
  if (badgeDisk && latest.disk) {
    badgeDisk.textContent = `Avg: ${latest.disk.percent}%`;
  }
}

function setupServerMonitorControls() {
  // Time range selector buttons
  const timeBtns = document.querySelectorAll('.sm-time-btn');
  timeBtns.forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const range = btn.dataset.range;
      if (range === 'custom') {
        openCustomRangeModal();
        return;
      }
      timeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const customBtn = document.querySelector('[data-range="custom"]');
      if (customBtn) {
        const span = customBtn.querySelector('span');
        if (span) span.textContent = 'Custom';
      }
      ServerMonitorState.activeRange = range;
      fetchServerMonitorMetrics();
    };
  });

  // Smoothing select
  const smoothSelect = document.getElementById('smSmoothingSelect');
  if (smoothSelect) {
    smoothSelect.onchange = (e) => {
      ServerMonitorState.smoothing = e.target.value;
      Object.values(ServerMonitorState.charts).forEach(c => c.draw());
    };
  }

  // Cluster/Server select
  const clusterSelect = document.getElementById('smClusterSelect');
  if (clusterSelect) {
    if (window.AppState?.config?.servers && Array.isArray(window.AppState.config.servers)) {
      const currentVal = clusterSelect.value || ServerMonitorState.activeServer;
      clusterSelect.innerHTML = window.AppState.config.servers.map(s => 
        `<option value="${s.id}">${s.name || s.id} (${s.type === 'local' ? 'Master' : s.type})</option>`
      ).join('');
      if (currentVal && window.AppState.config.servers.some(s => s.id === currentVal)) {
        clusterSelect.value = currentVal;
      }
    }
    clusterSelect.onchange = (e) => {
      ServerMonitorState.activeServer = e.target.value;
      fetchServerMonitorMetrics();
    };
  }

  const btnRefreshNow = document.getElementById('smBtnRefreshNow');
  if (btnRefreshNow) {
    btnRefreshNow.onclick = () => fetchServerMonitorMetrics();
  }

  const btnOpenAdd = document.getElementById('btnOpenAddChartModal');
  if (btnOpenAdd) {
    btnOpenAdd.onclick = () => openChartManageModal();
  }

  const btnAddMenu = document.getElementById('btnAddChartFromMenu');
  if (btnAddMenu) {
    btnAddMenu.onclick = () => openChartManageModal();
  }

  applyChartsOrderAndVisibility();
  setupChartDragAndDrop();
}

const CHART_DEFINITIONS = {
  cpu: { id: 'smCardCpu', title: 'CPU Usage', icon: '⚡', key: 'cpu', color: '#818cf8' },
  load: { id: 'smCardLoad', title: 'Load Average', icon: '⚖️', key: 'load', color: '#ef4444' },
  memory: { id: 'smCardMem', title: 'Memory Usage', icon: '🧠', key: 'memory', color: '#a855f7' },
  network: { id: 'smCardNet', title: 'Network I/O', icon: '🌐', key: 'network', color: '#10b981' },
  connections: { id: 'smCardConn', title: 'TCP / UDP Connections', icon: '🔗', key: 'connections', color: '#f59e0b' },
  disk: { id: 'smCardDisk', title: 'Disk Usage & Speed', icon: '💾', key: 'disk', color: '#f97316' },
  diskIops: { id: 'smCardIops', title: 'Disk IOPS', icon: '⚙️', key: 'diskIops', color: '#8b5cf6' }
};

function applyChartsOrderAndVisibility() {
  const grid = document.getElementById('smChartsGrid');
  if (!grid) return;

  const cfg = window.AppState?.config?.settings || {};
  const hidden = new Set(cfg.hidden_charts || []);
  const order = cfg.charts_order || ['cpu', 'load', 'memory', 'network', 'connections', 'disk', 'diskIops'];

  // 1. Re-order DOM elements
  order.forEach(k => {
    const def = CHART_DEFINITIONS[k];
    if (def) {
      const card = document.getElementById(def.id);
      if (card) grid.appendChild(card);
    }
  });

  // 2. Toggle visibility
  Object.keys(CHART_DEFINITIONS).forEach(k => {
    const def = CHART_DEFINITIONS[k];
    const card = document.getElementById(def.id);
    if (card) {
      card.style.display = hidden.has(k) ? 'none' : '';
    }
  });
}

function setupChartDragAndDrop() {
  const grid = document.getElementById('smChartsGrid');
  if (!grid) return;

  let draggedKey = null;

  grid.querySelectorAll('.sm-chart-card').forEach(card => {
    card.setAttribute('draggable', 'true');

    card.ondragstart = (e) => {
      draggedKey = card.dataset.chartKey;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedKey);
    };

    card.ondragover = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (card.dataset.chartKey !== draggedKey) {
        card.classList.add('drag-over');
      }
    };

    card.ondragleave = () => {
      card.classList.remove('drag-over');
    };

    card.ondrop = (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const targetKey = card.dataset.chartKey;
      if (!draggedKey || draggedKey === targetKey) return;

      const sourceCard = grid.querySelector(`.sm-chart-card[data-chart-key="${draggedKey}"]`);
      if (!sourceCard) return;

      const cards = Array.from(grid.querySelectorAll('.sm-chart-card'));
      const srcIdx = cards.indexOf(sourceCard);
      const tgtIdx = cards.indexOf(card);

      if (srcIdx < tgtIdx) {
        card.after(sourceCard);
      } else {
        card.before(sourceCard);
      }

      // Save new order to config
      const newOrder = Array.from(grid.querySelectorAll('.sm-chart-card')).map(c => c.dataset.chartKey);
      if (window.AppState?.config) {
        window.AppState.config.settings = window.AppState.config.settings || {};
        window.AppState.config.settings.charts_order = newOrder;
        if (window.saveConfigToServer) {
          window.saveConfigToServer('Chart layout saved successfully');
        }
      }

      // Re-align and redraw canvas sizes
      setTimeout(() => {
        Object.values(ServerMonitorState.charts).forEach(c => {
          c.setupRetina();
          c.draw();
        });
      }, 60);
    };

    card.ondragend = () => {
      grid.querySelectorAll('.sm-chart-card').forEach(c => {
        c.classList.remove('dragging', 'drag-over');
      });
      draggedKey = null;
    };

    // Delete button
    const delBtn = card.querySelector('.sm-card-btn-delete');
    if (delBtn) {
      delBtn.onclick = (e) => {
        e.stopPropagation();
        deleteChart(card.dataset.chartKey);
      };
    }
  });
}

function deleteChart(chartKey) {
  if (!chartKey) return;
  const def = CHART_DEFINITIONS[chartKey];
  const card = document.getElementById(def?.id);
  if (card) {
    card.style.display = 'none';
  }

  if (window.AppState?.config) {
    window.AppState.config.settings = window.AppState.config.settings || {};
    const hidden = new Set(window.AppState.config.settings.hidden_charts || []);
    hidden.add(chartKey);
    window.AppState.config.settings.hidden_charts = Array.from(hidden);
    if (window.saveConfigToServer) {
      window.saveConfigToServer(`Chart "${def?.title || chartKey}" removed`);
    }
  }
}

function openChartManageModal() {
  const modal = document.getElementById('chartManageModal');
  const container = document.getElementById('chartTogglesList');
  if (!modal || !container) return;

  const cfg = window.AppState?.config?.settings || {};
  const hidden = new Set(cfg.hidden_charts || []);

  container.innerHTML = Object.keys(CHART_DEFINITIONS).map(k => {
    const def = CHART_DEFINITIONS[k];
    const isHidden = hidden.has(k);
    return `
      <div class="chart-toggle-row">
        <div class="chart-toggle-info">
          <span class="chart-toggle-icon">${def.icon}</span>
          <div>
            <div class="chart-toggle-title">${def.title}</div>
            <span class="chart-toggle-status ${isHidden ? 'hidden' : 'active'}">${isHidden ? 'Hidden / Removed' : 'Active on Dashboard'}</span>
          </div>
        </div>
        <div>
          ${isHidden 
            ? `<button class="btn btn-sm btn-primary" onclick="window.restoreChart('${k}')">+ Add to Dashboard</button>`
            : `<button class="btn btn-sm btn-secondary" onclick="window.deleteChart('${k}')">Remove</button>`
          }
        </div>
      </div>
    `;
  }).join('');

  modal.classList.add('open');
}

function restoreChart(chartKey) {
  if (!chartKey) return;
  const def = CHART_DEFINITIONS[chartKey];
  const card = document.getElementById(def?.id);
  if (card) {
    card.style.display = '';
  }

  if (window.AppState?.config) {
    window.AppState.config.settings = window.AppState.config.settings || {};
    const hidden = new Set(window.AppState.config.settings.hidden_charts || []);
    hidden.delete(chartKey);
    window.AppState.config.settings.hidden_charts = Array.from(hidden);
    if (window.saveConfigToServer) {
      window.saveConfigToServer(`Chart "${def?.title || chartKey}" added to dashboard`);
    }
  }

  setTimeout(() => {
    if (ServerMonitorState.charts[chartKey]) {
      ServerMonitorState.charts[chartKey].setupRetina();
      ServerMonitorState.charts[chartKey].draw();
    }
  }, 80);

  openChartManageModal();
}

// Fullscreen toggle for charts
window.toggleChartFullscreen = function(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  card.classList.toggle('chart-fullscreen');
  const canvas = card.querySelector('canvas');
  if (canvas) {
    const chartKey = canvas.dataset.chartKey;
    if (ServerMonitorState.charts[chartKey]) {
      setTimeout(() => {
        ServerMonitorState.charts[chartKey].setupRetina();
        ServerMonitorState.charts[chartKey].draw();
      }, 100);
    }
  }
};

// Custom Range Picker Modal
function openCustomRangeModal() {
  let modal = document.getElementById('customRangeModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'customRangeModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card" style="max-width: 440px;">
        <div class="modal-header">
          <h3>Custom Timeframe</h3>
          <button class="modal-close-btn" onclick="document.getElementById('customRangeModal').classList.remove('open')">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
            Select a quick preset or define a custom time range:
          </p>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; margin-bottom: 1.25rem;">
            <button class="btn btn-secondary" onclick="applyCustomRange('3h', '3h')">3 Hours (3h)</button>
            <button class="btn btn-secondary" onclick="applyCustomRange('8h', '8h')">8 Hours (8h)</button>
            <button class="btn btn-secondary" onclick="applyCustomRange('3d', '3d')">3 Days (3d)</button>
            <button class="btn btn-secondary" onclick="applyCustomRange('14d', '14d')">14 Days (14d)</button>
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: center; border-top: 1px solid var(--border-glass); padding-top: 1rem;">
            <input type="number" id="customRangeNum" min="1" max="90" value="4" class="form-input" style="width: 80px; text-align: center;">
            <select id="customRangeUnit" class="form-select" style="flex: 1;">
              <option value="h">Hours</option>
              <option value="d">Days</option>
            </select>
            <button class="btn btn-primary" onclick="applyCustomRangeManual()">Apply Timeframe</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  modal.classList.add('open');
}

window.applyCustomRange = function(rangeKey, label) {
  const modal = document.getElementById('customRangeModal');
  if (modal) modal.classList.remove('open');
  ServerMonitorState.activeRange = rangeKey;

  const timeBtns = document.querySelectorAll('.sm-time-btn');
  timeBtns.forEach(b => b.classList.remove('active'));
  const customBtn = document.querySelector('[data-range="custom"]');
  if (customBtn) {
    customBtn.classList.add('active');
    const span = customBtn.querySelector('span');
    if (span) span.textContent = `Custom (${label || rangeKey})`;
  }
  fetchServerMonitorMetrics();
};

window.applyCustomRangeManual = function() {
  const num = parseInt(document.getElementById('customRangeNum')?.value, 10) || 1;
  const unit = document.getElementById('customRangeUnit')?.value || 'h';
  const rangeKey = `${num}${unit}`;
  const label = `${num}${unit}`;
  window.applyCustomRange(rangeKey, label);
};

window.ServerMonitorState = ServerMonitorState;
window.initServerCharts = initServerCharts;
window.fetchServerMonitorMetrics = fetchServerMonitorMetrics;
window.deleteChart = deleteChart;
window.restoreChart = restoreChart;
window.openChartManageModal = openChartManageModal;
window.openCustomRangeModal = openCustomRangeModal;


