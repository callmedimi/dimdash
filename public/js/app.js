/**
 * DimDash — Main Client Controller
 * Pure Vanilla JS, Zero External Libraries, Air-Gapped Ready
 */

const AppState = {
  config: null,
  probes: {},
  isAdmin: false,
  adminPin: '',
  activeCategory: 'all',
  searchQuery: '',
  draggedTileId: null,
  draggedSourceCatId: null
};

// DOM References
const elements = {
  dashTitle: document.getElementById('dashTitle'),
  searchBar: document.getElementById('searchBar'),
  categoryTabs: document.getElementById('categoryTabs'),
  contentArea: document.getElementById('contentArea'),
  clockTime: document.getElementById('clockTime'),
  clockDate: document.getElementById('clockDate'),
  adminToggleBtn: document.getElementById('adminToggleBtn'),
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
  sideNavAll: document.getElementById('sideNavAll'),
  sideNavRefresh: document.getElementById('sideNavRefresh'),
  sideNavTheme: document.getElementById('sideNavTheme'),
  sideNavLock: document.getElementById('sideNavLock')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  await IconCatalog.init();
  setupClock();
  setupKeyboardShortcuts();
  setupEventListeners();
  await loadConfig();
  setupSSE();
});

// Clock
function setupClock() {
  const update = () => {
    const now = new Date();
    elements.clockTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    elements.clockDate.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };
  update();
  setInterval(update, 1000);
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if ((e.key === '/' || (e.ctrlKey && e.key === 'k')) && document.activeElement !== elements.searchBar) {
      e.preventDefault();
      elements.searchBar.focus();
      elements.searchBar.select();
    }
    if (e.key === 'Escape') {
      closeAllModals();
      elements.searchBar.blur();
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

// Config & Theme Management
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('Failed to fetch config');
    AppState.config = await res.json();
    applyTheme(AppState.config.settings?.theme);
    renderDashboard();
    fetchProbes();
  } catch (err) {
    showToast('خطا در دریافت تنظیمات: ' + err.message, 'error');
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
  if (theme.tile_density) {
    document.body.classList.remove('density-compact', 'density-normal', 'density-expanded');
    document.body.classList.add(`density-${theme.tile_density}`);
  }
  if (theme.background_value) {
    if (theme.background_type === 'image') {
      document.body.style.background = `url("${theme.background_value}") center/cover fixed no-repeat`;
    } else {
      document.body.style.background = theme.background_value;
    }
  }
  if (AppState.config.settings?.dashboard_title) {
    elements.dashTitle.textContent = AppState.config.settings.dashboard_title;
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

// Render Dashboard
function renderDashboard() {
  renderCategoryTabs();
  renderGrid();
}

// Render Category Tabs
function renderCategoryTabs() {
  if (!elements.categoryTabs) return;
  const categories = AppState.config?.categories || [];
  
  let totalTiles = 0;
  categories.forEach(c => totalTiles += (c.tiles || []).length);

  let html = `
    <button class="tab-btn ${AppState.activeCategory === 'all' ? 'active' : ''}" data-cat="all">
      همه سرویس‌ها <span class="tab-count">${totalTiles}</span>
    </button>
  `;

  categories.forEach(cat => {
    const count = (cat.tiles || []).length;
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
      if (!query) return true;
      return (
        tile.title.toLowerCase().includes(query) ||
        (tile.subtitle && tile.subtitle.toLowerCase().includes(query)) ||
        (tile.target_url && tile.target_url.toLowerCase().includes(query))
      );
    });

    if (query && filteredTiles.length === 0) {
      return; // Skip empty category on search
    }

    matchFound = true;

    html += `
      <section class="category-section" data-cat-id="${cat.id}">
        <div class="category-header">
          <div class="category-title-group">
            <span class="category-badge-dot" style="background: ${cat.color || 'var(--accent-color)'}; box-shadow: 0 0 8px ${cat.color || 'var(--accent-color)'};"></span>
            <h2 class="category-title">${cat.name}</h2>
          </div>
          <div class="category-actions">
            ${AppState.isAdmin ? `
              <button class="btn btn-icon btn-edit-cat" data-id="${cat.id}" title="ویرایش دسته‌بندی">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button class="btn btn-icon btn-del-cat" data-id="${cat.id}" title="حذف دسته‌بندی">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
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

      html += `
        <div class="tile-card" 
             data-tile-id="${tile.id}" 
             data-cat-id="${cat.id}"
             draggable="${AppState.isAdmin}">
          
          <div class="tile-admin-bar">
            <button class="tile-admin-btn btn-test-tile" data-cat-id="${cat.id}" data-tile-id="${tile.id}" title="بررسی فوری">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            </button>
            <button class="tile-admin-btn btn-edit-tile" data-cat-id="${cat.id}" data-tile-id="${tile.id}" title="ویرایش">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="tile-admin-btn btn-del-tile" data-cat-id="${cat.id}" data-tile-id="${tile.id}" title="حذف">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <a href="${tile.target_url}" ${targetAttr} class="tile-main-link" style="text-decoration:none; color:inherit; display:flex; flex-direction:column; height:100%;">
            <div class="tile-top">
              <div class="tile-icon-box" ${customBg}>
                ${iconMarkup}
              </div>
              <div class="tile-status-container" id="status-${tile.id}">
                <!-- Rendered dynamically by updateProbeBadges() -->
              </div>
            </div>
            
            <div class="tile-info">
              <div class="tile-title">${tile.title}</div>
              ${tile.subtitle ? `<div class="tile-subtitle">${tile.subtitle}</div>` : ''}
            </div>

            <div class="sparkline-wrapper" id="sparkline-${tile.id}">
              <!-- Rendered dynamically -->
            </div>

            <div class="tile-footer" id="footer-${tile.id}">
              <span class="status-badge">
                <span class="status-dot"></span>
                <span>آماده اتصال</span>
              </span>
            </div>
          </a>
        </div>
      `;
    });

    html += `
        </div>
      </section>
    `;
  });

  if (!matchFound) {
    html = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <h3>نتیجه‌ای یافت نشد</h3>
        <p>هیچ برنامه‌ای با عبارت جستجوی "${AppState.searchQuery}" پیدا نشد.</p>
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
          <span class="status-badge">
            <span class="status-dot online"></span>
            <span>فعال</span>
          </span>
        `;
        if (sparkEl) sparkEl.innerHTML = renderSparkline([{ latency: 15, status: 'online' }], 'online');
        return;
      }

      if (!info || info.status === 'unknown') {
        footerEl.innerHTML = `
          <span class="status-badge">
            <span class="status-dot"></span>
            <span>در حال بررسی...</span>
          </span>
        `;
        if (sparkEl) sparkEl.innerHTML = renderSparkline([], 'unknown');
        return;
      }

      let statusDotClass = 'offline';
      let statusText = 'آفلاین';
      if (info.status === 'online') {
        statusDotClass = 'online';
        statusText = 'آنلاین';
        onlineCount++;
      } else if (info.status === 'warning') {
        statusDotClass = 'warning';
        statusText = info.statusCode ? `کد ${info.statusCode}` : 'هشدار';
        warningCount++;
      } else {
        offlineCount++;
      }

      let metricHtml = '';
      if (info.metric) {
        metricHtml = `<span class="metric-chip">${info.metric.label}: ${info.metric.value}${info.metric.unit || ''}</span>`;
      }

      footerEl.innerHTML = `
        <span class="status-badge">
          <span class="status-dot ${statusDotClass}"></span>
          <span>${statusText}</span>
        </span>
        <div style="display:flex; align-items:center; gap:0.4rem;">
          ${metricHtml}
          ${info.latency ? `<span class="latency-badge">${info.latency}ms</span>` : ''}
        </div>
      `;

      if (sparkEl) {
        sparkEl.innerHTML = renderSparkline(info.history, info.status);
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
      showToast('در حال ارسال پروب...', 'info');
      try {
        const res = await fetch(`/api/probes/${tileId}`);
        const result = await res.json();
        AppState.probes[tileId] = result;
        updateProbeBadges();
        if (result.status === 'online') {
          showToast(`پروب موفق: پاسخ در ${result.latency || 0}ms`, 'success');
        } else {
          showToast(`پروب ناموفق: ${result.error || result.status}`, 'error');
        }
      } catch (err) {
        showToast('خطا در پروب: ' + err.message, 'error');
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

  // Drag and drop logic
  if (AppState.isAdmin) {
    const cards = document.querySelectorAll('.tile-card');
    cards.forEach(card => {
      card.addEventListener('dragstart', (e) => {
        AppState.draggedTileId = card.dataset.tileId;
        AppState.draggedSourceCatId = card.dataset.catId;
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', card.dataset.tileId);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
      });

      card.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetTileId = card.dataset.tileId;
        const targetCatId = card.dataset.catId;
        handleTileReorder(AppState.draggedSourceCatId, AppState.draggedTileId, targetCatId, targetTileId);
      });
    });
  }
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
  const targetIndex = targetCat.tiles.findIndex(t => t.id === targetTileId);

  if (targetIndex !== -1) {
    targetCat.tiles.splice(targetIndex, 0, movedTile);
  } else {
    targetCat.tiles.push(movedTile);
  }

  saveConfigToServer('چیدمان کاشی‌ها ذخیره شد');
  renderDashboard();
}

// Save Config to Server
async function saveConfigToServer(successMsg = 'تنظیمات ذخیره شد') {
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: AppState.config,
        pin: AppState.adminPin
      })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save');
    }
    showToast(successMsg, 'success');
  } catch (err) {
    showToast('خطا در ذخیره‌سازی: ' + err.message, 'error');
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Search
  elements.searchBar.addEventListener('input', (e) => {
    AppState.searchQuery = e.target.value;
    renderGrid();
  });

  // Admin Toggle
  elements.adminToggleBtn.addEventListener('click', async () => {
    if (!AppState.isAdmin) {
      // Check if PIN protection is active
      if (AppState.config?.is_pin_protected) {
        openPinModal();
      } else {
        AppState.isAdmin = true;
        document.body.classList.add('admin-mode');
        elements.adminToggleBtn.classList.add('active');
        showToast('حالت ویرایش ادمین فعال شد', 'info');
        renderDashboard();
      }
    } else {
      AppState.isAdmin = false;
      document.body.classList.remove('admin-mode');
      elements.adminToggleBtn.classList.remove('active');
      showToast('حالت ویرایش ادمین غیرفعال شد', 'info');
      renderDashboard();
    }
  });

  // Action Buttons
  elements.addTileBtn?.addEventListener('click', () => openTileModal());
  elements.addCategoryBtn?.addEventListener('click', () => openCategoryModal());
  elements.themeBtn?.addEventListener('click', () => openThemeModal());
  elements.yamlBtn?.addEventListener('click', () => openYamlModal());

  // Test all probes button
  if (elements.btnTestAllProbes) {
    elements.btnTestAllProbes.addEventListener('click', async () => {
      elements.btnTestAllProbes.style.opacity = '0.5';
      showToast('در حال بررسی تمامی پروب‌ها...', 'info');
      try {
        const res = await fetch('/api/probes/test-all', { method: 'POST' });
        const data = await res.json();
        if (data.results) {
          AppState.probes = data.results;
          updateProbeBadges();
          showToast(`بررسی به پایان رسید: ${data.count} سرویس بررسی شد`, 'success');
        }
      } catch (err) {
        showToast('خطا در تست پروب‌ها: ' + err.message, 'error');
      } finally {
        elements.btnTestAllProbes.style.opacity = '1';
      }
    });
  }

  // Sidebar buttons
  if (elements.sideNavAll) {
    elements.sideNavAll.addEventListener('click', () => {
      AppState.activeCategory = 'all';
      renderCategoryTabs();
      renderGrid();
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
    elements.sideNavLock.addEventListener('click', () => elements.adminToggleBtn.click());
  }
}

// --------------------------------------------------------------------------
// MODALS
// --------------------------------------------------------------------------

function closeAllModals() {
  document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
}

// PIN Modal
function openPinModal() {
  const modal = document.getElementById('pinModal');
  const input = document.getElementById('adminPinInput');
  input.value = '';
  modal.classList.add('open');
  input.focus();

  document.getElementById('pinSubmitBtn').onclick = async () => {
    const pin = input.value;
    try {
      const res = await fetch('/api/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      if (res.ok) {
        AppState.adminPin = pin;
        AppState.isAdmin = true;
        document.body.classList.add('admin-mode');
        elements.adminToggleBtn.classList.add('active');
        modal.classList.remove('open');
        showToast('احراز هویت موفقیت‌آمیز بود', 'success');
        renderDashboard();
      } else {
        showToast('پین وارد شده صحیح نمی‌باشد', 'error');
      }
    } catch (e) {
      showToast('خطا در بررسی پین: ' + e.message, 'error');
    }
  };
}

// Tile Modal
function openTileModal(catId = null, tileId = null) {
  const modal = document.getElementById('tileModal');
  const isEdit = !!tileId;
  document.getElementById('tileModalTitle').textContent = isEdit ? 'ویرایش کاشی برنامه' : 'افزودن برنامه جدید';

  // Fill categories dropdown
  const catSelect = document.getElementById('tileCategorySelect');
  catSelect.innerHTML = (AppState.config?.categories || []).map(c => `
    <option value="${c.id}" ${catId === c.id ? 'selected' : ''}>${c.name}</option>
  `).join('');

  // Icon choices
  const iconPicker = document.getElementById('tileIconPicker');
  let selectedIcon = 'server';
  iconPicker.innerHTML = Object.keys(IconCatalog.icons).map(key => `
    <div class="icon-choice ${key === selectedIcon ? 'selected' : ''}" data-icon="${key}" title="${key}">
      ${IconCatalog.icons[key]}
    </div>
  `).join('');

  iconPicker.querySelectorAll('.icon-choice').forEach(choice => {
    choice.addEventListener('click', () => {
      iconPicker.querySelectorAll('.icon-choice').forEach(c => c.classList.remove('selected'));
      choice.classList.add('selected');
      selectedIcon = choice.dataset.icon;
    });
  });

  // Target tile data if edit
  let existing = null;
  if (isEdit) {
    const cat = AppState.config?.categories.find(c => c.id === catId);
    existing = cat?.tiles.find(t => t.id === tileId);
  }

  document.getElementById('tileTitleInput').value = existing?.title || '';
  document.getElementById('tileSubtitleInput').value = existing?.subtitle || '';
  document.getElementById('tileUrlInput').value = existing?.target_url || '';
  document.getElementById('tileNewTabInput').checked = existing ? existing.open_in_new_tab !== false : true;
  document.getElementById('tileColorInput').value = existing?.bg_color || '';

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

  if (existing?.icon_value && IconCatalog.icons[existing.icon_value]) {
    selectedIcon = existing.icon_value;
    iconPicker.querySelectorAll('.icon-choice').forEach(c => {
      if (c.dataset.icon === selectedIcon) c.classList.add('selected');
      else c.classList.remove('selected');
    });
  }

  modal.classList.add('open');

  document.getElementById('tileSaveBtn').onclick = () => {
    const title = document.getElementById('tileTitleInput').value.trim();
    const url = document.getElementById('tileUrlInput').value.trim();
    const targetCatId = catSelect.value;

    if (!title || !url) {
      showToast('لطفاً نام و آدرس برنامه را وارد نمایید', 'error');
      return;
    }

    const tileData = {
      id: existing ? existing.id : 'tile-' + Date.now(),
      title,
      subtitle: document.getElementById('tileSubtitleInput').value.trim(),
      target_url: url,
      open_in_new_tab: document.getElementById('tileNewTabInput').checked,
      icon_type: 'preset',
      icon_value: selectedIcon,
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

    saveConfigToServer(isEdit ? 'کاشی بروزرسانی شد' : 'کاشی جدید افزوده شد');
    modal.classList.remove('open');
    renderDashboard();
  };
}

function deleteTile(catId, tileId) {
  if (!confirm('آیا از حذف این کاشی اطمینان دارید؟')) return;
  const cat = AppState.config?.categories.find(c => c.id === catId);
  if (!cat) return;
  cat.tiles = cat.tiles.filter(t => t.id !== tileId);
  saveConfigToServer('کاشی حذف شد');
  renderDashboard();
}

// Category Modal
function openCategoryModal(catId = null) {
  const modal = document.getElementById('categoryModal');
  const isEdit = !!catId;
  document.getElementById('categoryModalTitle').textContent = isEdit ? 'ویرایش دسته‌بندی' : 'افزودن دسته‌بندی جدید';

  let existing = null;
  if (isEdit) {
    existing = AppState.config?.categories.find(c => c.id === catId);
  }

  document.getElementById('catNameInput').value = existing?.name || '';
  document.getElementById('catColorInput').value = existing?.color || '#6366f1';

  modal.classList.add('open');

  document.getElementById('catSaveBtn').onclick = () => {
    const name = document.getElementById('catNameInput').value.trim();
    if (!name) {
      showToast('لطفاً نام دسته‌بندی را وارد کنید', 'error');
      return;
    }

    const color = document.getElementById('catColorInput').value;
    if (isEdit && existing) {
      existing.name = name;
      existing.color = color;
    } else {
      AppState.config.categories = AppState.config.categories || [];
      AppState.config.categories.push({
        id: 'cat-' + Date.now(),
        name,
        color,
        icon: 'folder',
        is_collapsed: false,
        tiles: []
      });
    }

    saveConfigToServer(isEdit ? 'دسته‌بندی بروز شد' : 'دسته‌بندی جدید افزوده شد');
    modal.classList.remove('open');
    renderDashboard();
  };
}

function deleteCategory(catId) {
  const cat = AppState.config?.categories.find(c => c.id === catId);
  if (!cat) return;
  if ((cat.tiles || []).length > 0) {
    if (!confirm(`این دسته‌بندی دارای ${cat.tiles.length} برنامه است. آیا مطمئنید؟`)) return;
  } else {
    if (!confirm('آیا از حذف این دسته‌بندی اطمینان دارید؟')) return;
  }

  AppState.config.categories = AppState.config.categories.filter(c => c.id !== catId);
  saveConfigToServer('دسته‌بندی حذف شد');
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

  modal.classList.add('open');

  document.getElementById('themeBlurInput').oninput = (e) => {
    document.getElementById('themeBlurVal').textContent = `${e.target.value}px`;
  };

  document.getElementById('themeSaveBtn').onclick = () => {
    AppState.config.settings = AppState.config.settings || {};
    AppState.config.settings.dashboard_title = document.getElementById('themeTitleInput').value.trim() || 'DimDash';
    AppState.config.settings.theme = {
      ...AppState.config.settings.theme,
      accent_color: document.getElementById('themeAccentInput').value,
      glass_blur: parseInt(document.getElementById('themeBlurInput').value, 10),
      tile_density: document.getElementById('themeDensitySelect').value
    };

    applyTheme(AppState.config.settings.theme);
    saveConfigToServer('تنظیمات تم با موفقیت ذخیره شد');
    modal.classList.remove('open');
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
