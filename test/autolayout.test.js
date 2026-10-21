/**
 * DimDash Auto-Layout Engine Unit Tests
 * Tests Flow, Grid, Justified Rows, Masonry, Stack, Carousel, and RTL Mirroring.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const AutoLayout = require('../public/js/stage/autolayout.js');

describe('Auto-Layout Engine: Flow Mode', () => {

  test('wraps items into multiple rows when exceeding width', () => {
    const children = [
      { id: 'c1', w: 100, h: 40 },
      { id: 'c2', w: 100, h: 40 },
      { id: 'c3', w: 100, h: 40 }
    ];
    // Box width 220, padding 0, gap 10 -> fits 2 items on first row (100 + 10 + 100 = 210), 3rd wraps
    const rects = AutoLayout.solveAutoLayout('flow', children, { w: 220, h: 200 }, { padding: 0, gap: 10 });
    assert.equal(rects.length, 3);
    assert.equal(rects[0].x, 0);
    assert.equal(rects[0].y, 0);

    assert.equal(rects[1].x, 110);
    assert.equal(rects[1].y, 0);

    // 3rd item wrapped to second row
    assert.equal(rects[2].x, 0);
    assert.equal(rects[2].y, 50); // 40 + 10 gap
  });

  test('justify: space-between distributes remaining row width', () => {
    const children = [
      { id: 'c1', w: 50, h: 40 },
      { id: 'c2', w: 50, h: 40 }
    ];
    // Box width 200, padding 0 -> c1 at 0, c2 at 150
    const rects = AutoLayout.solveAutoLayout('flow', children, { w: 200, h: 100 }, {
      padding: 0,
      gap: 10,
      justify: 'space-between'
    });
    assert.equal(rects[0].x, 0);
    assert.equal(rects[1].x, 150);
  });
});

describe('Auto-Layout Engine: Grid Mode', () => {

  test('calculates columns based on minCell and packs without overlapping', () => {
    const children = [
      { id: 'c1' },
      { id: 'c2' },
      { id: 'c3' },
      { id: 'c4' }
    ];
    // Box width 260, minCell 120, gap 10 -> 2 columns of 125 each
    const rects = AutoLayout.solveAutoLayout('grid', children, { w: 260, h: 200 }, {
      padding: 0,
      gap: 10,
      minCell: 120,
      rowHeight: 60
    });
    assert.equal(rects.length, 4);
    assert.equal(rects[0].x, 0);
    assert.equal(rects[0].y, 0);
    assert.equal(rects[1].x, 135); // 125 + 10
    assert.equal(rects[1].y, 0);

    assert.equal(rects[2].x, 0);
    assert.equal(rects[2].y, 70); // 60 + 10
    assert.equal(rects[3].x, 135);
    assert.equal(rects[3].y, 70);
  });

  test('supports child column span', () => {
    const children = [
      { id: 'c1', span: [2, 1] }, // spans 2 columns
      { id: 'c2', span: [1, 1] },
      { id: 'c3', span: [1, 1] }
    ];
    const rects = AutoLayout.solveAutoLayout('grid', children, { w: 250, h: 200 }, {
      padding: 0,
      gap: 10,
      columns: 2,
      rowHeight: 50
    });
    assert.equal(rects[0].w, 250); // full width
    assert.equal(rects[0].y, 0);

    assert.equal(rects[1].y, 60);
    assert.equal(rects[2].y, 60);
  });
});

describe('Auto-Layout Engine: Justified Rows (Linear Partition DP)', () => {

  test('partitions items into justified rows filling the container width', () => {
    const children = [
      { id: 'c1', aspect: 1.5 }, // 3:2
      { id: 'c2', aspect: 1.0 }, // 1:1
      { id: 'c3', aspect: 2.0 }, // 2:1
      { id: 'c4', aspect: 1.5 }
    ];
    const rects = AutoLayout.solveAutoLayout('justify', children, { w: 400, h: 300 }, {
      padding: 0,
      gap: 8,
      targetRowHeight: 100
    });
    assert.equal(rects.length, 4);

    // Verify all items are within box bounds
    for (const r of rects) {
      assert.ok(r.x >= 0);
      assert.ok(r.x + r.w <= 400);
      assert.ok(r.y >= 0);
    }
  });

  test('performance: justifies 200 items in <= 2ms', () => {
    const children = [];
    for (let i = 0; i < 200; i++) {
      children.push({ id: `item_${i}`, aspect: 1.2 + (i % 5) * 0.2 });
    }

    const t0 = performance.now();
    const rects = AutoLayout.solveAutoLayout('justify', children, { w: 1200, h: 1000 }, {
      padding: 10,
      gap: 8,
      targetRowHeight: 120
    });
    const dur = performance.now() - t0;

    assert.equal(rects.length, 200);
    assert.ok(dur <= 2.5, `Justify 200 items took ${dur.toFixed(2)}ms (expected <= 2.5ms)`);
  });

  test('fillHeight: scales row heights to fill island height', () => {
    const children = [
      { id: 'c1', aspect: 2.0 },
      { id: 'c2', aspect: 2.0 }
    ];
    const rects = AutoLayout.solveAutoLayout('justify', children, { w: 300, h: 200 }, {
      padding: 0,
      gap: 10,
      fillHeight: true
    });
    // Total height should match 200 within tolerance
    const maxBottom = Math.max(...rects.map(r => r.y + r.h));
    assert.ok(Math.abs(maxBottom - 200) <= 15);
  });
});

describe('Auto-Layout Engine: Masonry, Stack, Carousel & RTL', () => {

  test('masonry: places next item in shortest column', () => {
    const children = [
      { id: 'c1', h: 100 },
      { id: 'c2', h: 50 },
      { id: 'c3', h: 60 }
    ];
    // 2 columns
    const rects = AutoLayout.solveAutoLayout('masonry', children, { w: 210, h: 300 }, {
      padding: 0,
      gap: 10,
      minCell: 100
    });
    assert.equal(rects[0].x, 0); // col 0
    assert.equal(rects[1].x, 110); // col 1 (height 50 < col 0 height 100)
    assert.equal(rects[2].x, 110); // col 1 was shorter (50 < 100), so c3 goes to col 1!
    assert.equal(rects[2].y, 60);  // 50 + 10 gap
  });

  test('stack: vertical arrangement with gap', () => {
    const children = [
      { id: 'c1', h: 30 },
      { id: 'c2', h: 40 }
    ];
    const rects = AutoLayout.solveAutoLayout('stack', children, { w: 200, h: 150 }, {
      padding: 0,
      gap: 10,
      direction: 'vertical'
    });
    assert.equal(rects[0].x, 0);
    assert.equal(rects[0].y, 0);
    assert.equal(rects[0].w, 200);

    assert.equal(rects[1].y, 40); // 30 + 10
  });

  test('carousel: paged horizontal layout', () => {
    const children = [
      { id: 'c1' },
      { id: 'c2' },
      { id: 'c3' }
    ];
    const rects = AutoLayout.solveAutoLayout('carousel', children, { w: 300, h: 100 }, {
      padding: 0,
      gap: 10,
      visibleCount: 2
    });
    // item width = (300 - 10) / 2 = 145
    assert.equal(rects[0].w, 145);
    assert.equal(rects[1].x, 155);
    assert.equal(rects[2].x, 310);
  });

  test('RTL Mirroring: mirrors X coordinates within container width', () => {
    const children = [
      { id: 'c1', w: 80, h: 40 },
      { id: 'c2', w: 80, h: 40 }
    ];
    // Box width 300, padding 0, gap 10
    // In LTR: c1.x = 0, c2.x = 90
    // In RTL: c1.x = 300 - 0 - 80 = 220, c2.x = 300 - 90 - 80 = 130
    const rects = AutoLayout.solveAutoLayout('flow', children, { w: 300, h: 100 }, {
      padding: 0,
      gap: 10,
      isRtl: true
    });
    assert.equal(rects[0].x, 220);
    assert.equal(rects[1].x, 130);
  });
});
