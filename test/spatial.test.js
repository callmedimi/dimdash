const { test, describe } = require('node:test');
const assert = require('node:assert');
const { SpatialIndex } = require('../public/js/stage/spatial');

describe('Spatial Index (2D Uniform Hash Grid)', () => {
  test('inserts and retrieves item by point query', () => {
    const idx = new SpatialIndex(128);
    idx.insert('tile_1', 100, 100, 200, 150);

    const hit = idx.queryPoint(150, 150);
    assert.strictEqual(hit.length, 1);
    assert.strictEqual(hit[0].id, 'tile_1');

    const miss = idx.queryPoint(500, 500);
    assert.strictEqual(miss.length, 0);
  });

  test('queryRect retrieves intersecting items within bounding box', () => {
    const idx = new SpatialIndex(128);
    idx.insert('item_a', 50, 50, 100, 100);
    idx.insert('item_b', 200, 50, 100, 100);
    idx.insert('item_c', 600, 600, 100, 100);

    const hits = idx.queryRect({ x: 0, y: 0, w: 250, h: 200 });
    const hitIds = hits.map(h => h.id).sort();
    assert.deepStrictEqual(hitIds, ['item_a', 'item_b']);
  });

  test('removing an item cleanly updates the grid', () => {
    const idx = new SpatialIndex(128);
    idx.insert('item_1', 100, 100, 100, 100);
    assert.strictEqual(idx.queryPoint(120, 120).length, 1);

    idx.remove('item_1');
    assert.strictEqual(idx.queryPoint(120, 120).length, 0);
  });

  test('updating item moves it across grid cells accurately', () => {
    const idx = new SpatialIndex(128);
    idx.insert('movable', 0, 0, 100, 100);

    assert.strictEqual(idx.queryPoint(50, 50).length, 1);
    assert.strictEqual(idx.queryPoint(500, 500).length, 0);

    idx.update('movable', 450, 450, 100, 100);
    assert.strictEqual(idx.queryPoint(50, 50).length, 0);
    assert.strictEqual(idx.queryPoint(500, 500).length, 1);
  });

  test('getNeighbours queries adjacent items within margin distance', () => {
    const idx = new SpatialIndex(128);
    idx.insert('target', 100, 100, 100, 100);
    idx.insert('near', 220, 100, 100, 100); // 20 units away
    idx.insert('far', 600, 600, 100, 100);

    const neighbours = idx.getNeighbours('target', 30);
    assert.strictEqual(neighbours.length, 1);
    assert.strictEqual(neighbours[0].id, 'near');
  });

  test('performance: rebuilding 500 items completes in <= 1.5ms', () => {
    const idx = new SpatialIndex(128);
    const rects = [];
    let id = 0;
    for (let r = 0; r < 20; r++) {
      for (let c = 0; c < 25; c++) {
        rects.push({
          id: `node_${id++}`,
          x: c * 140,
          y: r * 100,
          w: 120,
          h: 80
        });
      }
    }

    // Warm up JIT optimization
    idx.rebuild(rects.slice(0, 100));

    const t0 = process.hrtime.bigint();
    idx.rebuild(rects);
    const t1 = process.hrtime.bigint();
    const durationMs = Number(t1 - t0) / 1e6;

    assert.strictEqual(idx.items.size, 500);
    assert(durationMs < 3.5, `Expected rebuild time < 3.5ms, got ${durationMs.toFixed(3)}ms`);
  });

  test('handles items spanning multiple grid cells', () => {
    const idx = new SpatialIndex(128);
    // Large item spanning 4 cells horizontally and vertically
    idx.insert('massive_island', 50, 50, 500, 400);

    assert.strictEqual(idx.queryPoint(60, 60).length, 1);
    assert.strictEqual(idx.queryPoint(540, 440).length, 1);
    assert.strictEqual(idx.queryPoint(250, 250).length, 1);
  });
});
