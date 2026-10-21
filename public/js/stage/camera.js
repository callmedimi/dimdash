/**
 * DimDash Camera Controller
 * Smooth pan, zoom to cursor, fit selection, and coordinate transforms for the Spatial Stage.
 * Universal module (Node.js & Browser)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashCamera = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class Camera {
    constructor(options = {}) {
      this.x = options.x || 0; // translation in CSS px
      this.y = options.y || 0;
      this.z = options.z || 1.0; // scale zoom factor

      this.minZoom = options.minZoom || 0.1;
      this.maxZoom = options.maxZoom || 4.0;
      this.viewportW = options.viewportW || 1920;
      this.viewportH = options.viewportH || 1080;
    }

    setViewportSize(w, h) {
      this.viewportW = Math.max(10, w);
      this.viewportH = Math.max(10, h);
    }

    pan(dx, dy) {
      this.x += dx;
      this.y += dy;
    }

    zoomAt(factor, clientX, clientY) {
      const oldZoom = this.z;
      const newZoom = Math.min(Math.max(oldZoom * factor, this.minZoom), this.maxZoom);
      if (newZoom === oldZoom) return;

      // Pivot zoom around cursor (clientX, clientY)
      const ratio = newZoom / oldZoom;
      this.x = clientX - (clientX - this.x) * ratio;
      this.y = clientY - (clientY - this.y) * ratio;
      this.z = newZoom;
    }

    screenToWorld(screenX, screenY, wu = 1.0) {
      const stageX = (screenX - this.x) / this.z;
      const stageY = (screenY - this.y) / this.z;
      return {
        x: stageX / wu,
        y: stageY / wu
      };
    }

    worldToScreen(worldX, worldY, wu = 1.0) {
      const stageX = worldX * wu;
      const stageY = worldY * wu;
      return {
        x: stageX * this.z + this.x,
        y: stageY * this.z + this.y
      };
    }

    fitBounds(bounds, padding = 40, wu = 1.0) {
      if (!bounds || bounds.w <= 0 || bounds.h <= 0) return;

      const availW = Math.max(100, this.viewportW - padding * 2);
      const availH = Math.max(100, this.viewportH - padding * 2);

      const contentW = bounds.w * wu;
      const contentH = bounds.h * wu;

      const scaleX = availW / contentW;
      const scaleY = availH / contentH;
      const fitZoom = Math.min(Math.max(Math.min(scaleX, scaleY), this.minZoom), 2.0);

      this.z = fitZoom;
      this.x = (this.viewportW - contentW * fitZoom) / 2 - (bounds.x * wu * fitZoom);
      this.y = (this.viewportH - contentH * fitZoom) / 2 - (bounds.y * wu * fitZoom);
    }

    reset() {
      this.x = 0;
      this.y = 0;
      this.z = 1.0;
    }

    applyToElement(el) {
      if (!el || !el.style) return;
      el.style.setProperty('--stage-scale', this.z.toFixed(4));
      el.style.setProperty('--stage-tx', `${Math.round(this.x)}px`);
      el.style.setProperty('--stage-ty', `${Math.round(this.y)}px`);
    }
  }

  return { Camera };
});
