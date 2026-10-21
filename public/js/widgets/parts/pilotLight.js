/**
 * Widget Part: Pilot Light Component Helper
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PartPilotLight = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create(status = 'ok', size = 'md') {
    const el = document.createElement('div');
    el.className = `pilot-light is-${status} size-${size}`;
    el.setAttribute('data-status', status);
    const glyph = document.createElement('span');
    glyph.className = 'pilot-light-glyph';
    el.appendChild(glyph);

    return {
      el,
      update(newStatus, newSize) {
        if (newStatus) {
          el.className = el.className.replace(/is-\w+/, `is-${newStatus}`);
          el.setAttribute('data-status', newStatus);
        }
        if (newSize) {
          el.className = el.className.replace(/size-\w+/, `size-${newSize}`);
        }
      }
    };
  }

  return { create };
});
