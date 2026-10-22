// test/a11y.test.js — Accessibility, Spatial Navigation & Sensory Unit Tests
const test = require('node:test');
const assert = require('node:assert/strict');

test('A11y: Spatial Navigation & Geometric Direction Distance', async (t) => {
  // Distance metric: dist = (vertical) ? |dy| + 2*|dx| : |dx| + 2*|dy|
  function calcSpatialDist(from, to, direction) {
    const fx = from.x + from.w / 2;
    const fy = from.y + from.h / 2;
    const tx = to.x + to.w / 2;
    const ty = to.y + to.h / 2;
    const dx = tx - fx;
    const dy = ty - fy;

    if (direction === 'ArrowRight' && dx > 0) return dx + 2 * Math.abs(dy);
    if (direction === 'ArrowLeft' && dx < 0) return -dx + 2 * Math.abs(dy);
    if (direction === 'ArrowDown' && dy > 0) return dy + 2 * Math.abs(dx);
    if (direction === 'ArrowUp' && dy < 0) return -dy + 2 * Math.abs(dx);
    return Infinity;
  }

  const origin = { x: 100, y: 100, w: 50, h: 50 };
  const directRight = { x: 200, y: 100, w: 50, h: 50 };
  const diagonalRight = { x: 200, y: 180, w: 50, h: 50 };
  const directDown = { x: 100, y: 200, w: 50, h: 50 };

  await t.test('prefers direct horizontal neighbor over diagonal neighbor on ArrowRight', () => {
    const distDirect = calcSpatialDist(origin, directRight, 'ArrowRight');
    const distDiag = calcSpatialDist(origin, diagonalRight, 'ArrowRight');
    assert.ok(distDirect < distDiag, `Direct (${distDirect}) should be closer than diagonal (${distDiag})`);
  });

  await t.test('prefers direct vertical neighbor over diagonal neighbor on ArrowDown', () => {
    const distDirect = calcSpatialDist(origin, directDown, 'ArrowDown');
    const distDiag = calcSpatialDist(origin, diagonalRight, 'ArrowDown');
    assert.ok(distDirect < distDiag, `Direct (${distDirect}) should be closer than diagonal (${distDiag})`);
  });

  await t.test('rejects items in opposite direction as Infinity', () => {
    const distLeft = calcSpatialDist(origin, directRight, 'ArrowLeft');
    assert.equal(distLeft, Infinity);
  });
});

test('A11y: RTL Spatial Direction Inversion', async (t) => {
  function mapKeyForDir(key, dir) {
    if (dir === 'rtl') {
      if (key === 'ArrowRight') return 'ArrowLeft';
      if (key === 'ArrowLeft') return 'ArrowRight';
    }
    return key;
  }

  assert.equal(mapKeyForDir('ArrowRight', 'rtl'), 'ArrowLeft');
  assert.equal(mapKeyForDir('ArrowLeft', 'rtl'), 'ArrowRight');
  assert.equal(mapKeyForDir('ArrowUp', 'rtl'), 'ArrowUp');
  assert.equal(mapKeyForDir('ArrowDown', 'rtl'), 'ArrowDown');
  assert.equal(mapKeyForDir('ArrowRight', 'ltr'), 'ArrowRight');
});

test('A11y: Roving Tabindex State Machine', async (t) => {
  class RovingTablist {
    constructor(items) {
      this.items = items;
      this.activeIndex = 0;
    }
    getActive() {
      return this.items[this.activeIndex];
    }
    setActive(idx) {
      this.activeIndex = Math.max(0, Math.min(this.items.length - 1, idx));
    }
    getTabindices() {
      return this.items.map((_, i) => (i === this.activeIndex ? 0 : -1));
    }
  }

  const list = new RovingTablist(['item-1', 'item-2', 'item-3']);
  assert.deepEqual(list.getTabindices(), [0, -1, -1], 'Only first item has tabindex 0 initially');

  list.setActive(1);
  assert.deepEqual(list.getTabindices(), [-1, 0, -1], 'Active item gets 0, previous drops to -1');

  list.setActive(2);
  assert.deepEqual(list.getTabindices(), [-1, -1, 0], 'Third item gets 0');
});

test('A11y: Polite Live Region Announcements Debouncer & Batcher', async (t) => {
  class LiveAnnouncer {
    constructor(debounceMs = 100) {
      this.debounceMs = debounceMs;
      this.pending = [];
      this.history = [];
      this.timer = null;
    }
    announce(msg) {
      this.pending.push(msg);
    }
    flush() {
      if (this.pending.length === 0) return;
      let text = '';
      if (this.pending.length === 1) {
        text = this.pending[0];
      } else {
        text = `${this.pending.length} changes: ${this.pending.join('; ')}`;
      }
      this.history.push(text);
      this.pending = [];
    }
  }

  const announcer = new LiveAnnouncer();
  announcer.announce('Grafana online');
  announcer.flush();
  assert.equal(announcer.history.length, 1);
  assert.equal(announcer.history[0], 'Grafana online');

  announcer.announce('Postgres offline');
  announcer.announce('Redis offline');
  announcer.flush();
  assert.equal(announcer.history.length, 2);
  assert.match(announcer.history[1], /2 changes: Postgres offline; Redis offline/);
});

test('A11y: Color-blindness Simulation & Palette Separation', async (t) => {
  // Protanopia matrix
  function simulateProtan(r, g, b) {
    const pr = 0.56667 * r + 0.43333 * g + 0.0 * b;
    const pg = 0.55833 * r + 0.44167 * g + 0.0 * b;
    const pb = 0.0 * r + 0.24167 * g + 0.75833 * b;
    return [Math.round(pr), Math.round(pg), Math.round(pb)];
  }

  // Hex to RGB
  const onlineRgb = [0x10, 0xb9, 0x81];
  const offlineRgb = [0xef, 0x44, 0x44];

  const pOnline = simulateProtan(...onlineRgb);
  const pOffline = simulateProtan(...offlineRgb);

  // Euclidean color distance in simulated space
  const dist = Math.sqrt(
    Math.pow(pOnline[0] - pOffline[0], 2) +
    Math.pow(pOnline[1] - pOffline[1], 2) +
    Math.pow(pOnline[2] - pOffline[2], 2)
  );

  assert.ok(dist >= 60, `Protanopia color separation must be >= 60, got ${dist.toFixed(1)}`);
});
