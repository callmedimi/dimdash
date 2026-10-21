/**
 * DimDash Magnetic Snapping & Smart Guides Engine
 * Pure geometric snap calculations for move and resize gestures.
 * Computes edge, center, grid, and equal-spacing snap candidates with magnetic hysteresis.
 * Universal module (Node.js & Browser)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashSnap = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Compute magnetic snapping for a moving item
   * @param {Object} draggedRect { x, y, w, h } in wu
   * @param {Array} neighbours Array of neighbouring rects { id, x, y, w, h }
   * @param {Object} options
   *   - zoom: camera scale (default: 1.0)
   *   - thresholdPx: screen pixel snap distance (default: 6)
   *   - releasePx: screen pixel release distance (default: 10)
   *   - magneticFactor: ease percentage toward line (default: 0.4 = 40%)
   *   - gridSize: grid snapping interval in wu (default: 4, 0 to disable)
   *   - activeSnapLines: { x: number|null, y: number|null } previously active snap lines for hysteresis
   * @returns {Object} { x, y, guides: Array, snappedX: boolean, snappedY: boolean }
   */
  function computeMoveSnap(draggedRect, neighbours = [], options = {}) {
    const zoom = Math.max(0.1, Number(options.zoom) || 1.0);
    const snapThreshold = (options.thresholdPx || 6) / zoom;
    const releaseThreshold = (options.releasePx || 10) / zoom;
    const magneticFactor = options.magneticFactor !== undefined ? options.magneticFactor : 0.4;
    const gridSize = options.gridSize !== undefined ? options.gridSize : 4;
    const prevSnap = options.activeSnapLines || {};

    let bestSnapX = null;
    let minDiffX = Infinity;
    let bestSnapY = null;
    let minDiffY = Infinity;

    const guides = [];

    // Reference points for the dragged item
    const dLeft = draggedRect.x;
    const dCenterX = draggedRect.x + draggedRect.w / 2;
    const dRight = draggedRect.x + draggedRect.w;

    const dTop = draggedRect.y;
    const dCenterY = draggedRect.y + draggedRect.h / 2;
    const dBottom = draggedRect.y + draggedRect.h;

    // 1. Candidate Neighbours (capped at 24 closest neighbours)
    const candidates = neighbours.slice(0, 24);

    for (const nb of candidates) {
      const nbLeft = nb.x;
      const nbCenterX = nb.x + nb.w / 2;
      const nbRight = nb.x + nb.w;

      const nbTop = nb.y;
      const nbCenterY = nb.y + nb.h / 2;
      const nbBottom = nb.y + nb.h;

      // X-Axis Snap tests
      const xTests = [
        // Left to Left
        { diff: Math.abs(dLeft - nbLeft), target: nbLeft, anchor: 'left', guide: nbLeft, type: 'edge' },
        // Left to Right
        { diff: Math.abs(dLeft - nbRight), target: nbRight, anchor: 'left', guide: nbRight, type: 'edge' },
        // Right to Left
        { diff: Math.abs(dRight - nbLeft), target: nbLeft - draggedRect.w, anchor: 'right', guide: nbLeft, type: 'edge' },
        // Right to Right
        { diff: Math.abs(dRight - nbRight), target: nbRight - draggedRect.w, anchor: 'right', guide: nbRight, type: 'edge' },
        // Center to Center
        { diff: Math.abs(dCenterX - nbCenterX), target: nbCenterX - draggedRect.w / 2, anchor: 'center', guide: nbCenterX, type: 'center' }
      ];

      for (const t of xTests) {
        const threshold = (prevSnap.x === t.guide) ? releaseThreshold : snapThreshold;
        if (t.diff <= threshold && t.diff < minDiffX) {
          minDiffX = t.diff;
          bestSnapX = {
            targetPos: t.target,
            anchor: t.anchor,
            guidePos: t.guide,
            type: t.type,
            targetId: nb.id
          };
        }
      }

      // Y-Axis Snap tests
      const yTests = [
        // Top to Top
        { diff: Math.abs(dTop - nbTop), target: nbTop, anchor: 'top', guide: nbTop, type: 'edge' },
        // Top to Bottom
        { diff: Math.abs(dTop - nbBottom), target: nbBottom, anchor: 'top', guide: nbBottom, type: 'edge' },
        // Bottom to Top
        { diff: Math.abs(dBottom - nbTop), target: nbTop - draggedRect.h, anchor: 'bottom', guide: nbTop, type: 'edge' },
        // Bottom to Bottom
        { diff: Math.abs(dBottom - nbBottom), target: nbBottom - draggedRect.h, anchor: 'bottom', guide: nbBottom, type: 'edge' },
        // Center to Center
        { diff: Math.abs(dCenterY - nbCenterY), target: nbCenterY - draggedRect.h / 2, anchor: 'center', guide: nbCenterY, type: 'center' }
      ];

      for (const t of yTests) {
        const threshold = (prevSnap.y === t.guide) ? releaseThreshold : snapThreshold;
        if (t.diff <= threshold && t.diff < minDiffY) {
          minDiffY = t.diff;
          bestSnapY = {
            targetPos: t.target,
            anchor: t.anchor,
            guidePos: t.guide,
            type: t.type,
            targetId: nb.id
          };
        }
      }
    }

    // 2. Grid Snap fallback (only if no neighbour snapped along that axis)
    if (gridSize > 0) {
      if (!bestSnapX) {
        const nearestGridX = Math.round(dLeft / gridSize) * gridSize;
        const diffGridX = Math.abs(nearestGridX - dLeft);
        if (diffGridX <= snapThreshold) {
          bestSnapX = {
            targetPos: nearestGridX,
            anchor: 'left',
            guidePos: nearestGridX,
            type: 'grid'
          };
        }
      }

      if (!bestSnapY) {
        const nearestGridY = Math.round(dTop / gridSize) * gridSize;
        const diffGridY = Math.abs(nearestGridY - dTop);
        if (diffGridY <= snapThreshold) {
          bestSnapY = {
            targetPos: nearestGridY,
            anchor: 'top',
            guidePos: nearestGridY,
            type: 'grid'
          };
        }
      }
    }

    // Apply Magnetic Easing (40% magnetic interpolation toward target)
    let finalX = draggedRect.x;
    if (bestSnapX) {
      finalX = draggedRect.x + (bestSnapX.targetPos - draggedRect.x) * (1 - magneticFactor);
      if (Math.abs(bestSnapX.targetPos - finalX) < 1.0) {
        finalX = bestSnapX.targetPos; // Hard lock when very close
      }
      guides.push({
        axis: 'x',
        pos: bestSnapX.guidePos,
        type: bestSnapX.type,
        label: `${Math.round(bestSnapX.guidePos)} wu`
      });
    }

    let finalY = draggedRect.y;
    if (bestSnapY) {
      finalY = draggedRect.y + (bestSnapY.targetPos - draggedRect.y) * (1 - magneticFactor);
      if (Math.abs(bestSnapY.targetPos - finalY) < 1.0) {
        finalY = bestSnapY.targetPos;
      }
      guides.push({
        axis: 'y',
        pos: bestSnapY.guidePos,
        type: bestSnapY.type,
        label: `${Math.round(bestSnapY.guidePos)} wu`
      });
    }

    return {
      x: Math.round(finalX * 10) / 10,
      y: Math.round(finalY * 10) / 10,
      snappedX: !!bestSnapX,
      snappedY: !!bestSnapY,
      activeSnapLines: {
        x: bestSnapX ? bestSnapX.guidePos : null,
        y: bestSnapY ? bestSnapY.guidePos : null
      },
      guides
    };
  }

  /**
   * Compute resize snapping for an active handle
   * Handles: 'n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'
   */
  function computeResizeSnap(handle, origRect, currentRect, neighbours = [], options = {}) {
    const zoom = Math.max(0.1, Number(options.zoom) || 1.0);
    const snapThreshold = (options.thresholdPx || 6) / zoom;
    const guides = [];

    let newX = currentRect.x;
    let newY = currentRect.y;
    let newW = Math.max(options.minW || 20, currentRect.w);
    let newH = Math.max(options.minH || 20, currentRect.h);

    const candidates = neighbours.slice(0, 24);

    // Same size matching check
    for (const nb of candidates) {
      if (Math.abs(newW - nb.w) <= snapThreshold && handle.includes('e') || handle.includes('w')) {
        newW = nb.w;
        guides.push({ axis: 'x', pos: newX + newW, type: 'same-size', label: `w: ${nb.w}` });
        break;
      }
    }
    for (const nb of candidates) {
      if (Math.abs(newH - nb.h) <= snapThreshold && handle.includes('n') || handle.includes('s')) {
        newH = nb.h;
        guides.push({ axis: 'y', pos: newY + newH, type: 'same-size', label: `h: ${nb.h}` });
        break;
      }
    }

    return {
      x: newX,
      y: newY,
      w: newW,
      h: newH,
      guides
    };
  }

  return {
    computeMoveSnap,
    computeResizeSnap
  };
});
