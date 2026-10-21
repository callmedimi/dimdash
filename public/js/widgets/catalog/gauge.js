/**
 * Built-in Widget: Gauge (Arc / Segmented / Tape)
 * Responsive at XS, S, M, L, XL
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WidgetGauge = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return {
    type: 'gauge',
    version: 1,
    label: { en: 'Gauge', fa: 'گیج' },
    category: 'instruments',
    icon: 'gauge',
    size: { min: [80, 48], preferred: [220, 100], max: [600, 400], resizable: true },
    schema: {
      label: { type: 'string', label: 'Metric Name', default: 'CPU' },
      format: { type: 'string', label: 'Format (arc|segmented)', default: 'segmented' },
      min: { type: 'number', label: 'Min', default: 0 },
      max: { type: 'number', label: 'Max', default: 100 },
      warnThreshold: { type: 'number', label: 'Warning Threshold', default: 75 },
      critThreshold: { type: 'number', label: 'Critical Threshold', default: 90 }
    },
    bindings: {
      value: { kind: 'metric', required: true }
    },
    mount(ctx) {
      const container = ctx.el;
      container.innerHTML = `
        <div class="widget-gauge-root" style="display:flex; flex-direction:column; justify-content:center; width:100%; height:100%; padding:var(--space-2); box-sizing:border-box;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-1);">
            <span class="widget-gauge-label mono-micro" style="display:none;"></span>
            <span class="widget-gauge-val tabular-nums mono-micro" style="display:none;">0%</span>
          </div>
          <div class="instrument-segmented-gauge widget-gauge-bar">
            ${Array.from({ length: 10 })
              .map(() => '<span class="instrument-segment"></span>')
              .join('')}
          </div>
        </div>
      `;

      const labelEl = container.querySelector('.widget-gauge-label');
      const valEl = container.querySelector('.widget-gauge-val');
      const segments = container.querySelectorAll('.instrument-segment');

      function applyLayout(cls) {
        if (cls === 'xs') {
          labelEl.style.display = 'none';
          valEl.style.display = 'none';
        } else if (cls === 's') {
          labelEl.style.display = 'none';
          valEl.style.display = 'block';
        } else {
          // M, L, XL
          labelEl.style.display = 'block';
          valEl.style.display = 'block';
        }
      }

      function update(props = ctx.props()) {
        const val = Number(props.value) || 0;
        const max = Number(props.max) || 100;
        const pct = Math.max(0, Math.min(100, Math.round((val / max) * 100)));

        if (props.label) labelEl.textContent = props.label;
        valEl.textContent = `${pct}%`;

        const activeCount = Math.round((pct / 100) * segments.length);
        segments.forEach((seg, i) => {
          seg.className = 'instrument-segment';
          if (i < activeCount) {
            seg.classList.add('is-active');
            if (pct >= (props.critThreshold || 90)) {
              seg.classList.add('is-crit');
            } else if (pct >= (props.warnThreshold || 75)) {
              seg.classList.add('is-warn');
            }
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
