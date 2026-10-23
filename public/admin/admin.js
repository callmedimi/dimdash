/**
 * DimDash Admin Studio Controller (v2.0)
 * Air-gapped homelab management console, data tables, live theme studio,
 * widgets management, and automatic transparent logo processing.
 */

const AdminState = {
  config: null,
  probes: {},
  stats: {},
  selectedTileIds: new Set(),
  currentEditingTile: null,
  currentEditingWidget: null,
  currentTab: 'overview'
};

document.addEventListener('DOMContentLoaded', async () => {
  await IconCatalog.init();
  setupTabNavigation();
  await loadAdminData();
  setupEventListeners();
});

// Toast notification for admin
function showAdminToast(msg, type = 'info') {
  const container = document.getElementById('adminToastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// Tab Switching
function setupTabNavigation() {
  document.querySelectorAll('.admin-menu .nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = link.dataset.tab;
      switchTab(tab);
    });
  });
}

function switchTab(tabId) {
  AdminState.currentTab = tabId;
  document.querySelectorAll('.admin-menu .nav-link').forEach(l => l.classList.remove('active'));
  const activeLink = document.querySelector(`.admin-menu .nav-link[data-tab="${tabId}"]`);
  if (activeLink) activeLink.classList.add('active');

  document.querySelectorAll('.admin-tab-content').forEach(s => s.classList.remove('active'));
  
  const targetId = 'tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1);
  const targetSection = document.getElementById(targetId);
  if (targetSection) targetSection.classList.add('active');

  const titles = {
    overview: ['System Overview & Diagnostics', 'Real-time status of homelab services, active health probes, and isolated node telemetry.'],
    tiles: ['App Tiles & Services', 'Manage, edit, bulk remove, and test health probes for all services.'],
    categories: ['Category Groups & Boards', 'Organize services into custom category boards and set accent colors.'],
    widgets: ['Widgets & Hardware Gauges', 'Configure real-time monitoring cards, telemetry sources, and gauge displays.'],
    theme: ['Theme & Appearance Studio', 'Customize accent colors, glassmorphic frosted blur, layout styles, and watermarks.'],
    probes: ['Service Health Probes', 'Monitor HTTP response codes, TCP port reachability, and network latencies.'],
    backup: ['Backup & Synchronization', 'Export and restore configuration files or edit the raw JSON blueprint.'],
    security: ['Security & PIN Protection', 'Configure master PIN authentication to protect sensitive management actions.']
  };

  if (titles[tabId]) {
    document.getElementById('tabTitle').textContent = titles[tabId][0];
    document.getElementById('tabDesc').textContent = titles[tabId][1];
  }
}

// Load Data
async function loadAdminData() {
  try {
    const [cfgRes, statsRes, probesRes] = await Promise.all([
      fetch('/api/config'),
      fetch('/api/system-stats'),
      fetch('/api/probes')
    ]);

    if (cfgRes.ok) {
      AdminState.config = await cfgRes.json();
      if (AdminState.config?.is_pin_protected) {
        const savedRole = sessionStorage.getItem('dimdash_role');
        const savedPin = sessionStorage.getItem('dimdash_pin');
        if (savedRole !== 'admin' || !savedPin) {
          document.getElementById('adminStudioLockGate')?.classList.add('open');
          setTimeout(() => document.getElementById('adminStudioPinInput')?.focus(), 150);
          return; // Strictly halt - do NOT render admin interface or data for unauthenticated guests
        } else {
          AdminState.adminPin = savedPin;
        }
      }
    }
    if (statsRes.ok) AdminState.stats = await statsRes.json();
    if (probesRes.ok) AdminState.probes = await probesRes.json();

    renderOverview();
    renderTilesTable();
    renderCategoriesTable();
    renderWidgetsTable();
    initThemeStudio();
    renderProbesTable();
    initBackupEditor();
  } catch (err) {
    showAdminToast('Failed to load dashboard data: ' + err.message, 'error');
  }
}

// TAB 1: OVERVIEW
function renderOverview() {
  const stats = AdminState.stats || {};
  let total = 0, online = 0, warning = 0, offline = 0;

  for (const cat of AdminState.config?.categories || []) {
    for (const t of cat.tiles || []) {
      total++;
      const p = AdminState.probes[t.id];
      if (!t.probe || t.probe.type === 'none' || p?.status === 'online') {
        online++;
      } else if (p?.status === 'warning') {
        warning++;
      } else if (p?.status === 'offline') {
        offline++;
      } else {
        online++;
      }
    }
  }

  document.getElementById('metricTotal').textContent = total;
  document.getElementById('metricOnline').textContent = online;
  document.getElementById('metricWarning').textContent = warning;
  document.getElementById('metricOffline').textContent = offline;

  const uptimeSec = stats.uptime || 0;
  const hours = Math.floor(uptimeSec / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  document.getElementById('serverUptimeVal').textContent = `${hours}h ${minutes}m`;
  document.getElementById('serverMemVal').textContent = `${stats.memoryUsageMb || '--'} MB`;
  document.getElementById('serverCpuVal').textContent = `${stats.cpuCount || '--'} Cores`;
}

// TAB 2: TILES TABLE
function renderTilesTable() {
  const tbody = document.getElementById('adminTilesTbody');
  const catFilter = document.getElementById('adminCatFilter');
  const statusFilter = document.getElementById('adminStatusFilter').value;
  const search = document.getElementById('adminTileSearch').value.toLowerCase().trim();

  // Populate category filter options
  const cats = AdminState.config?.categories || [];
  catFilter.innerHTML = '<option value="all">All Categories</option>';
  cats.forEach(c => {
    catFilter.innerHTML += `<option value="${c.id}">${c.name}</option>`;
  });

  const selectedCat = catFilter.value;

  let rowsHtml = '';
  let allTiles = [];

  cats.forEach(cat => {
    if (selectedCat !== 'all' && cat.id !== selectedCat) return;

    (cat.tiles || []).forEach(tile => {
      const probe = AdminState.probes[tile.id] || {};
      const status = (!tile.probe || tile.probe.type === 'none') ? 'online' : (probe.status || 'unknown');

      if (statusFilter !== 'all' && status !== statusFilter) return;

      if (search) {
        const match = tile.title.toLowerCase().includes(search) ||
                      (tile.subtitle && tile.subtitle.toLowerCase().includes(search)) ||
                      (tile.target_url && tile.target_url.toLowerCase().includes(search));
        if (!match) return;
      }

      allTiles.push({ tile, cat, probe, status });
    });
  });

  allTiles.forEach(({ tile, cat, probe, status }) => {
    const isChecked = AdminState.selectedTileIds.has(tile.id) ? 'checked' : '';
    const iconMarkup = IconCatalog.render(tile.icon_type, tile.icon_value);

    let statusPillClass = 'status-pill none';
    let statusLabel = 'Active';
    if (tile.probe && tile.probe.type !== 'none') {
      if (status === 'online') { statusPillClass = 'status-pill online'; statusLabel = 'Online'; }
      else if (status === 'warning') { statusPillClass = 'status-pill warning'; statusLabel = 'Warning'; }
      else { statusPillClass = 'status-pill offline'; statusLabel = 'Offline'; }
    }

    const latencyText = (probe.latency) ? `${probe.latency}ms` : '--';
    const probeTypeText = tile.probe?.type || 'none';
    const vis = tile.visibility || 'public';
    const visBadge = vis === 'admin'
      ? '<span class="tile-visibility-badge vis-admin">🛡️ Admin</span>'
      : (vis === 'user' ? '<span class="tile-visibility-badge vis-user">🔒 Member</span>' : '<span class="tile-visibility-badge vis-public">🌐 Public</span>');

    rowsHtml += `
      <tr data-tile-id="${tile.id}">
        <td><input type="checkbox" class="tile-row-check" data-id="${tile.id}" ${isChecked}></td>
        <td><div class="table-icon-cell">${iconMarkup}</div></td>
        <td>
          <div style="font-weight:600; color:#fff;">${tile.title}</div>
          ${tile.subtitle ? `<div style="font-size:0.75rem; color:#94a3b8;">${tile.subtitle}</div>` : ''}
        </td>
        <td><span class="category-pill" style="border: 1px solid ${cat.color || 'transparent'};">${cat.name}</span></td>
        <td>${visBadge}</td>
        <td><span class="table-url-mono" title="${tile.target_url}">${tile.target_url}</span></td>
        <td><span style="font-size:0.78rem; font-family:monospace; color:#cbd5e1;">${probeTypeText}</span></td>
        <td><span class="${statusPillClass}">${statusLabel}</span></td>
        <td><span style="font-family:monospace; color:#a5b4fc;">${latencyText}</span></td>
        <td>
          <div class="table-actions-cell">
            <button class="btn btn-icon btn-action-test" data-tile-id="${tile.id}" title="Test Probe">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            </button>
            <button class="btn btn-icon btn-action-edit" data-cat-id="${cat.id}" data-tile-id="${tile.id}" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn btn-icon btn-action-del" data-cat-id="${cat.id}" data-tile-id="${tile.id}" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml || '<tr><td colspan="9" style="text-align:center; color:#64748b; padding:2rem;">No matching services found.</td></tr>';
  attachTableEventListeners();
}

function attachTableEventListeners() {
  document.querySelectorAll('.tile-row-check').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) AdminState.selectedTileIds.add(id);
      else AdminState.selectedTileIds.delete(id);
      updateBulkBar();
    });
  });

  document.querySelectorAll('.btn-action-test').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.tileId;
      btn.style.opacity = '0.5';
      showAdminToast('Probing service...', 'info');
      try {
        const res = await fetch(`/api/probes/${id}`);
        const data = await res.json();
        AdminState.probes[id] = data;
        renderTilesTable();
        showAdminToast(`Status: ${data.status} (${data.latency || 0}ms)`, data.status === 'online' ? 'success' : 'error');
      } catch (err) {
        showAdminToast('Probe error: ' + err.message, 'error');
      } finally {
        btn.style.opacity = '1';
      }
    });
  });

  document.querySelectorAll('.btn-action-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      openTileEditModal(btn.dataset.catId, btn.dataset.tileId);
    });
  });

  document.querySelectorAll('.btn-action-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to delete this service?')) return;
      await deleteSingleTile(btn.dataset.catId, btn.dataset.tileId);
    });
  });
}

function updateBulkBar() {
  const bar = document.getElementById('bulkActionsBar');
  const count = AdminState.selectedTileIds.size;
  if (count > 0) {
    bar.classList.add('show');
    document.getElementById('bulkSelectedText').textContent = `${count} services selected`;
  } else {
    bar.classList.remove('show');
  }
}

// TAB 3: CATEGORIES TABLE
function renderCategoriesTable() {
  const tbody = document.getElementById('adminCategoriesTbody');
  const cats = AdminState.config?.categories || [];

  let html = '';
  cats.forEach(c => {
    const tileCount = (c.tiles || []).length;
    html += `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span style="width:14px; height:14px; border-radius:50%; background:${c.color || '#6366f1'}; box-shadow:0 0 8px ${c.color || '#6366f1'};"></span>
            <span style="font-family:monospace; font-size:0.8rem; color:#94a3b8;">${c.color || '#6366f1'}</span>
          </div>
        </td>
        <td style="font-weight:600; color:#fff;">${c.name}</td>
        <td><span class="category-pill">${tileCount} Services</span></td>
        <td>
          <div class="table-actions-cell">
            <button class="btn btn-icon" onclick="editCategoryName('${c.id}')" title="Rename Category">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn btn-icon" onclick="deleteCategory('${c.id}')" title="Delete Category">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html || '<tr><td colspan="4" style="text-align:center; color:#64748b; padding:2rem;">No categories defined yet.</td></tr>';
}

// TAB 4: WIDGETS TABLE
function renderWidgetsTable() {
  const tbody = document.getElementById('adminWidgetsTbody');
  if (!tbody) return;

  const widgets = AdminState.config?.widgets || [];

  const typeLabels = {
    clock_widget: '⏰ Clock & Calendar (ساعت و تقویم)',
    chart_widget: '📈 Telemetry Chart',
    cpu_gauge: 'CPU Utilization Gauge',
    ram_gauge: 'Memory (RAM) Gauge',
    disk_gauge: 'Disk Storage Gauge',
    network_traffic: 'Network Traffic I/O',
    docker_stats: 'Docker Containers',
    host_info: 'Host Telemetry & Uptime',
    service_health: 'Service Health Ratio'
  };

  let html = '';
  widgets.forEach((w, index) => {
    const label = typeLabels[w.type] || w.type;
    const color = w.color || '#6366f1';
    const serverName = w.server_id === 'local' ? 'Local Master' : (w.server_id || 'local');
    const size = w.size || 'normal';

    html += `
      <tr>
        <td>
          <span style="font-family:monospace; font-size:0.82rem; color:#a5b4fc; background:rgba(99,102,241,0.12); padding:0.2rem 0.6rem; border-radius:6px;">
            ${label}
          </span>
        </td>
        <td style="font-weight:600; color:#fff;">${w.title || 'Untitled Widget'}</td>
        <td><span style="color:#38bdf8; font-size:0.82rem;">${serverName}</span></td>
        <td>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span style="width:14px; height:14px; border-radius:50%; background:${color}; box-shadow:0 0 8px ${color};"></span>
            <span style="font-family:monospace; font-size:0.8rem; color:#94a3b8;">${color}</span>
          </div>
        </td>
        <td><span class="category-pill">${size}</span></td>
        <td>
          <div class="table-actions-cell">
            <button class="btn btn-icon" onclick="moveWidget(${index}, -1)" title="Move Up" ${index === 0 ? 'disabled style="opacity:0.3;"' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
            </button>
            <button class="btn btn-icon" onclick="moveWidget(${index}, 1)" title="Move Down" ${index === widgets.length - 1 ? 'disabled style="opacity:0.3;"' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            <button class="btn btn-icon" onclick="openWidgetEditModal(${index})" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn btn-icon" onclick="deleteWidget(${index})" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html || '<tr><td colspan="6" style="text-align:center; color:#64748b; padding:2rem;">No widgets configured yet. Click "Add Widget" to create one.</td></tr>';
}

function openWidgetEditModal(index = null) {
  const modal = document.getElementById('adminWidgetModal');
  const widgets = AdminState.config?.widgets || [];

  const titleInput = document.getElementById('mWidgetTitle');
  const typeSelect = document.getElementById('mWidgetType');
  const sizeSelect = document.getElementById('mWidgetSize');
  const colorInput = document.getElementById('mWidgetColor');
  const colorHex = document.getElementById('mWidgetColorHex');

  const updateTypeSpecificRows = (t) => {
    const clockRow = document.getElementById('adminClockOptionsRow');
    const chartRow = document.getElementById('adminChartOptionsRow');
    if (clockRow) clockRow.style.display = (t === 'clock_widget') ? 'flex' : 'none';
    if (chartRow) chartRow.style.display = (t === 'chart_widget') ? 'flex' : 'none';
  };

  if (colorInput && colorHex) {
    colorInput.oninput = (e) => { colorHex.value = e.target.value; };
    colorHex.oninput = (e) => { colorInput.value = e.target.value; };
  }

  if (typeSelect) {
    typeSelect.onchange = () => updateTypeSpecificRows(typeSelect.value);
  }

  if (index !== null && widgets[index]) {
    AdminState.currentEditingWidget = index;
    const w = widgets[index];
    document.getElementById('adminWidgetModalTitle').textContent = 'Edit Monitoring Widget';
    titleInput.value = w.title || '';
    typeSelect.value = w.type || 'clock_widget';
    sizeSelect.value = w.size || 'normal';
    colorInput.value = w.color || '#38bdf8';
    colorHex.value = w.color || '#38bdf8';

    if (document.getElementById('mClockCalendarMode')) {
      document.getElementById('mClockCalendarMode').value = w.calendar_mode || 'both';
    }
    if (document.getElementById('mClockTimeFormat')) {
      document.getElementById('mClockTimeFormat').value = w.time_format || '24h';
    }
    if (document.getElementById('mChartMetric')) {
      document.getElementById('mChartMetric').value = w.metric_type || 'cpu';
    }
    if (document.getElementById('mChartRange')) {
      document.getElementById('mChartRange').value = w.time_range || '1h';
    }
    updateTypeSpecificRows(w.type || 'clock_widget');
  } else {
    AdminState.currentEditingWidget = null;
    document.getElementById('adminWidgetModalTitle').textContent = 'Add Monitoring Widget';
    titleInput.value = 'ساعت و تقویم';
    typeSelect.value = 'clock_widget';
    sizeSelect.value = 'normal';
    colorInput.value = '#38bdf8';
    colorHex.value = '#38bdf8';

    if (document.getElementById('mClockCalendarMode')) document.getElementById('mClockCalendarMode').value = 'both';
    if (document.getElementById('mClockTimeFormat')) document.getElementById('mClockTimeFormat').value = '24h';
    if (document.getElementById('mChartMetric')) document.getElementById('mChartMetric').value = 'cpu';
    if (document.getElementById('mChartRange')) document.getElementById('mChartRange').value = '1h';
    updateTypeSpecificRows('clock_widget');
  }

  modal.classList.add('open');

  document.getElementById('btnWidgetModalSave').onclick = async () => {
    const title = titleInput.value.trim();
    if (!title) return showAdminToast('Widget title is required', 'error');

    AdminState.config.widgets = AdminState.config.widgets || [];
    const t = typeSelect.value;

    const widgetData = {
      id: AdminState.currentEditingWidget !== null ? (AdminState.config.widgets[AdminState.currentEditingWidget].id || 'widget-' + Date.now()) : ('widget-' + Date.now()),
      server_id: document.getElementById('mWidgetServer').value || 'local',
      type: t,
      title,
      color: colorInput.value,
      size: sizeSelect.value
    };

    if (t === 'clock_widget') {
      widgetData.calendar_mode = document.getElementById('mClockCalendarMode')?.value || 'both';
      widgetData.time_format = document.getElementById('mClockTimeFormat')?.value || '24h';
    } else if (t === 'chart_widget') {
      widgetData.metric_type = document.getElementById('mChartMetric')?.value || 'cpu';
      widgetData.time_range = document.getElementById('mChartRange')?.value || '1h';
    }

    if (AdminState.currentEditingWidget !== null) {
      AdminState.config.widgets[AdminState.currentEditingWidget] = widgetData;
    } else {
      AdminState.config.widgets.push(widgetData);
    }

    await saveConfigToServer('Widget settings updated');
    closeWidgetModal();
    renderWidgetsTable();
  };
}

function closeWidgetModal() {
  document.getElementById('adminWidgetModal')?.classList.remove('open');
}

async function deleteWidget(index) {
  if (!confirm('Are you sure you want to remove this widget?')) return;
  AdminState.config.widgets.splice(index, 1);
  await saveConfigToServer('Widget removed');
  renderWidgetsTable();
}

async function moveWidget(index, direction) {
  const targetIndex = index + direction;
  const widgets = AdminState.config.widgets;
  if (targetIndex < 0 || targetIndex >= widgets.length) return;
  const temp = widgets[index];
  widgets[index] = widgets[targetIndex];
  widgets[targetIndex] = temp;
  await saveConfigToServer('Widgets reordered');
  renderWidgetsTable();
}

// TAB 5: THEME STUDIO
function initThemeStudio() {
  const theme = AdminState.config?.settings?.theme || {};
  document.getElementById('adminThemeTitleInput').value = AdminState.config?.settings?.dashboard_title || 'DimDash Homelab';
  document.getElementById('adminThemeAccentInput').value = theme.accent_color || '#6366f1';
  document.getElementById('adminThemeAccentHex').value = theme.accent_color || '#6366f1';
  document.getElementById('adminThemeBlurInput').value = theme.glass_blur || 16;
  document.getElementById('adminBlurVal').textContent = `${theme.glass_blur || 16}px`;
  document.getElementById('adminThemeDensitySelect').value = theme.tile_density || 'normal';
  if (document.getElementById('adminCardStyleSelect')) {
    document.getElementById('adminCardStyleSelect').value = theme.card_style || 'pill';
  }
  if (document.getElementById('adminWpDimInput')) {
    document.getElementById('adminWpDimInput').value = theme.wallpaper_dim ?? 45;
    document.getElementById('adminWpDimVal').textContent = `${theme.wallpaper_dim ?? 45}%`;
  }

  function setAdminWpBlur(px) {
    const input = document.getElementById('adminWpBlurInput');
    const valEl = document.getElementById('adminWpBlurVal');
    if (input) input.value = px;
    if (valEl) {
      const n = Number(px);
      valEl.textContent = n === 0 ? '0px (Sharp)' : (n <= 4 ? `${n}px (Slight Blur)` : `${n}px (Medium Blur)`);
    }
  }
  window.setAdminWpBlur = setAdminWpBlur;

  if (document.getElementById('adminWpBlurInput')) {
    const bVal = theme.wallpaper_blur ?? 0;
    setAdminWpBlur(bVal);
    document.getElementById('adminWpBlurInput').addEventListener('input', (e) => {
      setAdminWpBlur(Number(e.target.value));
    });
  }

  AdminState.tempWp = {
    type: theme.background_type || 'image',
    value: theme.background_value || '/wallpapers/twilight_pines.jpg'
  };

  function updateActiveWallpaperCard() {
    document.querySelectorAll('#adminWallpaperGrid .wallpaper-card').forEach(card => {
      const wp = card.dataset.wp;
      if (AdminState.tempWp.type === 'image' && AdminState.tempWp.value === wp) {
        card.style.borderColor = 'var(--accent-color, #6366f1)';
        card.style.boxShadow = '0 0 14px var(--accent-color, #6366f1)';
      } else if (AdminState.tempWp.type === 'color' && wp === 'none') {
        card.style.borderColor = 'var(--accent-color, #6366f1)';
        card.style.boxShadow = '0 0 14px var(--accent-color, #6366f1)';
      } else {
        card.style.borderColor = 'transparent';
        card.style.boxShadow = 'none';
      }
    });
  }
  updateActiveWallpaperCard();

  document.querySelectorAll('#adminWallpaperGrid .wallpaper-card').forEach(card => {
    card.onclick = () => {
      const wp = card.dataset.wp;
      if (wp === 'none') {
        AdminState.tempWp = { type: 'color', value: '#090d16' };
      } else {
        AdminState.tempWp = { type: 'image', value: wp };
      }
      updateActiveWallpaperCard();
    };
  });

  document.getElementById('btnAdminUnsetWp')?.addEventListener('click', () => {
    AdminState.tempWp = { type: 'color', value: '#090d16' };
    updateActiveWallpaperCard();
    showAdminToast('Wallpaper removed (Dark background applied)', 'info');
  });

  document.getElementById('adminWpDimInput')?.addEventListener('input', (e) => {
    document.getElementById('adminWpDimVal').textContent = `${e.target.value}%`;
  });

  // Wallpaper Upload
  document.getElementById('adminWpUploadInput')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        showAdminToast('Uploading wallpaper...', 'info');
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, base64Data: evt.target.result })
        });
        const data = await res.json();
        if (data.url) {
          AdminState.tempWp = { type: 'image', value: data.url };
          updateActiveWallpaperCard();
          showAdminToast('Wallpaper uploaded successfully', 'success');
        }
      } catch (err) {
        showAdminToast('Wallpaper upload failed: ' + err.message, 'error');
      }
    };
    reader.readAsDataURL(file);
  });

  updateThemePreview();

  document.getElementById('adminThemeAccentInput').oninput = (e) => {
    document.getElementById('adminThemeAccentHex').value = e.target.value;
    updateThemePreview();
  };
  document.getElementById('adminThemeAccentHex').oninput = (e) => {
    document.getElementById('adminThemeAccentInput').value = e.target.value;
    updateThemePreview();
  };
  document.getElementById('adminThemeBlurInput').oninput = (e) => {
    document.getElementById('adminBlurVal').textContent = `${e.target.value}px`;
    updateThemePreview();
  };

  // Background Logo / Watermark with Automatic Transparency
  const adminLogoUrl = document.getElementById('adminBgLogoUrlInput');
  const adminLogoPreset = document.getElementById('adminBgLogoPresetSelect');
  const adminLogoOpacity = document.getElementById('adminBgLogoOpacityInput');
  const adminLogoOpacityVal = document.getElementById('adminBgLogoOpacityVal');
  const adminLogoPos = document.getElementById('adminBgLogoPosSelect');
  const adminLogoSize = document.getElementById('adminBgLogoSizeSelect');
  const adminLogoRepeat = document.getElementById('adminBgLogoRepeatSelect');
  const btnClearLogo = document.getElementById('btnAdminClearBgLogo');
  const uploadLogoInput = document.getElementById('adminBgLogoUploadInput');

  if (adminLogoUrl) adminLogoUrl.value = theme.bg_logo_url || '';
  if (adminLogoOpacity) {
    const curOp = theme.bg_logo_opacity !== undefined ? theme.bg_logo_opacity : 18;
    adminLogoOpacity.value = curOp;
    if (adminLogoOpacityVal) adminLogoOpacityVal.textContent = `${curOp}%`;
    adminLogoOpacity.oninput = (e) => {
      if (adminLogoOpacityVal) adminLogoOpacityVal.textContent = `${e.target.value}%`;
    };
  }
  if (adminLogoPos) adminLogoPos.value = theme.bg_logo_position || 'center';
  if (adminLogoSize) adminLogoSize.value = theme.bg_logo_size || '550px';
  if (adminLogoRepeat) adminLogoRepeat.value = theme.bg_logo_repeat || 'no-repeat';

  if (adminLogoPreset) {
    adminLogoPreset.onchange = (e) => {
      if (e.target.value && adminLogoUrl) {
        adminLogoUrl.value = e.target.value;
      }
    };
  }

  if (btnClearLogo) {
    btnClearLogo.onclick = () => {
      if (adminLogoUrl) adminLogoUrl.value = '';
      if (adminLogoPreset) adminLogoPreset.value = '';
      showAdminToast('Background watermark logo removed', 'info');
    };
  }

  if (uploadLogoInput) {
    uploadLogoInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          showAdminToast('Making logo background transparent...', 'info');
          let finalDataUrl = evt.target.result;
          if (window.stripImageBackground) {
            finalDataUrl = await window.stripImageBackground(finalDataUrl);
          }
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: file.name.replace(/\.[^/.]+$/, "") + ".png",
              base64Data: finalDataUrl
            })
          });
          const data = await res.json();
          if (data.url && adminLogoUrl) {
            adminLogoUrl.value = data.url;
            showAdminToast('Transparent logo processed and applied', 'success');
          }
        } catch (err) {
          showAdminToast('Upload failed: ' + err.message, 'error');
        }
      };
      reader.readAsDataURL(file);
    };
  }
}

function applyPreset(color) {
  document.getElementById('adminThemeAccentInput').value = color;
  document.getElementById('adminThemeAccentHex').value = color;
  updateThemePreview();
}

function updateThemePreview() {
  const color = document.getElementById('adminThemeAccentInput').value;
  const blur = document.getElementById('adminThemeBlurInput').value;
  const box = document.getElementById('themePreviewBox');
  if (box) {
    box.style.borderColor = `${color}60`;
    box.style.backdropFilter = `blur(${blur}px)`;
    box.style.boxShadow = `0 10px 30px rgba(0,0,0,0.4), 0 0 15px ${color}30`;
  }
}

// TAB 6: PROBES
function renderProbesTable() {
  const tbody = document.getElementById('adminProbesTableBody');
  const cats = AdminState.config?.categories || [];

  let html = '';
  cats.forEach(c => {
    (c.tiles || []).forEach(t => {
      const p = AdminState.probes[t.id] || {};
      const type = t.probe?.type || 'none';
      const target = (t.probe?.host) ? `${t.probe.host}:${t.probe.port || 80}` : '--';
      const latency = (p.latency) ? `${p.latency}ms` : '--';
      const statusClass = p.status === 'online' ? 'status-pill online' : (p.status === 'warning' ? 'status-pill warning' : 'status-pill offline');
      const timeStr = p.lastChecked ? new Date(p.lastChecked).toLocaleTimeString() : '--';

      html += `
        <tr>
          <td style="font-weight:600; color:#fff;">${t.title}</td>
          <td><span style="font-family:monospace; color:#a5b4fc;">${type}</span></td>
          <td><span style="font-family:monospace; color:#38bdf8;">${target}</span></td>
          <td><span class="${statusClass}">${p.status || 'unknown'}</span></td>
          <td><span style="font-family:monospace;">${latency}</span></td>
          <td style="color:#94a3b8; font-size:0.8rem;">${timeStr}</td>
          <td>
            <div class="table-actions-cell">
              <button class="btn btn-icon btn-action-test" data-tile-id="${t.id}" title="Run Probe">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    });
  });

  tbody.innerHTML = html || '<tr><td colspan="7" style="text-align:center; color:#64748b; padding:2rem;">No probes defined.</td></tr>';
  tbody.querySelectorAll('.btn-action-test').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.tileId;
      btn.style.opacity = '0.5';
      try {
        const res = await fetch(`/api/probes/${id}`);
        const data = await res.json();
        AdminState.probes[id] = data;
        renderProbesTable();
        showAdminToast(`Response: ${data.status} (${data.latency || 0}ms)`, 'success');
      } catch (err) {
        showAdminToast('Probe failed: ' + err.message, 'error');
      } finally {
        btn.style.opacity = '1';
      }
    });
  });
}

// TAB 7: BACKUP & YAML
function initBackupEditor() {
  const textarea = document.getElementById('adminRawConfig');
  if (textarea && AdminState.config) {
    textarea.value = JSON.stringify(AdminState.config, null, 2);
  }
}

// Event Listeners Setup
function setupEventListeners() {
  // Select all checkbox
  const selectAll = document.getElementById('selectAllCheckbox');
  if (selectAll) {
    selectAll.addEventListener('change', (e) => {
      const checked = e.target.checked;
      document.querySelectorAll('.tile-row-check').forEach(chk => {
        chk.checked = checked;
        const id = chk.dataset.id;
        if (checked) AdminState.selectedTileIds.add(id);
        else AdminState.selectedTileIds.delete(id);
      });
      updateBulkBar();
    });
  }

  // Filters
  document.getElementById('adminCatFilter')?.addEventListener('change', renderTilesTable);
  document.getElementById('adminStatusFilter')?.addEventListener('change', renderTilesTable);
  document.getElementById('adminTileSearch')?.addEventListener('input', renderTilesTable);

  // Bulk delete button
  document.getElementById('btnBulkDelete')?.addEventListener('click', async () => {
    const count = AdminState.selectedTileIds.size;
    if (!confirm(`Are you sure you want to delete ${count} selected services?`)) return;

    try {
      const res = await fetch('/api/admin/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tileIds: Array.from(AdminState.selectedTileIds) })
      });
      if (!res.ok) throw new Error('Bulk delete request failed');
      AdminState.selectedTileIds.clear();
      showAdminToast('Selected services removed', 'success');
      await loadAdminData();
    } catch (err) {
      showAdminToast(err.message, 'error');
    }
  });

  // Test all probes buttons
  const testAllAction = async () => {
    showAdminToast('Testing all network probes...', 'info');
    try {
      const res = await fetch('/api/probes/test-all', { method: 'POST' });
      const data = await res.json();
      if (data.results) {
        AdminState.probes = data.results;
        renderOverview();
        renderTilesTable();
        renderProbesTable();
        showAdminToast(`All probes tested: ${data.count} services checked`, 'success');
      }
    } catch (err) {
      showAdminToast('Probe sweep failed: ' + err.message, 'error');
    }
  };

  document.getElementById('btnAdminTestAll')?.addEventListener('click', testAllAction);
  document.getElementById('btnRunFullProbeCycle')?.addEventListener('click', testAllAction);

  // Save theme studio
  document.getElementById('btnSaveThemeStudio')?.addEventListener('click', async () => {
    AdminState.config.settings = AdminState.config.settings || {};
    AdminState.config.settings.dashboard_title = document.getElementById('adminThemeTitleInput').value.trim() || 'DimDash Homelab';
    AdminState.config.settings.theme = {
      ...AdminState.config.settings.theme,
      accent_color: document.getElementById('adminThemeAccentInput').value,
      glass_blur: parseInt(document.getElementById('adminThemeBlurInput').value, 10),
      tile_density: document.getElementById('adminThemeDensitySelect').value,
      card_style: document.getElementById('adminCardStyleSelect')?.value || 'pill',
      wallpaper_dim: parseInt(document.getElementById('adminWpDimInput')?.value || 45, 10),
      wallpaper_blur: parseInt(document.getElementById('adminWpBlurInput')?.value || 0, 10),
      background_type: AdminState.tempWp ? AdminState.tempWp.type : (AdminState.config.settings.theme?.background_type || 'image'),
      background_value: AdminState.tempWp ? AdminState.tempWp.value : (AdminState.config.settings.theme?.background_value || '/wallpapers/twilight_pines.jpg'),
      bg_logo_url: document.getElementById('adminBgLogoUrlInput')?.value.trim() || '',
      bg_logo_opacity: parseInt(document.getElementById('adminBgLogoOpacityInput')?.value || 18, 10),
      bg_logo_position: document.getElementById('adminBgLogoPosSelect')?.value || 'center',
      bg_logo_size: document.getElementById('adminBgLogoSizeSelect')?.value || '550px',
      bg_logo_repeat: document.getElementById('adminBgLogoRepeatSelect')?.value || 'no-repeat'
    };

    await saveConfigToServer('Theme and background settings saved');
  });

  // Export JSON Backup
  document.getElementById('btnAdminExportBackup')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(AdminState.config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dimdash-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import Backup File
  document.getElementById('importBackupFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (!Array.isArray(parsed.categories)) throw new Error('Invalid backup file structure');
        AdminState.config = parsed;
        await saveConfigToServer('Configuration restored from backup');
        await loadAdminData();
      } catch (err) {
        showAdminToast('Failed to parse backup file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  });

  // Save raw config
  document.getElementById('btnAdminSaveRaw')?.addEventListener('click', async () => {
    try {
      const parsed = JSON.parse(document.getElementById('adminRawConfig').value);
      AdminState.config = parsed;
      await saveConfigToServer('Raw configuration saved');
      await loadAdminData();
    } catch (err) {
      showAdminToast('Invalid JSON syntax: ' + err.message, 'error');
    }
  });

  // Security: PIN Save
  document.getElementById('btnSavePin')?.addEventListener('click', async () => {
    const pin = document.getElementById('newPinInput').value;
    const confirm = document.getElementById('confirmPinInput').value;
    if (pin.length < 4) {
      return showAdminToast('PIN must be at least 4 characters', 'error');
    }
    if (pin !== confirm) {
      return showAdminToast('PIN and confirmation do not match', 'error');
    }
    AdminState.config.settings = AdminState.config.settings || {};
    AdminState.config.settings.admin_pin = pin;
    await saveConfigToServer('Security PIN saved successfully');
  });

  document.getElementById('btnRemovePin')?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to disable PIN protection?')) return;
    AdminState.config.settings = AdminState.config.settings || {};
    AdminState.config.settings.admin_pin = '';
    await saveConfigToServer('PIN protection disabled');
  });

  // Security: User / Member PIN Save
  document.getElementById('btnSaveUserPin')?.addEventListener('click', async () => {
    const pin = document.getElementById('newUserPinInput').value;
    const confirm = document.getElementById('confirmUserPinInput').value;
    if (pin.length < 4) {
      return showAdminToast('User PIN must be at least 4 characters', 'error');
    }
    if (pin !== confirm) {
      return showAdminToast('User PIN and confirmation do not match', 'error');
    }
    AdminState.config.settings = AdminState.config.settings || {};
    AdminState.config.settings.user_pin = pin;
    await saveConfigToServer('Member / User PIN saved successfully');
  });

  document.getElementById('btnRemoveUserPin')?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to disable Member / User PIN?')) return;
    AdminState.config.settings = AdminState.config.settings || {};
    AdminState.config.settings.user_pin = '';
    await saveConfigToServer('Member / User PIN disabled');
  });

  // Admin Studio Lock Gate Handlers
  const unlockBtn = document.getElementById('btnAdminStudioUnlock');
  const gatePinInput = document.getElementById('adminStudioPinInput');
  const gateError = document.getElementById('adminStudioLockError');

  const attemptGateUnlock = async () => {
    const pin = gatePinInput?.value?.trim();
    if (!pin) {
      if (gateError) gateError.textContent = 'Please enter Admin PIN';
      return;
    }
    try {
      const res = await fetch('/api/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      if (res.ok) {
        sessionStorage.setItem('dimdash_role', 'admin');
        sessionStorage.setItem('dimdash_pin', pin);
        AdminState.adminPin = pin;
        document.getElementById('adminStudioLockGate')?.classList.remove('open');
        showAdminToast('Administrator console unlocked', 'success');
        renderOverview();
        renderTilesTable();
        renderCategoriesTable();
        renderWidgetsTable();
        initThemeStudio();
        renderProbesTable();
        initBackupEditor();
      } else {
        if (gateError) gateError.textContent = 'Incorrect PIN code. Access denied.';
      }
    } catch (e) {
      if (gateError) gateError.textContent = e.message;
    }
  };

  unlockBtn?.addEventListener('click', attemptGateUnlock);
  gatePinInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attemptGateUnlock();
  });

  // Add Tile Buttons
  document.getElementById('btnAdminAddTile')?.addEventListener('click', () => openTileEditModal());
  document.getElementById('btnTableAddTile')?.addEventListener('click', () => openTileEditModal());

  // Add Widget Button
  document.getElementById('btnAdminAddWidget')?.addEventListener('click', () => openWidgetEditModal());

  // Add Category Button
  document.getElementById('btnAdminAddCat')?.addEventListener('click', () => {
    const name = prompt('Enter name for the new category:');
    if (!name) return;
    AdminState.config.categories = AdminState.config.categories || [];
    AdminState.config.categories.push({
      id: 'cat-' + Date.now(),
      name,
      color: '#6366f1',
      icon: 'folder',
      tiles: []
    });
    saveConfigToServer('Category added').then(loadAdminData);
  });
}

// Modal Tile Edit
function renderAdminIconPicker(selectedIcon = 'server') {
  const grid = document.getElementById('adminTileIconGrid');
  if (!grid) return;
  const icons = IconCatalog.getAll();
  const heimdallApps = IconCatalog.getHeimdallApps() || [];
  const searchVal = (document.getElementById('adminTileIconSearch')?.value || '').toLowerCase().trim();
  
  grid.innerHTML = '';

  // 1. Presets
  Object.keys(icons).forEach(key => {
    const iconVal = icons[key];
    if (typeof iconVal !== 'string' || !iconVal.trim().startsWith('<svg')) return;
    if (searchVal && !key.toLowerCase().includes(searchVal)) return;
    const isSelected = (selectedIcon === key);
    const div = document.createElement('div');
    div.className = `icon-cell ${isSelected ? 'selected' : ''}`;
    div.title = key;
    div.innerHTML = `${iconVal}<span class="icon-cell-name" style="font-size:0.65rem;color:var(--text-muted);">${key}</span>`;
    div.onclick = () => {
      document.querySelectorAll('#adminTileIconGrid .icon-cell').forEach(c => c.classList.remove('selected'));
      div.classList.add('selected');
      document.getElementById('adminTileIconValue').value = key;
      document.getElementById('adminTileIconType').value = 'svg';
    };
    grid.appendChild(div);
  });

  // 2. Heimdall Foundation Icons (680+ apps)
  const matchingHeimdall = heimdallApps.filter(app => {
    if (!searchVal) return true;
    return (
      app.name.toLowerCase().includes(searchVal) ||
      app.id.toLowerCase().includes(searchVal) ||
      (app.description && app.description.toLowerCase().includes(searchVal))
    );
  });

  const displayLimit = searchVal ? 200 : 80;
  matchingHeimdall.slice(0, displayLimit).forEach(app => {
    const isSelected = (selectedIcon === app.icon_url || selectedIcon === app.id);
    const div = document.createElement('div');
    div.className = `icon-cell ${isSelected ? 'selected' : ''}`;
    div.title = `${app.name} (Heimdall Foundation)`;
    div.innerHTML = `<img src="${app.icon_url}" alt="" style="width:28px;height:28px;object-fit:contain;overflow:hidden;" loading="lazy" onerror="this.style.display='none'" /><span class="icon-cell-name" style="font-size:0.65rem;color:var(--text-muted);">${app.name}</span>`;
    div.onclick = () => {
      document.querySelectorAll('#adminTileIconGrid .icon-cell').forEach(c => c.classList.remove('selected'));
      div.classList.add('selected');
      document.getElementById('adminTileIconValue').value = app.icon_url;
      document.getElementById('adminTileIconType').value = 'image';
      
      const titleInput = document.getElementById('mTileTitle');
      if (titleInput && !titleInput.value.trim()) {
        titleInput.value = app.name;
      }
    };
    grid.appendChild(div);
  });
}

function openTileEditModal(catId = null, tileId = null) {
  const modal = document.getElementById('adminTileModal');
  const catSelect = document.getElementById('mTileCategory');
  catSelect.innerHTML = '';
  (AdminState.config?.categories || []).forEach(c => {
    catSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
  });

  const searchInput = document.getElementById('adminTileIconSearch');
  if (searchInput) {
    searchInput.value = '';
    searchInput.oninput = () => {
      renderAdminIconPicker(document.getElementById('adminTileIconValue').value);
    };
  }

  const uploadInput = document.getElementById('adminTileIconUpload');
  if (uploadInput) {
    uploadInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          showAdminToast('Removing icon background...', 'info');
          let finalDataUrl = evt.target.result;
          if (window.stripImageBackground) {
            finalDataUrl = await window.stripImageBackground(finalDataUrl);
          }
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: file.name.replace(/\.[^/.]+$/, "") + ".png",
              base64Data: finalDataUrl
            })
          });
          const data = await res.json();
          if (data.url) {
            document.getElementById('adminTileIconValue').value = data.url;
            document.getElementById('adminTileIconType').value = 'image';
            renderAdminIconPicker(data.url);
            showAdminToast('Icon uploaded with transparent background', 'success');
          }
        } catch (err) {
          showAdminToast('Icon upload failed: ' + err.message, 'error');
        }
      };
      reader.readAsDataURL(file);
    };
  }

  if (catId && tileId) {
    const cat = AdminState.config.categories.find(c => c.id === catId);
    const tile = cat?.tiles?.find(t => t.id === tileId);
    if (!tile) return;
    AdminState.currentEditingTile = { catId, tileId };
    document.getElementById('adminTileModalTitle').textContent = 'Edit Service: ' + tile.title;
    document.getElementById('mTileTitle').value = tile.title;
    document.getElementById('mTileSubtitle').value = tile.subtitle || '';
    document.getElementById('mTileUrl').value = tile.target_url;
    document.getElementById('mTileCategory').value = catId;
    document.getElementById('adminTileIconValue').value = tile.icon_value || 'server';
    document.getElementById('adminTileIconType').value = tile.icon_type || 'svg';
    document.getElementById('mProbeType').value = tile.probe?.type || 'none';
    document.getElementById('mProbeHost').value = tile.probe?.host || '';
    document.getElementById('mProbePort').value = tile.probe?.port || '';
    document.getElementById('mProbePath').value = tile.probe?.path || '';
    if (document.getElementById('mTileVisibility')) document.getElementById('mTileVisibility').value = tile.visibility || 'public';
    if (document.getElementById('mTileNewTab')) document.getElementById('mTileNewTab').checked = tile.open_in_new_tab !== false;
    renderAdminIconPicker(tile.icon_value || 'server');
  } else {
    AdminState.currentEditingTile = null;
    document.getElementById('adminTileModalTitle').textContent = 'Add New Service';
    document.getElementById('mTileTitle').value = '';
    document.getElementById('mTileSubtitle').value = '';
    document.getElementById('mTileUrl').value = '';
    document.getElementById('adminTileIconValue').value = 'server';
    document.getElementById('adminTileIconType').value = 'svg';
    document.getElementById('mProbeType').value = 'none';
    document.getElementById('mProbeHost').value = '';
    document.getElementById('mProbePort').value = '';
    document.getElementById('mProbePath').value = '';
    if (document.getElementById('mTileVisibility')) document.getElementById('mTileVisibility').value = 'public';
    if (document.getElementById('mTileNewTab')) document.getElementById('mTileNewTab').checked = true;
    renderAdminIconPicker('server');
  }

  modal.classList.add('open');

  document.getElementById('btnAdminModalSave').onclick = async () => {
    const title = document.getElementById('mTileTitle').value.trim();
    const url = document.getElementById('mTileUrl').value.trim();
    const targetCatId = document.getElementById('mTileCategory').value;
    const iconType = document.getElementById('adminTileIconType').value || 'svg';
    const iconValue = document.getElementById('adminTileIconValue').value || 'server';
    const visibility = document.getElementById('mTileVisibility')?.value || 'public';
    const open_in_new_tab = document.getElementById('mTileNewTab') ? document.getElementById('mTileNewTab').checked : true;

    if (!title || !url) {
      return showAdminToast('Service title and URL are required', 'error');
    }

    const probe = {
      type: document.getElementById('mProbeType').value,
      host: document.getElementById('mProbeHost').value.trim(),
      port: parseInt(document.getElementById('mProbePort').value, 10) || null,
      path: document.getElementById('mProbePath').value.trim()
    };

    if (AdminState.currentEditingTile) {
      // Edit existing
      const { catId: oldCatId, tileId } = AdminState.currentEditingTile;
      const oldCat = AdminState.config.categories.find(c => c.id === oldCatId);
      const tileIndex = oldCat.tiles.findIndex(t => t.id === tileId);
      const existing = oldCat.tiles[tileIndex];

      existing.title = title;
      existing.subtitle = document.getElementById('mTileSubtitle').value.trim();
      existing.target_url = url;
      existing.visibility = visibility;
      existing.open_in_new_tab = open_in_new_tab;
      existing.icon_type = iconType;
      existing.icon_value = iconValue;
      existing.probe = probe;

      if (oldCatId !== targetCatId) {
        oldCat.tiles.splice(tileIndex, 1);
        const newCat = AdminState.config.categories.find(c => c.id === targetCatId);
        newCat.tiles = newCat.tiles || [];
        newCat.tiles.push(existing);
      }
    } else {
      // Add new
      const targetCat = AdminState.config.categories.find(c => c.id === targetCatId);
      targetCat.tiles = targetCat.tiles || [];
      targetCat.tiles.push({
        id: 'tile-' + Date.now(),
        title,
        subtitle: document.getElementById('mTileSubtitle').value.trim(),
        target_url: url,
        visibility,
        open_in_new_tab,
        icon_type: iconType,
        icon_value: iconValue,
        probe
      });
    }

    await saveConfigToServer('Service tile saved');
    closeAdminModal();
    await loadAdminData();
  };
}

function closeAdminModal() {
  document.getElementById('adminTileModal').classList.remove('open');
}

// Category helpers
function editCategoryName(catId) {
  const cat = AdminState.config.categories.find(c => c.id === catId);
  if (!cat) return;
  const newName = prompt('Enter new category name:', cat.name);
  if (!newName) return;
  cat.name = newName;
  saveConfigToServer('Category updated').then(loadAdminData);
}

function deleteCategory(catId) {
  const cat = AdminState.config.categories.find(c => c.id === catId);
  if (!cat) return;
  if (!confirm(`Are you sure you want to delete category "${cat.name}" and all its services?`)) return;
  AdminState.config.categories = AdminState.config.categories.filter(c => c.id !== catId);
  saveConfigToServer('Category deleted').then(loadAdminData);
}

async function deleteSingleTile(catId, tileId) {
  const cat = AdminState.config.categories.find(c => c.id === catId);
  if (!cat) return;
  cat.tiles = cat.tiles.filter(t => t.id !== tileId);
  await saveConfigToServer('Service deleted');
  await loadAdminData();
}

async function saveConfigToServer(msg = 'Settings saved successfully') {
  try {
    const pin = sessionStorage.getItem('dimdash_pin') || AdminState.adminPin || '';
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: AdminState.config, pin })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save settings');
    }
    showAdminToast(msg, 'success');
  } catch (err) {
    showAdminToast(err.message, 'error');
  }
}
