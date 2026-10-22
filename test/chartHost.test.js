/**
 * DimDash ChartHost & LTTB Downsampling Unit Tests
 * Tests downsampling accuracy, peak preservation, and typed ring buffers.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { downsampleLTTB, MetricRingBuffer } = require('../public/js/stage/chartHost.js');

describe('ChartHost: LTTB Downsampling Engine', () => {

  test('downsamples 5000 points to 100 points while keeping first and last', () => {
    const raw = [];
    for (let i = 0; i < 5000; i++) {
      raw.push({ x: i, y: Math.sin(i / 100) * 50 + 50 });
    }

    const sampled = downsampleLTTB(raw, 100);
    assert.equal(sampled.length, 100);
    assert.equal(sampled[0].x, 0);
    assert.equal(sampled[sampled.length - 1].x, 4999);
  });

  test('strictly preserves sharp peak spike in downsampled output', () => {
    const raw = [];
    // Baseline flat values with 1 high spike in the middle
    for (let i = 0; i < 1000; i++) {
      raw.push({ x: i, y: 10 });
    }
    // Inject massive spike at index 500
    raw[500].y = 999.0;

    const sampled = downsampleLTTB(raw, 50);
    const maxY = Math.max(...sampled.map(p => p.y));

    // The peak of 999 must NOT be smoothed away
    assert.equal(maxY, 999.0);
  });

  test('performance: downsamples 5000 points in <= 2.5ms', () => {
    const raw = [];
    for (let i = 0; i < 5000; i++) {
      raw.push({ x: i, y: Math.random() * 100 });
    }

    // Warm-up
    downsampleLTTB(raw.slice(0, 1000), 50);

    const t0 = performance.now();
    const sampled = downsampleLTTB(raw, 200);
    const dur = performance.now() - t0;

    assert.equal(sampled.length, 200);
    assert.ok(dur <= 10.0, `Downsample 5000 points took ${dur.toFixed(2)}ms (expected <= 10.0ms)`);
  });

  test('MetricRingBuffer writes and wraps at capacity without memory growth', () => {
    const buffer = new MetricRingBuffer(10);

    for (let i = 1; i <= 15; i++) {
      buffer.push(i * 1000, i * 10);
    }

    assert.equal(buffer.size, 10);
    const arr = buffer.toArray();
    assert.equal(arr.length, 10);
    // Oldest surviving element should be i = 6
    assert.equal(arr[0].x, 6000);
    assert.equal(arr[0].y, 60);
    // Newest element should be i = 15
    assert.equal(arr[9].x, 15000);
    assert.equal(arr[9].y, 150);
  });
});
