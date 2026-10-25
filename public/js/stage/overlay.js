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
        accentDim: options.accentDim || 'rgba(56, 189, 248, 0.08)',
        guideColor: options.guideColor || '#06b6d4', // cyan-500
        handleFill: '#ffffff',
        handleStroke: '#0284c7',
        handleSize: 10, // px
        coarseHitRadius: 28, // px
        fineHitRadius: 15, // px
        borderTolerance: 9, // px
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

    /**
     * Hit tests resize handles and continuous borders geometrically for a given item bounding box in screen space.
     * Supports:
     * - Generous corner handles (nw, ne, se, sw)
     * - Midpoint handles (n, s, e, w)
     * - Continuous border perimeter edges (top -> n, bottom -> s, left -> w, right -> e)
     * - Safe interior zone (returns null so clicking interior moves/drags the item)
     */
    static hitTestHandles(screenX, screenY, bounds, isCoarse = false) {
      if (!bounds || bounds.w <= 0 || bounds.h <= 0) return null;
      const { x, y, w, h } = bounds;
      const x2 = x + w;
      const y2 = y + h;

      // 1. Direct Corner Handle check (highest priority with generous radius)
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

      // 2. Direct Midpoint Handle check
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

      // 3. Continuous Border Hit Zone (Outer and Inner tolerance bands)
      const borderTolerance = isCoarse ? 18 : 9;
      const outerX1 = x - borderTolerance;
      const outerX2 = x2 + borderTolerance;
      const outerY1 = y - borderTolerance;
      const outerY2 = y2 + borderTolerance;

      // Check if pointer is anywhere within outer bounding halo
      if (screenX < outerX1 || screenX > outerX2 || screenY < outerY1 || screenY > outerY2) {
        return null;
      }

      // Check if pointer is inside inner safe interior (where clicking moves/drags the card)
      const innerX1 = x + borderTolerance;
      const innerX2 = x2 - borderTolerance;
      const innerY1 = y + borderTolerance;
      const innerY2 = y2 - borderTolerance;

      if (innerX1 < innerX2 && innerY1 < innerY2) {
        if (screenX > innerX1 && screenX < innerX2 && screenY > innerY1 && screenY < innerY2) {
          // Inside safe interior -> allows moving/dragging the card
          return null;
        }
      }

      // Pointer is on the border perimeter!
      // Resolve corner regions vs edge regions
      const cornerZone = Math.min(28, Math.max(14, Math.min(w, h) * 0.28));

      // Check if in corner zones of the border
      if (screenX <= x + cornerZone) {
        if (screenY <= y + cornerZone) return 'nw';
        if (screenY >= y2 - cornerZone) return 'sw';
      }
      if (screenX >= x2 - cornerZone) {
        if (screenY <= y + cornerZone) return 'ne';
        if (screenY >= y2 - cornerZone) return 'se';
      }

      // Along the edges: find closest edge
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
        hoverHandle = null,
        sizingInfo = null,
        debug = false,
        debugItems = []
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

      // 6. Debug Overlay (STEP 0: ?debug=1)
      const isDebug = debug || (typeof window !== 'undefined' && window.location.search.includes('debug=1'));
      if (isDebug && debugItems && debugItems.length > 0) {
        this.renderDebugOverlay(ctx, debugItems);
      }
    }

    renderProximityGrid(ctx, pointerPos, camera, wu = 1.0) {
      if (!ctx || !pointerPos) return;
      const step = (this.options?.dotGridStep || 32) * wu;
      if (step < 8) return;

      const px = pointerPos.screenX;
      const py = pointerPos.screenY;
      const radius = 96;
      const radiusSq = radius * radius;

      const startX = Math.floor((px - radius) / step) * step;
      const endX = Math.ceil((px + radius) / step) * step;
      const startY = Math.floor((py - radius) / step) * step;
      const endY = Math.ceil((py + radius) / step) * step;

      ctx.save();
      for (let x = startX; x <= endX; x += step) {
        for (let y = startY; y <= endY; y += step) {
          const dx = x - px;
          const dy = y - py;
          const distSq = dx * dx + dy * dy;
          if (distSq <= radiusSq) {
            const alpha = (1 - Math.sqrt(distSq) / radius) * 0.25;
            ctx.fillStyle = `rgba(56, 189, 248, ${alpha.toFixed(2)})`;
            ctx.fillRect(x - 1, y - 1, 2, 2);
          }
        }
      }
      ctx.restore();
    }

    renderDebugOverlay(ctx, items) {
      ctx.save();
      const diffs = [];

      for (const item of items) {
        const { id, kind, modelRect, domRect } = item;

        // Draw model rect in RED (dashed)
        if (modelRect) {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 2]);
          ctx.strokeRect(modelRect.x, modelRect.y, modelRect.w, modelRect.h);

          ctx.fillStyle = '#ef4444';
          ctx.font = '10px monospace';
          ctx.fillText(`[Model] ${id} (${kind})`, modelRect.x + 4, modelRect.y + 12);
        }

        // Draw real DOM rect in GREEN (solid)
        if (domRect) {
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([]);
          ctx.strokeRect(domRect.x, domRect.y, domRect.w, domRect.h);

          ctx.fillStyle = '#10b981';
          ctx.font = '10px monospace';
          ctx.fillText(`[DOM] ${id}`, domRect.x + 4, domRect.y + domRect.h - 4);
        }

        // Compare
        if (modelRect && domRect) {
          const dx = Math.abs(modelRect.x - domRect.x);
          const dy = Math.abs(modelRect.y - domRect.y);
          const dw = Math.abs(modelRect.w - domRect.w);
          const dh = Math.abs(modelRect.h - domRect.h);
          if (dx > 1 || dy > 1 || dw > 1 || dh > 1) {
            diffs.push({
              id,
              kind,
              model: `${modelRect.x.toFixed(1)}, ${modelRect.y.toFixed(1)} [${modelRect.w.toFixed(1)}x${modelRect.h.toFixed(1)}]`,
              dom: `${domRect.x.toFixed(1)}, ${domRect.y.toFixed(1)} [${domRect.w.toFixed(1)}x${domRect.h.toFixed(1)}]`,
              delta: `dx:${dx.toFixed(1)}, dy:${dy.toFixed(1)}, dw:${dw.toFixed(1)}, dh:${dh.toFixed(1)}`
            });
          }
        }
      }

      ctx.restore();

      if (diffs.length > 0 && (!this._lastDiffLogTime || (Date.now() - this._lastDiffLogTime > 2000))) {
        this._lastDiffLogTime = Date.now();
        console.group('[DimDash Debug Overlay] Coordinate Mismatches (>1px)');
        console.table(diffs);
        console.groupEnd();
      }
    }

    renderSelectionBounds(ctx, rect, camera, wu, activeHandle, hoverHandle) {
      // Source of truth: prefer measured screen rect from DOM getBoundingClientRect
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

      // Highlight active or hovered edge/border
      const targetHandle = activeHandle || hoverHandle;
      if (targetHandle) {
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(56, 189, 248, 0.8)';
        ctx.shadowBlur = 8;
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

        ctx.save();
        if (isActive || isHovered) {
          ctx.fillStyle = this.theme.accent;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.shadowColor = 'rgba(56, 189, 248, 0.7)';
          ctx.shadowBlur = 6;
        } else {
          ctx.fillStyle = this.theme.handleFill;
          ctx.strokeStyle = this.theme.handleStroke;
          ctx.lineWidth = 1.5;
          ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
          ctx.shadowBlur = 3;
        }

        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(hp.x - half, hp.y - half, hs, hs, 2.5);
        } else {
          ctx.rect(hp.x - half, hp.y - half, hs, hs);
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
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
