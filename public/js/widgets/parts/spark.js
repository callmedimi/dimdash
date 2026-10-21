/**
 * Widget Part: Sparkline SVG Component Helper
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PartSpark = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create(points = [], width = 64, height = 20, options = {}) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.style.overflow = 'visible';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', options.color || 'var(--accent)');
    path.setAttribute('stroke-width', options.strokeWidth || '1.5');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);

    function updatePoints(pts) {
      if (!pts || pts.length < 2) {
        path.setAttribute('d', '');
        return;
      }
      const min = Math.min(...pts);
      const max = Math.max(...pts);
      const range = max - min || 1;
      const stepX = width / (pts.length - 1);

      const d = pts
        .map((p, idx) => {
          const x = idx * stepX;
          const y = height - ((p - min) / range) * (height - 4) - 2;
          return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');

      path.setAttribute('d', d);
    }

    updatePoints(points);

    return {
      el: svg,
      update: updatePoints
    };
  }

  return { create };
});
