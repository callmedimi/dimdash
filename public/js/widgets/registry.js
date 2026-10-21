/**
 * DimDash Widget Framework: Registry & Lifecycle Contract (P08)
 * Manages widget definitions, lazy loading, error isolation, size classes, and manifests
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WidgetRegistry = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const registry = new Map();
  const manifests = new Map();
  const lazyLoaders = new Map();

  /**
   * Helper to normalize and validate widget definition
   */
  function defineWidget(def) {
    if (!def || typeof def !== 'object') {
      throw new Error('[WidgetRegistry] Invalid widget definition: must be an object');
    }
    if (!def.type || typeof def.type !== 'string') {
      throw new Error('[WidgetRegistry] Widget must have a string "type"');
    }
    if (typeof def.mount !== 'function') {
      throw new Error(`[WidgetRegistry] Widget "${def.type}" must provide a "mount(ctx)" function`);
    }

    const version = Number(def.version) || 1;
    const size = Object.assign(
      { min: [80, 48], preferred: [200, 120], max: [1200, 800], aspect: null, resizable: true },
      def.size
    );

    const manifest = {
      type: def.type,
      version,
      label: def.label || { en: def.type, fa: def.type },
      category: def.category || 'general',
      icon: def.icon || 'widget',
      size,
      schema: def.schema || {},
      bindings: def.bindings || {}
    };

    return {
      type: def.type,
      version,
      manifest,
      size,
      schema: def.schema || {},
      bindings: def.bindings || {},
      migrate: typeof def.migrate === 'function' ? def.migrate : (p) => p,
      mount: def.mount
    };
  }

  /**
   * Register a widget definition directly
   */
  function register(widgetDef) {
    const w = defineWidget(widgetDef);
    registry.set(w.type, w);
    manifests.set(w.type, w.manifest);
    return w;
  }

  /**
   * Register a lazy-loaded widget with lightweight manifest
   */
  function registerLazy(type, manifest, loaderFn) {
    manifests.set(type, Object.assign({ type }, manifest));
    lazyLoaders.set(type, loaderFn);
  }

  /**
   * Get widget definition (synchronous)
   */
  function get(type) {
    return registry.get(type) || null;
  }

  /**
   * Get widget manifest (instant metadata lookup for palette)
   */
  function getManifest(type) {
    return manifests.get(type) || null;
  }

  /**
   * List all available widget manifests
   */
  function listManifests(filter = {}) {
    const list = Array.from(manifests.values());
    if (filter.category) {
      return list.filter((m) => m.category === filter.category);
    }
    return list;
  }

  /**
   * Resolve widget asynchronously (handles lazy loading)
   */
  async function load(type) {
    if (registry.has(type)) {
      return registry.get(type);
    }
    if (lazyLoaders.has(type)) {
      try {
        const loader = lazyLoaders.get(type);
        const module = await loader();
        const def = module.default || module;
        return register(def);
      } catch (err) {
        console.error(`[WidgetRegistry] Failed to lazy load widget "${type}":`, err);
        return null;
      }
    }
    return null;
  }

  /**
   * Compute size class (XS, S, M, L, XL) from width
   */
  function computeSizeClass(w) {
    if (w < 120) return 'xs';
    if (w < 220) return 's';
    if (w < 360) return 'm';
    if (w < 540) return 'l';
    return 'xl';
  }

  /**
   * Create an isolated disposal scope for widget subscriptions and timers
   */
  function createScope() {
    const cleanups = [];
    return {
      effect(fn) {
        if (typeof fn !== 'function') return;
        const res = fn();
        if (typeof res === 'function') cleanups.push(res);
      },
      interval(fn, ms) {
        const id = setInterval(fn, ms);
        cleanups.push(() => clearInterval(id));
        return id;
      },
      add(cleanupFn) {
        if (typeof cleanupFn === 'function') cleanups.push(cleanupFn);
      },
      dispose() {
        while (cleanups.length > 0) {
          const fn = cleanups.pop();
          try {
            fn();
          } catch (e) {
            console.error('[WidgetRegistry] Scope cleanup error:', e);
          }
        }
      }
    };
  }

  /**
   * Mount a widget into a container with full error isolation & fallback
   */
  function mount(type, containerEl, ctxOptions = {}) {
    const widget = get(type);
    const scope = createScope();

    // 1. Missing Widget Fallback Placeholder
    if (!widget) {
      containerEl.innerHTML = `
        <div class="widget-missing-placeholder" style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; padding:var(--space-3); text-align:center; color:var(--text-muted); font-size:var(--text-caption);">
          <span style="font-family:var(--font-mono); font-size:var(--text-micro); opacity:0.7;">[MISSING WIDGET]</span>
          <strong style="color:var(--text-primary); margin:2px 0;">${type}</strong>
          <span>Data preserved</span>
        </div>
      `;
      return {
        update: () => {},
        resize: () => {},
        destroy: () => scope.dispose()
      };
    }

    // 2. Prepare Widget Context
    let currentWidth = ctxOptions.width || containerEl.clientWidth || 200;
    let currentHeight = ctxOptions.height || containerEl.clientHeight || 120;
    let currentCls = computeSizeClass(currentWidth);

    const sizeState = { w: currentWidth, h: currentHeight, cls: currentCls };

    const ctx = {
      el: containerEl,
      props: () => ctxOptions.props || {},
      bind: ctxOptions.bind || (() => null),
      size: () => sizeState,
      scope,
      theme: ctxOptions.theme || 'graphite',
      locale: ctxOptions.locale || 'en',
      now: () => Date.now()
    };

    // 3. Mount with Error Isolation
    try {
      containerEl.classList.add(`widget-size-${currentCls}`);
      const instance = widget.mount(ctx) || {};

      return {
        update: (newProps) => {
          try {
            if (typeof instance.update === 'function') {
              instance.update(newProps);
            }
          } catch (err) {
            console.error(`[WidgetRegistry] Update error in widget "${type}":`, err);
          }
        },
        resize: (newW, newH) => {
          try {
            sizeState.w = newW;
            sizeState.h = newH;
            const newCls = computeSizeClass(newW);
            if (newCls !== sizeState.cls) {
              containerEl.classList.remove(`widget-size-${sizeState.cls}`);
              containerEl.classList.add(`widget-size-${newCls}`);
              sizeState.cls = newCls;
            }
            if (typeof instance.resize === 'function') {
              instance.resize(newW, newH, newCls);
            }
          } catch (err) {
            console.error(`[WidgetRegistry] Resize error in widget "${type}":`, err);
          }
        },
        destroy: () => {
          try {
            if (typeof instance.destroy === 'function') {
              instance.destroy();
            }
          } catch (err) {
            console.error(`[WidgetRegistry] Destroy error in widget "${type}":`, err);
          } finally {
            scope.dispose();
          }
        }
      };
    } catch (err) {
      console.error(`[WidgetRegistry] Mount error in widget "${type}":`, err);
      containerEl.innerHTML = `
        <div class="widget-error-plate" style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; padding:var(--space-2); text-align:center; color:var(--status-crit); background:var(--status-crit-bg); border-radius:var(--r-control);">
          <span style="font-family:var(--font-mono); font-size:var(--text-micro);">WIDGET ERROR</span>
          <span style="font-size:var(--text-caption); margin-top:2px; color:var(--text-primary);">${err.message || 'Render failure'}</span>
        </div>
      `;
      return {
        update: () => {},
        resize: () => {},
        destroy: () => scope.dispose()
      };
    }
  }

  return {
    defineWidget,
    register,
    registerLazy,
    get,
    getManifest,
    listManifests,
    load,
    mount,
    computeSizeClass,
    createScope
  };
});
