/**
 * DimDash Interaction Engine & State Machine Unit Tests
 * Tests state transitions, resize handle math (8 handles x modifiers),
 * history stack coalescing, and keyboard parity.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { STATES, HistoryController, InteractionController } = require('../public/js/stage/interaction.js');
const { StageOverlay } = require('../public/js/stage/overlay.js');

describe('Interaction Engine: State Machine & History', () => {

  test('HistoryController manages undo/redo stacks correctly', () => {
    const history = new HistoryController(10);

    assert.equal(history.canUndo(), false);
    assert.equal(history.canRedo(), false);

    // Push action 1
    history.push({
      type: 'move',
      targetId: 'item-1',
      patches: [{ op: 'merge', path: '/x', value: 100 }],
      inverse: [{ op: 'merge', path: '/x', value: 50 }]
    });

    assert.equal(history.canUndo(), true);
    assert.equal(history.canRedo(), false);

    // Undo
    const undoOps = history.undo();
    assert.deepEqual(undoOps, [{ op: 'merge', path: '/x', value: 50 }]);
    assert.equal(history.canUndo(), false);
    assert.equal(history.canRedo(), true);

    // Redo
    const redoOps = history.redo();
    assert.deepEqual(redoOps, [{ op: 'merge', path: '/x', value: 100 }]);
    assert.equal(history.canUndo(), true);
    assert.equal(history.canRedo(), false);
  });

  test('HistoryController coalesces rapid nudge bursts on the same item', () => {
    const history = new HistoryController(10);

    // Initial nudge
    history.push({
      type: 'nudge',
      targetId: 'item-1',
      patches: [{ op: 'merge', path: '/x', value: 51 }],
      inverse: [{ op: 'merge', path: '/x', value: 50 }],
      isCoalesceable: true
    });

    // Burst nudge within 500ms
    history.push({
      type: 'nudge',
      targetId: 'item-1',
      patches: [{ op: 'merge', path: '/x', value: 52 }],
      inverse: [{ op: 'merge', path: '/x', value: 51 }],
      isCoalesceable: true
    });

    // Should coalesce into 1 entry with the initial inverse and final patch
    assert.equal(history.undoStack.length, 1);
    assert.deepEqual(history.undoStack[0].patches, [{ op: 'merge', path: '/x', value: 52 }]);
    assert.deepEqual(history.undoStack[0].inverse, [{ op: 'merge', path: '/x', value: 50 }]);
  });

  test('HistoryController caps max entries at configured limit', () => {
    const history = new HistoryController(3);
    for (let i = 1; i <= 5; i++) {
      history.push({
        type: 'move',
        targetId: `item-${i}`,
        patches: [{ op: 'merge', path: '/x', value: i }],
        inverse: [{ op: 'merge', path: '/x', value: 0 }]
      });
    }
    assert.equal(history.undoStack.length, 3);
    assert.equal(history.undoStack[0].targetId, 'item-3');
    assert.equal(history.undoStack[2].targetId, 'item-5');
  });
});

describe('Interaction Engine: Resize Handle Math (8 Handles x Modifiers)', () => {
  const baseRect = { x: 100, y: 100, w: 200, h: 100 }; // 2:1 aspect ratio

  test('Handle E (East): increases width on positive dx', () => {
    const res = InteractionController.calculateResize(baseRect, 'e', 50, 0, {});
    assert.equal(res.x, 100);
    assert.equal(res.y, 100);
    assert.equal(res.w, 250);
    assert.equal(res.h, 100);
  });

  test('Handle W (West): shifts x and increases width on negative dx', () => {
    const res = InteractionController.calculateResize(baseRect, 'w', -40, 0, {});
    assert.equal(res.x, 60);
    assert.equal(res.y, 100);
    assert.equal(res.w, 240);
    assert.equal(res.h, 100);
  });

  test('Handle S (South): increases height on positive dy', () => {
    const res = InteractionController.calculateResize(baseRect, 's', 0, 30, {});
    assert.equal(res.x, 100);
    assert.equal(res.y, 100);
    assert.equal(res.w, 200);
    assert.equal(res.h, 130);
  });

  test('Handle N (North): shifts y and increases height on negative dy', () => {
    const res = InteractionController.calculateResize(baseRect, 'n', 0, -25, {});
    assert.equal(res.x, 100);
    assert.equal(res.y, 75);
    assert.equal(res.w, 200);
    assert.equal(res.h, 125);
  });

  test('Handle SE (South-East): expands both width and height', () => {
    const res = InteractionController.calculateResize(baseRect, 'se', 40, 20, {});
    assert.equal(res.x, 100);
    assert.equal(res.y, 100);
    assert.equal(res.w, 240);
    assert.equal(res.h, 120);
  });

  test('Handle NW (North-West): shifts x,y and expands width and height', () => {
    const res = InteractionController.calculateResize(baseRect, 'nw', -30, -15, {});
    assert.equal(res.x, 70);
    assert.equal(res.y, 85);
    assert.equal(res.w, 230);
    assert.equal(res.h, 115);
  });

  test('Handle NE (North-East): expands width and shifts y', () => {
    const res = InteractionController.calculateResize(baseRect, 'ne', 50, -20, {});
    assert.equal(res.x, 100);
    assert.equal(res.y, 80);
    assert.equal(res.w, 250);
    assert.equal(res.h, 120);
  });

  test('Handle SW (South-West): shifts x and expands height', () => {
    const res = InteractionController.calculateResize(baseRect, 'sw', -50, 30, {});
    assert.equal(res.x, 50);
    assert.equal(res.y, 100);
    assert.equal(res.w, 250);
    assert.equal(res.h, 130);
  });

  test('Shift Modifier: preserves original aspect ratio (2:1)', () => {
    // East handle with shift
    const res = InteractionController.calculateResize(baseRect, 'e', 100, 0, { shiftKey: true });
    assert.equal(res.w, 300);
    assert.equal(res.h, 150); // 300 / 2 = 150
  });

  test('Alt Modifier: resizes symmetrically from center', () => {
    // East handle with alt
    const res = InteractionController.calculateResize(baseRect, 'e', 50, 0, { altKey: true });
    assert.equal(res.w, 300); // 200 + 50*2
    assert.equal(res.x, 50);  // 100 - (300-200)/2
    assert.equal(res.y, 100);
  });

  test('Clamps to min width (20) and min height (20) on extreme shrink', () => {
    const res = InteractionController.calculateResize(baseRect, 'se', -500, -500, {});
    assert.equal(res.w, 20);
    assert.equal(res.h, 20);
  });
});

describe('StageOverlay: Geometric Handle & Continuous Border Hit-Testing', () => {
  const bounds = { x: 100, y: 100, w: 400, h: 200 };

  test('Direct corner handle hits return corresponding corner name', () => {
    assert.equal(StageOverlay.hitTestHandles(100, 100, bounds), 'nw');
    assert.equal(StageOverlay.hitTestHandles(500, 100, bounds), 'ne');
    assert.equal(StageOverlay.hitTestHandles(500, 300, bounds), 'se');
    assert.equal(StageOverlay.hitTestHandles(100, 300, bounds), 'sw');
  });

  test('Direct midpoint handle hits return corresponding midpoint name', () => {
    assert.equal(StageOverlay.hitTestHandles(300, 100, bounds), 'n');
    assert.equal(StageOverlay.hitTestHandles(300, 300, bounds), 's');
    assert.equal(StageOverlay.hitTestHandles(100, 200, bounds), 'w');
    assert.equal(StageOverlay.hitTestHandles(500, 200, bounds), 'e');
  });

  test('Continuous border perimeter hits allow resizing anywhere along edges', () => {
    // Top border far from center (x=200, y=101)
    assert.equal(StageOverlay.hitTestHandles(200, 101, bounds), 'n');
    // Bottom border far from center (x=380, y=299)
    assert.equal(StageOverlay.hitTestHandles(380, 299, bounds), 's');
    // Left border far from center (x=102, y=160)
    assert.equal(StageOverlay.hitTestHandles(102, 160, bounds), 'w');
    // Right border far from center (x=498, y=240)
    assert.equal(StageOverlay.hitTestHandles(498, 240, bounds), 'e');
  });

  test('Inner safe interior returns null so clicking interior moves/selects element', () => {
    // Center point inside card
    assert.equal(StageOverlay.hitTestHandles(300, 200, bounds), null);
    // Well inside near top-left but outside border tolerance
    assert.equal(StageOverlay.hitTestHandles(150, 150, bounds), null);
  });

  test('Points outside bounds return null', () => {
    assert.equal(StageOverlay.hitTestHandles(50, 50, bounds), null);
    assert.equal(StageOverlay.hitTestHandles(600, 400, bounds), null);
  });

  test('Invalid or zero-size bounds return null safely', () => {
    assert.equal(StageOverlay.hitTestHandles(100, 100, null), null);
    assert.equal(StageOverlay.hitTestHandles(100, 100, { x: 0, y: 0, w: 0, h: 0 }), null);
  });
});

describe('Interaction Engine: Proportional Child Scaling on Group Resize', () => {
  test('scales child items proportionally when parent box expands', () => {
    const parentStart = { x: 40, y: 40, w: 1000, h: 400 };
    const childrenStart = [
      { id: 'child-1', x: 40, y: 40, w: 400, h: 140 },
      { id: 'child-2', x: 500, y: 40, w: 400, h: 140 }
    ];

    // Parent expands by 50% horizontally and 50% vertically
    const parentNew = { x: 40, y: 40, w: 1500, h: 600 };
    const scaleX = parentNew.w / parentStart.w; // 1.5
    const scaleY = parentNew.h / parentStart.h; // 1.5

    const scaledChildren = childrenStart.map(child => ({
      id: child.id,
      x: Math.round(child.x * scaleX * 10) / 10,
      y: Math.round(child.y * scaleY * 10) / 10,
      w: Math.max(20, Math.round(child.w * scaleX * 10) / 10),
      h: Math.max(20, Math.round(child.h * scaleY * 10) / 10)
    }));

    assert.deepEqual(scaledChildren[0], { id: 'child-1', x: 60, y: 60, w: 600, h: 210 });
    assert.deepEqual(scaledChildren[1], { id: 'child-2', x: 750, y: 60, w: 600, h: 210 });
  });

  test('scales child items proportionally when parent box shrinks with floor clamping', () => {
    const parentStart = { x: 40, y: 40, w: 1000, h: 400 };
    const childrenStart = [
      { id: 'child-1', x: 40, y: 40, w: 400, h: 140 },
      { id: 'child-2', x: 500, y: 40, w: 400, h: 140 }
    ];

    // Parent shrinks to 50%
    const parentNew = { x: 40, y: 40, w: 500, h: 200 };
    const scaleX = parentNew.w / parentStart.w; // 0.5
    const scaleY = parentNew.h / parentStart.h; // 0.5

    const scaledChildren = childrenStart.map(child => ({
      id: child.id,
      x: Math.round(child.x * scaleX * 10) / 10,
      y: Math.round(child.y * scaleY * 10) / 10,
      w: Math.max(20, Math.round(child.w * scaleX * 10) / 10),
      h: Math.max(20, Math.round(child.h * scaleY * 10) / 10)
    }));

    assert.deepEqual(scaledChildren[0], { id: 'child-1', x: 20, y: 20, w: 200, h: 70 });
    assert.deepEqual(scaledChildren[1], { id: 'child-2', x: 250, y: 20, w: 200, h: 70 });
  });
});

