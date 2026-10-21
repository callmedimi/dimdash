/**
 * DimDash Stage Overlay Renderer
 * High-performance 2D Canvas overlay for selection bounds, resize handles,
 * magnetic snap guidelines, distance badges, marquee lasso, and proximity dot-grid.
 * Universal module (Node.js & Browser)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashOverlay = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const HANDLE_NAMES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  class StageOverlay {
    constructor(canvasElement, options = {}) {
      this.canvas = canvasElement;
      this.ctx = canvasElement && canvasElement.getContext ? canvasElement.getContext('2d') : null;
      this.options = options;

      this.dpr = options.dpr || (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
      this.width = 0;
      this.height = 0;

      this.theme = {
        accent: options.accent || '#38bdf8', // Tailwind sky-400
        accentDim: options.accentDim || 'rgba(56, 189, 248, 0.12)',
        guideColor: options.guideColor || '#06b6d4', // cyan-500
        handleFill: '#ffffff',
        handleStroke: '#0284c7',
        handleSize: 8, // px
        coarseHitRadius: 22, // px
        fineHitRadius: 9, // px
        dotColor: 'rgba(255, 255, 255, 0.18)',
        dotRadius: 1.2,
        dotGridStep: 32 // wu
      };
    }

    resize(w, h, dpr) {
      if (dpr) this.dpr = dpr;
      this.width = w;
      this.height = h;

      if (!this.canvas) return;
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;

      if (this.ctx) {
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      }
    }

    clear() {
      if (!this.ctx) return;
      this.ctx.clearRect(0, 0, this.width, this.height);
    }

    /**
     * Hit tests resize handles geometrically for a given item bounding box in screen space.
     * Handles are not DOM elements.
     */
    static getHandlePositions(bounds) {
      // bounds: { x, y, w, h } in screen coordinates
      const { x, y, w, h } = bounds;
      const mx = x + w / 2;
      const my = y + h / 2;
      return {
        nw: { x: x, y: y },
        n:  { x: mx, y: y },
        ne: { x: x + w, y: y },
        e:  { x: x + w, y: my },
        se: { x: x + w, y: y + h },
        s:  { x: mx, y: y + h },
        sw: { x: x, y: y + h },
        w:  { x: x, y: my }
      };
    }

    static hitTestHandles(screenX, screenY, bounds, isCoarse = false) {
      if (!bounds || bounds.w <= 0 || bounds.h <= 0) return null;
      const handles = StageOverlay.getHandlePositions(bounds);
      const hitRadius = isCoarse ? 22 : 9;
      const hitRadiusSq = hitRadius * hitRadius;

      for (const name of HANDLE_NAMES) {
        const hp = handles[name];
        const dx = screenX - hp.x;
        const dy = screenY - hp.y;
        if (dx * dx + dy * dy <= hitRadiusSq) {
          return name;
        }
      }
      return null;
    }

    /**
     * Main Render Loop for overlay canvas
     */
    render(state = {}) {
      if (!this.ctx) return;
      this.clear();

      const {
        isEditing = false,
        camera = { x: 0, y: 0, z: 1 },
        wu = 1,
        selectedRects = [],
        snapGuides = [],
        marquee = null,
        pointerPos = null,
        activeHandle = null,
        sizingInfo = null
      } = state;

      if (!isEditing) return;

      const ctx = this.ctx;

      // 1. Proximity Dot-Grid around pointer
      if (pointerPos && pointerPos.screenX !== undefined) {
        this.renderProximityGrid(ctx, pointerPos, camera, wu);
      }

      // 2. Snap Guidelines & Distance Badges
      if (snapGuides && snapGuides.length > 0) {
        this.renderSnapGuides(ctx, snapGuides, camera, wu);
      }

      // 3. Selection Boxes & Resize Handles
      if (selectedRects && selectedRects.length > 0) {
        for (const rect of selectedRects) {
          this.renderSelectionBounds(ctx, rect, camera, wu, activeHandle);
        }
      }

      // 4. Marquee Lasso
      if (marquee) {
        this.renderMarquee(ctx, marquee);
      }

      // 5. Live Size Badge
      if (sizingInfo && sizingInfo.rect) {
        this.renderSizeBadge(ctx, sizingInfo, camera, wu);
      }
    }

    renderProximityGrid(ctx, pointerPos, camera, wu) {
      const radius = 180; // px
      const px = pointerPos.screenX;
      const py = pointerPos.screenY;

      // Determine world bounds of the proximity circle
      const stepPx = this.theme.dotGridStep * wu * camera.z;
      if (stepPx < 8) return; // don't draw if zoomed out too far

      // Snap world origin to grid
      const minX = Math.floor((px - radius - camera.x) / stepPx) * stepPx + camera.x;
      const maxX = Math.ceil((px + radius - camera.x) / stepPx) * stepPx + camera.x;
      const minY = Math.floor((py - radius - camera.y) / stepPx) * stepPx + camera.y;
      const maxY = Math.ceil((py + radius - camera.y) / stepPx) * stepPx + camera.y;

      ctx.save();
      for (let x = minX; x <= maxX; x += stepPx) {
        for (let y = minY; y <= maxY; y += stepPx) {
          const dx = x - px;
          const dy = y - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < radius) {
            const alpha = (1 - dist / radius) * 0.28;
            ctx.fillStyle = `rgba(148, 163, 184, ${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(x, y, this.theme.dotRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }

    renderSelectionBounds(ctx, worldRect, camera, wu, activeHandle) {
      // Convert world rect to screen rect
      const screenX = worldRect.x * wu * camera.z + camera.x;
      const screenY = worldRect.y * wu * camera.z + camera.y;
      const screenW = worldRect.w * wu * camera.z;
      const screenH = worldRect.h * wu * camera.z;

      ctx.save();

      // Soft bounding tint
      ctx.fillStyle = this.theme.accentDim;
      ctx.fillRect(screenX, screenY, screenW, screenH);

      // Solid bounding border
      ctx.strokeStyle = this.theme.accent;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(screenX, screenY, screenW, screenH);

      // 8 Resize Handles
      const handles = StageOverlay.getHandlePositions({
        x: screenX,
        y: screenY,
        w: screenW,
        h: screenH
      });

      const hs = this.theme.handleSize;
      const half = hs / 2;

      for (const name of HANDLE_NAMES) {
        const hp = handles[name];
        const isActive = activeHandle === name;

        ctx.fillStyle = isActive ? this.theme.accent : this.theme.handleFill;
        ctx.strokeStyle = this.theme.handleStroke;
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        // Slightly rounded corner box
        ctx.rect(hp.x - half, hp.y - half, hs, hs);
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }

    renderSnapGuides(ctx, guides, camera, wu) {
      ctx.save();
      ctx.strokeStyle = this.theme.guideColor;
      ctx.lineWidth = 1.0;
      ctx.setLineDash([4, 4]);

      for (const g of guides) {
        ctx.beginPath();
        if (g.type === 'x') {
          const sx = g.pos * wu * camera.z + camera.x;
          const sy1 = (g.start !== undefined ? g.start : -1000) * wu * camera.z + camera.y;
          const sy2 = (g.end !== undefined ? g.end : 3000) * wu * camera.z + camera.y;
          ctx.moveTo(sx, Math.max(0, sy1));
          ctx.lineTo(sx, Math.min(this.height, sy2));
          ctx.stroke();

          // Distance / Label badge if present
          if (g.label) {
            this.renderBadge(ctx, sx + 6, (sy1 + sy2) / 2, g.label);
          }
        } else if (g.type === 'y') {
          const sy = g.pos * wu * camera.z + camera.y;
          const sx1 = (g.start !== undefined ? g.start : -1000) * wu * camera.z + camera.x;
          const sx2 = (g.end !== undefined ? g.end : 3000) * wu * camera.z + camera.x;
          ctx.moveTo(Math.max(0, sx1), sy);
          ctx.lineTo(Math.min(this.width, sx2), sy);
          ctx.stroke();

          if (g.label) {
            this.renderBadge(ctx, (sx1 + sx2) / 2, sy - 14, g.label);
          }
        }
      }
      ctx.restore();
    }

    renderBadge(ctx, x, y, text) {
      ctx.save();
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      const metrics = ctx.measureText(text);
      const padding = 4;
      const w = metrics.width + padding * 2;
      const h = 16;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = this.theme.guideColor;
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.roundRect(x, y - h / 2, w, h, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + w / 2, y);
      ctx.restore();
    }

    renderMarquee(ctx, marquee) {
      const x = Math.min(marquee.startX, marquee.currentX);
      const y = Math.min(marquee.startY, marquee.currentY);
      const w = Math.abs(marquee.currentX - marquee.startX);
      const h = Math.abs(marquee.currentY - marquee.startY);

      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.fillRect(x, y, w, h);

      ctx.strokeStyle = this.theme.accent;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }

    renderSizeBadge(ctx, sizingInfo, camera, wu) {
      const { rect } = sizingInfo;
      const screenX = (rect.x + rect.w / 2) * wu * camera.z + camera.x;
      const screenY = (rect.y + rect.h) * wu * camera.z + camera.y + 16;

      const wRounded = Math.round(rect.w);
      const hRounded = Math.round(rect.h);
      const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
      const g = gcd(wRounded, hRounded) || 1;
      const aspect = `${Math.round(wRounded / g)}:${Math.round(hRounded / g)}`;
      const text = `${wRounded} × ${hRounded} wu · ${aspect}`;

      this.renderBadge(ctx, screenX - 40, screenY, text);
    }
  }

  return { StageOverlay };
});
