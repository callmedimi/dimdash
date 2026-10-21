/**
 * Built-in Widget: Big Number Hero
 * Responsive at XS, S, M, L, XL
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WidgetBigNumber = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return {
    type: 'big_number',
    version: 1,
    label: { en: 'Big Number', fa: 'عدد بزرگ' },
    category: 'data',
    icon: 'hash',
    size: { min: [80, 48], preferred: [200, 110], max: [800, 500], resizable: true },
    schema: {
      label: { type: 'string', label: 'Label' },
      unit: { type: 'string', label: 'Unit' },
      delta: { type: 'string', label: 'Delta %' },
      decimals: { type: 'number', label: 'Decimals', default: 1 }
    },
    bindings: {
      value: { kind: 'metric', required: true }
    },
    mount(ctx) {
      const container = ctx.el;
      container.innerHTML = `
        <div class="widget-bignum-root" style="display:flex; flex-direction:column; justify-content:center; width:100%; height:100%; padding:var(--space-2); box-sizing:border-box;">
          <span class="widget-bignum-label mono-micro" style="display:none; margin-bottom:2px;"></span>
          <div class="instrument-hero-val-wrap" style="align-items:baseline;">
            <span class="widget-bignum-val tabular-nums instrument-hero-val">0</span>
            <span class="widget-bignum-unit instrument-hero-unit" style="display:none; margin-left:var(--space-1);"></span>
            <span class="widget-bignum-delta instrument-hero-delta is-positive" style="display:none; margin-left:var(--space-2);"></span>
          </div>
          <div class="widget-bignum-spark-wrap" style="display:none; margin-top:var(--space-2);"></div>
        </div>
      `;

      const labelEl = container.querySelector('.widget-bignum-label');
      const valEl = container.querySelector('.widget-bignum-val');
      const unitEl = container.querySelector('.widget-bignum-unit');
      const deltaEl = container.querySelector('.widget-bignum-delta');
      const sparkWrap = container.querySelector('.widget-bignum-spark-wrap');

      function applyLayout(cls) {
        if (cls === 'xs') {
          labelEl.style.display = 'none';
          unitEl.style.display = 'none';
          deltaEl.style.display = 'none';
          sparkWrap.style.display = 'none';
        } else if (cls === 's') {
          labelEl.style.display = 'block';
          unitEl.style.display = 'inline';
          deltaEl.style.display = 'none';
          sparkWrap.style.display = 'none';
        } else if (cls === 'm') {
          labelEl.style.display = 'block';
          unitEl.style.display = 'inline';
          deltaEl.style.display = 'inline-flex';
          sparkWrap.style.display = 'none';
        } else {
          // L & XL
          labelEl.style.display = 'block';
          unitEl.style.display = 'inline';
          deltaEl.style.display = 'inline-flex';
          sparkWrap.style.display = 'block';
        }
      }

      function update(props = ctx.props()) {
        if (props.label) labelEl.textContent = props.label;
        if (props.value !== undefined) valEl.textContent = props.value;
        if (props.unit) {
          unitEl.textContent = props.unit;
          unitEl.style.display = 'inline';
        }
        if (props.delta) {
          deltaEl.textContent = props.delta;
          deltaEl.style.display = 'inline-flex';
        }
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
