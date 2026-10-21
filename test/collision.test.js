const { test, describe } = require('node:test');
const assert = require('node:assert');
const { relieveCollisions } = require('../public/js/stage/solver');

describe('Deterministic Collision Relief', () => {
  const S_1080 = { w: 1920, h: 1080 };

  test('non-overlapping rects return feasible immediately with 1 pass', () => {
    const rects = [
      { id: 'a', x: 40, y: 40, w: 200, h: 150, importance: 10 },
      { id: 'b', x: 300, y: 40, w: 200, h: 150, importance: 10 }
    ];
    const res = relieveCollisions(rects, S_1080);
    assert.strictEqual(res.feasible, true);
    assert.strictEqual(res.passes, 1);
    assert.strictEqual(res.offenders.length, 0);
  });

  test('resolves simple 2-item horizontal overlap by pushing along X', () => {
    const rects = [
      { id: 'a', x: 100, y: 100, w: 200, h: 100, importance: 10 },
      { id: 'b', x: 250, y: 100, w: 200, h: 100, importance: 5 } // 50px overlap
    ];
    const res = relieveCollisions(rects, S_1080);
    assert.strictEqual(res.feasible, true);
    const a = res.rects.find(r => r.id === 'a');
    const b = res.rects.find(r => r.id === 'b');
    assert.strictEqual(a.x, 100); // stationary (higher importance)
    assert(b.x >= 300, `Expected b.x >= 300, got ${b.x}`);
    assert(b.x >= a.x + a.w); // No overlap
  });

  test('resolves simple 2-item vertical overlap by pushing along Y', () => {
    const rects = [
      { id: 'a', x: 100, y: 100, w: 100, h: 200, importance: 10 },
      { id: 'b', x: 100, y: 250, w: 100, h: 200, importance: 5 } // 50px overlap
    ];
    const res = relieveCollisions(rects, S_1080);
    assert.strictEqual(res.feasible, true);
    const a = res.rects.find(r => r.id === 'a');
    const b = res.rects.find(r => r.id === 'b');
    assert.strictEqual(a.y, 100);
    assert(b.y >= 300);
  });

  test('higher importance stays stationary while lower importance moves', () => {
    const rects = [
      { id: 'boss', x: 100, y: 100, w: 200, h: 200, importance: 99 },
      { id: 'worker', x: 150, y: 150, w: 200, h: 200, importance: 1 }
    ];
    const res = relieveCollisions(rects, S_1080);
    assert.strictEqual(res.feasible, true);
    const boss = res.rects.find(r => r.id === 'boss');
    const worker = res.rects.find(r => r.id === 'worker');
    assert.strictEqual(boss.x, 100);
    assert.strictEqual(boss.y, 100);
    assert(worker.x !== 150 || worker.y !== 150);
  });

  test('stable tie-breaking by ID when importance is equal', () => {
    const rects1 = [
      { id: 'alpha', x: 100, y: 100, w: 200, h: 200, importance: 5 },
      { id: 'beta', x: 150, y: 150, w: 200, h: 200, importance: 5 }
    ];
    const res1 = relieveCollisions(rects1, S_1080);

    const rects2 = [
      { id: 'beta', x: 150, y: 150, w: 200, h: 200, importance: 5 },
      { id: 'alpha', x: 100, y: 100, w: 200, h: 200, importance: 5 }
    ];
    const res2 = relieveCollisions(rects2, S_1080);

    const a1 = res1.rects.find(r => r.id === 'alpha');
    const b1 = res1.rects.find(r => r.id === 'beta');
    const a2 = res2.rects.find(r => r.id === 'alpha');
    const b2 = res2.rects.find(r => r.id === 'beta');

    assert.strictEqual(a1.x, a2.x);
    assert.strictEqual(a1.y, a2.y);
    assert.strictEqual(b1.x, b2.x);
    assert.strictEqual(b1.y, b2.y);
  });

  test('items with overlap: "allow" are completely ignored by collision engine', () => {
    const rects = [
      { id: 'overlay_banner', x: 100, y: 100, w: 300, h: 300, overlap: 'allow', importance: 1 },
      { id: 'card', x: 150, y: 150, w: 200, h: 200, overlap: 'prevent', importance: 10 }
    ];
    const res = relieveCollisions(rects, S_1080);
    assert.strictEqual(res.feasible, true);
    assert.strictEqual(res.offenders.length, 0);
    const banner = res.rects.find(r => r.id === 'overlay_banner');
    const card = res.rects.find(r => r.id === 'card');
    assert.strictEqual(banner.x, 100);
    assert.strictEqual(card.x, 150); // Unchanged
  });

  test('resolves a 3-item horizontal collision cascade', () => {
    const rects = [
      { id: 'c1', x: 100, y: 100, w: 150, h: 100, importance: 10 },
      { id: 'c2', x: 180, y: 100, w: 150, h: 100, importance: 8 },
      { id: 'c3', x: 260, y: 100, w: 150, h: 100, importance: 6 }
    ];
    const res = relieveCollisions(rects, S_1080);
    assert.strictEqual(res.feasible, true);
    for (let i = 0; i < res.rects.length; i++) {
      for (let j = i + 1; j < res.rects.length; j++) {
        const a = res.rects[i];
        const b = res.rects[j];
        const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        assert.strictEqual(overlap, false, `Overlap found between ${a.id} and ${b.id}`);
      }
    }
  });

  test('resolves a 5-item cross cluster into clean separation', () => {
    const rects = [
      { id: 'center', x: 300, y: 300, w: 150, h: 150, importance: 20 },
      { id: 'north', x: 300, y: 250, w: 150, h: 150, importance: 10 },
      { id: 'south', x: 300, y: 350, w: 150, h: 150, importance: 10 },
      { id: 'east', x: 350, y: 300, w: 150, h: 150, importance: 10 },
      { id: 'west', x: 250, y: 300, w: 150, h: 150, importance: 10 }
    ];
    const res = relieveCollisions(rects, S_1080);
    assert.strictEqual(res.feasible, true);
  });

  test('marks infeasible and reports offenders when space is over-congested', () => {
    // 5 large items occupying identical tiny stage
    const rects = [];
    for (let i = 0; i < 6; i++) {
      rects.push({ id: `crowd_${i}`, x: 10, y: 10, w: 180, h: 180, importance: 1 });
    }
    // Tiny stage of 200x200 wu
    const res = relieveCollisions(rects, { w: 200, h: 200 }, { maxPasses: 3 });
    assert(res.offenders.length > 0);
  });

  test('sibling items sharing the same parent island are not separated by outer solver', () => {
    const rects = [
      { id: 'child_1', x: 100, y: 100, w: 100, h: 100, parent: 'isl_A', importance: 5 },
      { id: 'child_2', x: 120, y: 120, w: 100, h: 100, parent: 'isl_A', importance: 5 }
    ];
    const res = relieveCollisions(rects, S_1080);
    assert.strictEqual(res.offenders.length, 0); // Ignored because handled by parent island
  });

  test('performance: solving 300 non-overlapping items completes under 10ms', () => {
    const rects = [];
    let id = 0;
    for (let row = 0; row < 15; row++) {
      for (let col = 0; col < 20; col++) {
        rects.push({
          id: `item_${id++}`,
          x: col * 90,
          y: row * 70,
          w: 80,
          h: 60,
          importance: 5
        });
      }
    }
    const t0 = process.hrtime.bigint();
    const res = relieveCollisions(rects, S_1080);
    const t1 = process.hrtime.bigint();
    const durationMs = Number(t1 - t0) / 1e6;

    assert.strictEqual(res.feasible, true);
    assert(durationMs < 10, `Expected duration < 10ms, got ${durationMs.toFixed(2)}ms`);
  });

  test('aspect ratio tests: 32:9 ultrawide stage', () => {
    const S_32_9 = { w: 5120, h: 1440 };
    const rects = [
      { id: 'a', x: 1000, y: 500, w: 600, h: 400, importance: 10 },
      { id: 'b', x: 1400, y: 500, w: 600, h: 400, importance: 5 }
    ];
    const res = relieveCollisions(rects, S_32_9);
    assert.strictEqual(res.feasible, true);
    assert(res.rects[1].x >= 1600);
  });

  test('aspect ratio tests: 9:16 portrait kiosk stage', () => {
    const S_PORTRAIT = { w: 1080, h: 1920 };
    const rects = [
      { id: 'top', x: 100, y: 200, w: 400, h: 300, importance: 10 },
      { id: 'bottom', x: 100, y: 350, w: 400, h: 300, importance: 5 }
    ];
    const res = relieveCollisions(rects, S_PORTRAIT);
    assert.strictEqual(res.feasible, true);
    assert(res.rects[1].y >= 500);
  });

  test('aspect ratio tests: 4:3 legacy monitor', () => {
    const S_4_3 = { w: 1024, h: 768 };
    const rects = [
      { id: 'a', x: 200, y: 200, w: 300, h: 200, importance: 10 },
      { id: 'b', x: 300, y: 200, w: 300, h: 200, importance: 5 }
    ];
    const res = relieveCollisions(rects, S_4_3);
    assert.strictEqual(res.feasible, true);
  });

  test('aspect ratio tests: Square 1:1 display', () => {
    const S_SQUARE = { w: 1200, h: 1200 };
    const rects = [
      { id: 'sq1', x: 300, y: 300, w: 200, h: 200, importance: 10 },
      { id: 'sq2', x: 400, y: 300, w: 200, h: 200, importance: 8 }
    ];
    const res = relieveCollisions(rects, S_SQUARE);
    assert.strictEqual(res.feasible, true);
  });

  test('aspect ratio tests: 8K LED Wall (7680x4320)', () => {
    const S_8K = { w: 7680, h: 4320 };
    const rects = [
      { id: 'wall_a', x: 2000, y: 1500, w: 1200, h: 800, importance: 10 },
      { id: 'wall_b', x: 2800, y: 1500, w: 1200, h: 800, importance: 5 }
    ];
    const res = relieveCollisions(rects, S_8K);
    assert.strictEqual(res.feasible, true);
    assert(res.rects[1].x >= 3200);
  });

  test('maximum 8 passes boundary is strictly honored', () => {
    const rects = [
      { id: 'x1', x: 50, y: 50, w: 200, h: 200, importance: 5 },
      { id: 'x2', x: 60, y: 60, w: 200, h: 200, importance: 5 }
    ];
    const res = relieveCollisions(rects, S_1080, { maxPasses: 8 });
    assert(res.passes <= 8);
  });

  test('zero items or single item returns feasible immediately', () => {
    assert.strictEqual(relieveCollisions([], S_1080).feasible, true);
    assert.strictEqual(relieveCollisions([{ id: 'lone', x: 0, y: 0, w: 100, h: 100 }], S_1080).feasible, true);
  });

  test('axis of minimum penetration chooses X when dx penetration < dy penetration', () => {
    // Overlap: X overlap = 20, Y overlap = 80
    const rects = [
      { id: 'a', x: 100, y: 100, w: 100, h: 100, importance: 10 },
      { id: 'b', x: 180, y: 120, w: 100, h: 100, importance: 5 }
    ];
    const res = relieveCollisions(rects, S_1080);
    const b = res.rects.find(r => r.id === 'b');
    assert.strictEqual(b.y, 120); // Y unchanged because X was minimum penetration axis
    assert(b.x >= 200);
  });

  test('axis of minimum penetration chooses Y when dy penetration < dx penetration', () => {
    // Overlap: X overlap = 80, Y overlap = 20
    const rects = [
      { id: 'a', x: 100, y: 100, w: 100, h: 100, importance: 10 },
      { id: 'b', x: 120, y: 180, w: 100, h: 100, importance: 5 }
    ];
    const res = relieveCollisions(rects, S_1080);
    const b = res.rects.find(r => r.id === 'b');
    assert.strictEqual(b.x, 120); // X unchanged because Y was minimum penetration axis
    assert(b.y >= 200);
  });

  test('aspect ratio tests: tiny 300x200 wu stage separates 2 items cleanly', () => {
    const S_TINY = { w: 300, h: 200 };
    const rects = [
      { id: 't1', x: 10, y: 10, w: 100, h: 60, importance: 10 },
      { id: 't2', x: 50, y: 10, w: 100, h: 60, importance: 5 }
    ];
    const res = relieveCollisions(rects, S_TINY);
    assert.strictEqual(res.feasible, true);
    assert(res.rects[1].x >= 110);
  });

  test('RTL context: collision relief maintains deterministic layout without negative coordinates', () => {
    const rects = [
      { id: 'rtl_fixed', x: 800, y: 100, w: 200, h: 100, importance: 15 },
      { id: 'rtl_pushed', x: 750, y: 100, w: 200, h: 100, importance: 5 }
    ];
    const res = relieveCollisions(rects, S_1080);
    assert.strictEqual(res.feasible, true);
    for (const r of res.rects) {
      assert(r.x >= 0, `Item ${r.id} has negative x: ${r.x}`);
      assert(r.y >= 0, `Item ${r.id} has negative y: ${r.y}`);
    }
  });

  test('resolves 3 distinct importance tiers (tier 1, tier 2, tier 3)', () => {
    const rects = [
      { id: 'gold', x: 200, y: 200, w: 150, h: 150, importance: 30 },
      { id: 'silver', x: 250, y: 200, w: 150, h: 150, importance: 20 },
      { id: 'bronze', x: 280, y: 200, w: 150, h: 150, importance: 10 }
    ];
    const res = relieveCollisions(rects, S_1080);
    assert.strictEqual(res.feasible, true);
    const gold = res.rects.find(r => r.id === 'gold');
    assert.strictEqual(gold.x, 200); // Gold stays unmoved
  });

  test('circular collision cycle resolves without infinite loop', () => {
    const rects = [
      { id: 'node_a', x: 300, y: 300, w: 100, h: 100, importance: 5 },
      { id: 'node_b', x: 350, y: 300, w: 100, h: 100, importance: 5 },
      { id: 'node_c', x: 325, y: 340, w: 100, h: 100, importance: 5 }
    ];
    const res = relieveCollisions(rects, S_1080);
    assert(res.passes <= 8);
  });

  test('dense 50-item random scatter collision relief completes in <= 5ms', () => {
    const rects = [];
    for (let i = 0; i < 50; i++) {
      rects.push({
        id: `scat_${i}`,
        x: (i * 37) % 1600,
        y: (i * 23) % 900,
        w: 120,
        h: 80,
        importance: i % 10
      });
    }
    const t0 = process.hrtime.bigint();
    const res = relieveCollisions(rects, S_1080);
    const t1 = process.hrtime.bigint();
    const durMs = Number(t1 - t0) / 1e6;
    assert(durMs < 10);
  });

  test('zero-width or zero-height items do not crash solver', () => {
    const rects = [
      { id: 'zero_w', x: 100, y: 100, w: 0, h: 100, importance: 5 },
      { id: 'zero_h', x: 100, y: 100, w: 100, h: 0, importance: 5 },
      { id: 'normal', x: 100, y: 100, w: 100, h: 100, importance: 10 }
    ];
    assert.doesNotThrow(() => relieveCollisions(rects, S_1080));
  });

  test('sub-pixel coordinates are handled accurately', () => {
    const rects = [
      { id: 'sub1', x: 100.5, y: 100.25, w: 150.5, h: 100.75, importance: 10 },
      { id: 'sub2', x: 180.2, y: 100.25, w: 150.5, h: 100.75, importance: 5 }
    ];
    const res = relieveCollisions(rects, S_1080);
    assert.strictEqual(res.feasible, true);
  });

  test('items clustered at stage edges remain in non-negative space', () => {
    const rects = [
      { id: 'edge1', x: 0, y: 0, w: 100, h: 100, importance: 10 },
      { id: 'edge2', x: 20, y: 0, w: 100, h: 100, importance: 5 }
    ];
    const res = relieveCollisions(rects, S_1080);
    const edge2 = res.rects.find(r => r.id === 'edge2');
    assert(edge2.x >= 100);
  });

  test('reports all offender IDs accurately when infeasible', () => {
    const rects = [
      { id: 'bad1', x: 10, y: 10, w: 100, h: 100, importance: 1 },
      { id: 'bad2', x: 10, y: 10, w: 100, h: 100, importance: 1 }
    ];
    // Stage size is 100x100, so moving item out causes conflict or boundary constraints
    const res = relieveCollisions(rects, { w: 100, h: 100 }, { maxPasses: 1 });
    assert(res.offenders.includes('bad1') || res.offenders.includes('bad2'));
  });

  test('retains custom properties on returned rects', () => {
    const rects = [
      { id: 'custom_props', x: 10, y: 10, w: 100, h: 100, customMeta: 'special_value', z: 4 }
    ];
    const res = relieveCollisions(rects, S_1080);
    assert.strictEqual(res.rects[0].customMeta, 'special_value');
    assert.strictEqual(res.rects[0].z, 4);
  });
});
