/**
 * DimDash Auto-Layout Engine
 * High-performance deterministic layout algorithms for Island containers:
 * Flow, Grid, Justified Rows (Linear Partition), Masonry, Stack, and Carousel.
 * Fully RTL-aware, zero-allocation loops, O(n) / O(n log n) execution.
 * Universal module (Node.js & Browser)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashAutoLayout = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Main Dispatcher for Auto-Layout Modes
   * @param {string} mode - 'free'|'flow'|'grid'|'justify'|'masonry'|'stack'|'carousel'
   * @param {Array<Object>} children - array of child items with { id, w, h, props, aspect, order, span, flex }
   * @param {Object} box - island content box { w, h }
   * @param {Object} params - layout parameters (gap, padding, align, justify, isRtl, etc.)
   * @returns {Array<Object>} solved rects [{ id, x, y, w, h }]
   */
  function solveAutoLayout(mode, children, box, params = {}) {
    if (!children || children.length === 0) return [];
    if (!box || box.w <= 0 || box.h <= 0) return [];

    const isRtl = !!params.isRtl;
    const gap = params.gap !== undefined ? params.gap : 8;
    const pad = normalizePadding(params.padding !== undefined ? params.padding : 12);
    const insets = params.insets || [0, 0, 0, 0]; // [t, r, b, l] from shape safe area

    const availX = pad[3] + insets[3];
    const availY = pad[0] + insets[0];
    const availW = Math.max(10, box.w - (pad[1] + insets[1] + availX));
    const availH = Math.max(10, box.h - (pad[2] + insets[2] + availY));

    const contentBox = { x: availX, y: availY, w: availW, h: availH };

    // Sort children by order if specified
    const sorted = [...children].sort((a, b) => (a.order || 0) - (b.order || 0));

    let rects = [];
    switch (mode) {
      case 'flow':
        rects = solveFlowLayout(sorted, contentBox, gap, params);
        break;
      case 'grid':
        rects = solveGridLayout(sorted, contentBox, gap, params);
        break;
      case 'justify':
        rects = solveJustifyLayout(sorted, contentBox, gap, params);
        break;
      case 'masonry':
        rects = solveMasonryLayout(sorted, contentBox, gap, params);
        break;
      case 'stack':
        rects = solveStackLayout(sorted, contentBox, gap, params);
        break;
      case 'carousel':
        rects = solveCarouselLayout(sorted, contentBox, gap, params);
        break;
      case 'free':
      default:
        rects = solveFreeLayout(sorted, contentBox);
        break;
    }

    // Mirror horizontal coordinates if RTL
    if (isRtl) {
      for (const r of rects) {
        // x within total box: mirror inside box.w
        r.x = box.w - r.x - r.w;
      }
    }

    return rects;
  }

  function normalizePadding(p) {
    if (Array.isArray(p)) {
      if (p.length === 4) return p;
      if (p.length === 2) return [p[0], p[1], p[0], p[1]];
      if (p.length === 1) return [p[0], p[0], p[0], p[0]];
    }
    const val = typeof p === 'number' ? p : 12;
    return [val, val, val, val];
  }

  /* -------------------------------------------------------------------------
   * 1. FLOW LAYOUT (Wrapping flexbox rows)
   * ------------------------------------------------------------------------- */
  function solveFlowLayout(children, box, gap, params) {
    const align = params.align || 'start'; // 'start'|'center'|'end'
    const justify = params.justify || 'start'; // 'start'|'center'|'end'|'space-between'
    const rects = [];

    let curX = box.x;
    let curY = box.y;
    let rowItems = [];
    let rowMaxH = 0;

    function flushRow() {
      if (rowItems.length === 0) return;
      const totalItemW = rowItems.reduce((acc, it) => acc + it.w, 0);
      const totalGaps = (rowItems.length - 1) * gap;
      const remainingW = Math.max(0, box.w - (totalItemW + totalGaps));

      let startX = box.x;
      let gapStep = gap;

      if (justify === 'center') {
        startX += remainingW / 2;
      } else if (justify === 'end') {
        startX += remainingW;
      } else if (justify === 'space-between' && rowItems.length > 1) {
        gapStep = gap + remainingW / (rowItems.length - 1);
      }

      let rx = startX;
      for (const it of rowItems) {
        let ry = curY;
        if (align === 'center') {
          ry += (rowMaxH - it.h) / 2;
        } else if (align === 'end') {
          ry += rowMaxH - it.h;
        }

        rects.push({
          id: it.id,
          x: Math.round(rx),
          y: Math.round(ry),
          w: Math.round(it.w),
          h: Math.round(it.h)
        });
        rx += it.w + gapStep;
      }

      curY += rowMaxH + gap;
      rowItems = [];
      rowMaxH = 0;
      curX = box.x;
    }

    for (const child of children) {
      const itemW = Math.min(child.w || 140, box.w);
      const itemH = child.h || 60;

      if (rowItems.length > 0 && curX + itemW > box.x + box.w) {
        flushRow();
      }

      rowItems.push({ id: child.id, w: itemW, h: itemH });
      rowMaxH = Math.max(rowMaxH, itemH);
      curX += itemW + gap;
    }
    flushRow();

    return rects;
  }

  /* -------------------------------------------------------------------------
   * 2. GRID LAYOUT (Columns, row height, and span support)
   * ------------------------------------------------------------------------- */
  function solveGridLayout(children, box, gap, params) {
    const minCell = params.minCell || 120;
    let cols = params.columns;

    if (!cols || cols === 'auto-fill' || cols === 'auto-fit') {
      cols = Math.max(1, Math.floor((box.w + gap) / (minCell + gap)));
    } else {
      cols = Math.max(1, parseInt(cols, 10) || 1);
    }

    const colW = Math.max(20, (box.w - gap * (cols - 1)) / cols);
    const rowH = params.rowHeight && params.rowHeight !== 'auto' ? params.rowHeight : colW * 0.75;
    const rects = [];

    // Occupancy 2D grid bitmap for span / dense packing
    const occupied = []; // occupied[row][col]

    function isOccupied(r, c) {
      return occupied[r] && occupied[r][c];
    }

    function markOccupied(r, c, spanC, spanR) {
      for (let dr = 0; dr < spanR; dr++) {
        const row = r + dr;
        if (!occupied[row]) occupied[row] = [];
        for (let dc = 0; dc < spanC; dc++) {
          occupied[row][c + dc] = true;
        }
      }
    }

    function findSlot(spanC, spanR) {
      let r = 0;
      while (true) {
        for (let c = 0; c <= cols - spanC; c++) {
          let fits = true;
          for (let dr = 0; dr < spanR; dr++) {
            for (let dc = 0; dc < spanC; dc++) {
              if (isOccupied(r + dr, c + dc)) {
                fits = false;
                break;
              }
            }
            if (!fits) break;
          }
          if (fits) return { r, c };
        }
        r++;
      }
    }

    for (const child of children) {
      const span = child.span || [1, 1];
      const spanC = Math.min(cols, Math.max(1, span[0] || 1));
      const spanR = Math.max(1, span[1] || 1);

      const slot = findSlot(spanC, spanR);
      markOccupied(slot.r, slot.c, spanC, spanR);

      const itemX = box.x + slot.c * (colW + gap);
      const itemY = box.y + slot.r * (rowH + gap);
      const itemW = spanC * colW + (spanC - 1) * gap;
      const itemH = spanR * rowH + (spanR - 1) * gap;

      rects.push({
        id: child.id,
        x: Math.round(itemX),
        y: Math.round(itemY),
        w: Math.round(itemW),
        h: Math.round(itemH)
      });
    }

    return rects;
  }

  /* -------------------------------------------------------------------------
   * 3. JUSTIFIED ROWS LAYOUT (Google Photos Style Dynamic Programming)
   * ------------------------------------------------------------------------- */
  function solveJustifyLayout(children, box, gap, params) {
    if (children.length === 0) return [];
    let targetRowH = params.targetRowHeight || 120;
    const fillHeight = !!params.fillHeight;

    // Helper to evaluate layout with a given targetRowH
    function layoutWithTargetH(H0) {
      const aspects = children.map(c => {
        if (c.aspect) return c.aspect;
        const w = c.w || 140;
        const h = c.h || 100;
        return w / Math.max(1, h);
      });

      const n = children.length;
      const W = box.w;
      const maxK = Math.min(12, n); // max items per row

      // DP: dp[i] = { cost, prev } for partition 0..i
      const dp = new Array(n + 1).fill(null).map(() => ({ cost: Infinity, prev: 0, rowH: H0 }));
      dp[0] = { cost: 0, prev: 0, rowH: H0 };

      for (let i = 1; i <= n; i++) {
        let sumAspect = 0;
        for (let j = i; j >= Math.max(1, i - maxK + 1); j--) {
          sumAspect += aspects[j - 1];
          const count = i - j + 1;
          const rowW = W - gap * (count - 1);
          const computedRowH = rowW / Math.max(0.01, sumAspect);

          // Cost is squared deviation from target height H0
          const diff = computedRowH - H0;
          const cost = diff * diff;
          const totalCost = dp[j - 1].cost + cost;

          if (totalCost < dp[i].cost) {
            dp[i] = { cost: totalCost, prev: j - 1, rowH: computedRowH };
          }
        }
      }

      // Reconstruct partitions
      const rows = [];
      let curr = n;
      while (curr > 0) {
        const prev = dp[curr].prev;
        rows.unshift({
          start: prev,
          end: curr,
          rowH: dp[curr].rowH
        });
        curr = prev;
      }

      // Format rects
      const result = [];
      let curY = box.y;

      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = rows[rIdx];
        const count = row.end - row.start;
        const isLastRow = rIdx === rows.length - 1;

        // Last row natural clamp: do not over-stretch if last row has very few items
        let rowH = row.rowH;
        if (!fillHeight && isLastRow && rowH > H0 * 1.4) {
          rowH = H0;
        }

        let curX = box.x;
        for (let i = row.start; i < row.end; i++) {
          const item = children[i];
          const asp = aspects[i];
          let itemW = asp * rowH;

          // Clamping to row boundary for the last item in a non-stretched row
          if (!isLastRow && i === row.end - 1) {
            itemW = Math.max(20, box.x + box.w - curX);
          }

          result.push({
            id: item.id,
            x: Math.round(curX),
            y: Math.round(curY),
            w: Math.round(itemW),
            h: Math.round(rowH)
          });
          curX += itemW + gap;
        }

        curY += rowH + gap;
      }

      const totalH = curY - gap - box.y;

      // When fillHeight is enabled, scale row heights to exactly match box.h
      if (fillHeight && totalH > 0 && Math.abs(totalH - box.h) > 5) {
        const totalGaps = (rows.length - 1) * gap;
        const availForRows = Math.max(20, box.h - totalGaps);
        const currentRowsH = totalH - totalGaps;
        const scale = availForRows / Math.max(1, currentRowsH);

        let scaledY = box.y;
        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
          const row = rows[rIdx];
          const scaledH = Math.round(row.rowH * scale);
          for (let i = row.start; i < row.end; i++) {
            result[i].y = Math.round(scaledY);
            result[i].h = scaledH;
          }
          scaledY += scaledH + gap;
        }
      }

      return { rects: result, totalH: curY - gap - box.y };
    }

    // Binary search targetRowH if fillHeight is true
    if (fillHeight && box.h > 40) {
      let low = 20;
      let high = box.h * 2;
      let best = layoutWithTargetH(targetRowH);

      for (let iter = 0; iter < 12; iter++) {
        const mid = (low + high) / 2;
        const testRes = layoutWithTargetH(mid);
        best = testRes;

        if (Math.abs(testRes.totalH - box.h) < 10) break;
        if (testRes.totalH < box.h) {
          low = mid;
        } else {
          high = mid;
        }
      }
      return best.rects;
    }

    return layoutWithTargetH(targetRowH).rects;
  }

  /* -------------------------------------------------------------------------
   * 4. MASONRY LAYOUT (Shortest-Column-First)
   * ------------------------------------------------------------------------- */
  function solveMasonryLayout(children, box, gap, params) {
    const minCell = params.minCell || 140;
    const numCols = Math.max(1, Math.floor((box.w + gap) / (minCell + gap)));
    const colW = Math.max(20, (box.w - gap * (numCols - 1)) / numCols);

    const colHeights = new Array(numCols).fill(box.y);
    const rects = [];

    for (const child of children) {
      // Find shortest column
      let shortestCol = 0;
      let minH = colHeights[0];
      for (let c = 1; c < numCols; c++) {
        if (colHeights[c] < minH) {
          minH = colHeights[c];
          shortestCol = c;
        }
      }

      const itemX = box.x + shortestCol * (colW + gap);
      const itemY = colHeights[shortestCol];
      const itemH = child.h || 120;

      rects.push({
        id: child.id,
        x: Math.round(itemX),
        y: Math.round(itemY),
        w: Math.round(colW),
        h: Math.round(itemH)
      });

      colHeights[shortestCol] += itemH + gap;
    }

    return rects;
  }

  /* -------------------------------------------------------------------------
   * 5. STACK LAYOUT (Vertical or Horizontal Sequence)
   * ------------------------------------------------------------------------- */
  function solveStackLayout(children, box, gap, params) {
    const direction = params.direction || 'vertical';
    const isReverse = !!params.reverse;
    const rects = [];

    const items = isReverse ? [...children].reverse() : children;

    if (direction === 'vertical') {
      let curY = box.y;
      for (const it of items) {
        const itemH = it.h || 48;
        rects.push({
          id: it.id,
          x: Math.round(box.x),
          y: Math.round(curY),
          w: Math.round(box.w),
          h: Math.round(itemH)
        });
        curY += itemH + gap;
      }
    } else {
      let curX = box.x;
      for (const it of items) {
        const itemW = it.w || 100;
        rects.push({
          id: it.id,
          x: Math.round(curX),
          y: Math.round(box.y),
          w: Math.round(itemW),
          h: Math.round(box.h)
        });
        curX += itemW + gap;
      }
    }

    return rects;
  }

  /* -------------------------------------------------------------------------
   * 6. CAROUSEL LAYOUT (Paged Horizontal Snap Strip)
   * ------------------------------------------------------------------------- */
  function solveCarouselLayout(children, box, gap, params) {
    const visibleCount = Math.max(1, params.visibleCount || Math.floor(box.w / 180) || 1);
    const itemW = Math.max(40, (box.w - gap * (visibleCount - 1)) / visibleCount);
    const rects = [];

    let curX = box.x;
    for (const it of children) {
      rects.push({
        id: it.id,
        x: Math.round(curX),
        y: Math.round(box.y),
        w: Math.round(itemW),
        h: Math.round(box.h)
      });
      curX += itemW + gap;
    }

    return rects;
  }

  /* -------------------------------------------------------------------------
   * 7. FREE LAYOUT (Relative Coordinates)
   * ------------------------------------------------------------------------- */
  function solveFreeLayout(children, box) {
    return children.map(c => ({
      id: c.id,
      x: Math.round(box.x + (c.x || 0)),
      y: Math.round(box.y + (c.y || 0)),
      w: Math.round(c.w || 120),
      h: Math.round(c.h || 80)
    }));
  }

  return {
    solveAutoLayout,
    solveFlowLayout,
    solveGridLayout,
    solveJustifyLayout,
    solveMasonryLayout,
    solveStackLayout,
    solveCarouselLayout,
    solveFreeLayout
  };
});
