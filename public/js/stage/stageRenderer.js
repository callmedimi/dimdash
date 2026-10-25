/**
 * DimDash Stage Renderer
 * Renders spatial items and islands from layout.yaml onto a continuous pixel-responsive canvas.
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
      this.userScaleParam = 1.0;

      this.itemElements = new Map(); // id -> DOM element
      this.resizeObserver = null;

      this.idleTimer = null;
      this.isTenFoot = false;

      this.lastVwPx = 0;
      this.lastVhPx = 0;
      this.isRendering = false;
      this.relayoutRaf = null;

      this.camera = null;
      this.spatialIndex = null;
      this.overlayRenderer = null;
      this.interaction = null;
      this.stageScale = 1.0;
      this.centerTxPx = 0;
      this.centerTyPx = 0;

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
          <div id="stageBlueprintPill" class="stage-blueprint-pill" title="Toggle In-Place Blueprint Edit Mode (Key: E)" role="button" tabindex="0" aria-label="Toggle Blueprint Edit Mode">
            <span class="pill-dot"></span>
            <span class="pill-text">Blueprint Mode [E]</span>
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

      // Delegated capture listener for broken icon images
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
      this.userScaleParam = parseFloat(urlParams.get('scale')) || 1.0;

      const vwPx = this.viewportEl?.clientWidth || window.innerWidth || 1920;
      const vhPx = this.viewportEl?.clientHeight || (window.innerHeight - 70) || 1000;
      this.updatePixelScale(vwPx, vhPx, 1840, 920);
    }

    updatePixelScale(vwPx, vhPx, refW = 1840, refH = 920) {
      const isCoarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (window.DimDashScale && typeof window.DimDashScale.computePixelScale === 'function') {
        this.metrics = window.DimDashScale.computePixelScale({
          width_px: vwPx,
          height_px: vhPx,
          ref_w: refW,
          ref_h: refH,
          user_scale: this.userScaleParam,
          is_coarse: isCoarse
        });
        window.DimDashScale.applyToRoot(this.metrics);
        if (this.viewportEl) {
          this.viewportEl.style.setProperty('--wu', this.metrics.wu);
        }
      } else {
        const wu = Math.min(vwPx / refW, vhPx / refH) * this.userScaleParam;
        this.metrics = { wu: Number(wu.toFixed(4)), vw_wu: Math.round(vwPx / wu), vh_wu: Math.round(vhPx / wu) };
        if (document.documentElement) {
          document.documentElement.style.setProperty('--wu', this.metrics.wu);
        }
      }
    }

    initObservers() {
      if (typeof ResizeObserver === 'undefined') return;

      // Viewport resize observer
      this.resizeObserver = new ResizeObserver(entries => {
        if (!entries || !entries[0]) return;
        const cr = entries[0].contentRect;
        this.onViewportResize(cr.width, cr.height);
      });
      if (this.viewportEl) this.resizeObserver.observe(this.viewportEl);
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
      if (widthPx <= 0 || heightPx <= 0) return;

      if (this.camera) this.camera.setViewportSize(widthPx, heightPx);
      if (this.overlayRenderer) {
        this.overlayRenderer.resize(widthPx, heightPx, window.devicePixelRatio || 1);
        if (this.interaction) this.interaction.requestOverlayRedraw();
      }

      if (!this.board || this.isRendering) return;

      // Skip sub-pixel jitter
      if (Math.abs(widthPx - this.lastVwPx) < 2 && Math.abs(heightPx - this.lastVhPx) < 2) {
        return;
      }

      this.lastVwPx = widthPx;
      this.lastVhPx = heightPx;

      if (this.relayoutRaf) cancelAnimationFrame(this.relayoutRaf);
      this.relayoutRaf = requestAnimationFrame(() => {
        this.relayoutRaf = null;
        this.relayout();
      });
    }

    setBoard(board) {
      this.board = board;
      this.render();
    }

    static applyItemResponsiveMetrics(el, item, wWu, hWu) {
      if (!el) return;
      const w = Number(wWu) || 100;
      const h = Number(hWu) || 100;

      let sizeClass = 'm';
      if (w < 130 || h < 52) sizeClass = 'xs';
      else if (w < 240 && h < 95) sizeClass = 's';
      else if (w < 360 && h < 140) sizeClass = 'm';
      else if (w < 540 && h < 220) sizeClass = 'l';
      else sizeClass = 'xl';

      const isCard = h >= 130 && (h / Math.max(1, w) >= 0.40);
      const layoutVal = isCard ? 'stacked' : 'row';

      if (el.getAttribute('data-size') !== sizeClass) {
        el.setAttribute('data-size', sizeClass);
      }
      if (el.getAttribute('data-card-layout') !== layoutVal) {
        el.setAttribute('data-card-layout', layoutVal);
      }

      if (!item || item.kind === 'widget' || el.classList.contains('stage-kind-widget')) {
        const scaleW = w / 220;
        const scaleH = h / 175;
        const itemScale = Math.min(Math.max(Math.min(scaleW, scaleH), 0.62), 2.8);
        el.style.setProperty('--item-scale', itemScale.toFixed(3));
      }
    }

    render() {
      if (!this.board || !this.viewportEl) return;
      this.isRendering = true;

      const items = this.board.config?.items || [];
      const layout = this.board.layout || {};

      const vwPx = this.viewportEl.clientWidth || window.innerWidth || 1920;
      const vhPx = this.viewportEl.clientHeight || (window.innerHeight - 70) || 960;

      // 1. Resolve Profile based on viewport pixel width
      // Mobile flow mode ONLY on narrow screens (<= 640px).
      // All monitors, laptops, ultrawides, and video walls use the canonical 'lg' (1920x1080) layout
      // scaled proportionally by --wu so items NEVER jump profiles or scramble positions!
      const urlParams = new URLSearchParams(window.location.search);
      const overrideProf = urlParams.get('profile');
      const profiles = layout.profiles || (window.DimDashSolver ? window.DimDashSolver.DEFAULT_PROFILES : []);

      let profile = null;
      if (overrideProf) {
        profile = profiles.find(p => p.id === overrideProf);
      }
      if (!profile) {
        if (vwPx <= 640) {
          profile = profiles.find(p => p.id === 'xs') || { id: 'xs', mode: 'flow', design: [390, 844] };
        } else {
          profile = profiles.find(p => p.id === 'lg') || { id: 'lg', mode: 'fit', design: [1920, 1080] };
        }
      }

      this.currentProfile = profile;
      this.currentMode = profile.mode || 'fit';

      this.viewportEl.setAttribute('data-profile', profile.id);
      this.viewportEl.setAttribute('data-mode', this.currentMode);

      this.isTenFoot = profile.ui === 'tenfoot' || profile.id === 'wall' || vwPx >= 3200;
      if (this.isTenFoot) {
        this.viewportEl.setAttribute('data-ui', 'tenfoot');
      } else {
        this.viewportEl.removeAttribute('data-ui');
      }

      // 2. Solve Layout in canonical reference space
      const solver = window.DimDashSolver;
      if (!solver) {
        this.isRendering = false;
        return;
      }

      const designW = profile.design ? profile.design[0] : 1920;
      const designH = profile.design ? profile.design[1] : 1080;

      const solved = solver.solveStageLayout(items, layout, { w: designW, h: designH }, profile.id, {
        isRtl: document.documentElement.dir === 'rtl',
        mirrorLayoutInRtl: !!this.board.config?.settings?.mirror_layout_in_rtl
      });

      // Only run collision relief when NOT actively editing in Blueprint Mode
      const activeRects = (this.interaction && this.interaction.isEditing)
        ? solved.rects
        : solver.relieveCollisions(solved.rects, { w: designW, h: designH }).rects;

      let finalRects = activeRects;

      if (this.currentMode === 'flow') {
        this.updatePixelScale(vwPx, vhPx, 390, 844);
        const wu = this.metrics ? this.metrics.wu : 1.0;
        const flowResult = solver.solveMode('flow', activeRects, {
          w: Math.round(vwPx / wu),
          h: Math.round(vhPx / wu)
        }, {
          isRtl: document.documentElement.dir === 'rtl'
        });
        finalRects = flowResult.rects;
        this.stageScale = 1.0;
        this.centerTxPx = 0;
        this.centerTyPx = 0;
        this.canvasEl.style.setProperty('--stage-scale', '1');
        this.canvasEl.style.setProperty('--stage-tx', '0px');
        this.canvasEl.style.setProperty('--stage-ty', '0px');
      } else {
        // Compute content bounding box in logical design units (wu)
        let minX = Infinity;
        let minY = Infinity;
        let maxX = 0;
        let maxY = 0;

        for (const r of activeRects) {
          if (r.pinned) continue;
          if (r.x < minX) minX = r.x;
          if (r.y < minY) minY = r.y;
          if (r.x + r.w > maxX) maxX = r.x + r.w;
          if (r.y + r.h > maxY) maxY = r.y + r.h;
        }

        if (!isFinite(minX)) minX = 40;
        if (!isFinite(minY)) minY = 40;
        if (maxX <= 0) maxX = 1760;
        if (maxY <= 0) maxY = 600;

        const padX = Math.max(24, Math.min(minX, 60));
        const padY = Math.max(24, Math.min(minY, 60));
        const contentRefW = Math.max(1800, maxX + padX);
        const contentRefH = Math.max(640, maxY + padY);

        // Lock scale and centering offset while user is actively dragging/resizing in Blueprint Mode
        const isActivelyDragging = !!(this.interaction && this.interaction.session);
        if (!isActivelyDragging || !this.metrics) {
          this.updatePixelScale(vwPx, vhPx, contentRefW, contentRefH);
        }

        const wu = this.metrics ? this.metrics.wu : 1.0;
        this.stageScale = 1.0;
        this.canvasEl.style.setProperty('--stage-scale', '1');

        if (!isActivelyDragging) {
          const visualSpanW = (maxX + minX) * wu;
          const centerTxPx = vwPx > visualSpanW
            ? Math.max(0, Math.round((vwPx - visualSpanW) / 2))
            : 0;
          this.centerTxPx = centerTxPx;
          this.canvasEl.style.setProperty('--stage-tx', `${centerTxPx}px`);
          this.canvasEl.style.setProperty('--stage-ty', '0px');
        }
      }

      // 3. Render or Update DOM Nodes (Node Re-use)
      this.mountItems(finalRects, items);

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

      const activeIds = new Set(rects.map(r => r.id));

      // Remove nodes no longer in active layout
      for (const [id, el] of this.itemElements.entries()) {
        if (!activeIds.has(id)) {
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
        } else if (item.kind === 'island') {
          // Only re-render island innerHTML if collapse state changed or custom clip shape dimensions changed
          const shape = item.props?.shape || 'rounded';
          const prevW = parseFloat(el.style.getPropertyValue('--w'));
          const prevH = parseFloat(el.style.getPropertyValue('--h'));
          const autoBelow = item.props?.collapse?.auto_below || [120, 80];
          const shouldBeChip = item.props?.collapse?.state === 'chip' || (rect.w < autoBelow[0] || rect.h < autoBelow[1]);
          const wasChip = el.classList.contains('is-chip');

          if (shouldBeChip !== wasChip || (shape !== 'rounded' && shape !== 'rect' && (prevW !== rect.w || prevH !== rect.h))) {
            this.renderItemContent(el, item, rect);
          }
        }

        // Write coordinates via CSS custom properties
        el.style.setProperty('--x', rect.x);
        el.style.setProperty('--y', rect.y);
        el.style.setProperty('--w', rect.w);
        el.style.setProperty('--h', rect.h);
        el.style.setProperty('--z', rect.z || 1);

        StageRenderer.applyItemResponsiveMetrics(el, item, rect.w, rect.h);

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
            this.renderItemContent(el, item, rect);
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

        if (window.DimDashShapes && shape !== 'rect' && shape !== 'rounded') {
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

        const headerStyle = item.props?.header?.style || item.props?.headerStyle || 'bar';
        const layoutMode = item.props?.layout || item.props?.layoutMode || 'free';
        const overflowMode = item.props?.overflow || 'clip';
        const bgStyle = item.props?.bgStyle || item.props?.bg_style || 'glass';
        const iconPlate = item.props?.iconPlate || item.props?.icon_plate || 'none';
        const tint = (item.props?.tint && bgStyle !== 'transparent' && bgStyle !== 'ghost' && bgStyle !== 'light')
          ? `style="--card-bg: ${item.props.tint};"`
          : '';

        const bgClass = bgStyle === 'transparent' ? 'cat-transparent'
                      : bgStyle === 'ghost' ? 'cat-ghost'
                      : bgStyle === 'light' ? 'cat-light'
                      : 'cat-glass';

        el.innerHTML = `
          <div class="stage-island ${bgClass}" ${tint} data-shape="${shape}" data-header="${headerStyle}" data-layout="${layoutMode}" data-overflow="${overflowMode}" data-bg-style="${bgStyle}" data-icon-plate="${iconPlate}" style="${clipStyle}">
            ${svgBorderHtml}
            <header class="stage-island-header">
              <span class="stage-island-title">
                <span class="island-icon">${item.props?.icon ? `<i data-icon="${item.props.icon}"></i>` : ''}</span>
                <span>${item.title || 'Island'}</span>
              </span>
              <div class="stage-island-actions">
                <button type="button" class="stage-island-btn admin-only" id="btnCatEdit_${item.id}" title="تنظیمات دسته‌بندی و شفافیت">⚙️</button>
                <button type="button" class="stage-island-btn" id="btnCollapse_${item.id}" title="Collapse">−</button>
              </div>
            </header>
            <div class="stage-island-body" id="body_${item.id}" style="${padStyle}"></div>
          </div>
        `;

        const editBtn = el.querySelector(`#btnCatEdit_${item.id}`);
        if (editBtn) {
          editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.openCategoryModal) {
              window.openCategoryModal(item.id);
            }
          });
        }

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

        const parentId = rect?.parent || el.getAttribute('data-parent') || this.board?.layout?.placement?.[item.id]?.lg?.parent || '';
        const parentIsl = (parentId && this.board?.config?.items)
          ? this.board.config.items.find(i => i.id === parentId)
          : null;
        const catIconPlate = parentIsl?.props?.iconPlate || parentIsl?.props?.icon_plate || 'none';

        const tileBgClass = (catIconPlate === 'cards-transparent') ? 'card-transparent' : '';
        const iconPlateClass = (catIconPlate === 'icon-transparent' || catIconPlate === 'cards-transparent') ? 'plate-transparent'
                             : (catIconPlate === 'light') ? 'plate-light'
                             : (catIconPlate === 'invert') ? 'filter-invert'
                             : '';

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
          <a class="stage-service-tile tile-main-link ${tileBgClass}" href="${targetUrl}" target="${openInNew}" rel="noreferrer" title="${item.subtitle || item.title}" aria-label="${ariaLabel}" draggable="false">
            <div class="stage-tile-icon tile-icon-box ${iconPlateClass}">
              ${iconMarkup}
            </div>
            <div class="stage-tile-info">
              <span class="stage-tile-title" dir="auto">${item.title || 'Service'}</span>
              ${item.subtitle ? `<span class="stage-tile-subtitle" dir="auto">${item.subtitle}</span>` : ''}
            </div>
            <div class="tile-status-indicator">
              <span class="pilot-light ${isOnline ? 'pilot-active' : ''}" style="display:inline-block; border-radius:50%; background:${statusColor}; box-shadow:0 0 6px ${statusColor};"></span>
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

      // Pure pixel-based scaling formula: calc(<px> * var(--wu) * var(--item-scale, 1))
      const u = 'calc(var(--wu, 1) * var(--item-scale, 1))';

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
          <div class="widget-card clock-widget-card stage-widget" id="widget-card-${wId}" data-widget-id="${wId}" style="--widget-accent: ${color}; width:100%; height:100%; min-width:0; min-height:0; display:flex; flex-direction:column; justify-content:center; align-items:center; box-sizing:border-box; padding:calc(10px * ${u}); background:rgba(15,23,42,0.78); border:1px solid rgba(255,255,255,0.08); border-radius:calc(14px * var(--wu));">
            <div class="clock-time-display" id="clock-display-${wId}" data-time-format="24h" style="font-size:calc(27px * ${u}); font-weight:800; letter-spacing:0.04em; color:#f8fafc; font-variant-numeric:tabular-nums; line-height:1.1;">
              ${timeStr}
            </div>
            <div class="clock-dates-container" id="clock-dates-${wId}" data-calendar-mode="both" style="display:flex; flex-direction:column; align-items:center; gap:calc(4px * ${u}); margin-top:calc(6px * ${u}); font-size:calc(11.5px * ${u}); width:100%;">
              ${shamsiHtml}
              ${gregorianHtml}
            </div>
          </div>
        `;
        return;
      }

      if (type === 'cpu_gauge') {
        el.innerHTML = `
          <div class="widget-card stage-widget" id="widget-card-${wId}" style="--widget-accent: ${color}; width:100%; height:100%; min-width:0; min-height:0; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box; padding:calc(12px * ${u}); background:rgba(15,23,42,0.78); border:1px solid rgba(255,255,255,0.08); border-radius:calc(14px * var(--wu));">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:calc(6px * ${u});">
              <span style="font-size:calc(13.5px * ${u}); font-weight:600; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">⚡ ${title}</span>
              <span id="metric-cores-${wId}" style="font-size:calc(11px * ${u}); color:#94a3b8; white-space:nowrap; flex-shrink:0;">- Cores</span>
            </div>
            <div style="display:flex; align-items:center; gap:calc(12px * ${u}); margin:auto 0; min-width:0;">
              <div class="radial-gauge-box" style="position:relative; width:calc(62px * ${u}); height:calc(62px * ${u}); min-width:calc(62px * ${u}); min-height:calc(62px * ${u}); flex-shrink:0;">
                <svg class="radial-gauge-svg" viewBox="0 0 80 80" style="width:100%; height:100%; transform:rotate(-90deg);">
                  <circle class="radial-gauge-bg" cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8" />
                  <circle class="radial-gauge-progress" id="gauge-arc-${wId}" cx="40" cy="40" r="34" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" />
                </svg>
                <div class="radial-gauge-val" id="gauge-val-${wId}" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:calc(14.5px * ${u}); font-weight:700; color:#f8fafc;">0<span class="radial-gauge-unit" style="font-size:calc(10px * ${u});">%</span></div>
              </div>
              <div style="display:flex; flex-direction:column; gap:calc(4px * ${u}); font-size:calc(11.5px * ${u}); color:#94a3b8; overflow:hidden; min-width:0; flex:1;">
                <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Load: <span id="metric-load-${wId}" style="color:#f8fafc; font-weight:600;">-</span></div>
                <div id="metric-model-${wId}" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">CPU</div>
              </div>
            </div>
          </div>
        `;
        return;
      }

      if (type === 'ram_gauge') {
        el.innerHTML = `
          <div class="widget-card stage-widget" id="widget-card-${wId}" style="--widget-accent: ${color}; width:100%; height:100%; min-width:0; min-height:0; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box; padding:calc(12px * ${u}); background:rgba(15,23,42,0.78); border:1px solid rgba(255,255,255,0.08); border-radius:calc(14px * var(--wu));">
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <span style="font-size:calc(13.5px * ${u}); font-weight:600; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🧠 ${title}</span>
            </div>
            <div style="display:flex; align-items:center; gap:calc(12px * ${u}); margin:auto 0; min-width:0;">
              <div class="radial-gauge-box" style="position:relative; width:calc(62px * ${u}); height:calc(62px * ${u}); min-width:calc(62px * ${u}); min-height:calc(62px * ${u}); flex-shrink:0;">
                <svg class="radial-gauge-svg" viewBox="0 0 80 80" style="width:100%; height:100%; transform:rotate(-90deg);">
                  <circle class="radial-gauge-bg" cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8" />
                  <circle class="radial-gauge-progress" id="gauge-arc-${wId}" cx="40" cy="40" r="34" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" />
                </svg>
                <div class="radial-gauge-val" id="gauge-val-${wId}" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:calc(14.5px * ${u}); font-weight:700; color:#f8fafc;">0<span class="radial-gauge-unit" style="font-size:calc(10px * ${u});">%</span></div>
              </div>
              <div style="display:flex; flex-direction:column; gap:calc(4px * ${u}); font-size:calc(11.5px * ${u}); color:#94a3b8; overflow:hidden; min-width:0; flex:1;">
                <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Used: <span id="metric-ram-used-${wId}" style="color:#f8fafc; font-weight:600;">0 GB</span></div>
                <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Total: <span id="metric-ram-total-${wId}" style="color:#f8fafc; font-weight:600;">0 GB</span></div>
              </div>
            </div>
          </div>
        `;
        return;
      }

      if (type === 'disk_gauge') {
        el.innerHTML = `
          <div class="widget-card stage-widget" id="widget-card-${wId}" style="--widget-accent: ${color}; width:100%; height:100%; min-width:0; min-height:0; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box; padding:calc(12px * ${u}); background:rgba(15,23,42,0.78); border:1px solid rgba(255,255,255,0.08); border-radius:calc(14px * var(--wu));">
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <span style="font-size:calc(13.5px * ${u}); font-weight:600; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">💾 ${title}</span>
            </div>
            <div style="display:flex; align-items:center; gap:calc(12px * ${u}); margin:auto 0; min-width:0;">
              <div class="radial-gauge-box" style="position:relative; width:calc(62px * ${u}); height:calc(62px * ${u}); min-width:calc(62px * ${u}); min-height:calc(62px * ${u}); flex-shrink:0;">
                <svg class="radial-gauge-svg" viewBox="0 0 80 80" style="width:100%; height:100%; transform:rotate(-90deg);">
                  <circle class="radial-gauge-bg" cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8" />
                  <circle class="radial-gauge-progress" id="gauge-arc-${wId}" cx="40" cy="40" r="34" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" />
                </svg>
                <div class="radial-gauge-val" id="gauge-val-${wId}" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:calc(14.5px * ${u}); font-weight:700; color:#f8fafc;">0<span class="radial-gauge-unit" style="font-size:calc(10px * ${u});">%</span></div>
              </div>
              <div style="display:flex; flex-direction:column; gap:calc(4px * ${u}); font-size:calc(11.5px * ${u}); color:#94a3b8; overflow:hidden; min-width:0; flex:1;">
                <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Used: <span id="metric-disk-used-${wId}" style="color:#f8fafc; font-weight:600;">0 GB</span></div>
                <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Free: <span id="metric-disk-free-${wId}" style="color:#f8fafc; font-weight:600;">0 GB</span></div>
              </div>
            </div>
          </div>
        `;
        return;
      }

      if (type === 'network_traffic') {
        el.innerHTML = `
          <div class="widget-card stage-widget" id="widget-card-${wId}" style="--widget-accent: ${color}; width:100%; height:100%; min-width:0; min-height:0; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box; padding:calc(12px * ${u}); background:rgba(15,23,42,0.78); border:1px solid rgba(255,255,255,0.08); border-radius:calc(14px * var(--wu));">
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <span style="font-size:calc(13.5px * ${u}); font-weight:600; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🌐 ${title}</span>
            </div>
            <div style="display:flex; flex-direction:column; justify-content:center; gap:calc(6px * ${u}); margin:auto 0; font-size:calc(12px * ${u}); min-width:0;">
              <div style="display:flex; justify-content:space-between; gap:calc(4px * ${u}); color:#94a3b8; white-space:nowrap;">
                <span>⬇️ RX Rate:</span>
                <span id="net-rx-speed-${wId}" style="color:#38bdf8; font-weight:700;">0 KB/s</span>
              </div>
              <div style="display:flex; justify-content:space-between; gap:calc(4px * ${u}); color:#94a3b8; white-space:nowrap;">
                <span>⬆️ TX Rate:</span>
                <span id="net-tx-speed-${wId}" style="color:#10b981; font-weight:700;">0 KB/s</span>
              </div>
              <div id="net-total-io-${wId}" style="font-size:calc(10.8px * ${u}); color:#64748b; text-align:center; margin-top:calc(4px * ${u}); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ⬇️ 0 MB | ⬆️ 0 MB
              </div>
            </div>
          </div>
        `;
        return;
      }

      if (type === 'docker_stats') {
        const initialDocker = window.AppState?.systemTelemetry?.docker;
        const isFa = (window.AppState?.config?.settings?.locale === 'fa');
        const running = initialDocker?.running ?? 0;
        const stopped = initialDocker?.stopped ?? 0;
        const total = initialDocker?.total ?? 0;
        const pct = total > 0 ? Math.round((running / total) * 100) : 0;
        const dashOffset = C - (pct / 100) * C;

        el.innerHTML = `
          <div class="widget-card stage-widget docker-widget-card" id="widget-card-${wId}" onclick="if(!document.getElementById('stageViewport')?.classList.contains('is-resizing') && !document.getElementById('stageViewport')?.classList.contains('is-interacting') && window.openDockerContainersModal) window.openDockerContainersModal();" title="${isFa ? 'مشاهده لیست کامل کانتینرها (برای مشاهده کلیک کنید)' : 'Click to view containers'}" style="--widget-accent: ${color}; width:100%; height:100%; min-width:0; min-height:0; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box; padding:calc(12px * ${u}); background:rgba(15,23,42,0.78); border:1px solid rgba(255,255,255,0.08); border-radius:calc(14px * var(--wu)); cursor:pointer;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:calc(4px * ${u});">
              <span style="font-size:calc(13.5px * ${u}); font-weight:600; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🐳 ${title}</span>
              <span style="font-size:calc(10.8px * ${u}); color:#38bdf8; opacity:0.85; font-weight:500; white-space:nowrap; flex-shrink:0;">🔍 ${isFa ? 'جزئیات' : 'Details'}</span>
            </div>
            <div style="display:flex; align-items:center; gap:calc(12px * ${u}); margin:auto 0; min-width:0;">
              <div class="radial-gauge-box" style="position:relative; width:calc(62px * ${u}); height:calc(62px * ${u}); min-width:calc(62px * ${u}); min-height:calc(62px * ${u}); flex-shrink:0;">
                <svg class="radial-gauge-svg" viewBox="0 0 80 80" style="width:100%; height:100%; transform:rotate(-90deg);">
                  <circle class="radial-gauge-bg" cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8" />
                  <circle class="radial-gauge-progress" id="gauge-arc-${wId}" cx="40" cy="40" r="34" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${dashOffset}" />
                </svg>
                <div class="radial-gauge-val" id="gauge-val-${wId}" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:calc(14.5px * ${u}); font-weight:700; color:#f8fafc;">${running}<span class="radial-gauge-unit" style="font-size:calc(10px * ${u});">${isFa ? 'فعال' : 'Up'}</span></div>
              </div>
              <div style="display:flex; flex-direction:column; gap:calc(3px * ${u}); font-size:calc(11.5px * ${u}); color:#94a3b8; overflow:hidden; min-width:0; flex:1;">
                <div id="docker-running-${wId}" style="color:#10b981; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${running} ${isFa ? 'در حال اجرا' : 'Containers'}</div>
                <div id="docker-stopped-${wId}" style="color:#94a3b8; font-size:calc(10.8px * ${u}); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${stopped} ${isFa ? 'متوقف' : 'Containers'}</div>
                <div id="docker-total-${wId}" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${total} ${isFa ? 'کل کانتینرها' : 'Total'}</div>
              </div>
            </div>
            <div class="docker-mini-list" id="docker-mini-list-${wId}" style="display:none; flex-direction:column; gap:calc(3px * ${u}); border-top:1px solid rgba(255,255,255,0.07); padding-top:calc(6px * ${u}); font-size:calc(10.8px * ${u}); color:#cbd5e1; overflow:hidden;"></div>
          </div>
        `;
        return;
      }

      if (type === 'host_info') {
        el.innerHTML = `
          <div class="widget-card stage-widget" id="widget-card-${wId}" style="--widget-accent: ${color}; width:100%; height:100%; min-width:0; min-height:0; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box; padding:calc(12px * ${u}); background:rgba(15,23,42,0.78); border:1px solid rgba(255,255,255,0.08); border-radius:calc(14px * var(--wu));">
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <span style="font-size:calc(13.5px * ${u}); font-weight:600; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🖥️ ${title}</span>
            </div>
            <div style="display:flex; flex-direction:column; justify-content:center; gap:calc(5px * ${u}); margin:auto 0; font-size:calc(11.5px * ${u}); min-width:0; overflow:hidden;">
              <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Host: <span id="host-hostname-${wId}" style="color:#f8fafc; font-weight:600;">-</span></div>
              <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">OS: <span id="host-os-${wId}" style="color:#94a3b8;">-</span></div>
              <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Uptime: <span id="host-uptime-${wId}" style="color:#f8fafc; font-weight:600;">-</span></div>
              <div id="host-status-${wId}" style="color:#10b981; font-weight:600; margin-top:calc(2px * ${u}); white-space:nowrap;">🛡️ Online</div>
            </div>
          </div>
        `;
        return;
      }

      // Default generic widget
      el.innerHTML = `
        <div class="widget-card stage-widget" id="widget-card-${wId}" style="width:100%; height:100%; min-width:0; min-height:0; padding:calc(12px * ${u}); box-sizing:border-box; background:rgba(15,23,42,0.78); border:1px solid rgba(255,255,255,0.08); border-radius:calc(14px * var(--wu));">
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
          if (this.interaction && this.interaction.isEditing) return;
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
          if (this.interaction && this.interaction.isEditing) return;
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
      if (this.relayoutRaf) cancelAnimationFrame(this.relayoutRaf);
      if (this.interaction) this.interaction.destroy();
      if (this.resizeObserver) this.resizeObserver.disconnect();
      clearTimeout(this.idleTimer);
      if (this.container) this.container.innerHTML = '';
    }
  }

  return { StageRenderer };
});
