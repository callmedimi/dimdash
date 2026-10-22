/**
 * DimDash Semantic Zoom & Level of Detail (LOD) Engine (F1)
 * Computes semantic representations (detail, mid, chip, dot) across zoom scales
 * with counter-scale text preservation and zero re-layout overhead.
 * Universal Module (Node.js & Browser)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashSemanticZoom = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LOD = {
    DETAIL: 'detail',
    MID: 'mid',
    CHIP: 'chip',
    DOT: 'dot'
  };

  const DEFAULT_THRESHOLDS = {
    detail: 0.9,  // z >= 0.9 -> full content
    mid: 0.5,     // 0.5 <= z < 0.9 -> compact widgets
    chip: 0.2     // 0.2 <= z < 0.5 -> chip summaries; z < 0.2 -> dot
  };

  class SemanticZoom {
    constructor(thresholds = {}) {
      this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
      this.currentLOD = LOD.DETAIL;
      this.listeners = new Set();
    }

    /**
     * Resolves appropriate LOD given current camera zoom scale z
     */
    resolveLOD(zoomScale) {
      const z = typeof zoomScale === 'number' ? zoomScale : 1.0;
      if (z >= this.thresholds.detail) return LOD.DETAIL;
      if (z >= this.thresholds.mid) return LOD.MID;
      if (z >= this.thresholds.chip) return LOD.CHIP;
      return LOD.DOT;
    }

    /**
     * Updates zoom scale and emits change if LOD tier transitions
     */
    update(zoomScale) {
      const nextLOD = this.resolveLOD(zoomScale);
      if (nextLOD !== this.currentLOD) {
        const prev = this.currentLOD;
        this.currentLOD = nextLOD;
        this._notify(nextLOD, prev);
      }
      return this.currentLOD;
    }

    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    _notify(next, prev) {
      for (const fn of this.listeners) {
        try {
          fn(next, prev);
        } catch (e) {
          console.error('[SemanticZoom] listener error:', e);
        }
      }
    }

    /**
     * Calculates counter-scale factor so text/badges remain readable when zoomed far out
     */
    getCounterScale(zoomScale, basePx = 12, minPx = 10, maxPx = 24) {
      const z = Math.max(0.01, zoomScale || 1.0);
      const ideal = basePx / z;
      const clamped = Math.min(Math.max(ideal, minPx), maxPx);
      return (clamped / basePx);
    }

    /**
     * Summarizes island items into a chip representation for LOD_CHIP / LOD_DOT
     */
    summarizeIsland(island, items = [], probeStatuses = {}) {
      const islandItems = items.filter((it) => it.islandId === island.id);
      let worstStatus = 'online';
      let critCount = 0;
      let warnCount = 0;

      for (const it of islandItems) {
        const st = probeStatuses[it.id] || it.status || 'unknown';
        if (st === 'crit' || st === 'offline' || st === 'error') {
          worstStatus = 'crit';
          critCount++;
        } else if ((st === 'warn' || st === 'warning') && worstStatus !== 'crit') {
          worstStatus = 'warn';
          warnCount++;
        }
      }

      return {
        id: island.id,
        title: island.title || island.id,
        itemCount: islandItems.length,
        worstStatus,
        critCount,
        warnCount
      };
    }
  }

  return {
    LOD,
    DEFAULT_THRESHOLDS,
    SemanticZoom
  };
});
