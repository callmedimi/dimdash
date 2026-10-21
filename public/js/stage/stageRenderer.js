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

      this.initDom();
      this.initDisplayScale();
      this.initObservers();
      this.initIdleHandler();
    }

    initDom() {
      if (!this.container) return;

      this.container.innerHTML = `
        <div id="stageViewport" class="stage-viewport" data-mode="fit">
          <div id="stageCanvas" class="stage-canvas"></div>
          <canvas id="stageOverlay" class="stage-overlay"></canvas>
          <div id="stageHud" class="stage-hud"></div>
        </div>
      `;

      this.viewportEl = this.container.querySelector('#stageViewport');
      this.canvasEl = this.container.querySelector('#stageCanvas');
      this.overlayEl = this.container.querySelector('#stageOverlay');
      this.hudEl = this.container.querySelector('#stageHud');
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
        this.canvasEl.style.setProperty('--stage-scale', stageScale);
      } else {
        this.canvasEl.style.setProperty('--stage-scale', 1.0);
      }

      // 3. Render or Update DOM Nodes (Node Re-use)
      this.mountItems(modeResult.rects, items);

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
          el = this.createItemElement(item);
          this.itemElements.set(rect.id, el);
          if (rect.pinned) {
            this.hudEl.appendChild(el);
          } else {
            this.canvasEl.appendChild(el);
          }
          if (this.sizeObserver) this.sizeObserver.observe(el);
        }

        // Write coordinates via CSS custom properties
        el.style.setProperty('--x', rect.x);
        el.style.setProperty('--y', rect.y);
        el.style.setProperty('--w', rect.w);
        el.style.setProperty('--h', rect.h);
        el.style.setProperty('--z', rect.z || 1);

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
    }

    createItemElement(item) {
      const el = document.createElement('section');
      el.className = `stage-item stage-${item.kind || 'widget'}`;
      el.setAttribute('data-id', item.id);
      el.setAttribute('data-kind', item.kind || 'widget');

      this.renderItemContent(el, item);
      return el;
    }

    renderItemContent(el, item) {
      if (item.kind === 'island') {
        el.innerHTML = `
          <div class="stage-island">
            <header class="stage-island-header">
              <span class="stage-island-title">
                <span class="island-icon">${item.props?.icon ? `<i data-icon="${item.props.icon}"></i>` : ''}</span>
                <span>${item.title || 'Island'}</span>
              </span>
            </header>
            <div class="stage-island-body" id="body_${item.id}"></div>
          </div>
        `;
        return;
      }

      if (item.kind === 'service') {
        const targetUrl = item.props?.target_url || '#';
        const openInNew = item.props?.open_in_new_tab !== false ? '_blank' : '_self';
        const iconVal = item.props?.icon_value || '';
        const isSvgOrImg = iconVal.startsWith('/') || iconVal.startsWith('http');

        el.innerHTML = `
          <a class="stage-service-tile" href="${targetUrl}" target="${openInNew}" rel="noreferrer" title="${item.subtitle || item.title}">
            <div class="stage-tile-icon">
              ${isSvgOrImg ? `<img src="${iconVal}" alt="${item.title}" loading="lazy">` : `<span class="icon-text">🔗</span>`}
            </div>
            <div class="stage-tile-info">
              <span class="stage-tile-title">${item.title || 'Service'}</span>
              ${item.subtitle ? `<span class="stage-tile-subtitle">${item.subtitle}</span>` : ''}
            </div>
          </a>
        `;
        return;
      }

      if (item.kind === 'widget') {
        el.innerHTML = `
          <div class="stage-widget" id="widget_${item.id}">
            <span class="stage-tile-title">${item.title || item.type || 'Widget'}</span>
          </div>
        `;
        return;
      }

      // Generic text / divider / image
      el.innerHTML = `<div class="stage-generic">${item.title || ''}</div>`;
    }

    destroy() {
      if (this.resizeObserver) this.resizeObserver.disconnect();
      if (this.sizeObserver) this.sizeObserver.disconnect();
      clearTimeout(this.idleTimer);
      if (this.container) this.container.innerHTML = '';
    }
  }

  return { StageRenderer };
});
