/**
 * DimDash Shapes Library
 * Arbitrary island outlines without performance cliffs.
 * Provides clip paths (path, polygon, inset), content safe-area insets,
 * inner SVG stroke border paths, and geometric point hit-testing.
 * Universal module (Node.js & Browser)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashShapes = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CLIP_CACHE = new Map();
  const MAX_CACHE_ENTRIES = 500;

  function cacheGetOrSet(key, computeFn) {
    if (CLIP_CACHE.has(key)) return CLIP_CACHE.get(key);
    const val = computeFn();
    if (CLIP_CACHE.size > MAX_CACHE_ENTRIES) {
      const firstKey = CLIP_CACHE.keys().next().value;
      CLIP_CACHE.delete(firstKey);
    }
    CLIP_CACHE.set(key, val);
    return val;
  }

  const SHAPES = {
    // 1. Rectangle
    rect: {
      id: 'rect',
      label: 'Rectangle',
      clip: () => null, // default box
      inset: () => [0, 0, 0, 0],
      hit: (px, py, w, h) => px >= 0 && px <= w && py >= 0 && py <= h,
      svgPath: (w, h) => `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`
    },

    // 2. Rounded Rectangle (per-corner radii)
    rounded: {
      id: 'rounded',
      label: 'Rounded',
      clip: (w, h, p = {}) => {
        const r = p.radius !== undefined ? p.radius : 16;
        const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
        return `inset(0% round ${tl}px ${tr}px ${br}px ${bl}px)`;
      },
      inset: (w, h, p = {}) => {
        const r = p.radius !== undefined ? p.radius : 16;
        const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
        const maxR = Math.max(tl, tr, br, bl);
        // Safe inner margin for rounded corners: r * (1 - 1/sqrt(2)) ~= r * 0.293
        const pad = Math.ceil(maxR * 0.293);
        return [pad, pad, pad, pad];
      },
      hit: (px, py, w, h, p = {}) => {
        if (px < 0 || px > w || py < 0 || py > h) return false;
        const r = p.radius !== undefined ? p.radius : 16;
        const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
        // Check 4 corner cutoffs
        if (px < tl && py < tl) return (px - tl) ** 2 + (py - tl) ** 2 <= tl ** 2;
        if (px > w - tr && py < tr) return (px - (w - tr)) ** 2 + (py - tr) ** 2 <= tr ** 2;
        if (px > w - br && py > h - br) return (px - (w - br)) ** 2 + (py - (h - br)) ** 2 <= br ** 2;
        if (px < bl && py > h - bl) return (px - bl) ** 2 + (py - (h - bl)) ** 2 <= bl ** 2;
        return true;
      },
      svgPath: (w, h, p = {}) => {
        const r = p.radius !== undefined ? p.radius : 16;
        const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
        return `M ${tl} 0 L ${w - tr} 0 Q ${w} 0 ${w} ${tr} L ${w} ${h - br} Q ${w} ${h} ${w - br} ${h} L ${bl} ${h} Q 0 ${h} 0 ${h - bl} L 0 ${tl} Q 0 0 ${tl} 0 Z`;
      }
    },

    // 3. Pill
    pill: {
      id: 'pill',
      label: 'Pill',
      clip: (w, h) => {
        const r = Math.min(w, h) / 2;
        return `inset(0% round ${r}px)`;
      },
      inset: (w, h) => {
        const r = Math.min(w, h) / 2;
        return w >= h ? [0, Math.ceil(r * 0.5), 0, Math.ceil(r * 0.5)] : [Math.ceil(r * 0.5), 0, Math.ceil(r * 0.5), 0];
      },
      hit: (px, py, w, h) => {
        const r = Math.min(w, h) / 2;
        if (w >= h) {
          if (px < r) return (px - r) ** 2 + (py - r) ** 2 <= r ** 2;
          if (px > w - r) return (px - (w - r)) ** 2 + (py - r) ** 2 <= r ** 2;
          return py >= 0 && py <= h;
        } else {
          if (py < r) return (px - r) ** 2 + (py - r) ** 2 <= r ** 2;
          if (py > h - r) return (px - r) ** 2 + (py - (h - r)) ** 2 <= r ** 2;
          return px >= 0 && px <= w;
        }
      },
      svgPath: (w, h) => {
        const r = Math.min(w, h) / 2;
        return w >= h
          ? `M ${r} 0 L ${w - r} 0 A ${r} ${r} 0 0 1 ${w - r} ${h} L ${r} ${h} A ${r} ${r} 0 0 1 ${r} 0 Z`
          : `M 0 ${r} L 0 ${h - r} A ${r} ${r} 0 0 0 ${w} ${h - r} L ${w} ${r} A ${r} ${r} 0 0 0 0 ${r} Z`;
      }
    },

    // 4. Circle
    circle: {
      id: 'circle',
      label: 'Circle',
      clip: (w, h) => {
        const r = Math.min(w, h) / 2;
        return `circle(${r}px at 50% 50%)`;
      },
      inset: (w, h) => {
        const r = Math.min(w, h) / 2;
        // Inner square inside circle of radius r has half-side = r / sqrt(2)
        const padX = Math.ceil(w / 2 - r * 0.707);
        const padY = Math.ceil(h / 2 - r * 0.707);
        return [padY, padX, padY, padX];
      },
      hit: (px, py, w, h) => {
        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(w, h) / 2;
        return (px - cx) ** 2 + (py - cy) ** 2 <= r ** 2;
      },
      svgPath: (w, h) => {
        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(w, h) / 2;
        return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
      }
    },

    // 5. Ellipse
    ellipse: {
      id: 'ellipse',
      label: 'Ellipse',
      clip: () => 'ellipse(50% 50% at 50% 50%)',
      inset: (w, h) => [Math.ceil(h * 0.146), Math.ceil(w * 0.146), Math.ceil(h * 0.146), Math.ceil(w * 0.146)],
      hit: (px, py, w, h) => {
        const rx = w / 2;
        const ry = h / 2;
        if (rx <= 0 || ry <= 0) return false;
        return ((px - rx) / rx) ** 2 + ((py - ry) / ry) ** 2 <= 1.0;
      },
      svgPath: (w, h) => {
        const rx = w / 2;
        const ry = h / 2;
        return `M ${rx} 0 A ${rx} ${ry} 0 1 1 ${rx} ${h} A ${rx} ${ry} 0 1 1 ${rx} 0 Z`;
      }
    },

    // 6. Squircle (Superellipse approximated with cubic Béziers)
    squircle: {
      id: 'squircle',
      label: 'Squircle',
      clip: (w, h) => {
        // SVG path string in CSS clip-path: path(...)
        const hw = w / 2;
        const hh = h / 2;
        const c = 0.18; // squircle factor
        return `path('M 0 ${hh} C 0 ${hh * c} ${hw * c} 0 ${hw} 0 C ${w - hw * c} 0 ${w} ${hh * c} ${w} ${hh} C ${w} ${h - hh * c} ${w - hw * c} ${h} ${hw} ${h} C ${hw * c} ${h} 0 ${h - hh * c} 0 ${hh} Z')`;
      },
      inset: (w, h) => [Math.ceil(h * 0.08), Math.ceil(w * 0.08), Math.ceil(h * 0.08), Math.ceil(w * 0.08)],
      hit: (px, py, w, h) => {
        const rx = w / 2;
        const ry = h / 2;
        if (rx <= 0 || ry <= 0) return false;
        // Superellipse n=4: |(x-rx)/rx|^4 + |(y-ry)/ry|^4 <= 1
        return ((px - rx) / rx) ** 4 + ((py - ry) / ry) ** 4 <= 1.0;
      },
      svgPath: (w, h) => {
        const hw = w / 2;
        const hh = h / 2;
        const c = 0.18;
        return `M 0 ${hh} C 0 ${hh * c} ${hw * c} 0 ${hw} 0 C ${w - hw * c} 0 ${w} ${hh * c} ${w} ${hh} C ${w} ${h - hh * c} ${w - hw * c} ${h} ${hw} ${h} C ${hw * c} ${h} 0 ${h - hh * c} 0 ${hh} Z`;
      }
    },

    // 7. Hexagon
    hexagon: {
      id: 'hexagon',
      label: 'Hexagon',
      clip: (w, h, p = {}) => {
        const orientation = p.orientation || 'horizontal';
        if (orientation === 'horizontal') {
          return `polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)`;
        }
        return `polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)`;
      },
      inset: (w, h, p = {}) => {
        const orientation = p.orientation || 'horizontal';
        return orientation === 'horizontal'
          ? [0, Math.ceil(w * 0.25), 0, Math.ceil(w * 0.25)]
          : [Math.ceil(h * 0.25), 0, Math.ceil(h * 0.25), 0];
      },
      hit: (px, py, w, h, p = {}) => {
        if (px < 0 || px > w || py < 0 || py > h) return false;
        const orientation = p.orientation || 'horizontal';
        if (orientation === 'horizontal') {
          // 4 corner cut lines: y - 2*h/w * x cutoff
          const m = (h / 2) / (w * 0.25);
          if (px < w * 0.25) {
            const dy = Math.abs(py - h / 2);
            if (dy > m * px) return false;
          }
          if (px > w * 0.75) {
            const dy = Math.abs(py - h / 2);
            if (dy > m * (w - px)) return false;
          }
          return true;
        } else {
          const m = (w / 2) / (h * 0.25);
          if (py < h * 0.25) {
            const dx = Math.abs(px - w / 2);
            if (dx > m * py) return false;
          }
          if (py > h * 0.75) {
            const dx = Math.abs(px - w / 2);
            if (dx > m * (h - py)) return false;
          }
          return true;
        }
      },
      svgPath: (w, h, p = {}) => {
        const orientation = p.orientation || 'horizontal';
        return orientation === 'horizontal'
          ? `M ${w * 0.25} 0 L ${w * 0.75} 0 L ${w} ${h * 0.5} L ${w * 0.75} ${h} L ${w * 0.25} ${h} L 0 ${h * 0.5} Z`
          : `M ${w * 0.5} 0 L ${w} ${h * 0.25} L ${w} ${h * 0.75} L ${w * 0.5} ${h} L 0 ${h * 0.75} L 0 ${h * 0.25} Z`;
      }
    },

    // 8. Octagon
    octagon: {
      id: 'octagon',
      label: 'Octagon',
      clip: (w, h, p = {}) => {
        const cut = p.cut || Math.min(w, h) * 0.2;
        return `polygon(${cut}px 0px, ${w - cut}px 0px, ${w}px ${cut}px, ${w}px ${h - cut}px, ${w - cut}px ${h}px, ${cut}px ${h}px, 0px ${h - cut}px, 0px ${cut}px)`;
      },
      inset: (w, h, p = {}) => {
        const cut = Math.ceil(p.cut || Math.min(w, h) * 0.2);
        const pad = Math.ceil(cut * 0.5);
        return [pad, pad, pad, pad];
      },
      hit: (px, py, w, h, p = {}) => {
        if (px < 0 || px > w || py < 0 || py > h) return false;
        const cut = p.cut || Math.min(w, h) * 0.2;
        if (px + py < cut) return false; // top-left
        if (w - px + py < cut) return false; // top-right
        if (w - px + h - py < cut) return false; // bottom-right
        if (px + h - py < cut) return false; // bottom-left
        return true;
      },
      svgPath: (w, h, p = {}) => {
        const cut = p.cut || Math.min(w, h) * 0.2;
        return `M ${cut} 0 L ${w - cut} 0 L ${w} ${cut} L ${w} ${h - cut} L ${w - cut} ${h} L ${cut} ${h} L 0 ${h - cut} L 0 ${cut} Z`;
      }
    },

    // 9. Chamfer (per-corner 45-degree angle cuts)
    chamfer: {
      id: 'chamfer',
      label: 'Chamfer',
      clip: (w, h, p = {}) => {
        const c = p.chamfer !== undefined ? p.chamfer : 16;
        const [tl, tr, br, bl] = Array.isArray(c) ? c : [c, c, c, c];
        return `polygon(${tl}px 0px, ${w - tr}px 0px, ${w}px ${tr}px, ${w}px ${h - br}px, ${w - br}px ${h}px, ${bl}px ${h}px, 0px ${h - bl}px, 0px ${tl}px)`;
      },
      inset: (w, h, p = {}) => {
        const c = p.chamfer !== undefined ? p.chamfer : 16;
        const [tl, tr, br, bl] = Array.isArray(c) ? c : [c, c, c, c];
        return [Math.max(tl, tr), Math.max(tr, br), Math.max(br, bl), Math.max(bl, tl)].map(v => Math.ceil(v * 0.5));
      },
      hit: (px, py, w, h, p = {}) => {
        if (px < 0 || px > w || py < 0 || py > h) return false;
        const c = p.chamfer !== undefined ? p.chamfer : 16;
        const [tl, tr, br, bl] = Array.isArray(c) ? c : [c, c, c, c];
        if (px + py < tl) return false;
        if (w - px + py < tr) return false;
        if (w - px + h - py < br) return false;
        if (px + h - py < bl) return false;
        return true;
      },
      svgPath: (w, h, p = {}) => {
        const c = p.chamfer !== undefined ? p.chamfer : 16;
        const [tl, tr, br, bl] = Array.isArray(c) ? c : [c, c, c, c];
        return `M ${tl} 0 L ${w - tr} 0 L ${w} ${tr} L ${w} ${h - br} L ${w - br} ${h} L ${bl} ${h} L 0 ${h - bl} L 0 ${tl} Z`;
      }
    },

    // 10. Notch (HUD cybernetic corner cutout)
    notch: {
      id: 'notch',
      label: 'Notch HUD',
      clip: (w, h, p = {}) => {
        const nw = p.notchW || 24;
        const nh = p.notchH || 24;
        const corner = p.corner || 'tr'; // top-right notch default
        if (corner === 'tr') {
          return `polygon(0% 0%, ${w - nw}px 0%, ${w}px ${nh}px, 100% 100%, 0% 100%)`;
        }
        if (corner === 'tl') {
          return `polygon(0% ${nh}px, ${nw}px 0%, 100% 0%, 100% 100%, 0% 100%)`;
        }
        if (corner === 'br') {
          return `polygon(0% 0%, 100% 0%, 100% ${h - nh}px, ${w - nw}px 100%, 0% 100%)`;
        }
        return `polygon(0% 0%, 100% 0%, 100% 100%, ${nw}px 100%, 0% ${h - nh}px)`;
      },
      inset: (w, h, p = {}) => {
        const nw = p.notchW || 24;
        const nh = p.notchH || 24;
        const corner = p.corner || 'tr';
        if (corner === 'tr') return [Math.ceil(nh * 0.7), Math.ceil(nw * 0.7), 0, 0];
        if (corner === 'tl') return [Math.ceil(nh * 0.7), 0, 0, Math.ceil(nw * 0.7)];
        if (corner === 'br') return [0, Math.ceil(nw * 0.7), Math.ceil(nh * 0.7), 0];
        return [0, 0, Math.ceil(nh * 0.7), Math.ceil(nw * 0.7)];
      },
      hit: (px, py, w, h, p = {}) => {
        if (px < 0 || px > w || py < 0 || py > h) return false;
        const nw = p.notchW || 24;
        const nh = p.notchH || 24;
        const corner = p.corner || 'tr';
        if (corner === 'tr' && px > w - nw && py < nh) {
          return (py / nh) >= ((px - (w - nw)) / nw);
        }
        if (corner === 'tl' && px < nw && py < nh) {
          return (py / nh) >= (1 - px / nw);
        }
        if (corner === 'br' && px > w - nw && py > h - nh) {
          return ((h - py) / nh) >= ((px - (w - nw)) / nw);
        }
        if (corner === 'bl' && px < nw && py > h - nh) {
          return ((h - py) / nh) >= (1 - px / nw);
        }
        return true;
      },
      svgPath: (w, h, p = {}) => {
        const nw = p.notchW || 24;
        const nh = p.notchH || 24;
        const corner = p.corner || 'tr';
        if (corner === 'tr') {
          return `M 0 0 L ${w - nw} 0 L ${w} ${nh} L ${w} ${h} L 0 ${h} Z`;
        }
        if (corner === 'tl') {
          return `M 0 ${nh} L ${nw} 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`;
        }
        if (corner === 'br') {
          return `M 0 0 L ${w} 0 L ${w} ${h - nh} L ${w - nw} ${h} L 0 ${h} Z`;
        }
        return `M 0 0 L ${w} 0 L ${w} ${h} L ${nw} ${h} L 0 ${h - nh} Z`;
      }
    },

    // 11. Ticket (side semicircle bites)
    ticket: {
      id: 'ticket',
      label: 'Ticket',
      clip: (w, h, p = {}) => {
        const r = p.biteRadius || 14;
        const cy = h / 2;
        // Inward arcs on left and right borders
        return `path('M 0 0 L ${w} 0 L ${w} ${cy - r} A ${r} ${r} 0 0 0 ${w} ${cy + r} L ${w} ${h} L 0 ${h} L 0 ${cy + r} A ${r} ${r} 0 0 0 0 ${cy - r} Z')`;
      },
      inset: (w, h, p = {}) => {
        const r = Math.ceil(p.biteRadius || 14);
        return [4, r + 4, 4, r + 4];
      },
      hit: (px, py, w, h, p = {}) => {
        if (px < 0 || px > w || py < 0 || py > h) return false;
        const r = p.biteRadius || 14;
        const cy = h / 2;
        // Left bite
        if (px < r && (px - 0) ** 2 + (py - cy) ** 2 < r ** 2) return false;
        // Right bite
        if (px > w - r && (px - w) ** 2 + (py - cy) ** 2 < r ** 2) return false;
        return true;
      },
      svgPath: (w, h, p = {}) => {
        const r = p.biteRadius || 14;
        const cy = h / 2;
        return `M 0 0 L ${w} 0 L ${w} ${cy - r} A ${r} ${r} 0 0 0 ${w} ${cy + r} L ${w} ${h} L 0 ${h} L 0 ${cy + r} A ${r} ${r} 0 0 0 0 ${cy - r} Z`;
      }
    },

    // 12. Tab (Browser / File Folder Tab Shape)
    tab: {
      id: 'tab',
      label: 'Folder Tab',
      clip: (w, h, p = {}) => {
        const tabW = Math.min(w * 0.6, 120);
        const tabH = Math.min(h * 0.25, 28);
        return `polygon(0% ${tabH}px, 0% 0%, ${tabW - 12}px 0%, ${tabW}px ${tabH}px, 100% ${tabH}px, 100% 100%, 0% 100%)`;
      },
      inset: (w, h, p = {}) => {
        const tabH = Math.ceil(Math.min(h * 0.25, 28));
        return [tabH + 6, 8, 8, 8];
      },
      hit: (px, py, w, h, p = {}) => {
        if (px < 0 || px > w || py < 0 || py > h) return false;
        const tabW = Math.min(w * 0.6, 120);
        const tabH = Math.min(h * 0.25, 28);
        if (py < tabH) {
          if (px > tabW) return false;
          if (px > tabW - 12) {
            const ratio = (px - (tabW - 12)) / 12;
            if (py / tabH < ratio) return false;
          }
        }
        return true;
      },
      svgPath: (w, h, p = {}) => {
        const tabW = Math.min(w * 0.6, 120);
        const tabH = Math.min(h * 0.25, 28);
        return `M 0 ${tabH} L 0 0 L ${tabW - 12} 0 L ${tabW} ${tabH} L ${w} ${tabH} L ${w} ${h} L 0 ${h} Z`;
      }
    },

    // 13. Parallelogram
    parallelogram: {
      id: 'parallelogram',
      label: 'Parallelogram',
      clip: (w, h, p = {}) => {
        const slant = p.slant || Math.min(w * 0.15, 30);
        return `polygon(${slant}px 0%, 100% 0%, ${w - slant}px 100%, 0% 100%)`;
      },
      inset: (w, h, p = {}) => {
        const slant = Math.ceil(p.slant || Math.min(w * 0.15, 30));
        return [0, slant, 0, slant];
      },
      hit: (px, py, w, h, p = {}) => {
        if (px < 0 || px > w || py < 0 || py > h) return false;
        const slant = p.slant || Math.min(w * 0.15, 30);
        const shift = slant * (1 - py / h);
        return px >= shift && px <= w - slant + shift;
      },
      svgPath: (w, h, p = {}) => {
        const slant = p.slant || Math.min(w * 0.15, 30);
        return `M ${slant} 0 L ${w} 0 L ${w - slant} ${h} L 0 ${h} Z`;
      }
    },

    // 14. Arrow / Chevron
    arrow: {
      id: 'arrow',
      label: 'Chevron Arrow',
      clip: (w, h, p = {}) => {
        const head = p.head || Math.min(w * 0.15, 32);
        return `polygon(0% 0%, ${w - head}px 0%, 100% 50%, ${w - head}px 100%, 0% 100%, ${head}px 50%)`;
      },
      inset: (w, h, p = {}) => {
        const head = Math.ceil(p.head || Math.min(w * 0.15, 32));
        return [4, head + 4, 4, head + 4];
      },
      hit: (px, py, w, h, p = {}) => {
        if (px < 0 || px > w || py < 0 || py > h) return false;
        const head = p.head || Math.min(w * 0.15, 32);
        const dy = Math.abs(py - h / 2) / (h / 2);
        // Left indentation
        if (px < head * (1 - dy)) return false;
        // Right tip
        if (px > w - head + head * dy) return false;
        return true;
      },
      svgPath: (w, h, p = {}) => {
        const head = p.head || Math.min(w * 0.15, 32);
        return `M 0 0 L ${w - head} 0 L ${w} ${h / 2} L ${w - head} ${h} L 0 ${h} L ${head} ${h / 2} Z`;
      }
    },

    // 15. Smooth Blob
    blob: {
      id: 'blob',
      label: 'Organic Blob',
      clip: (w, h) => {
        const rx = w / 2;
        const ry = h / 2;
        return `path('M ${w * 0.2} ${h * 0.1} C ${w * 0.6} 0 ${w * 0.9} ${h * 0.2} ${w} ${h * 0.5} C ${w} ${h * 0.8} ${w * 0.8} ${h} ${w * 0.4} ${h} C ${w * 0.1} ${h} 0 ${h * 0.8} 0 ${h * 0.4} C 0 ${h * 0.1} ${w * 0.05} ${h * 0.15} ${w * 0.2} ${h * 0.1} Z')`;
      },
      inset: (w, h) => [Math.ceil(h * 0.15), Math.ceil(w * 0.15), Math.ceil(h * 0.15), Math.ceil(w * 0.15)],
      hit: (px, py, w, h) => {
        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(w, h) * 0.42;
        return (px - cx) ** 2 + (py - cy) ** 2 <= r ** 2;
      },
      svgPath: (w, h) => {
        return `M ${w * 0.2} ${h * 0.1} C ${w * 0.6} 0 ${w * 0.9} ${h * 0.2} ${w} ${h * 0.5} C ${w} ${h * 0.8} ${w * 0.8} ${h} ${w * 0.4} ${h} C ${w * 0.1} ${h} 0 ${h * 0.8} 0 ${h * 0.4} C 0 ${h * 0.1} ${w * 0.05} ${h * 0.15} ${w * 0.2} ${h * 0.1} Z`;
      }
    }
  };

  function getShape(id) {
    return SHAPES[id] || SHAPES.rect;
  }

  function getClipPath(id, w, h, params) {
    const shape = getShape(id);
    const key = `${id}_${Math.round(w)}_${Math.round(h)}_${JSON.stringify(params || {})}`;
    return cacheGetOrSet(key, () => shape.clip(w, h, params));
  }

  function getContentSafeArea(id, w, h, params) {
    const shape = getShape(id);
    return shape.inset(w, h, params);
  }

  function hitTestShape(id, px, py, w, h, params) {
    const shape = getShape(id);
    return shape.hit(px, py, w, h, params);
  }

  function getSvgBorderPath(id, w, h, params) {
    const shape = getShape(id);
    return shape.svgPath(w, h, params);
  }

  function listShapes() {
    return Object.values(SHAPES).map(s => ({ id: s.id, label: s.label }));
  }

  return {
    SHAPES,
    getShape,
    getClipPath,
    getContentSafeArea,
    hitTestShape,
    getSvgBorderPath,
    listShapes
  };
});
