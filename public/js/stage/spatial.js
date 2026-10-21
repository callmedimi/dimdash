/**
 * DimDash Spatial Index
 * High-performance 2D uniform hash grid for spatial queries, snapping, culling, and marquee selection.
 * Target: Rebuild 500 items in <= 0.5ms. O(1) neighbour queries.
 * Universal module (Node.js & Browser)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashSpatial = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class SpatialIndex {
    constructor(cellSize = 128) {
      this.cellSize = cellSize;
      this.grid = new Map(); // hashKey -> Set of itemIds
      this.items = new Map(); // id -> rect { id, x, y, w, h }
    }

    _hash(col, row) {
      return `${col}:${row}`;
    }

    _getBounds(rect) {
      const minCol = Math.floor(rect.x / this.cellSize);
      const maxCol = Math.floor((rect.x + rect.w) / this.cellSize);
      const minRow = Math.floor(rect.y / this.cellSize);
      const maxRow = Math.floor((rect.y + rect.h) / this.cellSize);
      return { minCol, maxCol, minRow, maxRow };
    }

    insert(id, x, y, w, h) {
      const rect = { id, x, y, w, h };
      this.items.set(id, rect);

      const b = this._getBounds(rect);
      for (let c = b.minCol; c <= b.maxCol; c++) {
        for (let r = b.minRow; r <= b.maxRow; r++) {
          const key = this._hash(c, r);
          let cell = this.grid.get(key);
          if (!cell) {
            cell = new Set();
            this.grid.set(key, cell);
          }
          cell.add(id);
        }
      }
    }

    remove(id) {
      const rect = this.items.get(id);
      if (!rect) return;

      const b = this._getBounds(rect);
      for (let c = b.minCol; c <= b.maxCol; c++) {
        for (let r = b.minRow; r <= b.maxRow; r++) {
          const key = this._hash(c, r);
          const cell = this.grid.get(key);
          if (cell) {
            cell.delete(id);
            if (cell.size === 0) this.grid.delete(key);
          }
        }
      }
      this.items.delete(id);
    }

    update(id, x, y, w, h) {
      this.remove(id);
      this.insert(id, x, y, w, h);
    }

    rebuild(rects = []) {
      this.grid.clear();
      this.items.clear();
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        this.insert(r.id, r.x, r.y, r.w, r.h);
      }
    }

    queryRect(targetRect, margin = 0) {
      const expanded = {
        x: targetRect.x - margin,
        y: targetRect.y - margin,
        w: targetRect.w + margin * 2,
        h: targetRect.h + margin * 2
      };

      const b = this._getBounds(expanded);
      const candidateIds = new Set();

      for (let c = b.minCol; c <= b.maxCol; c++) {
        for (let r = b.minRow; r <= b.maxRow; r++) {
          const cell = this.grid.get(this._hash(c, r));
          if (cell) {
            for (const id of cell) candidateIds.add(id);
          }
        }
      }

      const results = [];
      for (const id of candidateIds) {
        const item = this.items.get(id);
        if (!item) continue;
        if (
          item.x < expanded.x + expanded.w &&
          item.x + item.w > expanded.x &&
          item.y < expanded.y + expanded.h &&
          item.y + item.h > expanded.y
        ) {
          results.push(item);
        }
      }

      return results;
    }

    queryPoint(px, py, tolerance = 0) {
      return this.queryRect({ x: px, y: py, w: 0, h: 0 }, tolerance);
    }

    getNeighbours(id, margin = 48) {
      const item = this.items.get(id);
      if (!item) return [];
      const matches = this.queryRect(item, margin);
      return matches.filter(m => m.id !== id);
    }
  }

  return { SpatialIndex };
});
