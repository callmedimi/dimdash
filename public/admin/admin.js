/**
 * DimDash Admin Studio Controller (v2.0)
 * Air-gapped management console, data tables, live theme studio, bulk operations
 */

const AdminState = {
  config: null,
  probes: {},
  stats: {},
  selectedTileIds: new Set(),
  currentEditingTile: null,
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
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
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
    overview: ['داشبورد آمار و وضعیت کلی', 'نمای کلی از وضعیت سرورها، پروب‌ها و منابع سیستم ایزوله'],
    tiles: ['مدیریت برنامه‌ها و کاشی‌ها', 'مشاهده، ویرایش، حذف دسته‌ای و تست پروب تمام سرویس‌ها'],
    categories: ['مدیریت دسته‌بندی‌ها', 'دسته‌بندی سرویس‌ها و تنظیم رنگ‌بندی‌های اختصاصی'],
    theme: ['استودیوی طراحی و تم زنده', 'تنظیم رنگ‌های سمانتیک، میزان محوشدگی شیشه و تراکم چیدمان'],
    probes: ['پروب‌ها و مانیتورینگ سلامت', 'جدول بررسی بلادرنگ تاخیر شبکه و وضعیت دسترسی به پورت‌ها'],
    backup: ['پشتیبان‌گیری و ساختار داده', 'خروجی گرفتن و بازیابی فایل‌های پیکربندی'],
    security: ['امنیت و احراز هویت', 'مدیریت و تنظیم رمز عبور یا پین ادمین']
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

    if (cfgRes.ok) AdminState.config = await cfgRes.json();
    if (statsRes.ok) AdminState.stats = await statsRes.json();
    if (probesRes.ok) AdminState.probes = await probesRes.json();

    renderOverview();
    renderTilesTable();
    renderCategoriesTable();
    initThemeStudio();
    renderProbesTable();
    initBackupEditor();
  } catch (err) {
    showAdminToast('خطا در بارگذاری اطلاعات: ' + err.message, 'error');
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
  document.getElementById('serverUptimeVal').textContent = `${hours} ساعت و ${minutes} دقیقه`;
  document.getElementById('serverMemVal').textContent = `${stats.memoryUsageMb || '--'} مگابایت`;
  document.getElementById('serverCpuVal').textContent = `${stats.cpuCount || '--'} هسته`;
}

// TAB 2: TILES TABLE
function renderTilesTable() {
  const tbody = document.getElementById('adminTilesTbody');
  const catFilter = document.getElementById('adminCatFilter');
  const statusFilter = document.getElementById('adminStatusFilter').value;
  const search = document.getElementById('adminTileSearch').value.toLowerCase().trim();

  // Populate category filter options
  const cats = AdminState.config?.categories || [];
  catFilter.innerHTML = '<option value="all">همه دسته‌ها</option>';
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
    let statusLabel = 'فعال';
    if (tile.probe && tile.probe.type !== 'none') {
      if (status === 'online') { statusPillClass = 'status-pill online'; statusLabel = 'آنلاین'; }
      else if (status === 'warning') { statusPillClass = 'status-pill warning'; statusLabel = 'هشدار'; }
      else { statusPillClass = 'status-pill offline'; statusLabel = 'آفلاین'; }
    }

    const latencyText = (probe.latency) ? `${probe.latency}ms` : '--';
    const probeTypeText = tile.probe?.type || 'none';

    rowsHtml += `
      <tr data-tile-id="${tile.id}">
        <td><input type="checkbox" class="tile-row-check" data-id="${tile.id}" ${isChecked}></td>
        <td><div class="table-icon-cell">${iconMarkup}</div></td>
        <td>
          <div style="font-weight:600; color:#fff;">${tile.title}</div>
          ${tile.subtitle ? `<div style="font-size:0.75rem; color:#94a3b8;">${tile.subtitle}</div>` : ''}
        </td>
        <td><span class="category-pill" style="border: 1px solid ${cat.color || 'transparent'};">${cat.name}</span></td>
        <td><span class="table-url-mono" title="${tile.target_url}">${tile.target_url}</span></td>
        <td><span style="font-size:0.78rem; font-family:monospace; color:#cbd5e1;">${probeTypeText}</span></td>
        <td><span class="${statusPillClass}">${statusLabel}</span></td>
        <td><span style="font-family:monospace; color:#a5b4fc;">${latencyText}</span></td>
        <td>
          <div class="table-actions-cell">
            <button class="btn btn-icon btn-action-test" data-tile-id="${tile.id}" title="تست پروب">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            </button>
            <button class="btn btn-icon btn-action-edit" data-cat-id="${cat.id}" data-tile-id="${tile.id}" title="ویرایش">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn btn-icon btn-action-del" data-cat-id="${cat.id}" data-tile-id="${tile.id}" title="حذف">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml || '<tr><td colspan="9" style="text-align:center; color:#64748b; padding:2rem;">هیچ برنامه‌ای یافت نشد.</td></tr>';
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
      showAdminToast('در حال بررسی پروب...', 'info');
      try {
        const res = await fetch(`/api/probes/${id}`);
        const data = await res.json();
        AdminState.probes[id] = data;
        renderTilesTable();
        showAdminToast(`وضعیت: ${data.status} (${data.latency || 0}ms)`, data.status === 'online' ? 'success' : 'error');
      } catch (err) {
        showAdminToast('خطا: ' + err.message, 'error');
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
      if (!confirm('آیا از حذف این برنامه اطمینان دارید؟')) return;
      await deleteSingleTile(btn.dataset.catId, btn.dataset.tileId);
    });
  });
}

function updateBulkBar() {
  const bar = document.getElementById('bulkActionsBar');
  const count = AdminState.selectedTileIds.size;
  if (count > 0) {
    bar.classList.add('show');
    document.getElementById('bulkSelectedText').textContent = `${count} مورد انتخاب شده`;
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
        <td><span class="category-pill">${tileCount} برنامه</span></td>
        <td>
          <div class="table-actions-cell">
            <button class="btn btn-icon" onclick="editCategoryName('${c.id}')" title="ویرایش">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn btn-icon" onclick="deleteCategory('${c.id}')" title="حذف">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html || '<tr><td colspan="4" style="text-align:center; color:#64748b; padding:2rem;">هیچ دسته‌ای تعریف نشده است.</td></tr>';
}

// TAB 4: THEME STUDIO
function initThemeStudio() {
  const theme = AdminState.config?.settings?.theme || {};
  document.getElementById('adminThemeTitleInput').value = AdminState.config?.settings?.dashboard_title || 'DimDash Homelab';
  document.getElementById('adminThemeAccentInput').value = theme.accent_color || '#6366f1';
  document.getElementById('adminThemeAccentHex').value = theme.accent_color || '#6366f1';
  document.getElementById('adminThemeBlurInput').value = theme.glass_blur || 16;
  document.getElementById('adminBlurVal').textContent = `${theme.glass_blur || 16}px`;
  document.getElementById('adminThemeDensitySelect').value = theme.tile_density || 'normal';

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

// TAB 5: PROBES
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
            <button class="btn btn-icon btn-action-test" data-tile-id="${t.id}" title="تست مستقیم">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            </button>
          </td>
        </tr>
      `;
    });
  });

  tbody.innerHTML = html || '<tr><td colspan="7" style="text-align:center; color:#64748b; padding:2rem;">هیچ پروبی تعریف نشده است.</td></tr>';
  tbody.querySelectorAll('.btn-action-test').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.tileId;
      btn.style.opacity = '0.5';
      try {
        const res = await fetch(`/api/probes/${id}`);
        const data = await res.json();
        AdminState.probes[id] = data;
        renderProbesTable();
        showAdminToast(`پاسخ: ${data.status} (${data.latency || 0}ms)`, 'success');
      } catch (err) {
        showAdminToast('خطا: ' + err.message, 'error');
      } finally {
        btn.style.opacity = '1';
      }
    });
  });
}

// TAB 6: BACKUP & YAML
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
  document.getElementById('adminCatFilter').addEventListener('change', renderTilesTable);
  document.getElementById('adminStatusFilter').addEventListener('change', renderTilesTable);
  document.getElementById('adminTileSearch').addEventListener('input', renderTilesTable);

  // Bulk delete button
  document.getElementById('btnBulkDelete').addEventListener('click', async () => {
    const count = AdminState.selectedTileIds.size;
    if (!confirm(`آیا از حذف دسته‌ای ${count} برنامه اطمینان دارید؟`)) return;

    try {
      const res = await fetch('/api/admin/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tileIds: Array.from(AdminState.selectedTileIds) })
      });
      if (!res.ok) throw new Error('خطا در حذف دسته‌ای');
      AdminState.selectedTileIds.clear();
      showAdminToast('حذف دسته‌ای با موفقیت انجام شد', 'success');
      await loadAdminData();
    } catch (err) {
      showAdminToast(err.message, 'error');
    }
  });

  // Test all probes buttons
  const testAllAction = async () => {
    showAdminToast('در حال بررسی تمامی پروب‌ها...', 'info');
    try {
      const res = await fetch('/api/probes/test-all', { method: 'POST' });
      const data = await res.json();
      if (data.results) {
        AdminState.probes = data.results;
        renderOverview();
        renderTilesTable();
        renderProbesTable();
        showAdminToast(`بررسی با موفقیت انجام شد: ${data.count} سرویس`, 'success');
      }
    } catch (err) {
      showAdminToast('خطا در تست: ' + err.message, 'error');
    }
  };

  document.getElementById('btnAdminTestAll')?.addEventListener('click', testAllAction);
  document.getElementById('btnRunFullProbeCycle')?.addEventListener('click', testAllAction);

  // Save theme studio
  document.getElementById('btnSaveThemeStudio')?.addEventListener('click', async () => {
    AdminState.config.settings = AdminState.config.settings || {};
    AdminState.config.settings.dashboard_title = document.getElementById('adminThemeTitleInput').value.trim() || 'DimDash';
    AdminState.config.settings.theme = {
      ...AdminState.config.settings.theme,
      accent_color: document.getElementById('adminThemeAccentInput').value,
      glass_blur: parseInt(document.getElementById('adminThemeBlurInput').value, 10),
      tile_density: document.getElementById('adminThemeDensitySelect').value
    };

    await saveConfigToServer('تنظیمات تم با موفقیت ذخیره شد');
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
        if (!Array.isArray(parsed.categories)) throw new Error('فرمت فایل پشتیبان معتبر نیست');
        AdminState.config = parsed;
        await saveConfigToServer('فایل پشتیبان با موفقیت بازیابی شد');
        await loadAdminData();
      } catch (err) {
        showAdminToast('خطا در خواندن فایل پشتیبان: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  });

  // Save raw config
  document.getElementById('btnAdminSaveRaw')?.addEventListener('click', async () => {
    try {
      const parsed = JSON.parse(document.getElementById('adminRawConfig').value);
      AdminState.config = parsed;
      await saveConfigToServer('پیکربندی مستقیم ذخیره شد');
      await loadAdminData();
    } catch (err) {
      showAdminToast('JSON نامعتبر است: ' + err.message, 'error');
    }
  });

  // Security: PIN Save
  document.getElementById('btnSavePin')?.addEventListener('click', async () => {
    const pin = document.getElementById('newPinInput').value;
    const confirm = document.getElementById('confirmPinInput').value;
    if (pin.length < 4) {
      return showAdminToast('پین باید حداقل ۴ کاراکتر باشد', 'error');
    }
    if (pin !== confirm) {
      return showAdminToast('پین و تکرار آن یکسان نیستند', 'error');
    }
    AdminState.config.settings = AdminState.config.settings || {};
    AdminState.config.settings.admin_pin = pin;
    await saveConfigToServer('پین امنیتی با موفقیت ثبت شد');
  });

  document.getElementById('btnRemovePin')?.addEventListener('click', async () => {
    if (!confirm('آیا مطمئن هستید که می‌خواهید محافظت با پین را غیرفعال کنید؟')) return;
    AdminState.config.settings = AdminState.config.settings || {};
    AdminState.config.settings.admin_pin = '';
    await saveConfigToServer('محافظت با پین حذف شد');
  });

  // Add Tile Buttons
  document.getElementById('btnAdminAddTile')?.addEventListener('click', () => openTileEditModal());
  document.getElementById('btnTableAddTile')?.addEventListener('click', () => openTileEditModal());

  // Add Category Button
  document.getElementById('btnAdminAddCat')?.addEventListener('click', () => {
    const name = prompt('نام دسته‌بندی جدید را وارد کنید:');
    if (!name) return;
    AdminState.config.categories = AdminState.config.categories || [];
    AdminState.config.categories.push({
      id: 'cat-' + Date.now(),
      name,
      color: '#6366f1',
      icon: 'folder',
      tiles: []
    });
    saveConfigToServer('دسته‌بندی جدید افزوده شد').then(loadAdminData);
  });
}

// Modal Tile Edit
function openTileEditModal(catId = null, tileId = null) {
  const modal = document.getElementById('adminTileModal');
  const catSelect = document.getElementById('mTileCategory');
  catSelect.innerHTML = '';
  (AdminState.config?.categories || []).forEach(c => {
    catSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
  });

  if (catId && tileId) {
    const cat = AdminState.config.categories.find(c => c.id === catId);
    const tile = cat?.tiles?.find(t => t.id === tileId);
    if (!tile) return;
    AdminState.currentEditingTile = { catId, tileId };
    document.getElementById('adminTileModalTitle').textContent = 'ویرایش برنامه: ' + tile.title;
    document.getElementById('mTileTitle').value = tile.title;
    document.getElementById('mTileSubtitle').value = tile.subtitle || '';
    document.getElementById('mTileUrl').value = tile.target_url;
    document.getElementById('mTileCategory').value = catId;
    document.getElementById('mProbeType').value = tile.probe?.type || 'none';
    document.getElementById('mProbeHost').value = tile.probe?.host || '';
    document.getElementById('mProbePort').value = tile.probe?.port || '';
    document.getElementById('mProbePath').value = tile.probe?.path || '';
  } else {
    AdminState.currentEditingTile = null;
    document.getElementById('adminTileModalTitle').textContent = 'افزودن برنامه جدید';
    document.getElementById('mTileTitle').value = '';
    document.getElementById('mTileSubtitle').value = '';
    document.getElementById('mTileUrl').value = '';
    document.getElementById('mProbeType').value = 'none';
    document.getElementById('mProbeHost').value = '';
    document.getElementById('mProbePort').value = '';
    document.getElementById('mProbePath').value = '';
  }

  modal.classList.add('open');

  document.getElementById('btnAdminModalSave').onclick = async () => {
    const title = document.getElementById('mTileTitle').value.trim();
    const url = document.getElementById('mTileUrl').value.trim();
    const targetCatId = document.getElementById('mTileCategory').value;
    if (!title || !url) {
      return showAdminToast('نام و آدرس برنامه الزامی هستند', 'error');
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
        icon_type: 'svg',
        icon_value: 'server',
        probe
      });
    }

    await saveConfigToServer('برنامه ذخیره شد');
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
  const newName = prompt('نام جدید دسته‌بندی:', cat.name);
  if (!newName) return;
  cat.name = newName;
  saveConfigToServer('دسته‌بندی بروزرسانی شد').then(loadAdminData);
}

function deleteCategory(catId) {
  const cat = AdminState.config.categories.find(c => c.id === catId);
  if (!cat) return;
  if (!confirm(`آیا از حذف دسته‌بندی "${cat.name}" و تمام زیرمجموعه‌های آن اطمینان دارید؟`)) return;
  AdminState.config.categories = AdminState.config.categories.filter(c => c.id !== catId);
  saveConfigToServer('دسته‌بندی حذف شد').then(loadAdminData);
}

async function deleteSingleTile(catId, tileId) {
  const cat = AdminState.config.categories.find(c => c.id === catId);
  if (!cat) return;
  cat.tiles = cat.tiles.filter(t => t.id !== tileId);
  await saveConfigToServer('برنامه حذف شد');
  await loadAdminData();
}

async function saveConfigToServer(msg = 'تنظیمات ذخیره شد') {
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: AdminState.config })
    });
    if (!res.ok) throw new Error('خطا در ذخیره‌سازی');
    showAdminToast(msg, 'success');
  } catch (err) {
    showAdminToast(err.message, 'error');
  }
}
