/**
 * DimDash Stage Renderer
 * Renders spatial items and islands from layout.yaml onto a continuous physical canvas.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashStage = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class StageRenderer {
    constructor(containerElement, options = {}) {
      this.container = containerElement;
      this.options = options;

      this.board = null;
      this.currentProfile = null;
      this.currentMode = 'fit';
      this.metrics = null;

      this.itemElements = new Map(); // id -> DOM element
      this.resizeObserver = null;
      this.sizeObserver = null;

      this.idleTimer = null;
      this.isTenFoot = false;

      this.lastVwWu = 0;
      this.lastVhWu = 0;
      this.isRendering = false;

      this.camera = null;
      this.spatialIndex = null;
      this.overlayRenderer = null;
      this.interaction = null;
      this.stageScale = 1.0;

      this.initDom();
      this.initDisplayScale();
      this.initStageEngines();
      this.initObservers();
      this.initIdleHandler();
      this.initSpatialKeyboardNavigation();

      if (typeof window !== 'undefined') {
        window.stageRenderer = this;
      }
    }

    initDom() {
      if (!this.container) return;
      this.container.setAttribute('role', 'region');
      this.container.setAttribute('aria-label', 'Dashboard Stage Viewport');

      this.container.innerHTML = `
        <div id="stageViewport" class="stage-viewport" data-mode="fit">
          <div id="stageCanvas" class="stage-canvas"></div>
          <canvas id="stageOverlay" class="stage-overlay"></canvas>
          <div id="stageHud" class="stage-hud"></div>
          <div id="stageBlueprintPill" class="stage-blueprint-pill admin-only-ui" title="Toggle In-Place Blueprint Edit Mode (Key: E)" role="button" tabindex="0" aria-label="Toggle Blueprint Edit Mode">
            <span class="pill-dot"></span>
            <span>Blueprint Mode [E]</span>
          </div>
        </div>
      `;

      this.viewportEl = this.container.querySelector('#stageViewport');
      this.canvasEl = this.container.querySelector('#stageCanvas');
      this.overlayEl = this.container.querySelector('#stageOverlay');
      this.hudEl = this.container.querySelector('#stageHud');
    }

    initStageEngines() {
      if (typeof window === 'undefined') return;

      if (window.DimDashCamera) {
        this.camera = new window.DimDashCamera.Camera({
          viewportW: this.viewportEl?.clientWidth || window.innerWidth,
          viewportH: this.viewportEl?.clientHeight || window.innerHeight
        });
      }

      if (window.DimDashSpatial) {
        this.spatialIndex = new window.DimDashSpatial.SpatialIndex(128);
      }

      if (window.DimDashOverlay && this.overlayEl) {
        this.overlayRenderer = new window.DimDashOverlay.StageOverlay(this.overlayEl, {
          dpr: window.devicePixelRatio || 1
        });
        const w = this.viewportEl?.clientWidth || window.innerWidth;
        const h = this.viewportEl?.clientHeight || window.innerHeight;
        this.overlayRenderer.resize(w, h, window.devicePixelRatio || 1);
      }

      if (window.DimDashMaterials) {
        this.qualityManager = new window.DimDashMaterials.QualityManager();
      }

      if (window.DimDashSignals) {
        this.reactiveStore = new window.DimDashSignals.ReactiveStore();
      }

      if (window.DimDashInteraction) {
        this.interaction = new window.DimDashInteraction.InteractionController(this);
      }

      const pill = this.container?.querySelector('#stageBlueprintPill');
      if (pill) {
        pill.addEventListener('click', () => {
          if (this.interaction) {
            this.interaction.toggleEditing();
            pill.classList.toggle('active', this.interaction.isEditing);
          }
        });
      }

      // STEP 4: Delegated capture listener for broken icon images
      if (this.viewportEl) {
        this.viewportEl.addEventListener('error', (e) => {
          if (e.target && e.target.tagName === 'IMG' && e.target.closest('.stage-service-tile')) {
            const tile = e.target.closest('.stage-service-tile');
            const titleEl = tile ? tile.querySelector('.stage-tile-title') : null;
            const titleText = (titleEl ? titleEl.textContent : '').trim() || '?';
            const firstChar = titleText.charAt(0).toUpperCase();
            const box = e.target.parentElement;
            if (box) {
              box.innerHTML = `<span class="tile-fallback-plate" aria-hidden="true">${firstChar}</span>`;
            }
          }
        }, true);
      }
    }

    initDisplayScale() {
      const urlParams = new URLSearchParams(window.location.search);
      const userScaleParam = parseFloat(urlParams.get('scale')) || 1.0;
      const displayParam = urlParams.get('display');

      let savedDisplay = {};
      try {
        savedDisplay = JSON.parse(localStorage.getItem('dimdash_display_profile') || '{}');
      } catch (e) {}

      const guessed = window.DimDashScale
        ? window.DimDashScale.guessDisplayProfile(window.innerWidth, window.innerHeight, window.devicePixelRatio)
        : { diagonal_in: 27, distance_m: 0.7, preset: 'desk' };

      const diagIn = parseFloat(urlParams.get('diag')) || savedDisplay.diagonal_in || guessed.diagonal_in;
      const distM = parseFloat(urlParams.get('dist')) || savedDisplay.distance_m || guessed.distance_m;
      const preset = displayParam || savedDisplay.preset || guessed.preset;

      if (window.DimDashScale) {
        this.metrics = window.DimDashScale.computeDisplayScale({
          diagonal_in: diagIn,
          distance_m: distM,
          width_px: window.innerWidth,
          height_px: window.innerHeight,
          dpr: window.devicePixelRatio || 1,
          preset,
          user_scale: userScaleParam,
          is_coarse: window.matchMedia && window.matchMedia('(pointer: coarse)').matches
        });

        window.DimDashScale.applyToRoot(this.metrics);
      } else {
        this.metrics = { wu: 1.0, vw_wu: window.innerWidth, vh_wu: window.innerHeight };
      }
    }

    initObservers() {
      if (typeof ResizeObserver === 'undefined') return;

      // 1. Viewport resize observer
      this.resizeObserver = new ResizeObserver(entries => {
        if (!entries || !entries[0]) return;
        const cr = entries[0].contentRect;
        this.onViewportResize(cr.width, cr.height);
      });
      if (this.viewportEl) this.resizeObserver.observe(this.viewportEl);

      // 2. Shared item size class observer
      this.sizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          const w = entry.contentRect.width;
          const wu = this.metrics ? this.metrics.wu : 1.0;
          const wWu = w / wu;

          let sizeClass = 'm';
          if (wWu < 120) sizeClass = 'xs';
          else if (wWu < 220) sizeClass = 's';
          else if (wWu < 380) sizeClass = 'm';
          else if (wWu < 640) sizeClass = 'l';
          else sizeClass = 'xl';

          entry.target.setAttribute('data-size', sizeClass);
        }
      });
    }

    initIdleHandler() {
      const resetIdle = () => {
        if (!this.isTenFoot) return;
        document.body.classList.remove('tenfoot-idle');
        clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
          document.body.classList.add('tenfoot-idle');
        }, 3000);
      };

      window.addEventListener('mousemove', resetIdle, { passive: true });
      window.addEventListener('keydown', resetIdle, { passive: true });
      window.addEventListener('touchstart', resetIdle, { passive: true });
    }

    onViewportResize(widthPx, heightPx) {
      if (this.camera) this.camera.setViewportSize(widthPx, heightPx);
      if (this.overlayRenderer) {
        this.overlayRenderer.resize(widthPx, heightPx, window.devicePixelRatio || 1);
        if (this.interaction) this.interaction.requestOverlayRedraw();
      }

      if (!this.board || this.isRendering) return;

      const wu = this.metrics ? this.metrics.wu : 1.0;
      const vwWu = Math.round(widthPx / wu);
      const vhWu = Math.round(heightPx / wu);

      // Skip tiny jitter less than 0.5 wu
      if (Math.abs(vwWu - this.lastVwWu) < 1 && Math.abs(vhWu - this.lastVhWu) < 1) {
        return;
      }

      this.lastVwWu = vwWu;
      this.lastVhWu = vhWu;

      requestAnimationFrame(() => this.relayout());
    }

    setBoard(board) {
      this.board = board;
      this.render();
    }

    render() {
      if (!this.board || !this.viewportEl) return;
      this.isRendering = true;

      const items = this.board.config?.items || [];
      const layout = this.board.layout || {};

      const vwPx = this.viewportEl.clientWidth || window.innerWidth;
      const vhPx = this.viewportEl.clientHeight || window.innerHeight;
      const wu = this.metrics ? this.metrics.wu : 1.0;
      const vwWu = Math.round(vwPx / wu);
      const vhWu = Math.round(vhPx / wu);

      // 1. Resolve Profile
      const urlParams = new URLSearchParams(window.location.search);
      const overrideProf = urlParams.get('profile');

      const profile = window.DimDashSolver
        ? window.DimDashSolver.resolveProfile(vwWu, vhWu, {
            profiles: layout.profiles,
            currentProfileId: this.currentProfile?.id,
            overrideProfile: overrideProf,
            displayClass: this.board.config?.settings?.display_class
          })
        : { id: 'lg', mode: 'fit' };

      this.currentProfile = profile;
      this.currentMode = profile.mode || 'fit';

      this.viewportEl.setAttribute('data-profile', profile.id);
      this.viewportEl.setAttribute('data-mode', this.currentMode);

      this.isTenFoot = profile.ui === 'tenfoot' || profile.id === 'wall';
      if (this.isTenFoot) {
        this.viewportEl.setAttribute('data-ui', 'tenfoot');
      } else {
        this.viewportEl.removeAttribute('data-ui');
      }

      // 2. Solve Layout
      const solver = window.DimDashSolver;
      if (!solver) {
        this.isRendering = false;
        return;
      }

      const solved = solver.solveStageLayout(items, layout, { w: vwWu, h: vhWu }, profile.id, {
        isRtl: document.documentElement.dir === 'rtl',
        mirrorLayoutInRtl: !!this.board.config?.settings?.mirror_layout_in_rtl
      });

      // Relieve Collisions
      const relieved = solver.relieveCollisions(solved.rects, { w: vwWu, h: vhWu });

      // Solve Mode (fit/flow/canvas)
      const modeResult = solver.solveMode(this.currentMode, relieved.rects, { w: vwWu, h: vhWu });

      if (this.currentMode === 'fit') {
        const stageScale = modeResult.scale || 1.0;
        this.stageScale = stageScale;
        this.canvasEl.style.setProperty('--stage-scale', stageScale);
      } else {
        this.stageScale = 1.0;
        this.canvasEl.style.setProperty('--stage-scale', 1.0);
      }

      // 3. Render or Update DOM Nodes (Node Re-use)
      this.mountItems(modeResult.rects, items);

      if (typeof window.updateWidgetValues === 'function') {
        window.updateWidgetValues();
      }

      this.isRendering = false;
    }

    relayout() {
      if (!this.board) return;
      this.render();
    }

    mountItems(rects, items) {
      const itemsById = new Map();
      items.forEach(it => itemsById.set(it.id, it));

      const rectsById = new Map();
      rects.forEach(r => rectsById.set(r.id, r));

      const activeIds = new Set(rects.map(r => r.id));

      // Remove nodes no longer in active layout
      for (const [id, el] of this.itemElements.entries()) {
        if (!activeIds.has(id)) {
          if (this.sizeObserver) this.sizeObserver.unobserve(el);
          el.remove();
          this.itemElements.delete(id);
        }
      }

      // Virtualization threshold
      const shouldVirtualize = rects.length > 150;
      const vh = this.viewportEl.clientHeight || 1080;
      const vw = this.viewportEl.clientWidth || 1920;

      // Mount or reposition
      for (const rect of rects) {
        const item = itemsById.get(rect.id);
        if (!item) continue;

        let el = this.itemElements.get(rect.id);
        if (!el) {
          el = this.createItemElement(item, rect);
          this.itemElements.set(rect.id, el);
          if (rect.pinned) {
            this.hudEl.appendChild(el);
          } else {
            this.canvasEl.appendChild(el);
          }
          if (this.sizeObserver) this.sizeObserver.observe(el);
        } else {
          // Re-render shaped islands or chips if dimensions changed
          if (item.kind === 'island') {
            this.renderItemContent(el, item, rect);
          }
        }

        // Write coordinates via CSS custom properties
        el.style.setProperty('--x', rect.x);
        el.style.setProperty('--y', rect.y);
        el.style.setProperty('--w', rect.w);
        el.style.setProperty('--h', rect.h);
        el.style.setProperty('--z', rect.z || 1);
        if (rect.parent) {
          el.setAttribute('data-parent', rect.parent);
        } else {
          el.removeAttribute('data-parent');
        }

        // Virtualize content if needed
        if (shouldVirtualize) {
          const isVisible = (
            rect.x < vw * 2 &&
            rect.x + rect.w > -vw &&
            rect.y < vh * 2 &&
            rect.y + rect.h > -vh
          );
          if (!isVisible && !el.classList.contains('virtual-shell')) {
            el.classList.add('virtual-shell');
            el.innerHTML = '';
          } else if (isVisible && el.classList.contains('virtual-shell')) {
            el.classList.remove('virtual-shell');
            this.renderItemContent(el, item);
          }
        }
      }

      // Rebuild spatial index and redraw overlay
      if (this.spatialIndex) {
        this.spatialIndex.rebuild(rects);
      }
      if (this.interaction) {
        this.interaction.requestOverlayRedraw();
      }

      // Ensure at least one element has tabindex="0" for roving tabindex
      const allElements = Array.from(this.itemElements.values());
      const hasFocusable = allElements.some(el => el.getAttribute('tabindex') === '0');
      if (!hasFocusable && allElements.length > 0) {
        allElements[0].setAttribute('tabindex', '0');
      }
    }

    createItemElement(item, rect = null) {
      const el = document.createElement('section');
      el.className = `stage-item stage-kind-${item.kind || 'widget'}`;
      el.setAttribute('data-id', item.id);
      el.setAttribute('data-kind', item.kind || 'widget');
      el.setAttribute('tabindex', '-1');
      if (rect?.parent) {
        el.setAttribute('data-parent', rect.parent);
      }

      if (item.kind === 'island') {
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', `${item.title || 'Island'} Island`);
      } else if (item.kind === 'widget') {
        el.setAttribute('role', 'region');
        el.setAttribute('aria-label', `${item.title || 'Widget'} Widget`);
      } else if (item.kind === 'service') {
        el.setAttribute('role', 'article');
      }

      this.renderItemContent(el, item, rect);
      return el;
    }

    renderItemContent(el, item, rect = null) {
      if (item.kind === 'island') {
        const itemW = rect ? rect.w : 280;
        const itemH = rect ? rect.h : 200;
        const autoBelow = item.props?.collapse?.auto_below || [120, 80];
        const isChip = item.props?.collapse?.state === 'chip' || (rect && (itemW < autoBelow[0] || itemH < autoBelow[1]));

        if (isChip) {
          el.classList.add('is-chip');
          el.innerHTML = `
            <div class="stage-island-chip" id="chip_${item.id}" title="Click to expand">
              <span class="chip-icon">${item.props?.icon ? `<i data-icon="${item.props.icon}"></i>` : '📁'}</span>
              <span class="chip-title">${item.title || 'Island'}</span>
              <span class="chip-badge">⤢</span>
            </div>
          `;
          const chipEl = el.querySelector(`#chip_${item.id}`);
          if (chipEl) {
            chipEl.addEventListener('click', (e) => {
              e.stopPropagation();
              item.props = item.props || {};
              item.props.collapse = item.props.collapse || {};
              item.props.collapse.state = 'expanded';
              this.render();
            });
          }
          return;
        }

        el.classList.remove('is-chip');

        const shape = item.props?.shape || 'rounded';
        const shapeParams = item.props?.shape_params || {};
        let clipStyle = '';
        let svgBorderHtml = '';
        let padStyle = '';

        if (window.DimDashShapes && shape !== 'rect') {
          const clipStr = window.DimDashShapes.getClipPath(shape, itemW, itemH, shapeParams);
          if (clipStr) {
            clipStyle = `clip-path: ${clipStr}; -webkit-clip-path: ${clipStr};`;
          }
          const svgPath = window.DimDashShapes.getSvgBorderPath(shape, itemW, itemH, shapeParams);
          if (svgPath) {
            svgBorderHtml = `
              <svg class="stage-island-svg-border" viewBox="0 0 ${itemW} ${itemH}">
                <path d="${svgPath}" />
              </svg>
            `;
          }
          const insets = window.DimDashShapes.getContentSafeArea(shape, itemW, itemH, shapeParams);
          if (insets) {
            padStyle = `padding: ${insets[0]}px ${insets[1]}px ${insets[2]}px ${insets[3]}px;`;
          }
        }

        const headerStyle = item.props?.header?.style || 'bar';
        const layoutMode = item.props?.layout || 'free';
        const overflowMode = item.props?.overflow || 'clip';
        const tint = item.props?.tint ? `style="--card-bg: ${item.props.tint};"` : '';

        el.innerHTML = `
          <div class="stage-island" ${tint} data-shape="${shape}" data-header="${headerStyle}" data-layout="${layoutMode}" data-overflow="${overflowMode}" style="${clipStyle}">
            ${svgBorderHtml}
            <header class="stage-island-header">
              <span class="stage-island-title">
                <span class="island-icon">${item.props?.icon ? `<i data-icon="${item.props.icon}"></i>` : ''}</span>
                <span>${item.title || 'Island'}</span>
              </span>
              <div class="stage-island-actions">
                <button class="stage-island-btn" id="btnCollapse_${item.id}" title="Collapse to Chip">−</button>
              </div>
            </header>
            <div class="stage-island-body" id="body_${item.id}" style="${padStyle}"></div>
          </div>
        `;

        const collapseBtn = el.querySelector(`#btnCollapse_${item.id}`);
        if (collapseBtn) {
          collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            item.props = item.props || {};
            item.props.collapse = item.props.collapse || {};
            item.props.collapse.state = 'chip';
            this.render();
          });
        }
        return;
      }

      if (item.kind === 'service') {
        const targetUrl = item.props?.target_url || '#';
        const openInNew = item.props?.open_in_new_tab !== false ? '_blank' : '_self';
        const iconVal = item.props?.icon_value || '';
        const iconType = item.props?.icon_type || (iconVal.startsWith('/') || iconVal.startsWith('http') ? 'image' : 'builtin');
        const initialChar = ((item.title || 'S').trim().charAt(0) || '?').toUpperCase();

        let iconMarkup = '';
        if (window.IconCatalog && typeof window.IconCatalog.render === 'function') {
          iconMarkup = window.IconCatalog.render(iconType, iconVal);
        } else if (iconVal.startsWith('/') || iconVal.startsWith('http')) {
          iconMarkup = `<img src="${iconVal}" alt="${item.title || 'Service'}" loading="lazy" draggable="false" onerror="this.parentElement.innerHTML='<span class=\\'tile-fallback-plate\\'>${initialChar}</span>';" style="max-width:100%; max-height:100%; object-fit:contain;">`;
        } else {
          iconMarkup = `<span class="tile-fallback-plate">${initialChar}</span>`;
        }

        const probeId = item.bind?.status ? item.bind.status.replace('probe:', '') : item.id;
        const probeResult = (window.AppState && window.AppState.probes) ? window.AppState.probes[probeId] : null;
        const isOnline = probeResult ? probeResult.status === 'online' : true;
        const statusColor = isOnline ? '#10b981' : '#ef4444';

        const statusText = isOnline ? 'Online' : 'Offline';
        const ariaLabel = `${item.title || 'Service'} — ${statusText}${item.subtitle ? ', ' + item.subtitle : ''}`;

        el.innerHTML = `
          <a class="stage-service-tile tile-main-link" href="${targetUrl}" target="${openInNew}" rel="noreferrer" title="${item.subtitle || item.title}" aria-label="${ariaLabel}" draggable="false">
            <div class="stage-tile-icon tile-icon-box">
              ${iconMarkup}
            </div>
            <div class="stage-tile-info">
              <span class="stage-tile-title" dir="auto">${item.title || 'Service'}</span>
              ${item.subtitle ? `<span class="stage-tile-subtitle" dir="auto">${item.subtitle}</span>` : ''}
            </div>
            <div class="tile-status-indicator">
              <span class="pilot-light ${isOnline ? 'pilot-active' : ''}" style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${statusColor}; box-shadow:0 0 8px ${statusColor};"></span>
            </div>
          </a>
        `;
        return;
      }

      if (item.kind === 'widget') {
        this.renderWidgetContent(el, item);
        return;
      }

      // Generic text / divider / image
      el.innerHTML = `<div class="stage-generic">${item.title || ''}</div>`;
    }

    renderWidgetContent(el, item) {
      const wId = item.id;
      const type = item.type || item.props?.type || 'clock_widget';
      const props = item.props || {};
      const title = item.title || props.title || 'Widget';
      const color = props.color || '#38bdf8';
      const C = 213.6;

      if (type === 'clock_widget') {
        const nowInfo = (window.DimDashCalendar ? window.DimDashCalendar.getNowInfo() : null);
        let timeStr = '--:--:--';
        let shamsiHtml = '';
        let gregorianHtml = '';
        if (nowInfo) {
          timeStr = `${nowInfo.time.hours24}<span class="clock-colon">:</span>${nowInfo.time.minutes}<span class="clock-colon">:</span>${nowInfo.time.seconds}`;
          shamsiHtml = `<span class="clock-date-chip chip-shamsi" title="تقویم خورشیدی / شمسی">☀️ ${nowInfo.shamsi.fullFa}</span>`;
          gregorianHtml = `<span class="clock-date-chip chip-gregorian" title="Gregorian Calendar">📅 ${nowInfo.gregorian.full}</span>`;
        }
        el.innerHTML = `
          <div class="widget-card clock-widget-card" id="widget-card-${wId}" data-widget-id="${wId}" style="--widget-accent: ${color}; width:100%; height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; box-sizing:border-box; padding:12px; background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.08); border-radius:calc(14px * var(--wu));">
            <div class="clock-time-display" id="clock-display-${wId}" data-time-format="24h" style="font-size:calc(1.8rem * var(--wu)); font-weight:700; letter-spacing:1px; color:#f8fafc; font-variant-numeric:tabular-nums;">
              ${timeStr}
            </div>
            <div class="clock-dates-container" id="clock-dates-${wId}" data-calendar-mode="both" style="display:flex; flex-direction:column; align-items:center; gap:4px; margin-top:8px; font-size:calc(0.72rem * var(--wu));">
              ${shamsiHtml}
              ${gregorianHtml}
            </div>
          </div>
        `;
        return;
      }

      if (type === 'cpu_gauge') {
        el.innerHTML = `
          <div class="widget-card stage-widget" id="widget-card-${wId}" style="--widget-accent: ${color}; width:100%; height:100%; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box; padding:12px; background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.08); border-radius:calc(14px * var(--wu));">
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <span style="font-size:calc(0.85rem * var(--wu)); font-weight:600; color:#f8fafc;">⚡ ${title}</span>
              <span id="metric-cores-${wId}" style="font-size:calc(0.7rem * var(--wu)); color:#94a3b8;">- Cores</span>
            </div>
            <div style="display:flex; align-items:center; gap:12px; margin:auto 0;">
              <div class="radial-gauge-box" style="position:relative; width:calc(64px * var(--wu)); height:calc(64px * var(--wu)); flex-shrink:0;">
                <svg class="radial-gauge-svg" viewBox="0 0 80 80" style="width:100%; height:100%; transform:rotate(-90deg);">
                  <circle class="radial-gauge-bg" cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8" />
                  <circle class="radial-gauge-progress" id="gauge-arc-${wId}" cx="40" cy="40" r="34" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" style="transition:stroke-dashoffset 0.5s ease;" />
                </svg>
                <div class="radial-gauge-val" id="gauge-val-${wId}" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:calc(0.95rem * var(--wu)); font-weight:700; color:#f8fafc;">0<span class="radial-gauge-unit">%</span></div>
              </div>
              <div style="display:flex; flex-direction:column; gap:4px; font-size:calc(0.72rem * var(--wu)); color:#94a3b8; overflow:hidden;">
                <div>Load: <span id="metric-load-${wId}" style="color:#f8fafc; font-weight:600;">-</span></div>
                <div id="metric-model-${wId}" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:110px;">CPU</div>
              </div>
            </div>
          </div>
        `;
        return;
      }

      if (type === 'ram_gauge') {
        el.innerHTML = `
          <div class="widget-card stage-widget" id="widget-card-${wId}" style="--widget-accent: ${color}; width:100%; height:100%; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box; padding:12px; background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.08); border-radius:calc(14px * var(--wu));">
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <span style="font-size:calc(0.85rem * var(--wu)); font-weight:600; color:#f8fafc;">🧠 ${title}</span>
            </div>
            <div style="display:flex; align-items:center; gap:12px; margin:auto 0;">
              <div class="radial-gauge-box" style="position:relative; width:calc(64px * var(--wu)); height:calc(64px * var(--wu)); flex-shrink:0;">
                <svg class="radial-gauge-svg" viewBox="0 0 80 80" style="width:100%; height:100%; transform:rotate(-90deg);">
                  <circle class="radial-gauge-bg" cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8" />
                  <circle class="radial-gauge-progress" id="gauge-arc-${wId}" cx="40" cy="40" r="34" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" style="transition:stroke-dashoffset 0.5s ease;" />
                </svg>
                <div class="radial-gauge-val" id="gauge-val-${wId}" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:calc(0.95rem * var(--wu)); font-weight:700; color:#f8fafc;">0<span class="radial-gauge-unit">%</span></div>
              </div>
              <div style="display:flex; flex-direction:column; gap:4px; font-size:calc(0.72rem * var(--wu)); color:#94a3b8;">
                <div>Used: <span id="metric-ram-used-${wId}" style="color:#f8fafc; font-weight:600;">0 GB</span></div>
                <div>Total: <span id="metric-ram-total-${wId}" style="color:#f8fafc; font-weight:600;">0 GB</span></div>
              </div>
            </div>
          </div>
        `;
        return;
      }

      if (type === 'disk_gauge') {
        el.innerHTML = `
          <div class="widget-card stage-widget" id="widget-card-${wId}" style="--widget-accent: ${color}; width:100%; height:100%; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box; padding:12px; background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.08); border-radius:calc(14px * var(--wu));">
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <span style="font-size:calc(0.85rem * var(--wu)); font-weight:600; color:#f8fafc;">💾 ${title}</span>
            </div>
            <div style="display:flex; align-items:center; gap:12px; margin:auto 0;">
              <div class="radial-gauge-box" style="position:relative; width:calc(64px * var(--wu)); height:calc(64px * var(--wu)); flex-shrink:0;">
                <svg class="radial-gauge-svg" viewBox="0 0 80 80" style="width:100%; height:100%; transform:rotate(-90deg);">
                  <circle class="radial-gauge-bg" cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8" />
                  <circle class="radial-gauge-progress" id="gauge-arc-${wId}" cx="40" cy="40" r="34" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" style="transition:stroke-dashoffset 0.5s ease;" />
                </svg>
                <div class="radial-gauge-val" id="gauge-val-${wId}" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:calc(0.95rem * var(--wu)); font-weight:700; color:#f8fafc;">0<span class="radial-gauge-unit">%</span></div>
              </div>
              <div style="display:flex; flex-direction:column; gap:4px; font-size:calc(0.72rem * var(--wu)); color:#94a3b8;">
                <div>Used: <span id="metric-disk-used-${wId}" style="color:#f8fafc; font-weight:600;">0 GB</span></div>
                <div>Free: <span id="metric-disk-free-${wId}" style="color:#f8fafc; font-weight:600;">0 GB</span></div>
              </div>
            </div>
          </div>
        `;
        return;
      }

      if (type === 'network_traffic') {
        el.innerHTML = `
          <div class="widget-card stage-widget" id="widget-card-${wId}" style="--widget-accent: ${color}; width:100%; height:100%; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box; padding:12px; background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.08); border-radius:calc(14px * var(--wu));">
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <span style="font-size:calc(0.85rem * var(--wu)); font-weight:600; color:#f8fafc;">🌐 ${title}</span>
            </div>
            <div style="display:flex; flex-direction:column; justify-content:center; gap:6px; margin:auto 0; font-size:calc(0.75rem * var(--wu));">
              <div style="display:flex; justify-content:space-between; color:#94a3b8;">
                <span>⬇️ RX Rate:</span>
                <span id="net-rx-speed-${wId}" style="color:#38bdf8; font-weight:700;">0 KB/s</span>
              </div>
              <div style="display:flex; justify-content:space-between; color:#94a3b8;">
                <span>⬆️ TX Rate:</span>
                <span id="net-tx-speed-${wId}" style="color:#10b981; font-weight:700;">0 KB/s</span>
              </div>
              <div id="net-total-io-${wId}" style="font-size:calc(0.68rem * var(--wu)); color:#64748b; text-align:center; margin-top:4px;">
                ⬇️ 0 MB | ⬆️ 0 MB
              </div>
            </div>
          </div>
        `;
        return;
      }

      if (type === 'docker_stats') {
        el.innerHTML = `
          <div class="widget-card stage-widget" id="widget-card-${wId}" style="--widget-accent: ${color}; width:100%; height:100%; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box; padding:12px; background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.08); border-radius:calc(14px * var(--wu));">
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <span style="font-size:calc(0.85rem * var(--wu)); font-weight:600; color:#f8fafc;">🐳 ${title}</span>
            </div>
            <div style="display:flex; align-items:center; gap:12px; margin:auto 0;">
              <div class="radial-gauge-box" style="position:relative; width:calc(64px * var(--wu)); height:calc(64px * var(--wu)); flex-shrink:0;">
                <svg class="radial-gauge-svg" viewBox="0 0 80 80" style="width:100%; height:100%; transform:rotate(-90deg);">
                  <circle class="radial-gauge-bg" cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8" />
                  <circle class="radial-gauge-progress" id="gauge-arc-${wId}" cx="40" cy="40" r="34" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" style="transition:stroke-dashoffset 0.5s ease;" />
                </svg>
                <div class="radial-gauge-val" id="gauge-val-${wId}" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:calc(0.95rem * var(--wu)); font-weight:700; color:#f8fafc;">0<span class="radial-gauge-unit">Up</span></div>
              </div>
              <div style="display:flex; flex-direction:column; gap:4px; font-size:calc(0.72rem * var(--wu)); color:#94a3b8;">
                <div id="docker-running-${wId}" style="color:#10b981; font-weight:600;">0 Containers</div>
                <div id="docker-total-${wId}">0 Total</div>
              </div>
            </div>
          </div>
        `;
        return;
      }

      if (type === 'host_info') {
        el.innerHTML = `
          <div class="widget-card stage-widget" id="widget-card-${wId}" style="--widget-accent: ${color}; width:100%; height:100%; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box; padding:12px; background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.08); border-radius:calc(14px * var(--wu));">
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <span style="font-size:calc(0.85rem * var(--wu)); font-weight:600; color:#f8fafc;">🖥️ ${title}</span>
            </div>
            <div style="display:flex; flex-direction:column; justify-content:center; gap:5px; margin:auto 0; font-size:calc(0.72rem * var(--wu));">
              <div>Host: <span id="host-hostname-${wId}" style="color:#f8fafc; font-weight:600;">-</span></div>
              <div>OS: <span id="host-os-${wId}" style="color:#94a3b8;">-</span></div>
              <div>Uptime: <span id="host-uptime-${wId}" style="color:#f8fafc; font-weight:600;">-</span></div>
              <div id="host-status-${wId}" style="color:#10b981; font-weight:600; margin-top:2px;">🛡️ Online</div>
            </div>
          </div>
        `;
        return;
      }

      // Default generic widget
      el.innerHTML = `
        <div class="widget-card stage-widget" id="widget-card-${wId}" style="width:100%; height:100%; padding:12px; box-sizing:border-box; background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.08); border-radius:calc(14px * var(--wu));">
          <span class="stage-tile-title">${title}</span>
        </div>
      `;
    }

    announce(message) {
      if (!message) return;
      const liveRegion = document.getElementById('a11yLiveRegion');
      if (!liveRegion) return;

      if (!this.announcementQueue) this.announcementQueue = [];
      this.announcementQueue.push(message);

      if (this.announcementTimer) clearTimeout(this.announcementTimer);
      this.announcementTimer = setTimeout(() => {
        if (this.announcementQueue.length === 0) return;
        const msg = this.announcementQueue.length === 1
          ? this.announcementQueue[0]
          : `${this.announcementQueue.length} system updates: ${this.announcementQueue[this.announcementQueue.length - 1]}`;
        liveRegion.textContent = msg;
        this.announcementQueue = [];
      }, 300);
    }

    initSpatialKeyboardNavigation() {
      const handleKeyDown = (e) => {
        // 1. Keyboard shortcuts help dialog '?'
        if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
          const modal = document.getElementById('keyboardModal');
          if (modal) {
            e.preventDefault();
            modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
          }
          return;
        }

        // Close modal on Escape
        if (e.key === 'Escape') {
          const modal = document.getElementById('keyboardModal');
          if (modal && modal.style.display !== 'none') {
            e.preventDefault();
            modal.style.display = 'none';
            return;
          }
        }

        // 2. Spatial Arrow Navigation
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          const items = Array.from(this.itemElements.values());
          if (items.length === 0) return;

          const activeEl = document.activeElement && this.itemElements.has(document.activeElement.getAttribute('data-id'))
            ? document.activeElement
            : (items.find(el => el.getAttribute('tabindex') === '0') || items[0]);

          const activeRect = activeEl.getBoundingClientRect();
          const activeCenterX = activeRect.left + activeRect.width / 2;
          const activeCenterY = activeRect.top + activeRect.height / 2;

          let dir = e.key;
          let bestEl = null;
          let bestDist = Infinity;

          for (const itemEl of items) {
            if (itemEl === activeEl) continue;
            const r = itemEl.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const dx = cx - activeCenterX;
            const dy = cy - activeCenterY;

            let isCandidate = false;
            if (dir === 'ArrowUp' && dy < -5) isCandidate = true;
            if (dir === 'ArrowDown' && dy > 5) isCandidate = true;
            if (dir === 'ArrowLeft' && dx < -5) isCandidate = true;
            if (dir === 'ArrowRight' && dx > 5) isCandidate = true;

            if (isCandidate) {
              const dist = (dir === 'ArrowUp' || dir === 'ArrowDown')
                ? Math.abs(dy) + 2 * Math.abs(dx)
                : Math.abs(dx) + 2 * Math.abs(dy);

              if (dist < bestDist) {
                bestDist = dist;
                bestEl = itemEl;
              }
            }
          }

          if (bestEl) {
            e.preventDefault();
            items.forEach(el => el.setAttribute('tabindex', '-1'));
            bestEl.setAttribute('tabindex', '0');
            bestEl.focus();
            const title = bestEl.getAttribute('aria-label') || bestEl.querySelector('.stage-tile-title')?.textContent || 'Item';
            this.announce(title);
          }
        }

        // 3. Enter key
        if (e.key === 'Enter') {
          const activeEl = document.activeElement;
          if (activeEl && this.itemElements.has(activeEl.getAttribute('data-id'))) {
            const link = activeEl.querySelector('.stage-service-tile');
            if (link) {
              e.preventDefault();
              link.click();
            } else {
              const chip = activeEl.querySelector('.stage-island-chip');
              if (chip) {
                e.preventDefault();
                chip.click();
              }
            }
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      this._keyboardHandler = handleKeyDown;

      // Close modal button listeners
      const closeBtn = document.getElementById('btnCloseKeyboardModal');
      const overlay = document.getElementById('kbOverlay');
      if (closeBtn) closeBtn.addEventListener('click', () => {
        const modal = document.getElementById('keyboardModal');
        if (modal) modal.style.display = 'none';
      });
      if (overlay) overlay.addEventListener('click', () => {
        const modal = document.getElementById('keyboardModal');
        if (modal) modal.style.display = 'none';
      });
    }

    destroy() {
      if (this._keyboardHandler) window.removeEventListener('keydown', this._keyboardHandler);
      if (this.announcementTimer) clearTimeout(this.announcementTimer);
      if (this.interaction) this.interaction.destroy();
      if (this.resizeObserver) this.resizeObserver.disconnect();
      if (this.sizeObserver) this.sizeObserver.disconnect();
      clearTimeout(this.idleTimer);
      if (this.container) this.container.innerHTML = '';
    }
  }

  return { StageRenderer };
});
