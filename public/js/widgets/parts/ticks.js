/**
 * Widget Part: Tick Scale & Registration Brackets Component Helper
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PartTicks = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createCorners(containerEl) {
    const corners = ['tl', 'tr', 'bl', 'br'];
    corners.forEach((c) => {
      const mark = document.createElement('div');
      mark.className = `tick-corner tick-corner-${c}`;
      containerEl.appendChild(mark);
    });
  }

  function createRuler(axis = 'x', dense = false) {
    const el = document.createElement('div');
    el.className = `tick-ruler-${axis} ${dense ? 'dense' : ''}`;
    return el;
  }

  return { createCorners, createRuler };
});
