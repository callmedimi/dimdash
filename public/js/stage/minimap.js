/**
 * DimDash Status Heat Minimap (F2)
 * High-performance pure-canvas minimap with status-tinted island bounding boxes,
 * visible viewport frame indicator, and interactive spatial jump pan.
 * Universal Module (Node.js & Browser)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashMinimap = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STATUS_COLORS = {
    crit: 'rgba(239, 68, 68, 0.8)',
    offline: 'rgba(239, 68, 68, 0.8)',
    warn: 'rgba(245, 158, 11, 0.8)',
    warning: 'rgba(245, 158, 11, 0.8)',
    online: 'rgba(16, 185, 129, 0.6)',
    unknown: 'rgba(100, 116, 139, 0.4)'
  };

  class Minimap {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
      this.width = options.width || 220;
      this.height = options.height || 140;
      this.worldBounds = options.worldBounds || { x: 0, y: 0, w: 1920, h: 1080 };
      this.onJump = options.onJump || null;
      this.isDragging = false;

      if (this.canvas) {
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this._bindEvents();
      }
    }

    setWorldBounds(bounds) {
      if (bounds && bounds.w > 0 && bounds.h > 0) {
        this.worldBounds = { ...bounds };
      }
    }

    worldToMap(wx, wy) {
      const scaleX = this.width / Math.max(10, this.worldBounds.w);
      const scaleY = this.height / Math.max(10, this.worldBounds.h);
      return {
        x: (wx - this.worldBounds.x) * scaleX,
        y: (wy - this.worldBounds.y) * scaleY
      };
    }

    mapToWorld(mx, my) {
      const scaleX = this.worldBounds.w / Math.max(1, this.width);
      const scaleY = this.worldBounds.h / Math.max(1, this.height);
      return {
        x: this.worldBounds.x + mx * scaleX,
        y: this.worldBounds.y + my * scaleY
      };
    }

    /**
     * Renders minimap frame: islands + viewport bounds
     */
    render(islands = [], viewportRect = null) {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t0 = typeof performance !== 'undefined' ? performance.now() : 0;

      // 1. Clear background
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'; // slate-900 with glass opacity
      ctx.fillRect(0, 0, this.width, this.height);

      // Border outline
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, this.width - 1, this.height - 1);

      // 2. Draw islands
      for (const isl of islands) {
        const pt = this.worldToMap(isl.x || 0, isl.y || 0);
        const w = (isl.w || 100) * (this.width / this.worldBounds.w);
        const h = (isl.h || 100) * (this.height / this.worldBounds.h);

        const color = STATUS_COLORS[isl.status] || STATUS_COLORS.online;
        ctx.fillStyle = color;
        ctx.fillRect(pt.x, pt.y, Math.max(4, w), Math.max(4, h));

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.strokeRect(pt.x, pt.y, Math.max(4, w), Math.max(4, h));
      }

      // 3. Draw camera viewport rectangle
      if (viewportRect) {
        const vpPt = this.worldToMap(viewportRect.x, viewportRect.y);
        const vpW = viewportRect.w * (this.width / this.worldBounds.w);
        const vpH = viewportRect.h * (this.height / this.worldBounds.h);

        ctx.fillStyle = 'rgba(56, 189, 248, 0.15)'; // light cyan lens
        ctx.fillRect(vpPt.x, vpPt.y, Math.max(6, vpW), Math.max(6, vpH));

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)'; // sharp cyan frame
        ctx.lineWidth = 1.5;
        ctx.strokeRect(vpPt.x, vpPt.y, Math.max(6, vpW), Math.max(6, vpH));
      }

      const t1 = typeof performance !== 'undefined' ? performance.now() : 0;
      return t1 - t0;
    }

    _bindEvents() {
      if (!this.canvas) return;

      const handleClick = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const worldPos = this.mapToWorld(mx, my);

        if (typeof this.onJump === 'function') {
          this.onJump(worldPos);
        }
      };

      this.canvas.addEventListener('click', handleClick);
    }
  }

  return {
    STATUS_COLORS,
    Minimap
  };
});
