/**
 * DimDash Stage Overlay Renderer
 * High-performance 2D Canvas overlay for selection bounds, resize handles,
 * magnetic snap guidelines, distance badges, marquee lasso, and proximity dot-grid.
 * Optimized with zero software shadowBlur for 60/120fps on Linux (Fedora Wayland/X11).
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
        accent: options.accent || '#38bdf8',
        accentDim: options.accentDim || 'rgba(56, 189, 248, 0.08)',
        guideColor: options.guideColor || '#06b6d4',
        handleFill: '#ffffff',
        handleStroke: '#0284c7',
        handleSize: 10,
        coarseHitRadius: 28,
        fineHitRadius: 15,
        borderTolerance: 9,
        dotColor: 'rgba(56, 189, 248, 0.22)',
        dotRadius: 1.2,
        dotGridStep: 32
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

    static getHandlePositions(bounds) {
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
      const { x, y, w, h } = bounds;
      const x2 = x + w;
      const y2 = y + h;

      const cornerHitRadius = isCoarse ? 28 : 15;
      const cornerRadiusSq = cornerHitRadius * cornerHitRadius;

      const corners = [
        { name: 'nw', x: x,  y: y },
        { name: 'ne', x: x2, y: y },
        { name: 'se', x: x2, y: y2 },
        { name: 'sw', x: x,  y: y2 }
      ];

      for (const c of corners) {
        const dx = screenX - c.x;
        const dy = screenY - c.y;
        if (dx * dx + dy * dy <= cornerRadiusSq) {
          return c.name;
        }
      }

      const midHitRadius = isCoarse ? 24 : 13;
      const midRadiusSq = midHitRadius * midHitRadius;
      const midpoints = [
        { name: 'n', x: x + w / 2, y: y },
        { name: 's', x: x + w / 2, y: y2 },
        { name: 'w', x: x,         y: y + h / 2 },
        { name: 'e', x: x2,        y: y + h / 2 }
      ];

      for (const m of midpoints) {
        const dx = screenX - m.x;
        const dy = screenY - m.y;
        if (dx * dx + dy * dy <= midRadiusSq) {
          return m.name;
        }
      }

      const borderTolerance = isCoarse ? 18 : 9;
      const outerX1 = x - borderTolerance;
      const outerX2 = x2 + borderTolerance;
      const outerY1 = y - borderTolerance;
      const outerY2 = y2 + borderTolerance;

      if (screenX < outerX1 || screenX > outerX2 || screenY < outerY1 || screenY > outerY2) {
        return null;
      }

      const innerX1 = x + borderTolerance;
      const innerX2 = x2 - borderTolerance;
      const innerY1 = y + borderTolerance;
      const innerY2 = y2 - borderTolerance;

      if (innerX1 < innerX2 && innerY1 < innerY2) {
        if (screenX > innerX1 && screenX < innerX2 && screenY > innerY1 && screenY < innerY2) {
          return null;
        }
      }

      const cornerZone = Math.min(28, Math.max(14, Math.min(w, h) * 0.28));

      if (screenX <= x + cornerZone) {
        if (screenY <= y + cornerZone) return 'nw';
        if (screenY >= y2 - cornerZone) return 'sw';
      }
      if (screenX >= x2 - cornerZone) {
        if (screenY <= y + cornerZone) return 'ne';
        if (screenY >= y2 - cornerZone) return 'se';
      }

      const dTop = Math.abs(screenY - y);
      const dBottom = Math.abs(screenY - y2);
      const dLeft = Math.abs(screenX - x);
      const dRight = Math.abs(screenX - x2);

      const minDistance = Math.min(dTop, dBottom, dLeft, dRight);
      if (minDistance > borderTolerance) {
        return null;
      }

      if (minDistance === dTop) return 'n';
      if (minDistance === dBottom) return 's';
      if (minDistance === dLeft) return 'w';
      return 'e';
    }

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
        hoverHandle = null,
        sizingInfo = null
      } = state;

      if (!isEditing) return;

      const ctx = this.ctx;

      // 1. Batched Single-Call Proximity Dot-Grid around pointer
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
          this.renderSelectionBounds(ctx, rect, camera, wu, activeHandle, hoverHandle);
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

    renderProximityGrid(ctx, pointerPos, camera, wu = 1.0) {
      if (!ctx || !pointerPos) return;
      const step = Math.max(16, Math.round((this.options?.dotGridStep || 32) * wu));
      const px = pointerPos.screenX;
      const py = pointerPos.screenY;
      const radius = 84;
      const radiusSq = radius * radius;

      const startX = Math.floor((px - radius) / step) * step;
      const endX = Math.ceil((px + radius) / step) * step;
      const startY = Math.floor((py - radius) / step) * step;
      const endY = Math.ceil((py + radius) / step) * step;

      ctx.save();
      ctx.fillStyle = this.theme.dotColor;
      ctx.beginPath();
      for (let x = startX; x <= endX; x += step) {
        for (let y = startY; y <= endY; y += step) {
          const dx = x - px;
          const dy = y - py;
          if (dx * dx + dy * dy <= radiusSq) {
            ctx.rect(x - 1, y - 1, 2, 2);
          }
        }
      }
      ctx.fill();
      ctx.restore();
    }

    renderSelectionBounds(ctx, rect, camera, wu, activeHandle, hoverHandle) {
      const screenX = rect.screenX !== undefined ? rect.screenX : (rect.x * wu * camera.z + camera.x);
      const screenY = rect.screenY !== undefined ? rect.screenY : (rect.y * wu * camera.z + camera.y);
      const screenW = rect.screenW !== undefined ? rect.screenW : (rect.w * wu * camera.z);
      const screenH = rect.screenH !== undefined ? rect.screenH : (rect.h * wu * camera.z);

      ctx.save();

      // Soft bounding tint
      ctx.fillStyle = this.theme.accentDim;
      ctx.fillRect(screenX, screenY, screenW, screenH);

      // Solid bounding border
      ctx.strokeStyle = this.theme.accent;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(screenX, screenY, screenW, screenH);

      // Highlight active or hovered edge/border (zero software shadowBlur for fast Linux rendering)
      const targetHandle = activeHandle || hoverHandle;
      if (targetHandle) {
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        if (targetHandle === 'n') {
          ctx.moveTo(screenX, screenY);
          ctx.lineTo(screenX + screenW, screenY);
        } else if (targetHandle === 's') {
          ctx.moveTo(screenX, screenY + screenH);
          ctx.lineTo(screenX + screenW, screenY + screenH);
        } else if (targetHandle === 'w') {
          ctx.moveTo(screenX, screenY);
          ctx.lineTo(screenX, screenY + screenH);
        } else if (targetHandle === 'e') {
          ctx.moveTo(screenX + screenW, screenY);
          ctx.lineTo(screenX + screenW, screenY + screenH);
        }
        ctx.stroke();
        ctx.restore();
      }

      // 8 Resize Handles
      const handles = StageOverlay.getHandlePositions({
        x: screenX,
        y: screenY,
        w: screenW,
        h: screenH
      });

      const baseHs = this.theme.handleSize || 10;

      for (const name of HANDLE_NAMES) {
        const hp = handles[name];
        const isActive = activeHandle === name;
        const isHovered = hoverHandle === name;
        const hs = (isActive || isHovered) ? baseHs + 3 : baseHs;
        const half = hs / 2;

        ctx.fillStyle = (isActive || isHovered) ? this.theme.accent : this.theme.handleFill;
        ctx.strokeStyle = (isActive || isHovered) ? '#ffffff' : this.theme.handleStroke;
        ctx.lineWidth = (isActive || isHovered) ? 2 : 1.5;

        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(hp.x - half, hp.y - half, hs, hs, 2.5);
        } else {
          ctx.rect(hp.x - half, hp.y - half, hs, hs);
        }
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

    renderMarquee(ctx, marquee) {
      const x = Math.min(marquee.startX, marquee.currentX);
      const y = Math.min(marquee.startY, marquee.currentY);
      const w = Math.abs(marquee.currentX - marquee.startX);
      const h = Math.abs(marquee.currentY - marquee.startY);

      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }

    renderSizeBadge(ctx, sizingInfo, camera, wu) {
      const r = sizingInfo.rect;
      const sx = (r.x + r.w / 2) * wu * camera.z + camera.x;
      const sy = (r.y + r.h) * wu * camera.z + camera.y + 18;
      const label = `${Math.round(r.w)} × ${Math.round(r.h)} wu`;
      this.renderBadge(ctx, sx, sy, label);
    }

    renderBadge(ctx, x, y, text) {
      ctx.save();
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      const metrics = ctx.measureText(text);
      const padX = 6;
      const bw = metrics.width + padX * 2;
      const bh = 20;
      const bx = x - bw / 2;
      const by = y - bh / 2;

      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(bx, by, bw, bh, 4);
      } else {
        ctx.rect(bx, by, bw, bh);
      }
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, bx + padX, y);
      ctx.restore();
    }
  }

  return { StageOverlay };
});
