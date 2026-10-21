const { test, describe } = require('node:test');
const assert = require('node:assert');
const { computeMoveSnap, computeResizeSnap } = require('../public/js/stage/snap');

describe('Magnetic Snapping & Smart Guides', () => {
  const nb = { id: 'ref_tile', x: 200, y: 150, w: 200, h: 100 };

  test('snaps left edge to neighbour left edge within threshold', () => {
    // Dragged item left edge at 203 (diff = 3 <= 6 threshold)
    const dragged = { x: 203, y: 300, w: 100, h: 100 };
    const res = computeMoveSnap(dragged, [nb], { zoom: 1.0, thresholdPx: 6, magneticFactor: 0, gridSize: 0 });

    assert.strictEqual(res.snappedX, true);
    assert.strictEqual(res.x, 200);
    assert.strictEqual(res.guides.length, 1);
    assert.strictEqual(res.guides[0].pos, 200);
  });

  test('snaps right edge to neighbour right edge within threshold', () => {
    // nb right edge is 400. Dragged item right edge at 402 (diff = 2)
    const dragged = { x: 302, y: 300, w: 100, h: 100 };
    const res = computeMoveSnap(dragged, [nb], { zoom: 1.0, thresholdPx: 6, magneticFactor: 0 });

    assert.strictEqual(res.snappedX, true);
    assert.strictEqual(res.x, 300); // 400 - 100
  });

  test('snaps center to neighbour center', () => {
    // nb center X is 300. Dragged item center at 303 (w=100 -> x=253)
    const dragged = { x: 253, y: 300, w: 100, h: 100 };
    const res = computeMoveSnap(dragged, [nb], { zoom: 1.0, thresholdPx: 6, magneticFactor: 0 });

    assert.strictEqual(res.snappedX, true);
    assert.strictEqual(res.x, 250); // center at 300 -> x = 250
  });

  test('snaps to 4 wu grid when no neighbours are in snap range', () => {
    const dragged = { x: 41, y: 83, w: 100, h: 100 };
    const res = computeMoveSnap(dragged, [], { gridSize: 4, thresholdPx: 6, magneticFactor: 0 });

    assert.strictEqual(res.snappedX, true);
    assert.strictEqual(res.snappedY, true);
    assert.strictEqual(res.x, 40); // 41 -> 40
    assert.strictEqual(res.y, 84); // 83 -> 84
  });

  test('hysteresis keeps item snapped until release threshold is crossed', () => {
    const dragged = { x: 207, y: 300, w: 100, h: 100 };
    // Diff is 7. Normal snapThreshold is 6, but active line is 200 with releasePx 10
    const res = computeMoveSnap(dragged, [nb], {
      thresholdPx: 6,
      releasePx: 10,
      activeSnapLines: { x: 200, y: null },
      magneticFactor: 0
    });

    assert.strictEqual(res.snappedX, true);
    assert.strictEqual(res.x, 200);
  });

  test('releases snap when moving beyond release threshold', () => {
    const dragged = { x: 215, y: 300, w: 100, h: 100 }; // diff = 15 > 10
    const res = computeMoveSnap(dragged, [nb], {
      thresholdPx: 6,
      releasePx: 10,
      activeSnapLines: { x: 200, y: null },
      gridSize: 0
    });

    assert.strictEqual(res.snappedX, false);
  });

  test('zoom compensation adjusts snap distance in world units', () => {
    // Zoom = 2.0 -> 6 screen px equals 3 wu
    const dragged = { x: 204, y: 300, w: 100, h: 100 }; // diff = 4 wu > 3 wu threshold
    const res = computeMoveSnap(dragged, [nb], { zoom: 2.0, thresholdPx: 6, gridSize: 0 });

    assert.strictEqual(res.snappedX, false);
  });

  test('magnetic easing eases partially toward snap target', () => {
    const dragged = { x: 204, y: 300, w: 100, h: 100 }; // diff = 4 wu
    // magneticFactor = 0.4 -> moves 60% of the way: 204 + (200 - 204)*0.6 = 201.6
    const res = computeMoveSnap(dragged, [nb], { thresholdPx: 6, magneticFactor: 0.4, gridSize: 0 });

    assert.strictEqual(res.snappedX, true);
    assert.strictEqual(res.x, 201.6);
  });

  test('resize snap matches same width as neighbouring item', () => {
    const origRect = { x: 100, y: 100, w: 150, h: 100 };
    const currentRect = { x: 100, y: 100, w: 198, h: 100 }; // nb width is 200 (diff = 2)

    const res = computeResizeSnap('e', origRect, currentRect, [nb], { thresholdPx: 6 });
    assert.strictEqual(res.w, 200);
    assert.strictEqual(res.guides.length, 1);
    assert.strictEqual(res.guides[0].type, 'same-size');
  });
});
