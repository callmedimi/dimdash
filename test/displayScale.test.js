const { test, describe } = require('node:test');
const assert = require('node:assert');
const { computeDisplayScale, guessDisplayProfile, THETA_PRESETS } = require('../public/js/stage/scale');

describe('Physical Display Scale & --wu Engine', () => {
  test('preset angles are defined and strictly increasing with distance', () => {
    assert.strictEqual(THETA_PRESETS.handheld, 0.22);
    assert.strictEqual(THETA_PRESETS.desk, 0.25);
    assert.strictEqual(THETA_PRESETS.wall, 0.35);
    assert.strictEqual(THETA_PRESETS.tv, 0.35);
    assert.strictEqual(THETA_PRESETS.far, 0.45);
  });

  test('Worked Example 1: 98" 4K @ 3m wall computes scale in ~2.0 - 2.9 range', () => {
    const res = computeDisplayScale({
      diagonal_in: 98,
      distance_m: 3.0,
      width_px: 3840,
      height_px: 2160,
      dpr: 1,
      preset: 'wall'
    });
    assert(res.wu >= 2.0 && res.wu <= 2.9, `Expected wu between 2.0 and 2.9, got ${res.wu}`);
    assert.strictEqual(res.preset, 'wall');
    assert(res.pitch_mm > 0.5 && res.pitch_mm < 0.6, `Pitch mm expected ~0.56, got ${res.pitch_mm}`);
  });

  test('Worked Example 2: 10.9" tablet (2360x1640 dpr2) @ 0.4m handheld computes scale ~0.6 - 1.1', () => {
    const res = computeDisplayScale({
      diagonal_in: 10.9,
      distance_m: 0.4,
      width_px: 1180, // CSS px for 2360 device px with dpr 2
      height_px: 820,
      dpr: 2,
      preset: 'handheld'
    });
    assert(res.wu >= 0.6 && res.wu <= 1.1, `Expected wu between 0.6 and 1.1, got ${res.wu}`);
    assert.strictEqual(res.preset, 'handheld');
  });

  test('Worked Example 3: 27" 1440p monitor @ 0.7m desk computes scale ~1.0 - 1.25', () => {
    const res = computeDisplayScale({
      diagonal_in: 27,
      distance_m: 0.7,
      width_px: 2560,
      height_px: 1440,
      dpr: 1,
      preset: 'desk'
    });
    assert(res.wu >= 0.95 && res.wu <= 1.25, `Expected wu ~1.0 - 1.25, got ${res.wu}`);
    assert.strictEqual(res.preset, 'desk');
  });

  test('auto_scale clamps strictly between 0.6 and 4.0', () => {
    // Ultra tiny display at extreme distance
    const tiny = computeDisplayScale({
      diagonal_in: 2,
      distance_m: 5.0,
      width_px: 1920,
      height_px: 1080,
      dpr: 1,
      preset: 'wall'
    });
    assert.strictEqual(tiny.auto_scale, 4.0);

    // Huge display right against eyes
    const hugeClose = computeDisplayScale({
      diagonal_in: 150,
      distance_m: 0.2,
      width_px: 7680,
      height_px: 4320,
      dpr: 1,
      preset: 'handheld'
    });
    assert.strictEqual(hugeClose.auto_scale, 0.6);
  });

  test('touch target floor enforces minimum 9mm on coarse pointers', () => {
    const res = computeDisplayScale({
      diagonal_in: 10.9,
      distance_m: 0.4,
      width_px: 1180,
      height_px: 820,
      dpr: 2,
      preset: 'handheld',
      is_coarse: true
    });
    assert(res.tap_min_px >= 40, `Touch target floor in px should be >= 40, got ${res.tap_min_px}`);
  });

  test('user_scale multiplies cleanly with auto_scale', () => {
    const base = computeDisplayScale({
      diagonal_in: 24,
      distance_m: 0.7,
      width_px: 1920,
      height_px: 1080,
      dpr: 1,
      user_scale: 1.0
    });
    const scaled = computeDisplayScale({
      diagonal_in: 24,
      distance_m: 0.7,
      width_px: 1920,
      height_px: 1080,
      dpr: 1,
      user_scale: 1.5
    });
    assert.strictEqual(Number((scaled.wu / base.wu).toFixed(2)), 1.5);
  });

  test('vw_wu and vh_wu are correctly normalized to logical stage coordinates', () => {
    const res = computeDisplayScale({
      diagonal_in: 27,
      distance_m: 0.7,
      width_px: 1920,
      height_px: 1080,
      dpr: 1
    });
    assert.strictEqual(res.vw_wu, Math.round(1920 / res.wu));
    assert.strictEqual(res.vh_wu, Math.round(1080 / res.wu));
  });

  test('guessDisplayProfile correctly identifies coarse mobile phone', () => {
    const prof = guessDisplayProfile(390, 844, 3, true);
    assert.strictEqual(prof.preset, 'handheld');
    assert.strictEqual(prof.diagonal_in, 6.5);
  });

  test('guessDisplayProfile correctly identifies 10" tablet', () => {
    const prof = guessDisplayProfile(1180, 820, 2, true);
    assert.strictEqual(prof.preset, 'handheld');
    assert.strictEqual(prof.diagonal_in, 10.9);
  });

  test('guessDisplayProfile identifies 32:9 ultrawide desktop monitor', () => {
    const prof = guessDisplayProfile(5120, 1440, 1, false);
    assert.strictEqual(prof.preset, 'desk');
    assert.strictEqual(prof.diagonal_in, 49.0);
  });

  test('guessDisplayProfile identifies massive 8K LED wall', () => {
    const prof = guessDisplayProfile(7680, 4320, 1, false);
    assert.strictEqual(prof.preset, 'wall');
    assert.strictEqual(prof.diagonal_in, 150.0);
  });

  test('handles zero or negative inputs gracefully with safe fallbacks', () => {
    const res = computeDisplayScale({
      diagonal_in: 0,
      distance_m: -1,
      width_px: 0,
      height_px: 0,
      dpr: 0,
      user_scale: 0
    });
    assert(res.wu > 0);
    assert(res.pitch_mm > 0);
    assert(res.tap_min_px >= 36);
  });

  test('computes consistent em_css_px for standard 15.6" laptop', () => {
    const res = computeDisplayScale({
      diagonal_in: 15.6,
      distance_m: 0.6,
      width_px: 1920,
      height_px: 1080,
      dpr: 1,
      preset: 'desk'
    });
    assert(res.em_css_px >= 12 && res.em_css_px <= 24);
  });
});
