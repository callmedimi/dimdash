/**
 * DimDash Constraint Solver & Profile Matcher
 * Figma-class constraint solver, profile resolver with hysteresis, and deterministic collision relief.
 * Universal module (Node.js & Browser)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashSolver = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_PROFILES = [
    { id: 'xs', match: { max_w: 480 }, mode: 'flow', design: [390, 844] },
    { id: 'sm', match: { min_w: 481, max_w: 900 }, mode: 'flow', design: [768, 1024] },
    { id: 'md', match: { min_w: 901, max_w: 1500 }, mode: 'fit', design: [1280, 800] },
    { id: 'lg', match: { min_w: 1501, max_w: 2400 }, mode: 'fit', design: [1920, 1080] },
    { id: 'xl', match: { min_w: 2401 }, mode: 'fit', design: [3440, 1440] },
    { id: 'wall', match: { display_class: 'wall' }, mode: 'fit', design: [1920, 1080], ui: 'tenfoot' }
  ];

  /**
   * Resolve active layout profile from logical stage size in wu.
   * Includes hysteresis (±3%) to prevent boundary oscillation.
   */
  function resolveProfile(vwWu, vhWu, options = {}) {
    const profiles = Array.isArray(options.profiles) && options.profiles.length > 0
      ? options.profiles
      : DEFAULT_PROFILES;

    const currentProfileId = options.currentProfileId || null;
    const displayClass = options.displayClass || null;
    const hysteresis = options.hysteresis !== undefined ? options.hysteresis : 0.03; // ±3%

    // Query param override (e.g. ?profile=xl)
    if (options.overrideProfile) {
      const match = profiles.find(p => p.id === options.overrideProfile);
      if (match) return match;
    }

    // Wall display class check
    if (displayClass === 'wall') {
      const wallProfile = profiles.find(p => p.id === 'wall' || p.match?.display_class === 'wall');
      if (wallProfile) return wallProfile;
    }

    const aspect = vhWu > 0 ? vwWu / vhWu : 1;

    // 1. Evaluate current profile first with hysteresis
    if (currentProfileId) {
      const currentProf = profiles.find(p => p.id === currentProfileId);
      if (currentProf && (currentProf.id !== 'wall' || displayClass === 'wall')) {
        const m = currentProf.match || {};
        const minW = m.min_w !== undefined ? m.min_w * (1 - hysteresis) : -Infinity;
        const maxW = m.max_w !== undefined ? m.max_w * (1 + hysteresis) : Infinity;
        const minAspect = m.min_aspect !== undefined ? m.min_aspect * (1 - hysteresis) : 0;
        const maxAspect = m.max_aspect !== undefined ? m.max_aspect * (1 + hysteresis) : Infinity;

        if (vwWu >= minW && vwWu <= maxW && aspect >= minAspect && aspect <= maxAspect) {
          return currentProf;
        }
      }
    }

    // 2. Scan all profiles without hysteresis
    for (const prof of profiles) {
      if (prof.id === 'wall' && displayClass !== 'wall') continue;

      const m = prof.match || {};
      const minW = m.min_w !== undefined ? m.min_w : -Infinity;
      const maxW = m.max_w !== undefined ? m.max_w : Infinity;
      const minAspect = m.min_aspect !== undefined ? m.min_aspect : 0;
      const maxAspect = m.max_aspect !== undefined ? m.max_aspect : Infinity;

      if (vwWu >= minW && vwWu <= maxW && aspect >= minAspect && aspect <= maxAspect) {
        return prof;
      }
    }

    // Default fallback to lg or first profile
    return profiles.find(p => p.id === 'lg') || profiles[0];
  }

  /**
   * Solve constraints for a single item (Figma model)
   * @param {Object} itemBase Base placement { x, y, w, h, hc, vc, min_w, max_w, min_h, max_h }
   * @param {Object} S Current viewport / container size { w, h }
   * @param {Object} R Profile design size { w, h }
   * @param {Object} options { isRtl: boolean, mirrorLayoutInRtl: boolean }
   * @returns {Object} Solved rect { x, y, w, h }
   */
  function solveItemConstraints(itemBase, S, R, options = {}) {
    const Sw = Math.max(1, S.w);
    const Sh = Math.max(1, S.h);
    const Rw = Math.max(1, R.w);
    const Rh = Math.max(1, R.h);

    const dx = Sw - Rw;
    const dy = Sh - Rh;

    let hc = (itemBase.hc || 'left').toLowerCase();
    const vc = (itemBase.vc || 'top').toLowerCase();

    // Mirror horizontal constraints if RTL and mirroring is explicitly enabled
    if (options.isRtl && options.mirrorLayoutInRtl) {
      if (hc === 'left') hc = 'right';
      else if (hc === 'right') hc = 'left';
    }

    const origX = Number(itemBase.x) || 0;
    const origY = Number(itemBase.y) || 0;
    const origW = Math.max(10, Number(itemBase.w) || 100);
    const origH = Math.max(10, Number(itemBase.h) || 100);

    let x = origX;
    let w = origW;
    let y = origY;
    let h = origH;

    // 1. Horizontal constraint
    switch (hc) {
      case 'left':
        x = origX;
        w = origW;
        break;
      case 'right':
        x = origX + dx;
        w = origW;
        break;
      case 'center':
        x = origX + dx / 2;
        w = origW;
        break;
      case 'stretch':
        x = origX;
        w = Math.max(10, origW + dx);
        break;
      case 'scale':
        x = origX * (Sw / Rw);
        w = origW * (Sw / Rw);
        break;
      default:
        x = origX;
        w = origW;
    }

    // 2. Vertical constraint
    switch (vc) {
      case 'top':
        y = origY;
        h = origH;
        break;
      case 'bottom':
        y = origY + dy;
        h = origH;
        break;
      case 'center':
        y = origY + dy / 2;
        h = origH;
        break;
      case 'stretch':
        y = origY;
        h = Math.max(10, origH + dy);
        break;
      case 'scale':
        y = origY * (Sh / Rh);
        h = origH * (Sh / Rh);
        break;
      default:
        y = origY;
        h = origH;
    }

    // 3. Min/Max Clamping and Re-anchoring
    const minW = itemBase.min_w !== undefined ? itemBase.min_w : 20;
    const maxW = itemBase.max_w !== undefined ? itemBase.max_w : Infinity;
    const minH = itemBase.min_h !== undefined ? itemBase.min_h : 20;
    const maxH = itemBase.max_h !== undefined ? itemBase.max_h : Infinity;

    const clampedW = Math.min(Math.max(w, minW), maxW);
    const clampedH = Math.min(Math.max(h, minH), maxH);

    // Re-anchor if clamped
    if (clampedW !== w) {
      const dw = clampedW - w;
      if (hc === 'right') {
        x -= dw;
      } else if (hc === 'center') {
        x -= dw / 2;
      }
      w = clampedW;
    }

    if (clampedH !== h) {
      const dh = clampedH - h;
      if (vc === 'bottom') {
        y -= dh;
      } else if (vc === 'center') {
        y -= dh / 2;
      }
      h = clampedH;
    }

    return {
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      w: Math.round(w * 10) / 10,
      h: Math.round(h * 10) / 10
    };
  }

  /**
   * Solve full stage layout for a list of items and layout profile
   */
  function solveStageLayout(items = [], layoutDoc = {}, stageSize = { w: 1920, h: 1080 }, profileId = 'lg', options = {}) {
    const profiles = layoutDoc.profiles || DEFAULT_PROFILES;
    const activeProfile = profiles.find(p => p.id === profileId) || profiles.find(p => p.id === 'lg') || DEFAULT_PROFILES[3];

    const designW = activeProfile.design ? activeProfile.design[0] : 1920;
    const designH = activeProfile.design ? activeProfile.design[1] : 1080;
    const R = { w: designW, h: designH };
    const S = { w: stageSize.w, h: stageSize.h };

    const placementMap = layoutDoc.placement || {};
    const solvedRects = new Map(); // id -> { id, kind, x, y, w, h, z, parent, pinned }
    const itemsById = new Map();
    items.forEach(it => itemsById.set(it.id, it));

    // Resolve an item's base placement for profile (supporting inherit)
    function getBasePlacement(itemId, targetProfId) {
      const itemPlacements = placementMap[itemId] || {};
      if (itemPlacements[targetProfId]) return itemPlacements[targetProfId];

      const profObj = profiles.find(p => p.id === targetProfId);
      if (profObj && profObj.inherit && itemPlacements[profObj.inherit]) {
        return itemPlacements[profObj.inherit];
      }

      return itemPlacements['lg'] || itemPlacements['md'] || Object.values(itemPlacements)[0] || null;
    }

    // 1. Solve top-level items first (items with no parent or parent === null)
    function solveItem(item, parentRect = null, depth = 0) {
      if (depth > 6) return null; // Cap nesting at 6

      const base = getBasePlacement(item.id, activeProfile.id) || {
        x: 40,
        y: 40,
        w: 300,
        h: 180,
        hc: 'left',
        vc: 'top',
        z: 1
      };

      const containerS = parentRect ? { w: parentRect.w, h: parentRect.h } : S;
      const containerR = parentRect ? { w: parentRect.baseW || parentRect.w, h: parentRect.baseH || parentRect.h } : R;

      const solved = solveItemConstraints(base, containerS, containerR, options);

      // If item has a parent, coordinates are offset by parent's position
      const finalX = parentRect ? parentRect.x + solved.x : solved.x;
      const finalY = parentRect ? parentRect.y + solved.y : solved.y;

      const result = {
        id: item.id,
        kind: item.kind,
        title: item.title,
        x: finalX,
        y: finalY,
        w: solved.w,
        h: solved.h,
        z: base.z || (depth + 1),
        parent: base.parent || null,
        pinned: !!base.pinned,
        overlap: base.overlap || 'prevent',
        importance: base.importance !== undefined ? base.importance : (item.kind === 'island' ? 10 : 5),
        baseW: base.w,
        baseH: base.h,
        depth
      };

      solvedRects.set(item.id, result);
      return result;
    }

    // Separate top-level items and child items
    const topLevel = [];
    const childrenByParent = new Map();

    for (const item of items) {
      const base = getBasePlacement(item.id, activeProfile.id);
      const parentId = base?.parent;
      if (parentId && itemsById.has(parentId)) {
        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
        childrenByParent.get(parentId).push(item);
      } else {
        topLevel.push(item);
      }
    }

    // Solve top-level items
    for (const item of topLevel) {
      const rect = solveItem(item, null, 0);
      // Recursively solve children if any
      const children = childrenByParent.get(item.id);
      if (children && rect) {
        for (const child of children) {
          solveItem(child, rect, 1);
        }
      }
    }

    // Handle any orphan children whose parents weren't found
    for (const [parentId, children] of childrenByParent.entries()) {
      if (!solvedRects.has(parentId)) {
        for (const child of children) {
          solveItem(child, null, 0);
        }
      }
    }

    return {
      profile: activeProfile,
      stageSize: S,
      rects: Array.from(solvedRects.values())
    };
  }

  /**
   * Deterministic Collision Relief
   * Detects overlaps and pushes lower-importance items along minimum penetration axis.
   * Max 8 passes. Stable tie-break by ID.
   */
  function relieveCollisions(rects = [], S = { w: 1920, h: 1080 }, options = {}) {
    const maxPasses = options.maxPasses || 8;
    const working = rects.map(r => ({ ...r }));
    const offenders = new Set();

    function checkOverlap(a, b) {
      return (
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y
      );
    }

    if (working.length <= 1) {
      return {
        feasible: true,
        passes: 1,
        rects: working,
        offenders: []
      };
    }

    // Grid size for spatial hash
    const cellSize = options.cellSize || 200;

    function buildSpatialHash(items) {
      const grid = new Map();
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.overlap === 'allow') continue;

        const minCol = Math.floor(item.x / cellSize);
        const maxCol = Math.floor((item.x + item.w) / cellSize);
        const minRow = Math.floor(item.y / cellSize);
        const maxRow = Math.floor((item.y + item.h) / cellSize);

        for (let c = minCol; c <= maxCol; c++) {
          for (let r = minRow; r <= maxRow; r++) {
            const key = `${c}:${r}`;
            let bucket = grid.get(key);
            if (!bucket) {
              bucket = [];
              grid.set(key, bucket);
            }
            bucket.push(i);
          }
        }
      }
      return grid;
    }

    let pass = 0;
    let hadCollision = true;

    while (pass < maxPasses && hadCollision) {
      hadCollision = false;
      pass++;

      // Sort items by importance descending, tie-break by ID
      working.sort((a, b) => {
        if (b.importance !== a.importance) return b.importance - a.importance;
        return a.id.localeCompare(b.id);
      });

      const grid = buildSpatialHash(working);
      const checkedPairs = new Set();

      for (const bucket of grid.values()) {
        if (bucket.length <= 1) continue;

        for (let m = 0; m < bucket.length; m++) {
          const i = bucket[m];
          const a = working[i];
          if (a.overlap === 'allow') continue;

          for (let n = m + 1; n < bucket.length; n++) {
            const j = bucket[n];
            const pairKey = i < j ? `${i}:${j}` : `${j}:${i}`;
            if (checkedPairs.has(pairKey)) continue;
            checkedPairs.add(pairKey);

            const b = working[j];
            if (b.overlap === 'allow') continue;
            if (a.parent && a.parent === b.parent) continue;

            if (checkOverlap(a, b)) {
              hadCollision = true;
              offenders.add(a.id);
              offenders.add(b.id);

              const overlapX1 = a.x + a.w - b.x;
              const overlapX2 = b.x + b.w - a.x;
              const penX = Math.min(overlapX1, overlapX2);

              const overlapY1 = a.y + a.h - b.y;
              const overlapY2 = b.y + b.h - a.y;
              const penY = Math.min(overlapY1, overlapY2);

              const gap = 16;
              if (penX <= penY) {
                if (b.x >= a.x) {
                  b.x = a.x + a.w + gap;
                } else if (a.x - b.w - gap >= 0) {
                  b.x = a.x - b.w - gap;
                } else {
                  b.x = a.x + a.w + gap;
                }
              } else {
                if (b.y >= a.y) {
                  b.y = a.y + a.h + gap;
                } else if (a.y - b.h - gap >= 0) {
                  b.y = a.y - b.h - gap;
                } else {
                  b.y = a.y + a.h + gap;
                }
              }
            }
          }
        }
      }
    }

    // Final verification pass with spatial hash
    let remainingCollisions = false;
    const finalGrid = buildSpatialHash(working);
    const finalCheckedPairs = new Set();

    for (const bucket of finalGrid.values()) {
      if (bucket.length <= 1) continue;
      for (let m = 0; m < bucket.length; m++) {
        const i = bucket[m];
        const a = working[i];
        if (a.overlap === 'allow') continue;

        for (let n = m + 1; n < bucket.length; n++) {
          const j = bucket[n];
          const pairKey = i < j ? `${i}:${j}` : `${j}:${i}`;
          if (finalCheckedPairs.has(pairKey)) continue;
          finalCheckedPairs.add(pairKey);

          const b = working[j];
          if (b.overlap === 'allow') continue;
          if (a.parent && a.parent === b.parent) continue;

          if (checkOverlap(a, b)) {
            remainingCollisions = true;
            break;
          }
        }
        if (remainingCollisions) break;
      }
      if (remainingCollisions) break;
    }

    return {
      feasible: !remainingCollisions,
      passes: pass,
      rects: working,
      offenders: Array.from(offenders)
    };
  }

  /**
   * Solve view mode layout (fit, flow, canvas)
   */
  function solveMode(mode, rects = [], S = { w: 1920, h: 1080 }, options = {}) {
    if (mode === 'flow') {
      // Flow mode: Full-width stacked islands, no horizontal scroll
      const padding = 20;
      const gap = 20;
      let curY = padding;
      const flowWidth = Math.max(280, S.w - padding * 2);

      // Sort islands by explicit order, else y then x (RTL aware)
      const sorted = [...rects].sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        if (Math.abs(a.y - b.y) > 30) return a.y - b.y;
        return options.isRtl ? b.x - a.x : a.x - b.x;
      });

      const flowRects = sorted.map(r => {
        const itemH = Math.max(80, r.h);
        const res = {
          ...r,
          x: padding,
          y: curY,
          w: flowWidth,
          h: itemH
        };
        curY += itemH + gap;
        return res;
      });

      return {
        mode: 'flow',
        scale: 1,
        contentHeight: curY + padding,
        rects: flowRects
      };
    }

    if (mode === 'fit') {
      // Fit mode: Uniform shrink-to-fit if content exceeds viewport
      let maxX = 0;
      let maxY = 0;
      for (const r of rects) {
        if (r.pinned) continue;
        if (r.x + r.w > maxX) maxX = r.x + r.w;
        if (r.y + r.h > maxY) maxY = r.y + r.h;
      }

      let scale = 1.0;
      if (maxX > S.w || maxY > S.h) {
        const scaleX = S.w / Math.max(1, maxX);
        const scaleY = S.h / Math.max(1, maxY);
        scale = Math.min(scaleX, scaleY);
      }

      const minScale = options.minScale || 0.8;
      const isFeasible = scale >= minScale;

      return {
        mode: 'fit',
        scale: Number(Math.max(scale, minScale).toFixed(4)),
        feasible: isFeasible,
        contentWidth: maxX,
        contentHeight: maxY,
        rects
      };
    }

    // Canvas mode (infinite world)
    return {
      mode: 'canvas',
      scale: 1.0,
      rects
    };
  }

  return {
    DEFAULT_PROFILES,
    resolveProfile,
    solveItemConstraints,
    solveStageLayout,
    relieveCollisions,
    solveMode
  };
});
