/**
 * Widget Part: Squircle Icon Plate Component Helper
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PartPlate = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create(icon = 'server', mode = 'brand', size = 'md') {
    const el = document.createElement('div');
    el.className = `icon-plate mode-${mode} size-${size}`;

    // SVG or fallback letter
    if (typeof icon === 'string' && icon.startsWith('<svg')) {
      el.innerHTML = icon;
    } else if (typeof icon === 'string' && (icon.startsWith('/') || icon.startsWith('http') || icon.startsWith('data:'))) {
      const img = document.createElement('img');
      img.src = icon;
      img.alt = '';
      el.appendChild(img);
    } else {
      const fallback = document.createElement('span');
      fallback.className = 'icon-plate-fallback';
      fallback.textContent = (icon || 'D').substring(0, 2).toUpperCase();
      el.appendChild(fallback);
    }

    return {
      el,
      update(newIcon, newMode, newSize) {
        if (newMode) {
          el.className = el.className.replace(/mode-\w+/, `mode-${newMode}`);
        }
        if (newSize) {
          el.className = el.className.replace(/size-\w+/, `size-${newSize}`);
        }
      }
    };
  }

  return { create };
});
