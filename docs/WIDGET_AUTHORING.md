# DimDash Widget Authoring Guide

**Target Version:** DimDash Core v2.0  
**Phase:** P08 — Widget Framework & Catalog  

---

## 1. Overview & Architecture

DimDash widgets are lightweight, sandboxed UI plugins designed to display telemetry, status, and interactive controls across screen sizes ranging from 10" touch controllers to 150" video walls.

### Core Guarantees:
1. **Lazy Loading:** Widgets are loaded on demand; the "Add Widget" palette reads metadata manifests without loading module code.
2. **Container-Aware Size Classes:** Every widget adapts gracefully across 5 standardized size classes:
   - **`xs`:** $w < 120\text{px}$ (compact icon / glyph / status light)
   - **`s`:** $120 \le w < 220\text{px}$ (value + label)
   - **`m`:** $220 \le w < 360\text{px}$ (standard card with delta / subtitle)
   - **`l` / `xl`:** $w \ge 360\text{px}$ (rich display with sparklines, history, or detailed lists)
3. **Safe Reactive Scopes:** Widgets subscribe to reactive signals and timers through `ctx.scope`; all resources are automatically torn down when unmounted, guaranteeing zero memory leaks.
4. **Error Isolation:** A throwing widget renders an inline error card and never crashes the stage canvas or neighboring widgets.

---

## 2. The Widget Contract (`defineWidget`)

```javascript
import { defineWidget } from '/js/widgets/registry.js';

export default defineWidget({
  // Unique widget identifier and schema version
  type: 'my_widget',
  version: 1,

  // Bilingual human-readable labels
  label: {
    en: 'My Widget',
    fa: 'ابزارک من'
  },
  category: 'hardware',
  icon: 'battery',

  // Dimensions in CSS pixels [width, height]
  size: {
    min: [90, 50],
    preferred: [240, 110],
    max: [800, 600],
    resizable: true
  },

  // Inspector configuration schema
  schema: {
    title: { type: 'string', label: 'Title', default: 'UPS Battery' },
    warnThreshold: { type: 'number', label: 'Low Battery %', default: 20 }
  },

  // Data slot bindings
  bindings: {
    charge: { kind: 'metric', required: true },
    status: { kind: 'status' }
  },

  // Lifecycle Mount
  mount(ctx) {
    // 1. Build initial DOM
    const container = ctx.el;
    container.innerHTML = `<div class="my-widget-root">...</div>`;

    // 2. React to size class changes
    function onResize(w, h, cls) {
      // Toggle visibility based on cls ('xs', 's', 'm', 'l', 'xl')
    }

    // 3. Update DOM with new properties or data
    function onUpdate(props) {
      // Apply updated values
    }

    return {
      update: onUpdate,
      resize: onResize,
      destroy: () => {
        // Optional manual cleanup; ctx.scope automatically cleans up registered effects and intervals
      }
    };
  }
});
```

---

## 3. Worked Example: "UPS Battery Monitor" Widget

Here is a complete, production-grade example of a UPS Battery monitoring widget supporting all 5 size classes:

```javascript
// public/js/widgets/catalog/upsBattery.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WidgetUpsBattery = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return {
    type: 'ups_battery',
    version: 1,
    label: { en: 'UPS Battery', fa: 'باتری یو‌پی‌اس' },
    category: 'hardware',
    icon: 'battery',
    size: { min: [90, 50], preferred: [220, 100], max: [600, 300], resizable: true },
    schema: {
      label: { type: 'string', label: 'Label', default: 'UPS 1500VA' },
      warnPct: { type: 'number', label: 'Warning %', default: 25 },
      critPct: { type: 'number', label: 'Critical %', default: 15 }
    },
    bindings: {
      charge: { kind: 'metric', required: true },
      runtimeSecs: { kind: 'metric' },
      status: { kind: 'status' }
    },
    mount(ctx) {
      const el = ctx.el;
      el.innerHTML = `
        <div class="ups-battery-root" style="display:flex; flex-direction:column; justify-content:center; width:100%; height:100%; padding:var(--space-2); box-sizing:border-box;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
            <span class="ups-label mono-micro" style="display:none;"></span>
            <span class="ups-runtime mono-micro" style="display:none;"></span>
          </div>
          <div class="instrument-hero-val-wrap">
            <span class="ups-val instrument-hero-val tabular-nums">100</span>
            <span class="instrument-hero-unit">%</span>
            <div class="pilot-light is-ok size-sm ups-pilot" style="margin-left:auto;">
              <span class="pilot-light-glyph"></span>
            </div>
          </div>
          <div class="instrument-segmented-gauge ups-gauge" style="margin-top:var(--space-1); display:none;">
            ${Array.from({ length: 10 }).map(() => '<span class="instrument-segment"></span>').join('')}
          </div>
        </div>
      `;

      const labelEl = el.querySelector('.ups-label');
      const runtimeEl = el.querySelector('.ups-runtime');
      const valEl = el.querySelector('.ups-val');
      const pilotEl = el.querySelector('.ups-pilot');
      const gaugeEl = el.querySelector('.ups-gauge');
      const segments = el.querySelectorAll('.instrument-segment');

      function applyLayout(cls) {
        if (cls === 'xs') {
          labelEl.style.display = 'none';
          runtimeEl.style.display = 'none';
          gaugeEl.style.display = 'none';
        } else if (cls === 's') {
          labelEl.style.display = 'block';
          runtimeEl.style.display = 'none';
          gaugeEl.style.display = 'none';
        } else {
          // M, L, XL
          labelEl.style.display = 'block';
          runtimeEl.style.display = 'block';
          gaugeEl.style.display = 'flex';
        }
      }

      function update(props = ctx.props()) {
        const pct = Math.max(0, Math.min(100, Number(props.charge ?? 100)));
        valEl.textContent = pct;

        if (props.label) labelEl.textContent = props.label;
        if (props.runtimeSecs !== undefined) {
          const mins = Math.floor(props.runtimeSecs / 60);
          runtimeEl.textContent = `${mins}m left`;
        }

        // Determine status
        let st = 'ok';
        if (pct <= (props.critPct || 15)) st = 'crit';
        else if (pct <= (props.warnPct || 25)) st = 'warn';

        pilotEl.className = `pilot-light is-${st} size-sm ups-pilot`;

        // Update segments
        const active = Math.round((pct / 100) * segments.length);
        segments.forEach((seg, i) => {
          seg.className = 'instrument-segment';
          if (i < active) {
            seg.classList.add('is-active');
            if (st === 'crit') seg.classList.add('is-crit');
            else if (st === 'warn') seg.classList.add('is-warn');
          }
        });
      }

      applyLayout(ctx.size().cls);
      update(ctx.props());

      return {
        update,
        resize(w, h, cls) {
          applyLayout(cls);
        }
      };
    }
  };
});
```
