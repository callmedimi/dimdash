/**
 * DimDash — Main Client Controller
 * Pure Vanilla JS, Zero External Libraries, Air-Gapped Ready
 */

const AppState = {
  config: null,
  probes: {},
  systemTelemetry: null,
  selectedWidgetType: 'clock_widget',
  widgetsCollapsed: false,
  activeCluster: 'all',
  currentView: 'apps', // 'apps' (tiles) or 'server-monitor' (gauges & charts)
  authRole: 'guest', // 'guest', 'user', or 'admin'
  isAdmin: false,
  isArrangeMode: false,
  adminPin: '',
  activeCategory: 'all',
  searchQuery: '',
  draggedTileId: null,
  draggedSourceCatId: null,
  draggedCatId: null,
  draggedWidgetId: null
};

// DOM References
const elements = {
  dashTitle: document.getElementById('dashTitle'),
  searchBar: document.getElementById('searchBar'),
  spotlightSearchOverlay: document.getElementById('spotlightSearchOverlay'),
  spotlightCloseBtn: document.getElementById('spotlightCloseBtn'),
  sideNavSearch: document.getElementById('sideNavSearch'),
  categoryTabs: document.getElementById('categoryTabs'),
  contentArea: document.getElementById('contentArea'),
  widgetsSection: document.getElementById('widgetsSection'),
  widgetsContainer: document.getElementById('widgetsContainer'),
  widgetsCount: document.getElementById('widgetsCount'),
  clusterSelectorBar: document.getElementById('clusterSelectorBar'),
  btnManageClustersBtn: document.getElementById('btnManageClustersBtn'),
  serverManagerModal: document.getElementById('serverManagerModal'),
  clusterListContainer: document.getElementById('clusterListContainer'),
  widgetServerSelect: document.getElementById('widgetServerSelect'),
  newServerNameInput: document.getElementById('newServerNameInput'),
  newServerIdInput: document.getElementById('newServerIdInput'),
  newServerTypeSelect: document.getElementById('newServerTypeSelect'),
  newServerColorInput: document.getElementById('newServerColorInput'),
  newServerTokenInput: document.getElementById('newServerTokenInput'),
  newServerUrlInput: document.getElementById('newServerUrlInput'),
  newServerIntervalInput: document.getElementById('newServerIntervalInput'),
  btnSaveNewServer: document.getElementById('btnSaveNewServer'),
  agentPushFields: document.getElementById('agentPushFields'),
  httpPullFields: document.getElementById('httpPullFields'),
  agentSnippetBash: document.getElementById('agentSnippetBash'),
  btnAddWidgetBtn: document.getElementById('btnAddWidgetBtn'),
  addHeaderWidgetBtn: document.getElementById('addHeaderWidgetBtn'),
  btnAddChartFromMenu: document.getElementById('btnAddChartFromMenu'),
  btnToggleWidgetsCollapse: document.getElementById('btnToggleWidgetsCollapse'),
  widgetModal: document.getElementById('widgetModal'),
  btnSaveWidget: document.getElementById('btnSaveWidget'),
  widgetTitleInput: document.getElementById('widgetTitleInput'),
  widgetSizeSelect: document.getElementById('widgetSizeSelect'),
  widgetColorInput: document.getElementById('widgetColorInput'),
  authToggleBtn: document.getElementById('authToggleBtn'),
  authModal: document.getElementById('authModal'),
  authPinInput: document.getElementById('authPinInput'),
  authSubmitBtn: document.getElementById('authSubmitBtn'),
  authLogoutBtn: document.getElementById('authLogoutBtn'),
  currentAuthRolePill: document.getElementById('currentAuthRolePill'),
  authLoginForm: document.getElementById('authLoginForm'),
  authActiveSessionView: document.getElementById('authActiveSessionView'),
  authActiveDesc: document.getElementById('authActiveDesc'),
  authErrorMsg: document.getElementById('authErrorMsg'),
  tileVisibilitySelect: document.getElementById('tileVisibilitySelect'),
  clockCalendarModeSelect: document.getElementById('clockCalendarModeSelect'),
  clockTimeFormatSelect: document.getElementById('clockTimeFormatSelect'),
  chartMetricSelect: document.getElementById('chartMetricSelect'),
  chartRangeSelect: document.getElementById('chartRangeSelect'),
  clockConfigRow: document.getElementById('clockConfigRow'),
  chartConfigRow: document.getElementById('chartConfigRow'),
  btnHeaderArrange: document.getElementById('btnHeaderArrange'),
  arrangeFloatingBar: document.getElementById('arrangeFloatingBar'),
  btnFinishArrange: document.getElementById('btnFinishArrange'),
  addTileBtn: document.getElementById('addTileBtn'),
  addCategoryBtn: document.getElementById('addCategoryBtn'),
  themeBtn: document.getElementById('themeBtn'),
  yamlBtn: document.getElementById('yamlBtn'),
  toastContainer: document.getElementById('toastContainer'),
  statTotalVal: document.getElementById('statTotalVal'),
  statOnlineVal: document.getElementById('statOnlineVal'),
  statWarningVal: document.getElementById('statWarningVal'),
  statOfflineVal: document.getElementById('statOfflineVal'),
  btnTestAllProbes: document.getElementById('btnTestAllProbes'),
  sideNavArrange: document.getElementById('sideNavArrange'),
  sideNavAll: document.getElementById('sideNavAll'),
  sideNavCharts: document.getElementById('sideNavCharts'),
  sideNavRefresh: document.getElementById('sideNavRefresh'),
  sideNavTheme: document.getElementById('sideNavTheme'),
  sideNavLock: document.getElementById('sideNavLock'),
  sideNavClustersBtn: document.getElementById('sideNavClustersBtn'),
  btnViewApps: document.getElementById('btnViewApps'),
  btnViewServerMonitor: document.getElementById('btnViewServerMonitor'),
  serverMonitorView: document.getElementById('serverMonitorView')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  await IconCatalog.init();
  setupClock();
  setupKeyboardShortcuts();
  setupEventListeners();
  await loadConfig();
  fetchSystemTelemetry();
  setupSSE();
});

// Clock & Calendar Update Loop
function setupClock() {
  const update = () => {
    updateClockWidgets();
  };
  update();
  setInterval(update, 1000);
}

function updateClockWidgets() {
  const clockCards = document.querySelectorAll('.clock-widget-card');
  if (clockCards.length === 0) return;

  const nowInfo = window.DimDashCalendar ? window.DimDashCalendar.getNowInfo() : null;
  if (!nowInfo) return;

  clockCards.forEach(card => {
    const wId = card.dataset.widgetId;
    const displayEl = document.getElementById(`clock-display-${wId}`);
    const datesEl = document.getElementById(`clock-dates-${wId}`);
    if (!displayEl || !datesEl) return;

    const timeFmt = displayEl.dataset.timeFormat || '24h';
    const mode = datesEl.dataset.calendarMode || 'both';

    let timeStr = '';
    let ampmHtml = '';
    if (timeFmt === '12h') {
      timeStr = `${nowInfo.time.hours12}<span class="clock-colon">:</span>${nowInfo.time.minutes}<span class="clock-colon">:</span>${nowInfo.time.seconds}`;
      ampmHtml = `<span class="clock-ampm">${nowInfo.time.ampmFa || nowInfo.time.ampmEn}</span>`;
    } else {
      timeStr = `${nowInfo.time.hours24}<span class="clock-colon">:</span>${nowInfo.time.minutes}<span class="clock-colon">:</span>${nowInfo.time.seconds}`;
    }
    displayEl.innerHTML = `${timeStr} ${ampmHtml}`;

    const shamsiHtml = `<span class="clock-date-chip chip-shamsi" title="تقویم خورشیدی / شمسی">☀️ ${nowInfo.shamsi.fullFa}</span>`;
    const gregorianHtml = `<span class="clock-date-chip chip-gregorian" title="Gregorian Calendar">📅 ${nowInfo.gregorian.full}</span>`;

    if (mode === 'shamsi') {
      datesEl.innerHTML = shamsiHtml;
    } else if (mode === 'gregorian') {
      datesEl.innerHTML = gregorianHtml;
    } else {
      datesEl.innerHTML = `${shamsiHtml} ${gregorianHtml}`;
    }
  });
}

function openSpotlightSearch() {
  if (elements.spotlightSearchOverlay) {
    elements.spotlightSearchOverlay.classList.add('open');
  }
  if (elements.searchBar) {
    elements.searchBar.focus();
    elements.searchBar.select();
  }
}

function closeSpotlightSearch() {
  if (elements.spotlightSearchOverlay) {
    elements.spotlightSearchOverlay.classList.remove('open');
  }
  if (elements.searchBar) {
    elements.searchBar.blur();
  }
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if ((e.key === '/' || (e.ctrlKey && e.key === 'k')) && document.activeElement !== elements.searchBar) {
      e.preventDefault();
      openSpotlightSearch();
    }
    if (e.key === 'Escape') {
      closeAllModals();
      closeSpotlightSearch();
    }
  });
}

// Toast Notifications
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
window.showToast = showToast;

// Config & Theme Management
async function loadConfig() {
  try {
    // Attempt v2 board load first
    let board = null;
    try {
      const boardRes = await fetch('/api/board');
      if (boardRes.ok) {
        board = await boardRes.json();
        AppState.board = board;
      }
    } catch (e) {}

    if (board && window.DimDashCompat) {
      AppState.config = window.DimDashCompat.deriveV1FromV2(board);
    } else {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error('Failed to fetch config');
      AppState.config = await res.json();
    }

    // Check saved session
    const savedRole = sessionStorage.getItem('dimdash_role');
    const savedPin = sessionStorage.getItem('dimdash_pin');
    if (savedRole === 'admin' || savedRole === 'user') {
      AppState.authRole = savedRole;
      AppState.isAdmin = (savedRole === 'admin');
      AppState.adminPin = (savedRole === 'admin' ? (savedPin || '') : '');
    } else {
      AppState.authRole = 'guest';
      AppState.isAdmin = false;
      AppState.adminPin = '';
    }
    updateAuthUI();

    applyTheme(AppState.config.settings?.theme);
    renderDashboard();
    fetchProbes();
  } catch (err) {
    showToast('Error loading configuration: ' + err.message, 'error');
  }
}

function applyTheme(theme) {
  if (!theme) return;
  const root = document.documentElement;
  if (theme.accent_color) {
    root.style.setProperty('--accent-color', theme.accent_color);
    root.style.setProperty('--accent-glow', `${theme.accent_color}40`);
  }
  if (theme.glass_opacity) {
    root.style.setProperty('--glass-opacity', theme.glass_opacity);
  }
  if (theme.glass_blur) {
    root.style.setProperty('--glass-blur', `${theme.glass_blur}px`);
  }
  if (theme.card_radius) {
    root.style.setProperty('--card-radius', `${theme.card_radius}px`);
  }
  if (theme.wallpaper_dim !== undefined) {
    root.style.setProperty('--wallpaper-dim', `${theme.wallpaper_dim / 100}`);
  }
  if (theme.tile_density) {
    document.body.classList.remove('density-compact', 'density-normal', 'density-expanded');
    document.body.classList.add(`density-${theme.tile_density}`);
  }

  // Card Layout Style: 'pill' vs 'boards' vs 'card'
  document.body.classList.remove('card-style-pill', 'layout-boards');
  if (theme.card_style === 'boards') {
    document.body.classList.add('card-style-pill', 'layout-boards');
  } else if (theme.card_style === 'card') {
    // standard card grid
  } else {
    document.body.classList.add('card-style-pill');
  }

  // Background Image or Gradient / Unset
  if (theme.background_type === 'image' && theme.background_value) {
    document.body.style.backgroundImage = `url("${theme.background_value}")`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
    document.body.style.backgroundColor = '#020617';
    document.body.classList.add('has-wallpaper');
  } else {
    document.body.style.backgroundImage = '';
    document.body.style.background = theme.background_value || 'var(--bg-primary)';
    document.body.classList.remove('has-wallpaper');
  }

  // Transparent Background Logo / Watermark
  const bgLogoLayer = document.getElementById('bgLogoOverlay');
  if (bgLogoLayer) {
    if (theme.bg_logo_url) {
      bgLogoLayer.style.display = 'block';
      bgLogoLayer.style.backgroundImage = `url("${theme.bg_logo_url}")`;
      const opVal = theme.bg_logo_opacity !== undefined ? Number(theme.bg_logo_opacity) : 18;
      bgLogoLayer.style.opacity = String(opVal / 100);
      
      const pos = theme.bg_logo_position || 'center';
      bgLogoLayer.className = `bg-logo-overlay pos-${pos}`;
      bgLogoLayer.style.backgroundSize = theme.bg_logo_size || '550px';
      bgLogoLayer.style.backgroundRepeat = theme.bg_logo_repeat || 'no-repeat';
      bgLogoLayer.style.mixBlendMode = theme.bg_logo_blend || 'normal';
    } else {
      bgLogoLayer.style.display = 'none';
      bgLogoLayer.style.backgroundImage = 'none';
    }
  }

  if (AppState.config.settings?.dashboard_title) {
    if (elements.dashTitle) elements.dashTitle.textContent = AppState.config.settings.dashboard_title;
    document.title = AppState.config.settings.dashboard_title;
  }
}

// Server-Sent Events (SSE)
function setupSSE() {
  const evtSource = new EventSource('/api/events');
  evtSource.addEventListener('config', (e) => {
    try {
      AppState.config = JSON.parse(e.data);
      applyTheme(AppState.config.settings?.theme);
      renderDashboard();
    } catch (_) {}
  });

  evtSource.addEventListener('probes', (e) => {
    try {
      AppState.probes = JSON.parse(e.data);
      updateProbeBadges();
    } catch (_) {}
  });

  evtSource.addEventListener('system_telemetry', (e) => {
    try {
      AppState.systemTelemetry = JSON.parse(e.data);
      updateWidgetValues();
    } catch (_) {}
  });

  evtSource.onerror = () => {
    // SSE will automatically retry connecting
  };
}

async function fetchProbes() {
  try {
    const res = await fetch('/api/probes');
    if (res.ok) {
      AppState.probes = await res.json();
      updateProbeBadges();
    }
  } catch (_) {}
}

async function fetchSystemTelemetry() {
  try {
    const res = await fetch('/api/system-telemetry');
    if (res.ok) {
      AppState.systemTelemetry = await res.json();
      updateWidgetValues();
    }
  } catch (_) {}
}

// Stats Overview Bar Visibility (Total / Online / Warning / Offline Capsule)
function renderStatsBarVisibility() {
  const showStats = AppState.config?.settings?.show_stats_bar !== false;
  const isMonitoring = AppState.currentView === 'server-monitor';
  const statsBar = document.getElementById('statsOverviewBar');
  const restoreBtn = document.getElementById('btnRestoreStatsBar');
  const hideBtn = document.getElementById('btnHideStatsBar');

  if (statsBar) {
    if (!showStats || isMonitoring) {
      statsBar.style.setProperty('display', 'none', 'important');
    } else {
      statsBar.style.removeProperty('display');
    }
  }

  if (hideBtn) {
    hideBtn.style.display = (AppState.authRole === 'admin' && showStats && !isMonitoring) ? 'inline-flex' : 'none';
  }

  if (restoreBtn) {
    restoreBtn.style.display = (!showStats && AppState.authRole === 'admin' && !isMonitoring) ? 'inline-flex' : 'none';
  }
}

// Render Dashboard
function renderDashboard() {
  const isStageEnabled = AppState.config?.settings?.experimental?.stage !== false && window.DimDashStage;
  const stageMount = document.getElementById('stageMount');
  const contentArea = document.getElementById('contentArea');

  if (isStageEnabled && stageMount) {
    stageMount.style.display = 'block';
    if (contentArea) contentArea.style.display = 'none';

    if (!AppState.stageRenderer) {
      AppState.stageRenderer = new window.DimDashStage.StageRenderer(stageMount);
    }
    if (AppState.board) {
      AppState.stageRenderer.setBoard(AppState.board);
    }
  } else {
    if (stageMount) stageMount.style.display = 'none';
    if (contentArea) contentArea.style.display = '';
    if (AppState.stageRenderer) {
      AppState.stageRenderer.destroy();
      AppState.stageRenderer = null;
    }
    renderGrid();
  }

  renderCategoryTabs();
  renderWidgets();
  renderStatsBarVisibility();
  switchDashboardView(AppState.currentView || 'apps');
}

function isTileAccessible(tile) {
  const vis = tile.visibility || 'public';
  if (AppState.authRole === 'guest') return vis === 'public';
  if (AppState.authRole === 'user') return vis !== 'admin';
  return true; // admin sees everything
}

// Render Category Tabs
function renderCategoryTabs() {
  if (!elements.categoryTabs) return;
  const categories = AppState.config?.categories || [];
  
  let totalTiles = 0;
  categories.forEach(c => {
    (c.tiles || []).forEach(t => {
      if (isTileAccessible(t)) totalTiles++;
    });
  });

  let html = `
    <button class="tab-btn ${AppState.activeCategory === 'all' ? 'active' : ''}" data-cat="all">
      All Services <span class="tab-count">${totalTiles}</span>
    </button>
  `;

  categories.forEach(cat => {
    const accessibleTiles = (cat.tiles || []).filter(t => isTileAccessible(t));
    const count = accessibleTiles.length;
    if (count === 0 && AppState.authRole !== 'admin') return;

    const isActive = AppState.activeCategory === cat.id ? 'active' : '';
    html += `
      <button class="tab-btn ${isActive}" data-cat="${cat.id}">
        ${cat.name} <span class="tab-count">${count}</span>
      </button>
    `;
  });

  elements.categoryTabs.innerHTML = html;

  elements.categoryTabs.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      AppState.activeCategory = btn.dataset.cat;
      renderCategoryTabs();
      renderGrid();
    });
  });
}

// --------------------------------------------------------------------------
// Multi-Cluster & Modular Live Monitoring & Gauges Engine
// --------------------------------------------------------------------------

function renderClusterBar() {
  if (!elements.clusterSelectorBar) return;
  const servers = AppState.config?.servers || [];
  const telemetryMap = AppState.systemTelemetry?.servers || {};

  let html = `
    <div class="cluster-pill ${AppState.activeCluster === 'all' ? 'active' : ''}" data-cluster-id="all">
      <span>🌐 All Clusters</span>
      <span style="opacity:0.65; font-size:0.7rem;">(${servers.length})</span>
    </div>
  `;

  servers.forEach(srv => {
    const t = telemetryMap[srv.id];
    const isOnline = t ? t.status === 'online' : (srv.type === 'local');
    const statusClass = isOnline ? 'online' : (t ? 'offline' : 'pending');
    const isActive = AppState.activeCluster === srv.id;

    html += `
      <div class="cluster-pill ${isActive ? 'active' : ''}" data-cluster-id="${srv.id}">
        <span class="cluster-status-dot ${statusClass}"></span>
        <span>${srv.name || srv.id}</span>
      </div>
    `;
  });

  elements.clusterSelectorBar.innerHTML = html;

  elements.clusterSelectorBar.querySelectorAll('.cluster-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      AppState.activeCluster = pill.dataset.clusterId;
      renderClusterBar();
      renderWidgets();
    });
  });
}

function getWidgetCardHeader(w, icon) {
  const isClock = w.type === 'clock_widget';
  const isChart = w.type === 'chart_widget';
  const srvId = w.server_id || 'local';
  const srv = (AppState.config?.servers || []).find(s => s.id === srvId) || { id: srvId, name: 'Master Node', color: '#6366f1' };
  const srvTelemetry = AppState.systemTelemetry?.servers?.[srvId];
  const isOnline = srvTelemetry ? srvTelemetry.status === 'online' : true;
  const srvColor = srv.color || '#6366f1';
  const isAdmin = AppState.authRole === 'admin';

  let rightActionHtml = '';
  if (isClock) {
    const mode = w.calendar_mode || 'both';
    const modeLabel = mode === 'shamsi' ? '☀️ فقط شمسی' : (mode === 'gregorian' ? '📅 Gregorian' : '⚡ شمسی + میلادی');
    const isTrans = w.bg_style === 'transparent';
    const align = w.align || 'center';
    const alignLabels = {
      center: '📍 وسط',
      start: '⮜ چپ',
      end: '⮞ راست',
      full: '↔ عریض'
    };

    rightActionHtml = `
      <button type="button" class="clock-widget-mode-pill" data-widget-id="${w.id}" title="تغییر نمایش تقویم (شمسی / میلادی / هر دو)">
        ${modeLabel}
      </button>
      ${isAdmin ? `
        <button type="button" class="btn-clock-trans ${isTrans ? 'active' : ''}" data-widget-id="${w.id}" title="شفاف‌سازی ساعت (Transparent / Glass)">
          ${isTrans ? '🫥 شفاف' : '🫧 مات'}
        </button>
        <button type="button" class="btn-clock-align" data-widget-id="${w.id}" title="تراز و موقعیت ساعت (وسط، چپ، راست، تمام‌عرض)">
          ${alignLabels[align] || '📍 وسط'}
        </button>
      ` : ''}
    `;
  } else if (!isChart) {
    rightActionHtml = `
      <span class="widget-server-badge" style="background: ${srvColor}22; color: ${srvColor}; border: 1px solid ${srvColor}44;" title="Node: ${srv.name} (${srv.type || 'local'})">
        <span class="cluster-status-dot ${isOnline ? 'online' : 'offline'}"></span>
        <span>${srv.name}</span>
      </span>
    `;
  }

  return `
    <div class="widget-card-header">
      <div class="widget-card-title-group">
        ${isAdmin ? `<span class="widget-drag-handle" title="Drag to reorder gauge">⠿</span>` : ''}
        <span class="widget-icon">${icon}</span>
        <span class="widget-title">${w.title || (isClock ? 'ساعت و تقویم' : 'Gauge')}</span>
      </div>
      <div style="display:flex; align-items:center; gap:0.4rem;">
        ${rightActionHtml}
        ${isAdmin ? `
          <div class="widget-actions">
            <button class="btn-widget-action btn-del-widget" data-id="${w.id}" title="Remove Gauge">🗑</button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderWidgets() {
  if (!elements.widgetsContainer) return;

  const isMonitoring = AppState.currentView === 'server-monitor';
  const allWidgets = AppState.config?.widgets || [];

  // Filter widgets by active view mode:
  // - On apps view: only show widgets targeted for 'apps' or 'both' (default for clock_widget is 'both', hardware gauges default to 'monitoring')
  // - On monitoring view: show monitoring gauges, charts, and widgets targeted for 'monitoring' or 'both'
  const viewFilteredWidgets = allWidgets.filter(w => {
    if (w.type === 'clock_widget' && AppState.config?.settings?.show_clock === false && !isMonitoring) {
      return false;
    }
    const target = w.target_view || (w.type === 'clock_widget' ? 'both' : 'monitoring');
    if (target === 'both') return true;
    return isMonitoring ? target === 'monitoring' : target === 'apps';
  });

  const sec = document.getElementById('widgetsSection');
  if (sec) {
    if (!isMonitoring && viewFilteredWidgets.length === 0) {
      sec.style.setProperty('display', 'none', 'important');
    } else {
      sec.style.removeProperty('display');
    }
  }

  if (isMonitoring) {
    renderClusterBar();
  }

  const widgets = (AppState.activeCluster === 'all' || !isMonitoring)
    ? viewFilteredWidgets
    : viewFilteredWidgets.filter(w => (w.server_id || 'local') === AppState.activeCluster || w.type === 'clock_widget');

  if (elements.widgetsCount) {
    elements.widgetsCount.textContent = `${widgets.length} Active Gauges` + (AppState.activeCluster !== 'all' ? ` (Filtered: ${AppState.activeCluster})` : '');
  }

  if (widgets.length === 0) {
    if (isMonitoring) {
      elements.widgetsContainer.innerHTML = `
        <div class="empty-dropzone" style="grid-column: 1 / -1; padding: 1.25rem;">
          No gauges configured for this cluster. Click "+ Add Gauge" to add one.
        </div>
      `;
    } else {
      elements.widgetsContainer.innerHTML = '';
    }
    return;
  }

  const C = 213.6;
  let html = '';
  const isDraggable = AppState.authRole === 'admin' ? 'draggable="true"' : 'draggable="false"';

  widgets.forEach(w => {
    const accent = w.color || 'var(--accent-color, #6366f1)';
    const sizeClass = w.size === 'wide' ? 'widget-size-wide' : (w.size === 'full' ? 'widget-size-full' : '');

    if (w.type === 'clock_widget') {
      const mode = w.calendar_mode || 'both';
      const timeFmt = w.time_format || '24h';
      const nowInfo = (window.DimDashCalendar ? window.DimDashCalendar.getNowInfo() : null);

      let shamsiHtml = '';
      let gregorianHtml = '';
      let timeStr = '--:--:--';
      let ampmHtml = '';

      if (nowInfo) {
        if (timeFmt === '12h') {
          timeStr = `${nowInfo.time.hours12}<span class="clock-colon">:</span>${nowInfo.time.minutes}<span class="clock-colon">:</span>${nowInfo.time.seconds}`;
          ampmHtml = `<span class="clock-ampm">${nowInfo.time.ampmFa || nowInfo.time.ampmEn}</span>`;
        } else {
          timeStr = `${nowInfo.time.hours24}<span class="clock-colon">:</span>${nowInfo.time.minutes}<span class="clock-colon">:</span>${nowInfo.time.seconds}`;
        }
        shamsiHtml = `<span class="clock-date-chip chip-shamsi" title="تقویم خورشیدی / شمسی">☀️ ${nowInfo.shamsi.fullFa}</span>`;
        gregorianHtml = `<span class="clock-date-chip chip-gregorian" title="Gregorian Calendar">📅 ${nowInfo.gregorian.full}</span>`;
      }

      let datesHtml = '';
      if (mode === 'shamsi') {
        datesHtml = shamsiHtml;
      } else if (mode === 'gregorian') {
        datesHtml = gregorianHtml;
      } else {
        datesHtml = `${shamsiHtml} ${gregorianHtml}`;
      }

      const clockBgClass = w.bg_style ? `clock-${w.bg_style}` : '';
      const clockAlignClass = w.align ? `clock-align-${w.align}` : 'clock-align-center';

      html += `
        <div class="widget-card clock-widget-card ${sizeClass} ${clockBgClass} ${clockAlignClass}" id="widget-card-${w.id}" data-widget-id="${w.id}" ${isDraggable} style="--widget-accent: ${accent};">
          ${getWidgetCardHeader(w, '⏰')}
          <div class="clock-widget-body">
            <div class="clock-time-display" id="clock-display-${w.id}" data-time-format="${timeFmt}">
              ${timeStr} ${ampmHtml}
            </div>
            <div class="clock-dates-container" id="clock-dates-${w.id}" data-calendar-mode="${mode}">
              ${datesHtml}
            </div>
          </div>
        </div>
      `;
    } else if (w.type === 'chart_widget') {
      const metric = w.metric_type || 'cpu';
      const range = w.time_range || '1h';
      html += `
        <div class="widget-card chart-widget-card ${sizeClass}" id="widget-card-${w.id}" data-widget-id="${w.id}" ${isDraggable} style="--widget-accent: ${accent};">
          ${getWidgetCardHeader(w, '📈')}
          <div class="widget-card-body" style="flex-direction:column; align-items:stretch; padding-top:0.4rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem; font-size:0.75rem; color:var(--text-muted);">
              <span>${metric.toUpperCase()} Utilization (${range})</span>
              <span id="chart-val-${w.id}" style="color:${accent}; font-weight:700;">Live</span>
            </div>
            <canvas class="chart-widget-canvas" id="canvas-widget-${w.id}" width="340" height="85"></canvas>
          </div>
        </div>
      `;
    } else if (w.type === 'cpu_gauge') {
      html += `
        <div class="widget-card ${sizeClass}" id="widget-card-${w.id}" data-widget-id="${w.id}" ${isDraggable} style="--widget-accent: ${accent};">
          ${getWidgetCardHeader(w, '⚡')}
          <div class="widget-card-body">
            <div class="radial-gauge-box">
              <svg class="radial-gauge-svg" viewBox="0 0 80 80">
                <circle class="radial-gauge-bg" cx="40" cy="40" r="34" />
                <circle class="radial-gauge-progress" id="gauge-arc-${w.id}" cx="40" cy="40" r="34"
                  stroke-dasharray="${C}" stroke-dashoffset="${C}" />
              </svg>
              <div class="radial-gauge-val" id="gauge-val-${w.id}">0<span class="radial-gauge-unit">%</span></div>
            </div>
            <div class="widget-metrics-list">
              <div class="widget-metric-row">
                <span>CPU Cores:</span>
                <span class="widget-metric-val" id="metric-cores-${w.id}">-</span>
              </div>
              <div class="widget-metric-row">
                <span>Load Average:</span>
                <span class="widget-metric-val" id="metric-load-${w.id}">-</span>
              </div>
              <div class="widget-metric-row">
                <span>Model:</span>
                <span class="widget-metric-val" id="metric-model-${w.id}" style="font-size:0.68rem; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">-</span>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (w.type === 'ram_gauge') {
      html += `
        <div class="widget-card ${sizeClass}" id="widget-card-${w.id}" data-widget-id="${w.id}" ${isDraggable} style="--widget-accent: ${accent};">
          ${getWidgetCardHeader(w, '🧠')}
          <div class="widget-card-body">
            <div class="radial-gauge-box">
              <svg class="radial-gauge-svg" viewBox="0 0 80 80">
                <circle class="radial-gauge-bg" cx="40" cy="40" r="34" />
                <circle class="radial-gauge-progress" id="gauge-arc-${w.id}" cx="40" cy="40" r="34"
                  stroke-dasharray="${C}" stroke-dashoffset="${C}" />
              </svg>
              <div class="radial-gauge-val" id="gauge-val-${w.id}">0<span class="radial-gauge-unit">%</span></div>
            </div>
            <div class="widget-metrics-list">
              <div class="widget-metric-row">
                <span>Used Memory:</span>
                <span class="widget-metric-val" id="metric-ram-used-${w.id}">0 GB</span>
              </div>
              <div class="widget-metric-row">
                <span>Total Memory:</span>
                <span class="widget-metric-val" id="metric-ram-total-${w.id}">0 GB</span>
              </div>
              <div class="widget-progress-bar">
                <div class="widget-progress-fill" id="bar-ram-${w.id}" style="width: 0%;"></div>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (w.type === 'disk_gauge') {
      html += `
        <div class="widget-card ${sizeClass}" id="widget-card-${w.id}" data-widget-id="${w.id}" ${isDraggable} style="--widget-accent: ${accent};">
          ${getWidgetCardHeader(w, '💾')}
          <div class="widget-card-body">
            <div class="radial-gauge-box">
              <svg class="radial-gauge-svg" viewBox="0 0 80 80">
                <circle class="radial-gauge-bg" cx="40" cy="40" r="34" />
                <circle class="radial-gauge-progress" id="gauge-arc-${w.id}" cx="40" cy="40" r="34"
                  stroke-dasharray="${C}" stroke-dashoffset="${C}" />
              </svg>
              <div class="radial-gauge-val" id="gauge-val-${w.id}">0<span class="radial-gauge-unit">%</span></div>
            </div>
            <div class="widget-metrics-list">
              <div class="widget-metric-row">
                <span>Used Space:</span>
                <span class="widget-metric-val" id="metric-disk-used-${w.id}">0 GB</span>
              </div>
              <div class="widget-metric-row">
                <span>Free Space:</span>
                <span class="widget-metric-val" id="metric-disk-free-${w.id}">0 GB</span>
              </div>
              <div class="widget-metric-row">
                <span>Total Disk:</span>
                <span class="widget-metric-val" id="metric-disk-total-${w.id}">0 GB</span>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (w.type === 'network_traffic') {
      html += `
        <div class="widget-card ${sizeClass}" id="widget-card-${w.id}" data-widget-id="${w.id}" ${isDraggable} style="--widget-accent: ${accent};">
          ${getWidgetCardHeader(w, '🌐')}
          <div class="widget-card-body" style="flex-direction: column; align-items: stretch;">
            <div class="net-traffic-grid">
              <div class="net-dial-box">
                <div class="net-dial-label">⬇️ Download (RX)</div>
                <div class="net-dial-speed" id="net-rx-speed-${w.id}">0 KB/s</div>
              </div>
              <div class="net-dial-box">
                <div class="net-dial-label">⬆️ Upload (TX)</div>
                <div class="net-dial-speed tx" id="net-tx-speed-${w.id}">0 KB/s</div>
              </div>
            </div>
            <div class="widget-metrics-list" style="margin-top: 0.5rem;">
              <div class="widget-metric-row">
                <span>Total Transfer:</span>
                <span class="widget-metric-val" id="net-total-io-${w.id}">0 MB</span>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (w.type === 'docker_stats') {
      html += `
        <div class="widget-card ${sizeClass}" id="widget-card-${w.id}" data-widget-id="${w.id}" ${isDraggable} style="--widget-accent: ${accent};">
          ${getWidgetCardHeader(w, '🐳')}
          <div class="widget-card-body">
            <div class="radial-gauge-box">
              <svg class="radial-gauge-svg" viewBox="0 0 80 80">
                <circle class="radial-gauge-bg" cx="40" cy="40" r="34" />
                <circle class="radial-gauge-progress" id="gauge-arc-${w.id}" cx="40" cy="40" r="34"
                  stroke-dasharray="${C}" stroke-dashoffset="${C}" />
              </svg>
              <div class="radial-gauge-val" id="gauge-val-${w.id}">0<span class="radial-gauge-unit">Up</span></div>
            </div>
            <div class="widget-metrics-list">
              <div class="widget-metric-row">
                <span>Running:</span>
                <span class="widget-metric-val" style="color:#10b981;" id="docker-running-${w.id}">0 Containers</span>
              </div>
              <div class="widget-metric-row">
                <span>Stopped:</span>
                <span class="widget-metric-val" style="color:#ef4444;" id="docker-stopped-${w.id}">0 Containers</span>
              </div>
              <div class="widget-metric-row">
                <span>Total Containers:</span>
                <span class="widget-metric-val" id="docker-total-${w.id}">0 Total</span>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (w.type === 'host_info') {
      html += `
        <div class="widget-card ${sizeClass}" id="widget-card-${w.id}" data-widget-id="${w.id}" ${isDraggable} style="--widget-accent: ${accent};">
          ${getWidgetCardHeader(w, '🖥️')}
          <div class="widget-card-body" style="flex-direction: column; align-items: stretch;">
            <div class="widget-metrics-list">
              <div class="widget-metric-row">
                <span>Hostname:</span>
                <span class="widget-metric-val" id="host-hostname-${w.id}">-</span>
              </div>
              <div class="widget-metric-row">
                <span>OS & Kernel:</span>
                <span class="widget-metric-val" id="host-os-${w.id}" style="font-size:0.7rem;">-</span>
              </div>
              <div class="widget-metric-row">
                <span>System Uptime:</span>
                <span class="widget-metric-val" style="color:#38bdf8;" id="host-uptime-${w.id}">-</span>
              </div>
              <div class="widget-metric-row">
                <span>Node Status:</span>
                <span class="widget-metric-val" style="color:#10b981;" id="host-status-${w.id}">🛡️ Online & Ready</span>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (w.type === 'service_health') {
      html += `
        <div class="widget-card ${sizeClass}" id="widget-card-${w.id}" data-widget-id="${w.id}" ${isDraggable} style="--widget-accent: ${accent};">
          ${getWidgetCardHeader(w, '🛡️')}
          <div class="widget-card-body">
            <div class="radial-gauge-box">
              <svg class="radial-gauge-svg" viewBox="0 0 80 80">
                <circle class="radial-gauge-bg" cx="40" cy="40" r="34" />
                <circle class="radial-gauge-progress" id="gauge-arc-${w.id}" cx="40" cy="40" r="34"
                  stroke-dasharray="${C}" stroke-dashoffset="${C}" />
              </svg>
              <div class="radial-gauge-val" id="gauge-val-${w.id}">0<span class="radial-gauge-unit">%</span></div>
            </div>
            <div class="widget-metrics-list">
              <div class="widget-metric-row">
                <span>Online Services:</span>
                <span class="widget-metric-val" style="color:#10b981;" id="health-online-${w.id}">0</span>
              </div>
              <div class="widget-metric-row">
                <span>Offline / Warning:</span>
                <span class="widget-metric-val" style="color:#ef4444;" id="health-offline-${w.id}">0</span>
              </div>
              <div class="widget-metric-row">
                <span>Total Services:</span>
                <span class="widget-metric-val" id="health-total-${w.id}">0</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }
  });

  elements.widgetsContainer.innerHTML = html;

  // Attach delete events
  elements.widgetsContainer.querySelectorAll('.btn-del-widget').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteWidget(btn.dataset.id);
    });
  });

  // Attach interactive calendar mode switcher for clock widgets
  elements.widgetsContainer.querySelectorAll('.clock-widget-mode-pill').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wId = btn.dataset.widgetId;
      const widget = AppState.config?.widgets?.find(w => w.id === wId);
      if (widget) {
        const modes = ['both', 'shamsi', 'gregorian'];
        const curIdx = modes.indexOf(widget.calendar_mode || 'both');
        const nextMode = modes[(curIdx + 1) % modes.length];
        widget.calendar_mode = nextMode;
        if (AppState.authRole === 'admin') {
          saveConfigToServer('Calendar mode updated');
        }
        renderWidgets();
      }
    });
  });

  // Attach interactive transparency switcher for clock widgets
  elements.widgetsContainer.querySelectorAll('.btn-clock-trans').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const wId = btn.dataset.widgetId;
      const widget = AppState.config?.widgets?.find(w => w.id === wId);
      if (widget) {
        widget.bg_style = (widget.bg_style === 'transparent') ? undefined : 'transparent';
        if (AppState.authRole === 'admin') {
          await saveConfigToServer('Clock transparency updated');
        }
        renderWidgets();
        showToast(`شفافیت ساعت ${widget.bg_style === 'transparent' ? 'فعال شد (کاملاً شفاف)' : 'به شیشه‌ای مات بازگشت'}`, 'info');
      }
    });
  });

  // Attach interactive alignment switcher for clock widgets
  elements.widgetsContainer.querySelectorAll('.btn-clock-align').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const wId = btn.dataset.widgetId;
      const widget = AppState.config?.widgets?.find(w => w.id === wId);
      if (widget) {
        const aligns = ['center', 'start', 'end', 'full'];
        const curIdx = aligns.indexOf(widget.align || 'center');
        const nextAlign = aligns[(curIdx + 1) % aligns.length];
        widget.align = nextAlign;
        if (AppState.authRole === 'admin') {
          await saveConfigToServer('Clock alignment updated');
        }
        renderWidgets();
        const alignNames = { center: 'وسط‌چین (Center)', start: 'چپ‌چین (Left)', end: 'راست‌چین (Right)', full: 'تمام‌عرض (Full Width)' };
        showToast(`موقعیت ساعت به ${alignNames[nextAlign]} تنظیم شد`, 'info');
      }
    });
  });

  // Attach Drag & Drop reorder events for widgets (Admin Only)
  if (AppState.authRole === 'admin') {
    elements.widgetsContainer.querySelectorAll('.widget-card').forEach(card => {
      const wId = card.dataset.widgetId;

      card.ondragstart = (e) => {
        AppState.draggedWidgetId = wId;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('type', 'widget');
        e.dataTransfer.setData('text/plain', wId);
      };

      card.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (card.dataset.widgetId !== AppState.draggedWidgetId) {
          card.classList.add('drag-over');
        }
      };

      card.ondragleave = () => {
        card.classList.remove('drag-over');
      };

      card.ondrop = (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        const targetId = card.dataset.widgetId;
        if (AppState.draggedWidgetId && AppState.draggedWidgetId !== targetId) {
          handleWidgetReorder(AppState.draggedWidgetId, targetId);
          AppState.draggedWidgetId = null;
        }
      };

      card.ondragend = () => {
        elements.widgetsContainer.querySelectorAll('.widget-card').forEach(c => {
          c.classList.remove('dragging', 'drag-over');
        });
        AppState.draggedWidgetId = null;
      };
    });
  }

  updateWidgetValues();
}

function handleWidgetReorder(sourceWidgetId, targetWidgetId) {
  if (!AppState.config?.widgets || sourceWidgetId === targetWidgetId) return;
  const list = AppState.config.widgets;
  const srcIdx = list.findIndex(w => w.id === sourceWidgetId);
  const tgtIdx = list.findIndex(w => w.id === targetWidgetId);
  if (srcIdx !== -1 && tgtIdx !== -1) {
    const [moved] = list.splice(srcIdx, 1);
    list.splice(tgtIdx, 0, moved);
    saveConfigToServer('Gauge layout saved');
    renderWidgets();
  }
}

function updateWidgetValues() {
  if (typeof updateClockWidgets === 'function') {
    updateClockWidgets();
  }
  if (!AppState.systemTelemetry) return;

  const widgets = AppState.config?.widgets || [];
  const C = 213.6;
  const telemetryServers = AppState.systemTelemetry.servers || {};

  widgets.forEach(w => {
    const srvId = w.server_id || 'local';
    const srvEntry = telemetryServers[srvId];
    const stats = srvEntry?.stats || (srvId === 'local' ? AppState.systemTelemetry : null);
    const isOnline = srvEntry ? srvEntry.status === 'online' : (srvId === 'local');

    const card = document.getElementById(`widget-card-${w.id}`);
    if (card && card.closest('.is-dragging')) {
      return; // Do not re-render widgets in the subtree being dragged
    }
    if (card) {
      card.classList.toggle('server-offline', !isOnline);
    }

    if (!stats) return;

    const arc = document.getElementById(`gauge-arc-${w.id}`);
    const val = document.getElementById(`gauge-val-${w.id}`);

    if (w.type === 'cpu_gauge' && stats.cpu) {
      const pct = stats.cpu.percent || 0;
      if (arc) arc.style.strokeDashoffset = C - (pct / 100) * C;
      if (val) val.innerHTML = `${pct}<span class="radial-gauge-unit">%</span>`;
      const coresEl = document.getElementById(`metric-cores-${w.id}`);
      if (coresEl) coresEl.textContent = `${stats.cpu.cores} Cores`;
      const loadEl = document.getElementById(`metric-load-${w.id}`);
      if (loadEl) loadEl.textContent = `${stats.cpu.loadAvg?.[0] || 0} / ${stats.cpu.loadAvg?.[1] || 0}`;
      const modelEl = document.getElementById(`metric-model-${w.id}`);
      if (modelEl) modelEl.textContent = stats.cpu.model || 'CPU';
    } else if (w.type === 'ram_gauge' && stats.ram) {
      const pct = stats.ram.percent || 0;
      if (arc) arc.style.strokeDashoffset = C - (pct / 100) * C;
      if (val) val.innerHTML = `${pct}<span class="radial-gauge-unit">%</span>`;
      const usedEl = document.getElementById(`metric-ram-used-${w.id}`);
      if (usedEl) usedEl.textContent = `${stats.ram.usedGb} GB`;
      const totalEl = document.getElementById(`metric-ram-total-${w.id}`);
      if (totalEl) totalEl.textContent = `${stats.ram.totalGb} GB`;
      const bar = document.getElementById(`bar-ram-${w.id}`);
      if (bar) bar.style.width = `${pct}%`;
    } else if (w.type === 'disk_gauge' && stats.disk) {
      const pct = stats.disk.percent || 0;
      if (arc) arc.style.strokeDashoffset = C - (pct / 100) * C;
      if (val) val.innerHTML = `${pct}<span class="radial-gauge-unit">%</span>`;
      const usedEl = document.getElementById(`metric-disk-used-${w.id}`);
      if (usedEl) usedEl.textContent = `${stats.disk.usedGb} GB`;
      const freeEl = document.getElementById(`metric-disk-free-${w.id}`);
      if (freeEl) freeEl.textContent = `${stats.disk.freeGb} GB`;
      const totalEl = document.getElementById(`metric-disk-total-${w.id}`);
      if (totalEl) totalEl.textContent = `${stats.disk.totalGb} GB`;
    } else if (w.type === 'network_traffic' && stats.net) {
      const rxEl = document.getElementById(`net-rx-speed-${w.id}`);
      if (rxEl) {
        rxEl.textContent = stats.net.rxRateKb > 1024 ? `${(stats.net.rxRateKb / 1024).toFixed(1)} MB/s` : `${stats.net.rxRateKb} KB/s`;
      }
      const txEl = document.getElementById(`net-tx-speed-${w.id}`);
      if (txEl) {
        txEl.textContent = stats.net.txRateKb > 1024 ? `${(stats.net.txRateKb / 1024).toFixed(1)} MB/s` : `${stats.net.txRateKb} KB/s`;
      }
      const ioEl = document.getElementById(`net-total-io-${w.id}`);
      if (ioEl) {
        ioEl.textContent = `⬇️ ${stats.net.rxTotalMb} MB | ⬆️ ${stats.net.txTotalMb} MB`;
      }
    } else if (w.type === 'docker_stats' && stats.docker) {
      const total = stats.docker.total || 0;
      const running = stats.docker.running || 0;
      const stopped = stats.docker.stopped || 0;
      const pct = total > 0 ? Math.round((running / total) * 100) : 0;
      if (arc) arc.style.strokeDashoffset = C - (pct / 100) * C;
      if (val) val.innerHTML = `${running}<span class="radial-gauge-unit">Up</span>`;
      const runEl = document.getElementById(`docker-running-${w.id}`);
      if (runEl) runEl.textContent = `${running} Containers`;
      const stopEl = document.getElementById(`docker-stopped-${w.id}`);
      if (stopEl) stopEl.textContent = `${stopped} Containers`;
      const totalEl = document.getElementById(`docker-total-${w.id}`);
      if (totalEl) totalEl.textContent = `${total} Total`;
    } else if (w.type === 'host_info' && stats.host) {
      const hostEl = document.getElementById(`host-hostname-${w.id}`);
      if (hostEl) hostEl.textContent = stats.host.hostname || 'box';
      const osEl = document.getElementById(`host-os-${w.id}`);
      if (osEl) osEl.textContent = `${stats.host.platform} ${stats.host.release || ''}`;
      const upEl = document.getElementById(`host-uptime-${w.id}`);
      if (upEl) upEl.textContent = stats.host.uptimeStr || '0m';
      const statusEl = document.getElementById(`host-status-${w.id}`);
      if (statusEl) {
        statusEl.textContent = isOnline ? '🛡️ Online & Ready' : '⚠️ Offline / Disconnected';
        statusEl.style.color = isOnline ? '#10b981' : '#ef4444';
      }
    } else if (w.type === 'service_health') {
      let totalTiles = 0;
      (AppState.config?.categories || []).forEach(c => totalTiles += (c.tiles || []).length);
      let online = 0;
      let offline = 0;
      Object.keys(AppState.probes || {}).forEach(k => {
        if (AppState.probes[k]?.status === 'online') online++;
        else offline++;
      });
      const pct = totalTiles > 0 ? Math.round((online / totalTiles) * 100) : 100;
      if (arc) arc.style.strokeDashoffset = C - (pct / 100) * C;
      if (val) val.innerHTML = `${pct}<span class="radial-gauge-unit">%</span>`;
      const onEl = document.getElementById(`health-online-${w.id}`);
      if (onEl) onEl.textContent = `${online} Online`;
      const offEl = document.getElementById(`health-offline-${w.id}`);
      if (offEl) offEl.textContent = `${offline} Offline`;
      const totEl = document.getElementById(`health-total-${w.id}`);
      if (totEl) totEl.textContent = `${totalTiles} Total`;
    }
  });
}
window.updateWidgetValues = updateWidgetValues;

function openWidgetModal() {
  const modal = document.getElementById('widgetModal');
  if (!modal) return;

  AppState.selectedWidgetType = 'clock_widget';
  const typeCards = modal.querySelectorAll('.widget-type-card');

  const updateTypeSpecificRows = (type) => {
    if (elements.clockConfigRow) {
      elements.clockConfigRow.style.display = (type === 'clock_widget') ? 'flex' : 'none';
    }
    if (elements.chartConfigRow) {
      elements.chartConfigRow.style.display = (type === 'chart_widget') ? 'flex' : 'none';
    }
  };

  typeCards.forEach(c => {
    c.classList.toggle('active', c.dataset.type === AppState.selectedWidgetType);
    c.onclick = () => {
      typeCards.forEach(tc => tc.classList.remove('active'));
      c.classList.add('active');
      AppState.selectedWidgetType = c.dataset.type;
      const titleInput = document.getElementById('widgetTitleInput');
      if (titleInput && c.dataset.defaultTitle) {
        titleInput.value = c.dataset.defaultTitle;
      }
      updateTypeSpecificRows(c.dataset.type);
    };
  });

  updateTypeSpecificRows(AppState.selectedWidgetType);

  // Populate Servers Dropdown
  const srvSelect = document.getElementById('widgetServerSelect');
  if (srvSelect) {
    const servers = AppState.config?.servers || [];
    srvSelect.innerHTML = servers.map(s => `
      <option value="${s.id}" ${s.id === AppState.activeCluster ? 'selected' : ''}>${s.name} (${s.type === 'agent_push' ? 'Agent' : (s.type === 'http_pull' ? 'Pull' : 'Local')})</option>
    `).join('');
  }

  document.getElementById('widgetTitleInput').value = 'ساعت و تقویم';
  document.getElementById('widgetSizeSelect').value = 'normal';
  document.getElementById('widgetColorInput').value = '#38bdf8';
  if (elements.clockCalendarModeSelect) elements.clockCalendarModeSelect.value = 'both';
  if (elements.clockTimeFormatSelect) elements.clockTimeFormatSelect.value = '24h';

  modal.classList.add('open');
}

function saveNewWidget() {
  const title = document.getElementById('widgetTitleInput').value.trim() || 'New Widget';
  const size = document.getElementById('widgetSizeSelect').value || 'normal';
  const color = document.getElementById('widgetColorInput').value || '#38bdf8';
  const type = AppState.selectedWidgetType || 'clock_widget';
  const server_id = document.getElementById('widgetServerSelect')?.value || 'local';

  AppState.config.widgets = AppState.config.widgets || [];
  const newWidget = {
    id: 'widget-' + Date.now(),
    server_id,
    type,
    title,
    color,
    size
  };

  if (type === 'clock_widget') {
    newWidget.calendar_mode = elements.clockCalendarModeSelect?.value || 'both';
    newWidget.time_format = elements.clockTimeFormatSelect?.value || '24h';
  } else if (type === 'chart_widget') {
    newWidget.metric_type = elements.chartMetricSelect?.value || 'cpu';
    newWidget.time_range = elements.chartRangeSelect?.value || '1h';
  }

  AppState.config.widgets.push(newWidget);

  saveConfigToServer('New widget added to dashboard');
  renderWidgets();
  closeAllModals();
}

function deleteWidget(widgetId) {
  if (!AppState.config?.widgets) return;
  const idx = AppState.config.widgets.findIndex(w => w.id === widgetId);
  if (idx !== -1) {
    const [removed] = AppState.config.widgets.splice(idx, 1);
    saveConfigToServer(`Gauge "${removed.title}" removed`);
    renderWidgets();
  }
}

function toggleWidgetsCollapse() {
  AppState.widgetsCollapsed = !AppState.widgetsCollapsed;
  const sec = document.getElementById('widgetsSection');
  if (sec) {
    sec.classList.toggle('collapsed', AppState.widgetsCollapsed);
  }
}

// --------------------------------------------------------------------------
// Multi-Cluster Management Modal Logic
// --------------------------------------------------------------------------

function openServerManagerModal() {
  renderClusterList();
  updateAgentSnippet();
  const modal = document.getElementById('serverManagerModal');
  if (modal) modal.classList.add('open');
}

function renderClusterList() {
  if (!elements.clusterListContainer) return;
  const servers = AppState.config?.servers || [];
  const telemetryServers = AppState.systemTelemetry?.servers || {};

  let html = '';
  servers.forEach(srv => {
    const t = telemetryServers[srv.id];
    const isOnline = t ? t.status === 'online' : (srv.type === 'local');
    const statusText = isOnline ? 'Online' : (t ? 'Offline' : 'Pending');
    const statusClass = isOnline ? 'online' : (t ? 'offline' : 'pending');
    const isMaster = srv.id === 'local';

    html += `
      <div class="cluster-list-item">
        <div class="cluster-item-info">
          <span class="cluster-status-dot ${statusClass}" style="width:10px; height:10px;"></span>
          <div class="cluster-item-meta">
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span class="cluster-item-name">${srv.name || srv.id}</span>
              <span class="cluster-badge-type">${srv.type === 'local' ? 'Local Master' : (srv.type === 'agent_push' ? 'Agent Push' : 'HTTP Pull')}</span>
            </div>
            <span class="cluster-item-sub">ID: <code>${srv.id}</code> | Status: <strong>${statusText}</strong> ${srv.url ? '| URL: ' + srv.url : ''}</span>
          </div>
        </div>
        <div>
          ${!isMaster ? `<button class="btn btn-sm btn-icon" onclick="deleteServer('${srv.id}')" title="Delete Node" style="color:#ef4444;">🗑</button>` : '<span style="font-size:0.75rem; color:#64748b;">Default</span>'}
        </div>
      </div>
    `;
  });

  elements.clusterListContainer.innerHTML = html;
}

function toggleServerTypeFields(type) {
  if (elements.agentPushFields) {
    elements.agentPushFields.style.display = type === 'agent_push' ? 'block' : 'none';
  }
  if (elements.httpPullFields) {
    elements.httpPullFields.style.display = type === 'http_pull' ? 'block' : 'none';
  }
}

function updateAgentSnippet() {
  if (!elements.agentSnippetBash) return;
  const srvId = elements.newServerIdInput?.value.trim() || '<SERVER_ID>';
  const token = elements.newServerTokenInput?.value.trim() || '';
  const origin = window.location.origin || 'http://localhost:3080';
  let cmd = `curl -s ${origin}/scripts/dimdash-agent.sh | bash -s -- --master ${origin} --server-id ${srvId}`;
  if (token) cmd += ` --token ${token}`;
  elements.agentSnippetBash.textContent = cmd;
}

function saveNewServer() {
  const name = elements.newServerNameInput?.value.trim();
  const id = elements.newServerIdInput?.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const type = elements.newServerTypeSelect?.value || 'agent_push';
  const color = elements.newServerColorInput?.value || '#10b981';
  const token = elements.newServerTokenInput?.value.trim() || '';
  const url = elements.newServerUrlInput?.value.trim() || '';
  const interval = parseInt(elements.newServerIntervalInput?.value, 10) || 5;

  if (!name || !id) {
    showToast('Please enter a display name and cluster ID', 'error');
    return;
  }

  AppState.config.servers = AppState.config.servers || [];
  if (AppState.config.servers.some(s => s.id === id)) {
    showToast(`Server ID '${id}' is already in use`, 'error');
    return;
  }

  const newSrv = { id, name, type, color };
  if (type === 'agent_push') {
    if (token) newSrv.token = token;
  } else if (type === 'http_pull') {
    if (!url) {
      showToast('Please enter metric endpoint URL', 'error');
      return;
    }
    newSrv.url = url;
    newSrv.interval = interval;
    if (token) newSrv.token = token;
  }

  AppState.config.servers.push(newSrv);
  saveConfigToServer(`Cluster node "${name}" added successfully`);

  // Clear inputs
  if (elements.newServerNameInput) elements.newServerNameInput.value = '';
  if (elements.newServerIdInput) elements.newServerIdInput.value = '';
  if (elements.newServerTokenInput) elements.newServerTokenInput.value = '';
  if (elements.newServerUrlInput) elements.newServerUrlInput.value = '';

  renderClusterList();
  renderClusterBar();
  showToast('Server added successfully', 'success');
}

function deleteServer(serverId) {
  if (serverId === 'local') {
    showToast('Local master node cannot be removed', 'error');
    return;
  }

  if (!AppState.config?.servers) return;
  const idx = AppState.config.servers.findIndex(s => s.id === serverId);
  if (idx !== -1) {
    const [removed] = AppState.config.servers.splice(idx, 1);
    if (AppState.activeCluster === serverId) {
      AppState.activeCluster = 'all';
    }
    saveConfigToServer(`Cluster node "${removed.name}" removed`);
    renderClusterList();
    renderClusterBar();
    renderWidgets();
  }
}

window.deleteServer = deleteServer;


// Render Tiles Grid
function renderGrid() {
  if (!elements.contentArea) return;
  const categories = AppState.config?.categories || [];
  const query = AppState.searchQuery.toLowerCase().trim();

  let html = '';
  let matchFound = false;

  categories.forEach(cat => {
    if (AppState.activeCategory !== 'all' && AppState.activeCategory !== cat.id) {
      return;
    }

    const filteredTiles = (cat.tiles || []).filter(tile => {
      if (!isTileAccessible(tile)) return false;
      if (!query) return true;
      return (
        tile.title.toLowerCase().includes(query) ||
        (tile.subtitle && tile.subtitle.toLowerCase().includes(query)) ||
        (tile.target_url && tile.target_url.toLowerCase().includes(query))
      );
    });

    if (filteredTiles.length === 0 && (query || AppState.authRole !== 'admin')) {
      return; // Skip empty category on search or if user has no accessible tiles
    }

    matchFound = true;
    const catLayout = cat.layout || 'vertical';
    let catLayoutClass = 'cat-layout-vertical';
    if (catLayout === 'wide') catLayoutClass = 'cat-layout-wide';
    else if (catLayout === 'horizontal') catLayoutClass = 'cat-layout-horizontal';

    const catColClass = cat.col_start && cat.col_start !== 'auto' ? `cat-col-${cat.col_start}` : '';
    const catBgClass = cat.bg_style ? `cat-${cat.bg_style}` : '';
    const catPlateClass = cat.icon_plate ? `cat-icon-plate-${cat.icon_plate}` : '';

    const tileStyle = cat.tile_style || 'grid';
    const tileSize = cat.tile_size || 'large';
    const catStyleClass = `cat-style-${tileStyle}`;
    const catSizeClass = `cat-size-${tileSize}`;

    const isDraggable = AppState.authRole === 'admin' ? 'draggable="true"' : 'draggable="false"';

    const colLabel = cat.col_start && cat.col_start !== 'auto' ? `ستون ${cat.col_start}` : 'Auto';
    const isTrans = cat.bg_style === 'transparent';
    const hasCatPlate = cat.icon_plate === 'light';

    html += `
      <section class="category-section ${catLayoutClass} ${catColClass} ${catBgClass} ${catPlateClass} ${catStyleClass} ${catSizeClass}" data-cat-id="${cat.id}" ${isDraggable}>
        <div class="category-header">
          <div class="category-title-group">
            ${AppState.authRole === 'admin' ? `
              <span class="cat-drag-handle" title="Drag to reorder category">⠿</span>
              <button type="button" class="cat-move-btn btn-cat-move-left" data-cat-id="${cat.id}" title="Move left / up (جابجایی به چپ/بالا)">◀</button>
              <button type="button" class="cat-move-btn btn-cat-move-right" data-cat-id="${cat.id}" title="Move right / down (جابجایی به راست/پایین)">▶</button>
            ` : ''}
            <span class="category-badge-dot" style="background: ${cat.color || 'var(--accent-color)'}; box-shadow: 0 0 8px ${cat.color || 'var(--accent-color)'};"></span>
            <h2 class="category-title">${cat.name}</h2>
            <span class="cat-pill-count">${filteredTiles.length}</span>
          </div>

          <div class="category-actions">
            ${AppState.authRole === 'admin' ? `
              <div class="cat-island-controls" title="موقعیت ستون در صفحه (خالی گذاشتن بخش‌های دلخواه صفحه)">
                <button type="button" class="btn-island-col" data-cat-id="${cat.id}" title="تغییر ستون شروع: Auto / ستون ۱ / ۲ / ۳ / ۴">📍 ${colLabel}</button>
              </div>
              <div class="cat-island-controls" title="عرض گروه در صفحه">
                <button type="button" class="btn-island-size ${(!cat.layout || cat.layout === 'vertical') ? 'active' : ''}" data-cat-id="${cat.id}" data-layout="vertical" title="تک ستون">▮ Col</button>
                <button type="button" class="btn-island-size ${cat.layout === 'wide' ? 'active' : ''}" data-cat-id="${cat.id}" data-layout="wide" title="دو ستون (Wide)">▬ Wide</button>
                <button type="button" class="btn-island-size ${cat.layout === 'horizontal' ? 'active' : ''}" data-cat-id="${cat.id}" data-layout="horizontal" title="تمام عرض">▰ Row</button>
              </div>
              <div class="cat-island-controls cat-style-controls" title="حالت نمایش: کارت‌های جزیره‌ای یا ردیف‌های کپسولی">
                <button type="button" class="btn-cat-style ${(!cat.tile_style || cat.tile_style === 'grid') ? 'active' : ''}" data-cat-id="${cat.id}" data-style="grid" title="کارت‌های جزیره‌ای (Island Cards)">☷ Grid</button>
                <button type="button" class="btn-cat-style ${cat.tile_style === 'pill' ? 'active' : ''}" data-cat-id="${cat.id}" data-style="pill" title="ردیف‌های کپسولی (Pills)">☰ List</button>
              </div>
              <div class="cat-island-controls cat-size-controls" title="اندازه آیکون‌ها و تایل‌ها">
                <button type="button" class="btn-cat-size ${cat.tile_size === 'compact' ? 'active' : ''}" data-cat-id="${cat.id}" data-size="compact" title="فشرده و کوچک (Compact)">S</button>
                <button type="button" class="btn-cat-size ${cat.tile_size === 'medium' ? 'active' : ''}" data-cat-id="${cat.id}" data-size="medium" title="متوسط (Medium)">M</button>
                <button type="button" class="btn-cat-size ${(!cat.tile_size || cat.tile_size === 'large') ? 'active' : ''}" data-cat-id="${cat.id}" data-size="large" title="بزرگ جزیره‌ای (Large)">L</button>
              </div>
              <div class="cat-island-controls" title="شفافیت و پلاک کنتراست آیکون‌های مشکی">
                <button type="button" class="btn-island-trans ${isTrans ? 'active' : ''}" data-cat-id="${cat.id}" title="شفاف‌سازی گروه (Transparent / Glass)">${isTrans ? '🫥 شفاف' : '🫧 مات'}</button>
                <button type="button" class="btn-island-plate ${hasCatPlate ? 'active' : ''}" data-cat-id="${cat.id}" title="پلاک سفید زیر تمام آیکون‌ها برای نمایش لوگوهای تیره و مشکی">💡 بستر روشن</button>
              </div>
              <button class="btn btn-icon btn-edit-cat" data-id="${cat.id}" title="تنظیمات گروه">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button class="btn btn-icon btn-del-cat" data-id="${cat.id}" title="حذف گروه">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            ` : ''}
          </div>
        </div>
        <div class="tile-grid" data-cat-id="${cat.id}">
    `;

    filteredTiles.forEach(tile => {
      const iconMarkup = IconCatalog.render(tile.icon_type, tile.icon_value);
      const targetAttr = tile.open_in_new_tab !== false ? 'target="_blank" rel="noopener noreferrer"' : '';
      const customBg = tile.bg_color ? `style="background: ${tile.bg_color};"` : '';
      const vis = tile.visibility || 'public';
      let visBadge = '';
      if (AppState.authRole === 'admin' && vis !== 'public') {
        visBadge = `<span class="tile-visibility-badge vis-${vis}" title="دسترسی: ${vis === 'admin' ? 'فقط ادمین' : 'کاربران وارد شده'}">${vis === 'admin' ? '🛡️ Admin' : '🔒 Member'}</span>`;
      }

      const hasLightPlate = tile.icon_plate === 'light' || cat.icon_plate === 'light';
      const hasInvert = tile.icon_plate === 'invert' || cat.icon_plate === 'invert';
      const plateClass = hasLightPlate ? 'plate-light' : (hasInvert ? 'filter-invert' : '');
      const cardClass = tile.bg_style === 'transparent' ? 'card-transparent' : (tile.bg_style === 'light' ? 'card-light' : '');

      html += `
        <div class="tile-card ${cardClass}" 
             data-tile-id="${tile.id}" 
             data-cat-id="${cat.id}"
             ${isDraggable}>
          
          ${AppState.authRole === 'admin' ? '<span class="tile-drag-handle" title="Drag to reorder tile">⠿</span>' : ''}

          ${AppState.authRole === 'admin' && AppState.isArrangeMode ? `
            <div class="tile-arrange-controls">
              <button type="button" class="tile-move-btn btn-tile-up" data-cat-id="${cat.id}" data-tile-id="${tile.id}" title="Move up">▲</button>
              <button type="button" class="tile-move-btn btn-tile-down" data-cat-id="${cat.id}" data-tile-id="${tile.id}" title="Move down">▼</button>
              <button type="button" class="tile-move-btn btn-tile-next-cat" data-cat-id="${cat.id}" data-tile-id="${tile.id}" title="Move to next category">↷</button>
            </div>
          ` : ''}

          ${AppState.authRole === 'admin' ? `
            <div class="tile-admin-bar">
              <button class="tile-admin-btn btn-test-tile" data-cat-id="${cat.id}" data-tile-id="${tile.id}" title="Probe Health">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              </button>
              <button class="tile-admin-btn btn-edit-tile" data-cat-id="${cat.id}" data-tile-id="${tile.id}" title="Edit Tile">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button class="tile-admin-btn btn-del-tile" data-cat-id="${cat.id}" data-tile-id="${tile.id}" title="Delete Tile">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          ` : ''}

          <a href="${tile.target_url}" ${targetAttr} class="tile-main-link">
            <div class="tile-top">
              <div class="tile-icon-box ${plateClass}" ${customBg}>
                ${iconMarkup}
              </div>
              ${visBadge}
            </div>
            
            <div class="tile-info">
              <div class="tile-title">${tile.title}</div>
              ${tile.subtitle ? `<div class="tile-subtitle">${tile.subtitle}</div>` : ''}
            </div>

            <div class="tile-footer" id="footer-${tile.id}">
              <span class="status-badge">
                <span class="status-dot online"></span>
              </span>
            </div>
          </a>
        </div>
      `;
    });

    if (filteredTiles.length === 0 && AppState.isArrangeMode && AppState.authRole === 'admin') {
      html += `<div class="empty-dropzone" data-cat-id="${cat.id}">Drop tiles here</div>`;
    }

    html += `
        </div>
      </section>
    `;
  });

  if (!matchFound) {
    html = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <h3>No Services Found</h3>
        <p>No matching service found for "${AppState.searchQuery}".</p>
      </div>
    `;
  }

  elements.contentArea.innerHTML = html;

  attachCardEvents();
  updateProbeBadges();
}

// Mini SVG Sparkline Generator
function renderSparkline(history, status = 'unknown') {
  if (!history || history.length === 0) {
    return `<svg viewBox="0 0 100 24" class="sparkline-svg"><line x1="2" y1="12" x2="98" y2="12" stroke="rgba(255,255,255,0.08)" stroke-dasharray="2,2"/></svg>`;
  }

  const validVals = history.map(h => typeof h.latency === 'number' ? h.latency : (h.status === 'online' ? 20 : 0));
  const maxVal = Math.max(...validVals, 50);
  const minVal = Math.min(...validVals, 0);
  const range = (maxVal - minVal) || 1;

  const width = 100;
  const height = 24;
  const padding = 2;

  const points = validVals.map((val, idx) => {
    const x = (idx / (validVals.length - 1 || 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((val - minVal) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const fillD = `${pathD} L ${width - padding},${height} L ${padding},${height} Z`;

  const statusClass = status === 'online' ? 'online' : (status === 'warning' ? 'warning' : (status === 'offline' ? 'offline' : ''));

  return `
    <svg viewBox="0 0 ${width} ${height}" class="sparkline-svg" preserveAspectRatio="none">
      <path class="sparkline-fill ${statusClass}" d="${fillD}"></path>
      <path class="sparkline-path ${statusClass}" d="${pathD}"></path>
    </svg>
  `;
}

// Probe Badges Update & Stats Overview Updater
function updateProbeBadges() {
  const probes = AppState.probes || {};
  const categories = AppState.config?.categories || [];

  let totalCount = 0;
  let onlineCount = 0;
  let warningCount = 0;
  let offlineCount = 0;

  categories.forEach(cat => {
    (cat.tiles || []).forEach(tile => {
      totalCount++;
      const footerEl = document.getElementById(`footer-${tile.id}`);
      const sparkEl = document.getElementById(`sparkline-${tile.id}`);
      if (!footerEl) return;

      const info = probes[tile.id];
      if (!tile.probe || tile.probe.type === 'none') {
        onlineCount++;
        footerEl.innerHTML = `
          <span class="status-badge" title="Active local service">
            <span class="status-dot online"></span>
          </span>
        `;
        if (sparkEl) sparkEl.innerHTML = '';
        return;
      }

      if (!info || info.status === 'unknown') {
        footerEl.innerHTML = `
          <span class="status-badge" title="Probing status...">
            <span class="status-dot"></span>
          </span>
        `;
        if (sparkEl) sparkEl.innerHTML = '';
        return;
      }

      let statusDotClass = 'offline';
      let statusText = 'Offline';
      if (info.status === 'online') {
        statusDotClass = 'online';
        statusText = 'Online';
        onlineCount++;
      } else if (info.status === 'warning') {
        statusDotClass = 'warning';
        statusText = info.statusCode ? `Code ${info.statusCode}` : 'Warning';
        warningCount++;
      } else {
        offlineCount++;
      }

      footerEl.innerHTML = `
        <span class="status-badge" title="${statusText}">
          <span class="status-dot ${statusDotClass}"></span>
        </span>
        ${info.latency ? `<span class="latency-badge">${info.latency}ms</span>` : ''}
      `;

      if (sparkEl) {
        sparkEl.innerHTML = '';
      }
    });
  });

  // Update Stats Overview Bar
  if (elements.statTotalVal) elements.statTotalVal.textContent = totalCount;
  if (elements.statOnlineVal) elements.statOnlineVal.textContent = onlineCount;
  if (elements.statWarningVal) elements.statWarningVal.textContent = warningCount;
  if (elements.statOfflineVal) elements.statOfflineVal.textContent = offlineCount;
}

// Drag & Drop & Tile Interactions
function attachCardEvents() {
  // Tile test probe button
  document.querySelectorAll('.btn-test-tile').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tileId = btn.dataset.tileId;
      btn.style.opacity = '0.5';
      showToast('Probing service...', 'info');
      try {
        const res = await fetch(`/api/probes/${tileId}`);
        const result = await res.json();
        AppState.probes[tileId] = result;
        updateProbeBadges();
        if (result.status === 'online') {
          showToast(`Probe success: response in ${result.latency || 0}ms`, 'success');
        } else {
          showToast(`Probe failed: ${result.error || result.status}`, 'error');
        }
      } catch (err) {
        showToast('Probe error: ' + err.message, 'error');
      } finally {
        btn.style.opacity = '1';
      }
    });
  });

  // Tile edit & delete
  document.querySelectorAll('.btn-edit-tile').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openTileModal(btn.dataset.catId, btn.dataset.tileId);
    });
  });

  document.querySelectorAll('.btn-del-tile').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteTile(btn.dataset.catId, btn.dataset.tileId);
    });
  });

  // Category edit & delete
  document.querySelectorAll('.btn-edit-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      openCategoryModal(btn.dataset.id);
    });
  });

  document.querySelectorAll('.btn-del-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteCategory(btn.dataset.id);
    });
  });

  // Category Island Size Switcher (Column 1-col, Wide 2-col, or Full-row)
  document.querySelectorAll('.btn-island-size').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const catId = btn.dataset.catId;
      const newLayout = btn.dataset.layout;
      const cat = AppState.config?.categories.find(c => c.id === catId);
      if (cat) {
        cat.layout = newLayout;
        await saveConfigToServer();
        renderDashboard();
        const layoutLabels = {
          vertical: 'تک ستون (Single Column)',
          wide: 'دو ستون (Wide Island)',
          horizontal: 'ردیف تمام‌عرض (Full Row)'
        };
        showToast(`چیدمان "${cat.name}" به ${layoutLabels[newLayout] || newLayout} تغییر یافت`, 'info');
      }
    });
  });

  // Category Display Style Switcher (Island Card Grid vs Horizontal Pills)
  document.querySelectorAll('.btn-cat-style').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const catId = btn.dataset.catId;
      const newStyle = btn.dataset.style;
      const cat = AppState.config?.categories.find(c => c.id === catId);
      if (cat) {
        cat.tile_style = newStyle;
        await saveConfigToServer();
        renderDashboard();
        const styleLabels = {
          grid: 'کارت‌های جزیره‌ای (Island Cards)',
          pill: 'ردیف‌های کپسولی (Capsule Pills)'
        };
        showToast(`حالت نمایش "${cat.name}" به ${styleLabels[newStyle] || newStyle} تغییر یافت`, 'info');
      }
    });
  });

  // Category Tile & Icon Size Switcher (Compact, Medium, Large)
  document.querySelectorAll('.btn-cat-size').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const catId = btn.dataset.catId;
      const newSize = btn.dataset.size;
      const cat = AppState.config?.categories.find(c => c.id === catId);
      if (cat) {
        cat.tile_size = newSize;
        await saveConfigToServer();
        renderDashboard();
        const sizeLabels = {
          compact: 'کوچک و فشرده (Compact)',
          medium: 'متوسط (Medium)',
          large: 'بزرگ جزیره‌ای (Large)'
        };
        showToast(`اندازه آیکون‌های "${cat.name}" به ${sizeLabels[newSize] || newSize} تنظیم شد`, 'info');
      }
    });
  });

  // Directional Arrange Buttons (1-click moves anywhere)
  document.querySelectorAll('.btn-cat-move-left').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleCategoryShift(btn.dataset.catId, -1);
    });
  });

  document.querySelectorAll('.btn-cat-move-right').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleCategoryShift(btn.dataset.catId, 1);
    });
  });

  // Category Column Position Cycle (Auto -> Col 1 -> Col 2 -> Col 3 -> Col 4 -> Auto)
  document.querySelectorAll('.btn-island-col').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const catId = btn.dataset.catId;
      const cat = AppState.config?.categories.find(c => c.id === catId);
      if (cat) {
        const order = ['auto', '1', '2', '3', '4'];
        const current = cat.col_start || 'auto';
        const nextIdx = (order.indexOf(current) + 1) % order.length;
        const nextVal = order[nextIdx];
        cat.col_start = nextVal !== 'auto' ? nextVal : undefined;
        await saveConfigToServer();
        renderDashboard();
        const colMsg = nextVal !== 'auto' ? `ستون ${nextVal}` : 'تراز خودکار (Auto Flow)';
        showToast(`موقعیت ستون "${cat.name}" به ${colMsg} تنظیم شد`, 'info');
      }
    });
  });

  // Category Group Transparency Toggle (Glass vs 100% Transparent)
  document.querySelectorAll('.btn-island-trans').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const catId = btn.dataset.catId;
      const cat = AppState.config?.categories.find(c => c.id === catId);
      if (cat) {
        cat.bg_style = (cat.bg_style === 'transparent') ? undefined : 'transparent';
        await saveConfigToServer();
        renderDashboard();
        showToast(`شفافیت گروه "${cat.name}" ${cat.bg_style === 'transparent' ? 'فعال شد (کاملاً شفاف)' : 'به شیشه‌ای مات بازگشت'}`, 'info');
      }
    });
  });

  // Category Icon Contrast Light Plate Toggle (for dark / black logos)
  document.querySelectorAll('.btn-island-plate').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const catId = btn.dataset.catId;
      const cat = AppState.config?.categories.find(c => c.id === catId);
      if (cat) {
        cat.icon_plate = (cat.icon_plate === 'light') ? undefined : 'light';
        await saveConfigToServer();
        renderDashboard();
        showToast(`بستر سفید روشن آیکون‌های "${cat.name}" ${cat.icon_plate === 'light' ? 'فعال شد (حل مشکل لوگوی مشکی)' : 'غیرفعال شد'}`, 'info');
      }
    });
  });

  document.querySelectorAll('.btn-tile-up').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      handleTileShift(btn.dataset.catId, btn.dataset.tileId, -1);
    });
  });

  document.querySelectorAll('.btn-tile-down').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      handleTileShift(btn.dataset.catId, btn.dataset.tileId, 1);
    });
  });

  document.querySelectorAll('.btn-tile-next-cat').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      handleTileMoveToNextCat(btn.dataset.catId, btn.dataset.tileId);
    });
  });

  // Drag & Drop reorder events (Admin Only)
  if (AppState.authRole === 'admin') {
    // 1. Category Sections Drag & Drop
    const catSections = document.querySelectorAll('.category-section');
    catSections.forEach(cat => {
      cat.addEventListener('dragstart', (e) => {
        if (e.target.closest('.tile-card')) return;
        AppState.draggedCatId = cat.dataset.catId;
        cat.classList.add('dragging-cat');
        e.dataTransfer.setData('type', 'category');
        e.dataTransfer.setData('catId', cat.dataset.catId);
      });

      cat.addEventListener('dragend', () => {
        cat.classList.remove('dragging-cat');
        document.querySelectorAll('.category-section').forEach(c => c.classList.remove('drag-over-cat'));
      });

      cat.addEventListener('dragover', (e) => {
        e.preventDefault();
        cat.classList.add('drag-over-cat');
      });

      cat.addEventListener('dragleave', (e) => {
        if (!cat.contains(e.relatedTarget)) {
          cat.classList.remove('drag-over-cat');
        }
      });

      cat.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        cat.classList.remove('drag-over-cat');
        const dragType = e.dataTransfer.getData('type') || (AppState.draggedCatId ? 'category' : 'tile');
        if (dragType === 'category' && AppState.draggedCatId) {
          handleCategoryReorder(AppState.draggedCatId, cat.dataset.catId);
          AppState.draggedCatId = null;
        } else if (dragType === 'tile' && AppState.draggedTileId) {
          handleTileReorder(AppState.draggedSourceCatId, AppState.draggedTileId, cat.dataset.catId, null);
          AppState.draggedTileId = null;
        }
      });
    });

    // 2. Tile Cards Drag & Drop
    let lastDragTime = 0;
    const cards = document.querySelectorAll('.tile-card');
    cards.forEach(card => {
      card.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        lastDragTime = Date.now();
        AppState.draggedTileId = card.dataset.tileId;
        AppState.draggedSourceCatId = card.dataset.catId;
        card.classList.add('dragging');
        e.dataTransfer.setData('type', 'tile');
        e.dataTransfer.setData('tileId', card.dataset.tileId);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        document.querySelectorAll('.tile-card').forEach(c => c.classList.remove('drag-over-tile'));
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        card.classList.add('drag-over-tile');
      });

      card.addEventListener('dragleave', (e) => {
        if (!card.contains(e.relatedTarget)) {
          card.classList.remove('drag-over-tile');
        }
      });

      card.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        card.classList.remove('drag-over-tile');
        if (AppState.draggedTileId) {
          const targetTileId = card.dataset.tileId;
          const targetCatId = card.dataset.catId;
          handleTileReorder(AppState.draggedSourceCatId, AppState.draggedTileId, targetCatId, targetTileId);
          AppState.draggedTileId = null;
        }
      });

      // Prevent navigation if just dragged
      const link = card.querySelector('.tile-main-link');
      if (link) {
        link.addEventListener('click', (e) => {
          if (Date.now() - lastDragTime < 300) {
            e.preventDefault();
            e.stopPropagation();
          }
        });
      }
    });

    // 3. Empty dropzones
    document.querySelectorAll('.empty-dropzone').forEach(zone => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-over-tile');
      });
      zone.addEventListener('dragleave', () => {
        zone.classList.remove('drag-over-tile');
      });
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('drag-over-tile');
        if (AppState.draggedTileId) {
          handleTileReorder(AppState.draggedSourceCatId, AppState.draggedTileId, zone.dataset.catId, null);
          AppState.draggedTileId = null;
        }
      });
    });
  }
}

// Reorder Groups & Categories
function handleCategoryShift(catId, direction) {
  if (!AppState.config?.categories) return;
  const cats = AppState.config.categories;
  const idx = cats.findIndex(c => c.id === catId);
  if (idx === -1) return;
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= cats.length) return;
  const [moved] = cats.splice(idx, 1);
  cats.splice(targetIdx, 0, moved);
  saveConfigToServer('Category order saved');
  renderDashboard();
}

function handleCategoryReorder(sourceCatId, targetCatId) {
  if (!AppState.config?.categories || sourceCatId === targetCatId) return;
  const cats = AppState.config.categories;
  const sIdx = cats.findIndex(c => c.id === sourceCatId);
  const tIdx = cats.findIndex(c => c.id === targetCatId);
  if (sIdx === -1 || tIdx === -1) return;
  const [moved] = cats.splice(sIdx, 1);
  cats.splice(tIdx, 0, moved);
  saveConfigToServer('Category order saved');
  renderDashboard();
}

// Reorder Tiles & Items
function handleTileShift(catId, tileId, direction) {
  if (!AppState.config?.categories) return;
  const cat = AppState.config.categories.find(c => c.id === catId);
  if (!cat || !cat.tiles) return;
  const idx = cat.tiles.findIndex(t => t.id === tileId);
  if (idx === -1) return;
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= cat.tiles.length) return;
  const [moved] = cat.tiles.splice(idx, 1);
  cat.tiles.splice(targetIdx, 0, moved);
  saveConfigToServer('Tile layout saved');
  renderDashboard();
}

function handleTileMoveToNextCat(catId, tileId) {
  if (!AppState.config?.categories) return;
  const cats = AppState.config.categories;
  const catIdx = cats.findIndex(c => c.id === catId);
  if (catIdx === -1) return;
  const nextCatIdx = (catIdx + 1) % cats.length;
  const sourceCat = cats[catIdx];
  const targetCat = cats[nextCatIdx];
  const tileIdx = sourceCat.tiles.findIndex(t => t.id === tileId);
  if (tileIdx === -1) return;
  const [moved] = sourceCat.tiles.splice(tileIdx, 1);
  targetCat.tiles = targetCat.tiles || [];
  targetCat.tiles.push(moved);
  saveConfigToServer(`Tile moved to "${targetCat.name}"`);
  renderDashboard();
}

// Reorder Tiles Logic
function handleTileReorder(sourceCatId, tileId, targetCatId, targetTileId) {
  if (!AppState.config) return;

  const sourceCat = AppState.config.categories.find(c => c.id === sourceCatId);
  const targetCat = AppState.config.categories.find(c => c.id === targetCatId);
  if (!sourceCat || !targetCat) return;

  const tileIndex = sourceCat.tiles.findIndex(t => t.id === tileId);
  if (tileIndex === -1) return;

  const [movedTile] = sourceCat.tiles.splice(tileIndex, 1);
  const targetIndex = targetCat.tiles ? targetCat.tiles.findIndex(t => t.id === targetTileId) : -1;

  targetCat.tiles = targetCat.tiles || [];
  if (targetIndex !== -1) {
    targetCat.tiles.splice(targetIndex, 0, movedTile);
  } else {
    targetCat.tiles.push(movedTile);
  }

  saveConfigToServer('Tile layout saved');
  renderDashboard();
}

// Toggle Arrange Mode
function toggleArrangeMode(forceState) {
  if (AppState.authRole !== 'admin') {
    showToast('Permission denied: Only administrator can rearrange layout', 'error');
    return;
  }
  AppState.isArrangeMode = (forceState !== undefined) ? forceState : !AppState.isArrangeMode;
  document.body.classList.toggle('arrange-mode-active', AppState.isArrangeMode);

  const bar = document.getElementById('arrangeFloatingBar');
  if (bar) {
    bar.style.display = AppState.isArrangeMode ? 'flex' : 'none';
  }

  const btnSide = document.getElementById('sideNavArrange');
  if (btnSide) {
    btnSide.classList.toggle('active', AppState.isArrangeMode);
  }

  const btnHeader = document.getElementById('btnHeaderArrange');
  if (btnHeader) {
    btnHeader.classList.toggle('active', AppState.isArrangeMode);
  }

  renderDashboard();
  showToast(AppState.isArrangeMode ? 'Arrange mode active: Drag tiles and categories to reorder.' : 'Layout saved.', 'info');
}

// Save Config to Server
async function saveConfigToServer(successMsg = 'Settings saved') {
  if (AppState.authRole !== 'admin') {
    showToast('Permission denied: Only administrator can modify settings', 'error');
    return;
  }
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: AppState.config,
        pin: AppState.adminPin || sessionStorage.getItem('dimdash_pin') || ''
      })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save');
    }
    showToast(successMsg, 'success');
  } catch (err) {
    showToast('Error saving: ' + err.message, 'error');
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Search
  elements.searchBar?.addEventListener('input', (e) => {
    AppState.searchQuery = e.target.value;
    if (AppState.currentView !== 'apps') {
      switchDashboardView('apps');
    }
    renderGrid();
  });

  // Spotlight Search open / close
  elements.sideNavSearch?.addEventListener('click', () => openSpotlightSearch());
  elements.spotlightCloseBtn?.addEventListener('click', () => closeSpotlightSearch());
  elements.spotlightSearchOverlay?.addEventListener('click', (e) => {
    if (e.target === elements.spotlightSearchOverlay) {
      closeSpotlightSearch();
    }
  });

  // Sidebar Submenus toggle on click & close on outside click
  document.querySelectorAll('.sidebar-item-with-submenu').forEach(item => {
    const trigger = item.querySelector('.sidebar-btn, .sidebar-logo');
    trigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.sidebar-item-with-submenu').forEach(other => other.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });

  document.querySelectorAll('.submenu-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-item-with-submenu').forEach(item => item.classList.remove('open'));
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.sidebar-item-with-submenu')) {
      document.querySelectorAll('.sidebar-item-with-submenu').forEach(item => item.classList.remove('open'));
    }
  });

  // Authentication & Access Role Unlock
  elements.authToggleBtn?.addEventListener('click', () => openAuthModal());
  elements.authSubmitBtn?.addEventListener('click', () => submitAuth());
  elements.authLogoutBtn?.addEventListener('click', () => logoutAuth());
  elements.authPinInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitAuth();
  });

  // Action Buttons
  elements.addTileBtn?.addEventListener('click', () => openTileModal());
  elements.addCategoryBtn?.addEventListener('click', () => openCategoryModal());
  elements.themeBtn?.addEventListener('click', () => openThemeModal());
  elements.yamlBtn?.addEventListener('click', () => openYamlModal());

  // Widget Action Buttons
  elements.btnAddWidgetBtn?.addEventListener('click', () => openWidgetModal());
  elements.addHeaderWidgetBtn?.addEventListener('click', () => openWidgetModal());
  elements.btnAddChartFromMenu?.addEventListener('click', () => {
    if (window.openChartManageModal) window.openChartManageModal();
  });
  elements.btnToggleWidgetsCollapse?.addEventListener('click', () => toggleWidgetsCollapse());
  elements.btnSaveWidget?.addEventListener('click', () => saveNewWidget());

  // Multi-Cluster Management Listeners
  elements.btnManageClustersBtn?.addEventListener('click', () => openServerManagerModal());
  elements.sideNavClustersBtn?.addEventListener('click', () => openServerManagerModal());
  elements.btnSaveNewServer?.addEventListener('click', () => saveNewServer());
  elements.newServerTypeSelect?.addEventListener('change', (e) => toggleServerTypeFields(e.target.value));
  elements.newServerIdInput?.addEventListener('input', () => updateAgentSnippet());
  elements.newServerTokenInput?.addEventListener('input', () => updateAgentSnippet());

  // Test all probes button
  if (elements.btnTestAllProbes) {
    elements.btnTestAllProbes.addEventListener('click', async () => {
      elements.btnTestAllProbes.style.opacity = '0.5';
      showToast('Probing all services...', 'info');
      try {
        const res = await fetch('/api/probes/test-all', { method: 'POST' });
        const data = await res.json();
        if (data.results) {
          AppState.probes = data.results;
          updateProbeBadges();
          showToast(`Probe sweep complete: ${data.count} services checked`, 'success');
        }
      } catch (err) {
        showToast('Probe sweep error: ' + err.message, 'error');
      } finally {
        elements.btnTestAllProbes.style.opacity = '1';
      }
    });
  }

  // Hide & Restore Stats Overview Bar
  const btnHideStats = document.getElementById('btnHideStatsBar');
  if (btnHideStats) {
    btnHideStats.addEventListener('click', async (e) => {
      e.stopPropagation();
      AppState.config.settings = AppState.config.settings || {};
      AppState.config.settings.show_stats_bar = false;
      await saveConfigToServer();
      renderDashboard();
      showToast('نوار وضعیت سرویس‌ها مخفی شد (از طریق دکمه "نمایش نوار وضعیت" یا در تنظیمات قابل بازگردانی است)', 'info');
    });
  }

  const btnRestoreStats = document.getElementById('btnRestoreStatsBar');
  if (btnRestoreStats) {
    btnRestoreStats.addEventListener('click', async (e) => {
      e.stopPropagation();
      AppState.config.settings = AppState.config.settings || {};
      AppState.config.settings.show_stats_bar = true;
      await saveConfigToServer();
      renderDashboard();
      showToast('نوار وضعیت سرویس‌ها بازگردانی و نمایان شد', 'success');
    });
  }

  // Sidebar & Arrange buttons
  if (elements.sideNavArrange) {
    elements.sideNavArrange.addEventListener('click', () => toggleArrangeMode());
  }
  if (elements.btnHeaderArrange) {
    elements.btnHeaderArrange.addEventListener('click', () => toggleArrangeMode());
  }
  if (elements.btnFinishArrange) {
    elements.btnFinishArrange.addEventListener('click', () => toggleArrangeMode(false));
  }

  // View Switcher: Apps (Tiles) vs Gauges & Charts (Monitoring)
  function switchDashboardView(viewName) {
    const isMonitoring = viewName === 'server-monitor' || viewName === 'monitoring';
    AppState.currentView = isMonitoring ? 'server-monitor' : 'apps';
    
    document.body.classList.toggle('page-view-monitoring', isMonitoring);
    document.body.classList.toggle('page-view-apps', !isMonitoring);

    const isStageEnabled = AppState.config?.settings?.experimental?.stage !== false && window.DimDashStage;
    const stageMount = document.getElementById('stageMount');

    if (stageMount) {
      stageMount.style.setProperty('display', (isStageEnabled && !isMonitoring) ? 'block' : 'none', 'important');
    }

    // 1. Gauges & Widgets Section (Clock, Gauges, Charts) - hidden in Stage mode or Monitoring
    const widgetsSection = document.getElementById('widgetsSection');
    if (widgetsSection) {
      if (isStageEnabled || isMonitoring) {
        widgetsSection.style.setProperty('display', 'none', 'important');
      } else {
        widgetsSection.style.removeProperty('display');
      }
    }

    // 2. Server Monitor Time-Series Charts
    if (elements.serverMonitorView) {
      elements.serverMonitorView.style.setProperty('display', isMonitoring ? 'block' : 'none', 'important');
    }

    // 3. Apps / Tiles Section (Legacy Grid)
    if (elements.contentArea) {
      elements.contentArea.style.setProperty('display', (!isStageEnabled && !isMonitoring) ? 'grid' : 'none', 'important');
    }
    
    // 4. Sub Navigation Category Tabs (Legacy Grid)
    const subNav = document.querySelector('.sub-nav');
    if (subNav) {
      subNav.style.setProperty('display', (!isStageEnabled && !isMonitoring) ? 'flex' : 'none', 'important');
    }
    
    // 5. Telemetry Stats Bar
    renderStatsBarVisibility();

    if (elements.sideNavAll) elements.sideNavAll.classList.toggle('active', !isMonitoring);
    if (elements.sideNavCharts) elements.sideNavCharts.classList.toggle('active', isMonitoring);

    if (isMonitoring) {
      if (window.initServerCharts) {
        window.initServerCharts();
      }
      requestAnimationFrame(() => {
        if (window.ServerMonitorState?.charts) {
          Object.values(window.ServerMonitorState.charts).forEach(c => {
            if (c.setupRetina) c.setupRetina();
            if (c.draw) c.draw();
          });
        }
      });
    } else {
      if (isStageEnabled) {
        if (AppState.stageRenderer && AppState.board) {
          AppState.stageRenderer.setBoard(AppState.board);
        }
        updateWidgetValues();
      } else {
        renderWidgets();
        renderGrid();
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  window.switchDashboardView = switchDashboardView;

  if (elements.sideNavCharts) {
    elements.sideNavCharts.addEventListener('click', () => switchDashboardView('server-monitor'));
  }

  if (elements.sideNavAll) {
    elements.sideNavAll.addEventListener('click', () => {
      switchDashboardView('apps');
      AppState.activeCategory = 'all';
      renderCategoryTabs();
      renderGrid();
    });
  }
  if (elements.sideNavRefresh) {
    elements.sideNavRefresh.addEventListener('click', () => {
      if (elements.btnTestAllProbes) elements.btnTestAllProbes.click();
    });
  }
  if (elements.sideNavTheme) {
    elements.sideNavTheme.addEventListener('click', () => openThemeModal());
  }
  if (elements.sideNavLock) {
    elements.sideNavLock.addEventListener('click', () => openAuthModal());
  }
}

// --------------------------------------------------------------------------
// MODALS
// --------------------------------------------------------------------------

function closeAllModals() {
  document.querySelectorAll('.modal-backdrop').forEach(m => {
    m.classList.remove('open');
    m.style.display = '';
  });
}
window.closeAllModals = closeAllModals;

// Delegated click listener for bulletproof modal closing (backdrop, close buttons, cancel)
document.addEventListener('click', (e) => {
  // Backdrop click (click outside modal-window)
  if (e.target.classList && e.target.classList.contains('modal-backdrop')) {
    closeAllModals();
    return;
  }
  // Modal header close button (×) or footer cancel/close buttons
  const closeBtn = e.target.closest('.modal-header .btn-icon, .modal-footer [onclick*="closeAllModals"], [data-modal-close]');
  if (closeBtn && closeBtn.closest('.modal-backdrop')) {
    e.preventDefault();
    closeAllModals();
  }
});

// Escape key closes open modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllModals();
  }
});

// Auth UI & Role State Synchronizer
function updateAuthUI() {
  const role = AppState.authRole || 'guest';
  const isAdmin = (role === 'admin');
  AppState.isAdmin = isAdmin;

  // Toggle body classes
  document.body.classList.toggle('admin-mode', isAdmin);
  document.body.classList.toggle('role-guest', role === 'guest');
  document.body.classList.toggle('role-user', role === 'user');
  document.body.classList.toggle('role-admin', isAdmin);

  // Update auth button in sidebar
  if (elements.authToggleBtn) {
    elements.authToggleBtn.className = `sidebar-btn auth-toggle-btn role-${role}`;
    let tooltipText = 'Login / Unlock Access (Guest)';
    if (role === 'user') tooltipText = 'Member Mode (Click to manage session)';
    if (role === 'admin') tooltipText = 'Admin Mode (Click to lock or exit)';
    elements.authToggleBtn.setAttribute('data-tooltip', tooltipText);
  }

  // Update modal views if open
  if (elements.currentAuthRolePill) {
    elements.currentAuthRolePill.className = `auth-role-pill role-${role}`;
    if (role === 'admin') {
      elements.currentAuthRolePill.textContent = '🛡️ Administrator (Full Control)';
    } else if (role === 'user') {
      elements.currentAuthRolePill.textContent = '🔒 Member (Private Apps Unlocked)';
    } else {
      elements.currentAuthRolePill.textContent = '👤 Guest (Read-Only)';
    }
  }

  if (elements.authLoginForm && elements.authActiveSessionView) {
    if (role === 'guest') {
      elements.authLoginForm.style.display = 'block';
      elements.authActiveSessionView.style.display = 'none';
      if (elements.authSubmitBtn) elements.authSubmitBtn.style.display = 'inline-flex';
    } else {
      elements.authLoginForm.style.display = 'none';
      elements.authActiveSessionView.style.display = 'block';
      if (elements.authSubmitBtn) elements.authSubmitBtn.style.display = 'none';
      if (elements.authActiveDesc) {
        elements.authActiveDesc.innerHTML = role === 'admin'
          ? 'You are signed in as <strong>Administrator</strong>. Full editing, tile customization, and system controls are active.'
          : 'You are signed in as <strong>Authorized Member</strong>. Protected user tiles are visible.';
      }
    }
  }
}

function openAuthModal() {
  updateAuthUI();
  if (elements.authPinInput) elements.authPinInput.value = '';
  if (elements.authErrorMsg) elements.authErrorMsg.textContent = '';
  if (elements.authModal) {
    elements.authModal.classList.add('open');
    if (AppState.authRole === 'guest' && elements.authPinInput) {
      setTimeout(() => elements.authPinInput.focus(), 100);
    }
  }
}

async function submitAuth() {
  const pin = elements.authPinInput?.value?.trim() || '';
  if (!pin) {
    if (elements.authErrorMsg) elements.authErrorMsg.textContent = 'Please enter PIN or passcode';
    return;
  }
  if (elements.authErrorMsg) elements.authErrorMsg.textContent = '';

  try {
    // 1. First test if it's Admin PIN
    const adminRes = await fetch('/api/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });

    if (adminRes.ok) {
      AppState.authRole = 'admin';
      AppState.isAdmin = true;
      AppState.adminPin = pin;
      sessionStorage.setItem('dimdash_role', 'admin');
      sessionStorage.setItem('dimdash_pin', pin);
      updateAuthUI();
      closeAllModals();
      showToast('🛡️ Welcome Administrator! Full editing unlocked.', 'success');
      renderDashboard();
      return;
    }

    // 2. Next test if it's User PIN
    const userRes = await fetch('/api/verify-user-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });

    if (userRes.ok) {
      AppState.authRole = 'user';
      AppState.isAdmin = false;
      AppState.adminPin = '';
      sessionStorage.setItem('dimdash_role', 'user');
      sessionStorage.setItem('dimdash_pin', pin);
      updateAuthUI();
      closeAllModals();
      showToast('🔒 User authenticated: private services unlocked.', 'success');
      renderDashboard();
      return;
    }

    if (elements.authErrorMsg) {
      elements.authErrorMsg.textContent = 'Invalid PIN code. Access denied.';
    }
  } catch (err) {
    if (elements.authErrorMsg) {
      elements.authErrorMsg.textContent = 'Authentication error: ' + err.message;
    }
  }
}

function logoutAuth() {
  AppState.authRole = 'guest';
  AppState.isAdmin = false;
  AppState.adminPin = '';
  sessionStorage.removeItem('dimdash_role');
  sessionStorage.removeItem('dimdash_pin');
  toggleArrangeMode(false);
  updateAuthUI();
  closeAllModals();
  showToast('Logged out: Returning to read-only Guest mode.', 'info');
  renderDashboard();
}

const openPinModal = openAuthModal;

// Tile Modal
function openTileModal(catId = null, tileId = null) {
  const modal = document.getElementById('tileModal');
  const isEdit = !!tileId;
  document.getElementById('tileModalTitle').textContent = isEdit ? 'Edit Service' : 'Add New Service';

  // Fill categories dropdown
  const catSelect = document.getElementById('tileCategorySelect');
  catSelect.innerHTML = (AppState.config?.categories || []).map(c => `
    <option value="${c.id}" ${catId === c.id ? 'selected' : ''}>${c.name}</option>
  `).join('');

  // Target tile data if edit
  let existing = null;
  if (isEdit) {
    const cat = AppState.config?.categories.find(c => c.id === catId);
    existing = cat?.tiles.find(t => t.id === tileId);
  }

  // Icon choices with visual grid & search
  const iconPicker = document.getElementById('tileIconPicker');
  const iconSearchInput = document.getElementById('tileIconSearchInput');
  const customIconFileInput = document.getElementById('tileCustomIconFile');
  
  let selectedIconType = existing?.icon_type || (existing?.icon_value?.startsWith('/icons/') ? 'image' : 'preset');
  let selectedIconValue = existing?.icon_value || 'server';

  const renderIconGrid = (filterQuery = '') => {
    const allIcons = IconCatalog.getAll();
    const heimdallApps = IconCatalog.getHeimdallApps() || [];
    const query = filterQuery.toLowerCase().trim();
    let html = '';

    // If custom uploaded or Heimdall image icon is currently selected, show it at the front
    if (selectedIconType === 'uploaded' || selectedIconType === 'image') {
      html += `
        <div class="icon-cell selected" data-type="${selectedIconType}" data-val="${selectedIconValue}" title="Selected Icon">
          <img src="${selectedIconValue}" style="width:28px;height:28px;object-fit:contain;" />
          <span class="icon-cell-name">Selected</span>
        </div>
      `;
    }

    // 1. Built-in Preset Vectors
    Object.keys(allIcons).forEach(key => {
      const iconVal = allIcons[key];
      if (typeof iconVal !== 'string' || !iconVal.trim().startsWith('<svg')) return;
      if (query && !key.toLowerCase().includes(query)) return;
      const isSelected = selectedIconType === 'preset' && selectedIconValue === key;
      html += `
        <div class="icon-cell ${isSelected ? 'selected' : ''}" data-type="preset" data-val="${key}" data-name="${key}" title="${key}">
          ${iconVal}
          <span class="icon-cell-name">${key}</span>
        </div>
      `;
    });

    // 2. Heimdall Foundation App Icons (680+ apps)
    const matchingHeimdall = heimdallApps.filter(app => {
      if (!query) return true;
      return (
        app.name.toLowerCase().includes(query) ||
        app.id.toLowerCase().includes(query) ||
        (app.description && app.description.toLowerCase().includes(query))
      );
    });

    const displayLimit = query ? 200 : 90;
    matchingHeimdall.slice(0, displayLimit).forEach(app => {
      const isSelected = (selectedIconType === 'image' && selectedIconValue === app.icon_url) ||
                         (selectedIconValue === app.id);
      html += `
        <div class="icon-cell ${isSelected ? 'selected' : ''}" data-type="image" data-val="${app.icon_url}" data-name="${app.name}" title="${app.name} (Heimdall Foundation)">
          <img src="${app.icon_url}" alt="" style="width:28px;height:28px;object-fit:contain;overflow:hidden;" loading="lazy" onerror="this.style.display='none'" />
          <span class="icon-cell-name">${app.name}</span>
        </div>
      `;
    });

    iconPicker.innerHTML = html || '<div style="color:#64748b; font-size:0.8rem; padding:1.5rem; grid-column:1/-1; text-align:center;">No icons found</div>';

    iconPicker.querySelectorAll('.icon-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        iconPicker.querySelectorAll('.icon-cell').forEach(c => c.classList.remove('selected'));
        cell.classList.add('selected');
        selectedIconType = cell.dataset.type;
        selectedIconValue = cell.dataset.val;

        // Auto-fill title if empty
        const titleInput = document.getElementById('tileTitleInput');
        if (titleInput && !titleInput.value.trim() && cell.dataset.name) {
          titleInput.value = cell.dataset.name;
        }
      });
    });
  };

  renderIconGrid();

  if (iconSearchInput) {
    iconSearchInput.placeholder = 'Search 680+ Heimdall & system icons...';
    iconSearchInput.value = '';
    iconSearchInput.oninput = (e) => renderIconGrid(e.target.value);
  }

  // Custom icon file upload with auto-transparent background removal
  if (customIconFileInput) {
    customIconFileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          showToast('Processing transparent icon...', 'info');
          let base64 = evt.target.result;
          if (window.stripImageBackground) {
            try {
              base64 = await window.stripImageBackground(base64);
            } catch (stripErr) {
              console.warn('Background removal fallback:', stripErr);
            }
          }
          const cleanName = (file.name || 'custom_icon').replace(/\.[^.]+$/, '') + '.png';
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: cleanName, base64Data: base64 })
          });
          const data = await res.json();
          if (data.url) {
            selectedIconType = 'uploaded';
            selectedIconValue = data.url;
            renderIconGrid(iconSearchInput?.value || '');
            showToast('Transparent custom icon uploaded successfully', 'success');
          }
        } catch (err) {
          showToast('Failed to upload icon: ' + err.message, 'error');
        }
      };
      reader.readAsDataURL(file);
    };
  }

  document.getElementById('tileTitleInput').value = existing?.title || '';
  document.getElementById('tileSubtitleInput').value = existing?.subtitle || '';
  document.getElementById('tileUrlInput').value = existing?.target_url || '';
  document.getElementById('tileNewTabInput').checked = existing ? existing.open_in_new_tab !== false : true;
  document.getElementById('tileColorInput').value = existing?.bg_color || '';
  if (document.getElementById('tileVisibilitySelect')) {
    document.getElementById('tileVisibilitySelect').value = existing?.visibility || 'public';
  }
  if (document.getElementById('tileIconPlateSelect')) {
    document.getElementById('tileIconPlateSelect').value = existing?.icon_plate || 'none';
  }
  if (document.getElementById('tileBgStyleSelect')) {
    document.getElementById('tileBgStyleSelect').value = existing?.bg_style || 'default';
  }

  // Probe inputs
  const probe = existing?.probe || {};
  document.getElementById('probeTypeSelect').value = probe.type || 'none';
  document.getElementById('probeHostInput').value = probe.host || '';
  document.getElementById('probePortInput').value = probe.port || '';
  document.getElementById('probePathInput').value = probe.path || '';
  document.getElementById('probeIntervalInput').value = probe.interval || 15;
  document.getElementById('probeJsonPathInput').value = probe.json_path || '';
  document.getElementById('probeMetricLabelInput').value = probe.label || '';
  document.getElementById('probeMetricUnitInput').value = probe.unit || '';
  document.getElementById('probeIgnoreSslInput').checked = !!probe.ignore_ssl;

  modal.classList.add('open');

  document.getElementById('tileSaveBtn').onclick = () => {
    const title = document.getElementById('tileTitleInput').value.trim();
    const url = document.getElementById('tileUrlInput').value.trim();
    const targetCatId = catSelect.value;

    if (!title || !url) {
      showToast('Please enter service title and URL', 'error');
      return;
    }

    const icon_plate = document.getElementById('tileIconPlateSelect')?.value || 'none';
    const bg_style = document.getElementById('tileBgStyleSelect')?.value || 'default';

    const tileData = {
      id: existing ? existing.id : 'tile-' + Date.now(),
      title,
      subtitle: document.getElementById('tileSubtitleInput').value.trim(),
      target_url: url,
      open_in_new_tab: document.getElementById('tileNewTabInput').checked,
      visibility: document.getElementById('tileVisibilitySelect')?.value || 'public',
      icon_type: selectedIconType,
      icon_value: selectedIconValue,
      icon_plate: icon_plate !== 'none' ? icon_plate : undefined,
      bg_style: bg_style !== 'default' ? bg_style : undefined,
      bg_color: document.getElementById('tileColorInput').value.trim() || undefined,
      probe: {
        type: document.getElementById('probeTypeSelect').value,
        host: document.getElementById('probeHostInput').value.trim() || undefined,
        port: parseInt(document.getElementById('probePortInput').value, 10) || undefined,
        path: document.getElementById('probePathInput').value.trim() || undefined,
        interval: parseInt(document.getElementById('probeIntervalInput').value, 10) || 15,
        json_path: document.getElementById('probeJsonPathInput').value.trim() || undefined,
        label: document.getElementById('probeMetricLabelInput').value.trim() || undefined,
        unit: document.getElementById('probeMetricUnitInput').value.trim() || undefined,
        ignore_ssl: document.getElementById('probeIgnoreSslInput').checked
      }
    };

    const targetCategory = AppState.config.categories.find(c => c.id === targetCatId);
    if (!targetCategory) return;
    targetCategory.tiles = targetCategory.tiles || [];

    if (isEdit) {
      // Remove from old cat if moved
      if (catId !== targetCatId) {
        const oldCat = AppState.config.categories.find(c => c.id === catId);
        if (oldCat) {
          oldCat.tiles = oldCat.tiles.filter(t => t.id !== tileId);
        }
        targetCategory.tiles.push(tileData);
      } else {
        const idx = targetCategory.tiles.findIndex(t => t.id === tileId);
        if (idx !== -1) targetCategory.tiles[idx] = tileData;
      }
    } else {
      targetCategory.tiles.push(tileData);
    }

    saveConfigToServer(isEdit ? 'Service tile updated' : 'New service tile added');
    modal.classList.remove('open');
    renderDashboard();
  };
}

function deleteTile(catId, tileId) {
  if (!confirm('Are you sure you want to delete this service?')) return;
  const cat = AppState.config?.categories.find(c => c.id === catId);
  if (!cat) return;
  cat.tiles = cat.tiles.filter(t => t.id !== tileId);
  saveConfigToServer('Service deleted');
  renderDashboard();
}

// Category Modal
function openCategoryModal(catId = null) {
  const modal = document.getElementById('categoryModal');
  const isEdit = !!catId;
  document.getElementById('categoryModalTitle').textContent = isEdit ? 'Edit Category' : 'Add New Category';

  let existing = null;
  if (isEdit) {
    existing = AppState.config?.categories.find(c => c.id === catId);
  }

  document.getElementById('catNameInput').value = existing?.name || '';
  document.getElementById('catColorInput').value = existing?.color || '#6366f1';
  const layoutSelect = document.getElementById('catLayoutSelect');
  if (layoutSelect) {
    layoutSelect.value = existing?.layout || 'vertical';
  }
  const styleSelect = document.getElementById('catTileStyleSelect');
  if (styleSelect) {
    styleSelect.value = existing?.tile_style || 'grid';
  }
  const sizeSelect = document.getElementById('catTileSizeSelect');
  if (sizeSelect) {
    sizeSelect.value = existing?.tile_size || 'large';
  }
  const colStartSelect = document.getElementById('catColStartSelect');
  if (colStartSelect) {
    colStartSelect.value = existing?.col_start || 'auto';
  }
  const bgStyleSelect = document.getElementById('catBgStyleSelect');
  if (bgStyleSelect) {
    bgStyleSelect.value = existing?.bg_style || 'glass';
  }
  const iconPlateSelect = document.getElementById('catIconPlateSelect');
  if (iconPlateSelect) {
    iconPlateSelect.value = existing?.icon_plate || 'none';
  }

  modal.classList.add('open');

  document.getElementById('catSaveBtn').onclick = () => {
    const name = document.getElementById('catNameInput').value.trim();
    if (!name) {
      showToast('Please enter category name', 'error');
      return;
    }

    const color = document.getElementById('catColorInput').value;
    const layout = document.getElementById('catLayoutSelect')?.value || 'vertical';
    const tile_style = document.getElementById('catTileStyleSelect')?.value || 'grid';
    const tile_size = document.getElementById('catTileSizeSelect')?.value || 'large';
    const col_start = document.getElementById('catColStartSelect')?.value || 'auto';
    const bg_style = document.getElementById('catBgStyleSelect')?.value || 'glass';
    const icon_plate = document.getElementById('catIconPlateSelect')?.value || 'none';

    if (isEdit && existing) {
      existing.name = name;
      existing.color = color;
      existing.layout = layout;
      existing.tile_style = tile_style;
      existing.tile_size = tile_size;
      existing.col_start = col_start !== 'auto' ? col_start : undefined;
      existing.bg_style = bg_style !== 'glass' ? bg_style : undefined;
      existing.icon_plate = icon_plate !== 'none' ? icon_plate : undefined;
    } else {
      AppState.config.categories = AppState.config.categories || [];
      AppState.config.categories.push({
        id: 'cat-' + Date.now(),
        name,
        color,
        layout,
        tile_style,
        tile_size,
        col_start: col_start !== 'auto' ? col_start : undefined,
        bg_style: bg_style !== 'glass' ? bg_style : undefined,
        icon_plate: icon_plate !== 'none' ? icon_plate : undefined,
        icon: 'folder',
        is_collapsed: false,
        tiles: []
      });
    }

    saveConfigToServer(isEdit ? 'Category updated' : 'Category created');
    modal.classList.remove('open');
    renderDashboard();
  };
}

function deleteCategory(catId) {
  const cat = AppState.config?.categories.find(c => c.id === catId);
  if (!cat) return;
  if ((cat.tiles || []).length > 0) {
    if (!confirm(`This category contains ${cat.tiles.length} services. Are you sure you want to delete it?`)) return;
  } else {
    if (!confirm('Are you sure you want to delete this category?')) return;
  }

  AppState.config.categories = AppState.config.categories.filter(c => c.id !== catId);
  saveConfigToServer('Category deleted');
  renderDashboard();
}

// Theme Studio Modal
function openThemeModal() {
  const modal = document.getElementById('themeModal');
  const theme = AppState.config?.settings?.theme || {};

  document.getElementById('themeTitleInput').value = AppState.config?.settings?.dashboard_title || 'DimDash Homelab';
  document.getElementById('themeAccentInput').value = theme.accent_color || '#6366f1';
  document.getElementById('themeBlurInput').value = theme.glass_blur || 16;
  document.getElementById('themeBlurVal').textContent = `${theme.glass_blur || 16}px`;
  document.getElementById('themeDensitySelect').value = theme.tile_density || 'normal';
  document.getElementById('themeCardStyleSelect').value = theme.card_style || 'pill';
  
  const dimVal = theme.wallpaper_dim !== undefined ? theme.wallpaper_dim : 45;
  document.getElementById('themeDimInput').value = dimVal;
  document.getElementById('themeDimVal').textContent = `${dimVal}%`;

  let selectedBgType = theme.background_type || 'image';
  let selectedBgValue = theme.background_value || '/wallpapers/twilight_pines.jpg';

  // Highlight active wallpaper card
  const wallpaperCards = document.querySelectorAll('#themeWallpaperGrid .wallpaper-card');
  wallpaperCards.forEach(card => {
    if (card.dataset.bg && !card.style.backgroundImage) {
      card.style.backgroundImage = `url('${card.dataset.bg}')`;
    }
  });

  const updateWallpaperCardsActive = () => {
    wallpaperCards.forEach(card => {
      const val = card.dataset.val;
      if (selectedBgType === 'image' && val === selectedBgValue) {
        card.classList.add('active');
      } else if (selectedBgType !== 'image' && val === 'none') {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  };
  updateWallpaperCardsActive();

  // Preset click
  wallpaperCards.forEach(card => {
    card.onclick = () => {
      const val = card.dataset.val;
      if (val === 'none') {
        selectedBgType = 'gradient';
        selectedBgValue = 'radial-gradient(circle at 10% 15%, rgba(99, 102, 241, 0.08), transparent 45%), radial-gradient(circle at 90% 85%, rgba(14, 165, 233, 0.06), transparent 50%)';
      } else {
        selectedBgType = 'image';
        selectedBgValue = val;
      }
      updateWallpaperCardsActive();
      // Live preview
      applyTheme({
        ...theme,
        background_type: selectedBgType,
        background_value: selectedBgValue,
        wallpaper_dim: parseInt(document.getElementById('themeDimInput').value, 10),
        card_style: document.getElementById('themeCardStyleSelect').value
      });
    };
  });

  // Unset wallpaper button
  const unsetBtn = document.getElementById('btnUnsetWallpaperBtn');
  if (unsetBtn) {
    unsetBtn.onclick = () => {
      selectedBgType = 'gradient';
      selectedBgValue = '';
      updateWallpaperCardsActive();
      applyTheme({
        ...theme,
        background_type: 'gradient',
        background_value: '',
        card_style: document.getElementById('themeCardStyleSelect').value
      });
      showToast('Wallpaper removed', 'info');
    };
  }

  // Custom wallpaper upload
  const customWallInput = document.getElementById('themeCustomWallpaperFile');
  if (customWallInput) {
    customWallInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          showToast('Uploading wallpaper...', 'info');
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name, base64Data: evt.target.result })
          });
          const data = await res.json();
          if (data.url) {
            selectedBgType = 'image';
            selectedBgValue = data.url;
            updateWallpaperCardsActive();
            applyTheme({
              ...theme,
              background_type: 'image',
              background_value: data.url,
              wallpaper_dim: parseInt(document.getElementById('themeDimInput').value, 10),
              card_style: document.getElementById('themeCardStyleSelect').value
            });
            showToast('Wallpaper applied successfully', 'success');
          }
        } catch (err) {
          showToast('Failed to upload wallpaper: ' + err.message, 'error');
        }
      };
      reader.readAsDataURL(file);
    };
  }

  // Dimmer live preview
  document.getElementById('themeDimInput').oninput = (e) => {
    document.getElementById('themeDimVal').textContent = `${e.target.value}%`;
    document.documentElement.style.setProperty('--wallpaper-dim', `${e.target.value / 100}`);
  };

  document.getElementById('themeBlurInput').oninput = (e) => {
    document.getElementById('themeBlurVal').textContent = `${e.target.value}px`;
    document.documentElement.style.setProperty('--glass-blur', `${e.target.value}px`);
  };

  // Card style live toggle
  document.getElementById('themeCardStyleSelect').onchange = (e) => {
    if (e.target.value === 'card') {
      document.body.classList.remove('card-style-pill');
    } else {
      document.body.classList.add('card-style-pill');
    }
  };

  // Background Logo / Watermark controls
  const inputBgLogoUrl = document.getElementById('themeBgLogoUrlInput');
  const inputBgLogoOpacity = document.getElementById('themeBgLogoOpacityInput');
  const valBgLogoOpacity = document.getElementById('themeBgLogoOpacityVal');
  const selectBgLogoPos = document.getElementById('themeBgLogoPosSelect');
  const selectBgLogoSize = document.getElementById('themeBgLogoSizeSelect');
  const selectBgLogoRepeat = document.getElementById('themeBgLogoRepeatSelect');
  const selectBgLogoPreset = document.getElementById('themeBgLogoPresetSelect');
  const btnClearBgLogo = document.getElementById('btnClearBgLogoBtn');
  const fileBgLogo = document.getElementById('themeCustomBgLogoFile');

  if (inputBgLogoUrl) inputBgLogoUrl.value = theme.bg_logo_url || '';
  if (inputBgLogoOpacity) {
    const curOp = theme.bg_logo_opacity !== undefined ? theme.bg_logo_opacity : 18;
    inputBgLogoOpacity.value = curOp;
    if (valBgLogoOpacity) valBgLogoOpacity.textContent = `${curOp}%`;
  }
  if (selectBgLogoPos) selectBgLogoPos.value = theme.bg_logo_position || 'center';
  if (selectBgLogoSize) selectBgLogoSize.value = theme.bg_logo_size || '550px';
  if (selectBgLogoRepeat) selectBgLogoRepeat.value = theme.bg_logo_repeat || 'no-repeat';

  function previewWatermark() {
    const bgLayer = document.getElementById('bgLogoOverlay');
    if (!bgLayer) return;
    const url = inputBgLogoUrl ? inputBgLogoUrl.value.trim() : '';
    if (url) {
      bgLayer.style.display = 'block';
      bgLayer.style.backgroundImage = `url("${url}")`;
      const op = inputBgLogoOpacity ? Number(inputBgLogoOpacity.value) / 100 : 0.18;
      bgLayer.style.opacity = String(op);
      const pos = selectBgLogoPos ? selectBgLogoPos.value : 'center';
      bgLayer.className = `bg-logo-overlay pos-${pos}`;
      bgLayer.style.backgroundSize = selectBgLogoSize ? selectBgLogoSize.value : '550px';
      bgLayer.style.backgroundRepeat = selectBgLogoRepeat ? selectBgLogoRepeat.value : 'no-repeat';
    } else {
      bgLayer.style.display = 'none';
      bgLayer.style.backgroundImage = 'none';
    }
  }

  if (inputBgLogoUrl) inputBgLogoUrl.oninput = previewWatermark;
  if (selectBgLogoPreset) {
    selectBgLogoPreset.onchange = (e) => {
      if (e.target.value) {
        inputBgLogoUrl.value = e.target.value;
        previewWatermark();
      }
    };
  }
  if (inputBgLogoOpacity) {
    inputBgLogoOpacity.oninput = (e) => {
      if (valBgLogoOpacity) valBgLogoOpacity.textContent = `${e.target.value}%`;
      previewWatermark();
    };
  }
  if (selectBgLogoPos) selectBgLogoPos.onchange = previewWatermark;
  if (selectBgLogoSize) selectBgLogoSize.onchange = previewWatermark;
  if (selectBgLogoRepeat) selectBgLogoRepeat.onchange = previewWatermark;

  if (btnClearBgLogo) {
    btnClearBgLogo.onclick = () => {
      if (inputBgLogoUrl) inputBgLogoUrl.value = '';
      if (selectBgLogoPreset) selectBgLogoPreset.value = '';
      previewWatermark();
      showToast('Background logo removed', 'info');
    };
  }

  if (fileBgLogo) {
    fileBgLogo.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          showToast('Processing transparent background logo...', 'info');
          let base64 = evt.target.result;
          if (window.stripImageBackground) {
            try {
              base64 = await window.stripImageBackground(base64);
            } catch (stripErr) {
              console.warn('Background removal fallback:', stripErr);
            }
          }
          const cleanName = (file.name || 'watermark_logo').replace(/\.[^.]+$/, '') + '.png';
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: cleanName, base64Data: base64 })
          });
          const data = await res.json();
          if (data.url) {
            inputBgLogoUrl.value = data.url;
            previewWatermark();
            showToast('Transparent logo applied to background', 'success');
          }
        } catch (err) {
          showToast('Failed to upload logo: ' + err.message, 'error');
        }
      };
      reader.readAsDataURL(file);
    };
  }

  const chkStats = document.getElementById('themeShowStatsBarInput');
  if (chkStats) chkStats.checked = AppState.config?.settings?.show_stats_bar !== false;

  const chkClock = document.getElementById('themeShowClockInput');
  if (chkClock) chkClock.checked = AppState.config?.settings?.show_clock !== false;

  modal.classList.add('open');

  document.getElementById('themeSaveBtn').onclick = () => {
    AppState.config.settings = AppState.config.settings || {};
    AppState.config.settings.dashboard_title = document.getElementById('themeTitleInput').value.trim() || 'DimDash';
    
    const chkStats = document.getElementById('themeShowStatsBarInput');
    if (chkStats) AppState.config.settings.show_stats_bar = chkStats.checked;

    const chkClock = document.getElementById('themeShowClockInput');
    if (chkClock) AppState.config.settings.show_clock = chkClock.checked;

    AppState.config.settings.theme = {
      ...AppState.config.settings.theme,
      accent_color: document.getElementById('themeAccentInput').value,
      glass_blur: parseInt(document.getElementById('themeBlurInput').value, 10),
      tile_density: document.getElementById('themeDensitySelect').value,
      card_style: document.getElementById('themeCardStyleSelect').value,
      background_type: selectedBgType,
      background_value: selectedBgValue,
      wallpaper_dim: parseInt(document.getElementById('themeDimInput').value, 10),
      bg_logo_url: inputBgLogoUrl ? inputBgLogoUrl.value.trim() : '',
      bg_logo_opacity: inputBgLogoOpacity ? parseInt(inputBgLogoOpacity.value, 10) : 18,
      bg_logo_position: selectBgLogoPos ? selectBgLogoPos.value : 'center',
      bg_logo_size: selectBgLogoSize ? selectBgLogoSize.value : '550px',
      bg_logo_repeat: selectBgLogoRepeat ? selectBgLogoRepeat.value : 'no-repeat'
    };

    applyTheme(AppState.config.settings.theme);
    saveConfigToServer('Theme, wallpaper and logo settings saved');
    modal.classList.remove('open');
    renderDashboard();
  };
}

// YAML Backup Modal
function openYamlModal() {
  const modal = document.getElementById('yamlModal');
  const textarea = document.getElementById('yamlRawText');
  textarea.value = JSON.stringify(AppState.config, null, 2);

  modal.classList.add('open');

  document.getElementById('yamlDownloadBtn').onclick = () => {
    const blob = new Blob([textarea.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dimdash-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
}
