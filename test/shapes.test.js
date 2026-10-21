/**
 * DimDash Shapes Library Unit Tests
 * Tests all 15 shapes for clip-path generation, content safe-area insets,
 * geometric hit-testing, and SVG border path generation.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const Shapes = require('../public/js/stage/shapes.js');

describe('Shapes Library: 15 Arbitrary Outlines', () => {

  test('lists all 15 built-in shapes', () => {
    const list = Shapes.listShapes();
    assert.equal(list.length, 15);
    const ids = list.map(s => s.id);
    assert.ok(ids.includes('rect'));
    assert.ok(ids.includes('rounded'));
    assert.ok(ids.includes('pill'));
    assert.ok(ids.includes('circle'));
    assert.ok(ids.includes('ellipse'));
    assert.ok(ids.includes('squircle'));
    assert.ok(ids.includes('hexagon'));
    assert.ok(ids.includes('octagon'));
    assert.ok(ids.includes('chamfer'));
    assert.ok(ids.includes('notch'));
    assert.ok(ids.includes('ticket'));
    assert.ok(ids.includes('tab'));
    assert.ok(ids.includes('parallelogram'));
    assert.ok(ids.includes('arrow'));
    assert.ok(ids.includes('blob'));
  });

  test('rect: returns null clip-path and zero insets', () => {
    assert.equal(Shapes.getClipPath('rect', 200, 100), null);
    assert.deepEqual(Shapes.getContentSafeArea('rect', 200, 100), [0, 0, 0, 0]);
    assert.equal(Shapes.hitTestShape('rect', 50, 50, 200, 100), true);
    assert.equal(Shapes.hitTestShape('rect', 250, 50, 200, 100), false);
  });

  test('rounded: generates inset round clip-path and safe insets', () => {
    const clip = Shapes.getClipPath('rounded', 200, 100, { radius: 16 });
    assert.ok(clip.includes('inset(0% round 16px 16px 16px 16px)'));

    const insets = Shapes.getContentSafeArea('rounded', 200, 100, { radius: 16 });
    assert.ok(insets[0] > 0);

    // Center is a hit
    assert.equal(Shapes.hitTestShape('rounded', 100, 50, 200, 100, { radius: 16 }), true);
    // Extreme corner cut is a miss
    assert.equal(Shapes.hitTestShape('rounded', 1, 1, 200, 100, { radius: 16 }), false);
  });

  test('pill: produces half-dimension rounded cap', () => {
    const clip = Shapes.getClipPath('pill', 200, 60);
    assert.ok(clip.includes('round 30px'));

    const insets = Shapes.getContentSafeArea('pill', 200, 60);
    assert.ok(insets[1] >= 15); // right padding for semicircle
    assert.ok(insets[3] >= 15); // left padding

    // Left end corner miss vs hit
    assert.equal(Shapes.hitTestShape('pill', 2, 2, 200, 60), false);
    assert.equal(Shapes.hitTestShape('pill', 100, 30, 200, 60), true);
  });

  test('circle: generates circular clip and safe central square insets', () => {
    const clip = Shapes.getClipPath('circle', 100, 100);
    assert.equal(clip, 'circle(50px at 50% 50%)');

    const insets = Shapes.getContentSafeArea('circle', 100, 100);
    assert.ok(insets[0] > 10);
    assert.ok(insets[1] > 10);

    assert.equal(Shapes.hitTestShape('circle', 50, 50, 100, 100), true);
    assert.equal(Shapes.hitTestShape('circle', 5, 5, 100, 100), false); // corner outside circle
  });

  test('squircle: generates superellipse path clip and passes center hit', () => {
    const clip = Shapes.getClipPath('squircle', 120, 120);
    assert.ok(clip.startsWith("path('M 0 60 C"));

    assert.equal(Shapes.hitTestShape('squircle', 60, 60, 120, 120), true);
    assert.equal(Shapes.hitTestShape('squircle', 2, 2, 120, 120), false);
  });

  test('hexagon: generates polygon with 6 vertices and safe insets', () => {
    const clip = Shapes.getClipPath('hexagon', 200, 100, { orientation: 'horizontal' });
    assert.ok(clip.includes('polygon(25% 0%, 75% 0%'));

    const insets = Shapes.getContentSafeArea('hexagon', 200, 100, { orientation: 'horizontal' });
    assert.equal(insets[1], 50); // 25% of 200
    assert.equal(insets[3], 50);

    assert.equal(Shapes.hitTestShape('hexagon', 100, 50, 200, 100), true);
    assert.equal(Shapes.hitTestShape('hexagon', 5, 5, 200, 100), false);
  });

  test('chamfer & notch: generate cybernetic corner cuts', () => {
    const chamferClip = Shapes.getClipPath('chamfer', 150, 80, { chamfer: 12 });
    assert.ok(chamferClip.includes('polygon(12px 0px'));

    const notchClip = Shapes.getClipPath('notch', 200, 100, { notchW: 20, notchH: 20, corner: 'tr' });
    assert.ok(notchClip.includes('polygon(0% 0%'));

    assert.equal(Shapes.hitTestShape('notch', 195, 5, 200, 100, { notchW: 20, notchH: 20, corner: 'tr' }), false);
    assert.equal(Shapes.hitTestShape('notch', 100, 50, 200, 100), true);
  });

  test('ticket: generates side bites with safe margin around semicircle cutout', () => {
    const clip = Shapes.getClipPath('ticket', 200, 100, { biteRadius: 15 });
    assert.ok(clip.includes('path('));

    const insets = Shapes.getContentSafeArea('ticket', 200, 100, { biteRadius: 15 });
    assert.ok(insets[1] >= 15);
    assert.ok(insets[3] >= 15);

    // Left semicircle cutout is a miss
    assert.equal(Shapes.hitTestShape('ticket', 5, 50, 200, 100, { biteRadius: 15 }), false);
    // Center is a hit
    assert.equal(Shapes.hitTestShape('ticket', 100, 50, 200, 100), true);
  });

  test('generates valid SVG border paths for shaped containers', () => {
    for (const shape of Shapes.listShapes()) {
      const svgPath = Shapes.getSvgBorderPath(shape.id, 160, 90);
      assert.ok(typeof svgPath === 'string' && svgPath.length > 5, `SVG path missing for ${shape.id}`);
      assert.ok(svgPath.startsWith('M'), `Path should start with M for ${shape.id}`);
    }
  });
});
