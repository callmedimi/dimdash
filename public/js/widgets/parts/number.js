/**
 * Widget Part: Number Hero Component Helper
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PartNumber = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create(value = '0', unit = '', delta = null) {
    const el = document.createElement('div');
    el.className = 'instrument-hero';

    const wrap = document.createElement('div');
    wrap.className = 'instrument-hero-val-wrap';

    const valEl = document.createElement('span');
    valEl.className = 'instrument-hero-val tabular-nums';
    valEl.textContent = value;
    wrap.appendChild(valEl);

    let unitEl = null;
    if (unit) {
      unitEl = document.createElement('span');
      unitEl.className = 'instrument-hero-unit';
      unitEl.textContent = unit;
      wrap.appendChild(unitEl);
    }

    let deltaEl = null;
    if (delta) {
      deltaEl = document.createElement('span');
      deltaEl.className = `instrument-hero-delta ${delta.isPositive ? 'is-positive' : 'is-negative'}`;
      deltaEl.textContent = delta.text;
      wrap.appendChild(deltaEl);
    }

    el.appendChild(wrap);

    return {
      el,
      update(newVal, newUnit, newDelta) {
        if (newVal !== undefined) valEl.textContent = newVal;
        if (newUnit !== undefined && unitEl) unitEl.textContent = newUnit;
        if (newDelta && deltaEl) {
          deltaEl.className = `instrument-hero-delta ${newDelta.isPositive ? 'is-positive' : 'is-negative'}`;
          deltaEl.textContent = newDelta.text;
        }
      }
    };
  }

  return { create };
});
