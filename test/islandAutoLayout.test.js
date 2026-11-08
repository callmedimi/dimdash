const { test, describe } = require('node:test');
const assert = require('node:assert');
const { applyIslandAutoLayout } = require('../public/js/stage/autolayout.js');

const isl = (o = {}) => ({ id: 'i', kind: 'island', x: 40, y: 280, w: 540, h: 310, parent: null, ...o });
const tile = (id, x, y) => ({ id, kind: 'service', x, y, w: 230, h: 85, parent: 'i' });
const items = [{ id: 'i', kind: 'island', props: { layoutMode: 'flow' } }];

describe('applyIslandAutoLayout', () => {
  const rects = [isl(), tile('a', 60, 340), tile('b', 310, 340), tile('c', 60, 440), tile('d', 310, 440)];

  test('children fill the inner width with equal cells and symmetric padding', () => {
    const out = applyIslandAutoLayout(rects, items);
    const a = out.find(r => r.id === 'a'), b = out.find(r => r.id === 'b');
    assert.equal(a.x - 40, 20);                       // left padding
    assert.equal(40 + 540 - (b.x + b.w), 20);         // right padding is equal
    assert.equal(a.w, b.w);
    assert.equal(b.x - (a.x + a.w), 16);              // uniform gap
  });

  test('island height is trimmed to its content (no dead space)', () => {
    const out = applyIslandAutoLayout(rects, items);
    const i = out.find(r => r.id === 'i');
    assert.equal(i.h, 44 + 16 + 85 * 2 + 16 + 20);
  });

  test('RTL keeps the existing visual order and symmetric padding', () => {
    const out = applyIslandAutoLayout(rects, items, { isRtl: true });
    const a = out.find(r => r.id === 'a'), b = out.find(r => r.id === 'b');
    assert.ok(a.x < b.x);                              // a stays on the left, b on the right
    assert.equal(40 + 540 - (b.x + b.w), 20);
    assert.equal(a.x - 40, 20);
  });

  test('autoLayout:false and free mode leave the island untouched', () => {
    for (const props of [{ autoLayout: false, layoutMode: 'flow' }, { layoutMode: 'free' }]) {
      const out = applyIslandAutoLayout(rects, [{ id: 'i', kind: 'island', props }]);
      assert.deepEqual(out, rects);
    }
  });

  test('does not mutate its input and handles an empty island', () => {
    const snap = JSON.stringify(rects);
    applyIslandAutoLayout(rects, items);
    assert.equal(JSON.stringify(rects), snap);
    assert.deepEqual(applyIslandAutoLayout([isl()], items), [isl()]);
  });

  test('narrow island collapses to one column', () => {
    const out = applyIslandAutoLayout([isl({ w: 260 }), tile('a', 60, 340), tile('b', 60, 440)], items);
    assert.equal(out.find(r => r.id === 'a').x, out.find(r => r.id === 'b').x);
  });
});
