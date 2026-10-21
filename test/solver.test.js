const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  resolveProfile,
  solveItemConstraints,
  solveStageLayout,
  solveMode,
  DEFAULT_PROFILES
} = require('../public/js/stage/solver');

describe('Constraint Solver & Profile Matcher', () => {
  const S_1080 = { w: 1920, h: 1080 };
  const R_1080 = { w: 1920, h: 1080 };
  const S_WIDE = { w: 2560, h: 1440 }; // dx = 640, dy = 360

  describe('Horizontal Constraints', () => {
    test('hc: "left" keeps original x and width', () => {
      const item = { x: 50, y: 50, w: 200, h: 100, hc: 'left', vc: 'top' };
      const solved = solveItemConstraints(item, S_WIDE, R_1080);
      assert.strictEqual(solved.x, 50);
      assert.strictEqual(solved.w, 200);
    });

    test('hc: "right" offsets x by dx while preserving width', () => {
      const item = { x: 1600, y: 50, w: 200, h: 100, hc: 'right', vc: 'top' };
      const solved = solveItemConstraints(item, S_WIDE, R_1080);
      assert.strictEqual(solved.x, 1600 + 640);
      assert.strictEqual(solved.w, 200);
    });

    test('hc: "center" offsets x by dx/2 while preserving width', () => {
      const item = { x: 860, y: 50, w: 200, h: 100, hc: 'center', vc: 'top' };
      const solved = solveItemConstraints(item, S_WIDE, R_1080);
      assert.strictEqual(solved.x, 860 + 320);
      assert.strictEqual(solved.w, 200);
    });

    test('hc: "stretch" expands width by dx while keeping x anchored', () => {
      const item = { x: 40, y: 50, w: 1840, h: 100, hc: 'stretch', vc: 'top' };
      const solved = solveItemConstraints(item, S_WIDE, R_1080);
      assert.strictEqual(solved.x, 40);
      assert.strictEqual(solved.w, 1840 + 640);
    });

    test('hc: "scale" proportionally scales x and width by Sw / Rw', () => {
      const item = { x: 100, y: 50, w: 200, h: 100, hc: 'scale', vc: 'top' };
      const ratio = 2560 / 1920;
      const solved = solveItemConstraints(item, S_WIDE, R_1080);
      assert.strictEqual(solved.x, Math.round(100 * ratio * 10) / 10);
      assert.strictEqual(solved.w, Math.round(200 * ratio * 10) / 10);
    });
  });

  describe('Vertical Constraints', () => {
    test('vc: "top" keeps original y and height', () => {
      const item = { x: 50, y: 60, w: 200, h: 150, hc: 'left', vc: 'top' };
      const solved = solveItemConstraints(item, S_WIDE, R_1080);
      assert.strictEqual(solved.y, 60);
      assert.strictEqual(solved.h, 150);
    });

    test('vc: "bottom" offsets y by dy while preserving height', () => {
      const item = { x: 50, y: 800, w: 200, h: 150, hc: 'left', vc: 'bottom' };
      const solved = solveItemConstraints(item, S_WIDE, R_1080);
      assert.strictEqual(solved.y, 800 + 360);
      assert.strictEqual(solved.h, 150);
    });

    test('vc: "center" offsets y by dy/2 while preserving height', () => {
      const item = { x: 50, y: 440, w: 200, h: 200, hc: 'left', vc: 'center' };
      const solved = solveItemConstraints(item, S_WIDE, R_1080);
      assert.strictEqual(solved.y, 440 + 180);
      assert.strictEqual(solved.h, 200);
    });

    test('vc: "stretch" expands height by dy while keeping y anchored', () => {
      const item = { x: 50, y: 40, w: 200, h: 1000, hc: 'left', vc: 'stretch' };
      const solved = solveItemConstraints(item, S_WIDE, R_1080);
      assert.strictEqual(solved.y, 40);
      assert.strictEqual(solved.h, 1000 + 360);
    });

    test('vc: "scale" proportionally scales y and height by Sh / Rh', () => {
      const item = { x: 50, y: 100, w: 200, h: 200, hc: 'left', vc: 'scale' };
      const ratio = 1440 / 1080;
      const solved = solveItemConstraints(item, S_WIDE, R_1080);
      assert.strictEqual(solved.y, Math.round(100 * ratio * 10) / 10);
      assert.strictEqual(solved.h, Math.round(200 * ratio * 10) / 10);
    });
  });

  describe('Clamping & Re-anchoring', () => {
    test('clamps width to max_w and preserves right anchoring', () => {
      const item = { x: 1000, y: 50, w: 500, h: 100, hc: 'right', vc: 'top', max_w: 400 };
      const solved = solveItemConstraints(item, S_WIDE, R_1080);
      assert.strictEqual(solved.w, 400);
      // Right edge in unconstrained was: (1000 + 640) + 500 = 2140
      // Right edge with clamped 400: x + 400 = 2140 -> x = 1740
      assert.strictEqual(solved.x, 1740);
    });

    test('clamps width to min_w when stage shrinks', () => {
      const S_SMALL = { w: 1280, h: 720 };
      const item = { x: 40, y: 40, w: 600, h: 100, hc: 'stretch', vc: 'top', min_w: 450 };
      const solved = solveItemConstraints(item, S_SMALL, R_1080);
      assert.strictEqual(solved.w, 450);
    });

    test('clamps height to max_h and preserves bottom anchoring', () => {
      const item = { x: 40, y: 800, w: 200, h: 200, hc: 'left', vc: 'bottom', max_h: 150 };
      const solved = solveItemConstraints(item, S_WIDE, R_1080);
      assert.strictEqual(solved.h, 150);
      // Bottom edge was: (800 + 360) + 200 = 1360. Clamped h=150 -> y = 1360 - 150 = 1210
      assert.strictEqual(solved.y, 1210);
    });

    test('clamps center constraint and preserves center line', () => {
      const item = { x: 800, y: 40, w: 320, h: 100, hc: 'center', vc: 'top', max_w: 200 };
      const solved = solveItemConstraints(item, S_WIDE, R_1080);
      assert.strictEqual(solved.w, 200);
      // Unclamped center: (800 + 320) + 320/2 = 1280
      // Clamped center: solved.x + 200/2 = 1280 -> solved.x = 1180
      assert.strictEqual(solved.x, 1180);
    });
  });

  describe('RTL Mirroring', () => {
    test('mirrors left to right when mirrorLayoutInRtl is true', () => {
      const item = { x: 100, y: 50, w: 200, h: 100, hc: 'left', vc: 'top' };
      const solved = solveItemConstraints(item, S_WIDE, R_1080, { isRtl: true, mirrorLayoutInRtl: true });
      assert.strictEqual(solved.x, 100 + 640);
    });

    test('preserves physical left when mirrorLayoutInRtl is false in RTL', () => {
      const item = { x: 100, y: 50, w: 200, h: 100, hc: 'left', vc: 'top' };
      const solved = solveItemConstraints(item, S_WIDE, R_1080, { isRtl: true, mirrorLayoutInRtl: false });
      assert.strictEqual(solved.x, 100);
    });
  });

  describe('Nested Island & Child Constraint Resolution', () => {
    test('solves child coordinates relative to parent island rect', () => {
      const items = [
        { id: 'isl_1', kind: 'island', title: 'Island 1' },
        { id: 'srv_1', kind: 'service', title: 'Child Service' }
      ];
      const layout = {
        profiles: DEFAULT_PROFILES,
        placement: {
          isl_1: { lg: { x: 100, y: 100, w: 600, h: 400, hc: 'left', vc: 'top' } },
          srv_1: { lg: { x: 20, y: 30, w: 140, h: 80, hc: 'left', vc: 'top', parent: 'isl_1' } }
        }
      };

      const solved = solveStageLayout(items, layout, S_1080, 'lg');
      const islRect = solved.rects.find(r => r.id === 'isl_1');
      const srvRect = solved.rects.find(r => r.id === 'srv_1');

      assert.strictEqual(islRect.x, 100);
      assert.strictEqual(islRect.y, 100);
      assert.strictEqual(srvRect.x, 100 + 20);
      assert.strictEqual(srvRect.y, 100 + 30);
      assert.strictEqual(srvRect.parent, 'isl_1');
    });

    test('stretches child item when parent island expands', () => {
      const items = [
        { id: 'isl_1', kind: 'island' },
        { id: 'srv_1', kind: 'service' }
      ];
      const layout = {
        profiles: DEFAULT_PROFILES,
        placement: {
          isl_1: { lg: { x: 100, y: 100, w: 600, h: 400, hc: 'stretch', vc: 'top' } },
          srv_1: { lg: { x: 20, y: 20, w: 560, h: 60, hc: 'stretch', vc: 'top', parent: 'isl_1' } }
        }
      };

      // In S_WIDE (dx = 640): isl_1 expands by 640 -> w = 1240
      const solved = solveStageLayout(items, layout, S_WIDE, 'lg');
      const islRect = solved.rects.find(r => r.id === 'isl_1');
      const srvRect = solved.rects.find(r => r.id === 'srv_1');

      assert.strictEqual(islRect.w, 1240);
      assert.strictEqual(srvRect.w, 560 + 640);
    });

    test('caps recursive child nesting at depth 6', () => {
      const items = [];
      const placement = {};
      for (let i = 0; i < 9; i++) {
        items.push({ id: `item_${i}`, kind: 'island' });
        placement[`item_${i}`] = {
          lg: { x: 10, y: 10, w: 100, h: 100, parent: i === 0 ? null : `item_${i - 1}` }
        };
      }
      const layout = { profiles: DEFAULT_PROFILES, placement };
      const solved = solveStageLayout(items, layout, S_1080, 'lg');
      const deepItem = solved.rects.find(r => r.id === 'item_8');
      assert.strictEqual(deepItem, undefined); // Capped at depth 6
    });

    test('inherits placement from parent profile when inherit is set', () => {
      const profiles = [
        { id: 'lg', match: { min_w: 1500 }, design: [1920, 1080] },
        { id: 'xl', match: { min_w: 2400 }, inherit: 'lg', design: [3440, 1440] }
      ];
      const items = [{ id: 'it_1', kind: 'island' }];
      const layout = {
        profiles,
        placement: {
          it_1: { lg: { x: 120, y: 80, w: 300, h: 200, hc: 'left', vc: 'top' } }
        }
      };

      const solved = solveStageLayout(items, layout, { w: 3440, h: 1440 }, 'xl');
      const rect = solved.rects.find(r => r.id === 'it_1');
      assert.strictEqual(rect.x, 120);
      assert.strictEqual(rect.w, 300);
    });
  });

  describe('Profile Resolver with Hysteresis', () => {
    test('resolves xs profile for viewport width <= 480 wu', () => {
      const p = resolveProfile(390, 844);
      assert.strictEqual(p.id, 'xs');
    });

    test('resolves sm profile for viewport width 768 wu', () => {
      const p = resolveProfile(768, 1024);
      assert.strictEqual(p.id, 'sm');
    });

    test('resolves md profile for viewport width 1280 wu', () => {
      const p = resolveProfile(1280, 800);
      assert.strictEqual(p.id, 'md');
    });

    test('resolves lg profile for viewport width 1920 wu', () => {
      const p = resolveProfile(1920, 1080);
      assert.strictEqual(p.id, 'lg');
    });

    test('resolves xl profile for viewport width >= 2401 wu', () => {
      const p = resolveProfile(2560, 1440);
      assert.strictEqual(p.id, 'xl');
    });

    test('resolves wall profile when displayClass is "wall"', () => {
      const p = resolveProfile(1920, 1080, { displayClass: 'wall' });
      assert.strictEqual(p.id, 'wall');
      assert.strictEqual(p.ui, 'tenfoot');
    });

    test('hysteresis prevents boundary flapping between md and lg', () => {
      // lg min_w is 1501. If current is lg, min_w expands down by 3% (1501 * 0.97 = ~1455)
      const withoutHysteresis = resolveProfile(1480, 900, { currentProfileId: null });
      assert.strictEqual(withoutHysteresis.id, 'md');

      const withHysteresis = resolveProfile(1480, 900, { currentProfileId: 'lg', hysteresis: 0.03 });
      assert.strictEqual(withHysteresis.id, 'lg');
    });

    test('query parameter override explicitly forces selected profile', () => {
      const p = resolveProfile(1920, 1080, { overrideProfile: 'xs' });
      assert.strictEqual(p.id, 'xs');
    });
  });

  describe('View Modes (fit, flow, canvas)', () => {
    test('fit mode applies uniform shrink-to-fit when content exceeds viewport', () => {
      const rects = [
        { id: 'a', x: 0, y: 0, w: 1500, h: 800 },
        { id: 'b', x: 1400, y: 0, w: 1000, h: 800 } // Total width = 2400 > 1920
      ];
      const res = solveMode('fit', rects, S_1080);
      assert.strictEqual(res.mode, 'fit');
      assert.strictEqual(res.scale, Number((1920 / 2400).toFixed(4)));
      assert.strictEqual(res.feasible, true);
    });

    test('fit mode marks infeasible if shrink required exceeds minScale 0.8', () => {
      const rects = [
        { id: 'a', x: 0, y: 0, w: 4000, h: 800 } // Scale = 1920 / 4000 = 0.48 < 0.8
      ];
      const res = solveMode('fit', rects, S_1080, { minScale: 0.8 });
      assert.strictEqual(res.feasible, false);
      assert.strictEqual(res.scale, 0.8);
    });

    test('flow mode stacks islands into full-width vertical blocks', () => {
      const rects = [
        { id: 'a', x: 40, y: 40, w: 400, h: 200, order: 2 },
        { id: 'b', x: 40, y: 300, w: 400, h: 150, order: 1 }
      ];
      const res = solveMode('flow', rects, { w: 400, h: 800 });
      assert.strictEqual(res.mode, 'flow');
      assert.strictEqual(res.rects[0].id, 'b'); // order 1 comes first
      assert.strictEqual(res.rects[1].id, 'a');
      assert.strictEqual(res.rects[0].w, 400 - 40); // Full width minus padding
      assert(res.contentHeight > 350);
    });

    test('canvas mode returns unity scale and unchanged rects', () => {
      const rects = [{ id: 'a', x: 50, y: 50, w: 100, h: 100 }];
      const res = solveMode('canvas', rects, S_1080);
      assert.strictEqual(res.mode, 'canvas');
      assert.strictEqual(res.scale, 1.0);
    });
  });
});
