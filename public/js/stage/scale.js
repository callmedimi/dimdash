/**
 * DimDash Physical Display Scale Engine
 * Computes angularly constant World Unit (--wu) and touch targets across 10" to 150" displays.
 * Universal module (Node.js & Browser)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashScale = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Body text cap-height angular subtended degrees per viewing preset
  const THETA_PRESETS = {
    handheld: 0.22, // ~0.22 deg for phone / 10" tablet @ ~0.4m
    desk: 0.25,     // ~0.25 deg for desktop monitor @ ~0.7m
    wall: 0.35,     // ~0.35 deg for meeting room / control room video wall
    tv: 0.35,       // ~0.35 deg for living room TV @ ~2.5m - 3m
    far: 0.45       // ~0.45 deg for high-distance ambient billboard / signage
  };

  // Known hardware heuristics (diagonal in inches, typical distance in meters, default preset)
  const DISPLAY_PRESETS = {
    'tablet-10': { diagonal_in: 10.9, distance_m: 0.4, preset: 'handheld' },
    'laptop-13': { diagonal_in: 13.3, distance_m: 0.55, preset: 'desk' },
    'laptop-15': { diagonal_in: 15.6, distance_m: 0.6, preset: 'desk' },
    'monitor-24': { diagonal_in: 24.0, distance_m: 0.7, preset: 'desk' },
    'monitor-27': { diagonal_in: 27.0, distance_m: 0.7, preset: 'desk' },
    'monitor-32': { diagonal_in: 32.0, distance_m: 0.75, preset: 'desk' },
    'ultrawide-34': { diagonal_in: 34.0, distance_m: 0.75, preset: 'desk' },
    'ultrawide-49': { diagonal_in: 49.0, distance_m: 0.8, preset: 'desk' },
    'tv-55': { diagonal_in: 55.0, distance_m: 2.5, preset: 'tv' },
    'tv-75': { diagonal_in: 75.0, distance_m: 3.0, preset: 'tv' },
    'wall-98': { diagonal_in: 98.0, distance_m: 3.0, preset: 'wall' },
    'wall-150': { diagonal_in: 150.0, distance_m: 4.5, preset: 'wall' }
  };

  /**
   * Compute physical display metrics and --wu
   * @param {Object} options
   *   - diagonal_in: Screen diagonal in inches
   *   - distance_m: Viewer distance in meters
   *   - width_px: Viewport or screen width in CSS px
   *   - height_px: Viewport or screen height in CSS px
   *   - dpr: Device pixel ratio (default: 1)
   *   - preset: 'handheld' | 'desk' | 'wall' | 'tv' | 'far'
   *   - user_scale: Manual multiplier (default: 1)
   *   - is_coarse: Boolean indicating touch / coarse pointer
   * @returns {Object} scale metrics
   */
  function computeDisplayScale(options = {}) {
    const dpr = Math.max(0.25, Number(options.dpr) || 1);
    const userScale = Math.max(0.2, Number(options.user_scale) || 1);
    const widthCss = Math.max(100, Number(options.width_px) || 1920);
    const heightCss = Math.max(100, Number(options.height_px) || 1080);

    // Device resolution in physical device pixels
    const widthDevPx = widthCss * dpr;
    const heightDevPx = heightCss * dpr;
    const diagDevPx = Math.hypot(widthDevPx, heightDevPx);

    // Diagonal in inches
    const diagonalIn = Math.max(4.0, Number(options.diagonal_in) || 27.0);

    // Pixel pitch in millimeters (physical size of one device pixel)
    const pitchMm = (diagonalIn * 25.4) / diagDevPx;

    // Viewing distance in millimeters
    const distanceM = Math.max(0.15, Number(options.distance_m) || 0.7);
    const distanceMm = distanceM * 1000;

    // Subtended angle theta (in degrees, then converted to radians)
    const presetName = options.preset && THETA_PRESETS[options.preset] ? options.preset : 'desk';
    const thetaDeg = THETA_PRESETS[presetName] || 0.25;
    const thetaRad = (thetaDeg * Math.PI) / 180;

    // Required cap-height and em size in physical millimeters
    const capMm = 2 * distanceMm * Math.tan(thetaRad / 2);
    const emMm = capMm / 0.70; // 0.70 is standard typography ratio of cap-height to em

    // Desired body font size in CSS pixels
    const emCssPx = emMm / pitchMm / dpr;

    // Auto-scale relative to 16px baseline design, clamped [0.6, 4.0]
    const rawScale = emCssPx / 16;
    const autoScale = Math.min(Math.max(rawScale, 0.6), 4.0);

    // Final World Unit (CSS px per logical design unit)
    const wu = userScale * autoScale;

    // Touch target minimum: 9mm physical floor on coarse / touch screens
    const isCoarse = !!options.is_coarse;
    const tapMinPx = (9.0 / pitchMm / dpr);

    return {
      wu: Number(wu.toFixed(4)),
      auto_scale: Number(autoScale.toFixed(4)),
      user_scale: userScale,
      pitch_mm: Number(pitchMm.toFixed(5)),
      em_css_px: Number(emCssPx.toFixed(2)),
      tap_min_px: Math.max(36, Math.round(tapMinPx)),
      diagonal_in: diagonalIn,
      distance_m: distanceM,
      preset: presetName,
      is_coarse: isCoarse,
      vw_wu: Math.round(widthCss / wu),
      vh_wu: Math.round(heightCss / wu)
    };
  }

  /**
   * Guess a display profile when no user configuration is present
   */
  function guessDisplayProfile(widthPx, heightPx, dpr, isCoarse) {
    const width = widthPx || (typeof window !== 'undefined' ? window.innerWidth : 1920);
    const height = heightPx || (typeof window !== 'undefined' ? window.innerHeight : 1080);
    const ratio = dpr || (typeof window !== 'undefined' ? window.devicePixelRatio : 1);
    const coarse = isCoarse !== undefined ? isCoarse : (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

    const devW = width * ratio;
    const devH = height * ratio;

    if (coarse) {
      if (Math.max(width, height) < 950) {
        return { diagonal_in: 6.5, distance_m: 0.35, preset: 'handheld' };
      }
      return { diagonal_in: 10.9, distance_m: 0.4, preset: 'handheld' };
    }

    if (devW >= 7000 || devH >= 3800) {
      return { diagonal_in: 150.0, distance_m: 4.5, preset: 'wall' };
    }
    if (devW >= 3400 && devH >= 2000 && width > 2400) {
      return { diagonal_in: 98.0, distance_m: 3.0, preset: 'wall' };
    }
    if (devW / devH > 2.5) {
      return { diagonal_in: 49.0, distance_m: 0.8, preset: 'desk' };
    }
    if (devW / devH > 2.0) {
      return { diagonal_in: 34.0, distance_m: 0.75, preset: 'desk' };
    }
    if (width >= 2400) {
      return { diagonal_in: 32.0, distance_m: 0.75, preset: 'desk' };
    }
    if (width >= 1800) {
      return { diagonal_in: 27.0, distance_m: 0.7, preset: 'desk' };
    }
    if (width >= 1200) {
      return { diagonal_in: 24.0, distance_m: 0.7, preset: 'desk' };
    }

    return { diagonal_in: 15.6, distance_m: 0.6, preset: 'desk' };
  }

  /**
   * Apply calculated scale to document :root
   */
  function applyToRoot(metrics, rootElement) {
    const el = rootElement || (typeof document !== 'undefined' ? document.documentElement : null);
    if (!el || !el.style) return;

    el.style.setProperty('--wu', metrics.wu);
    el.style.setProperty('--tap-min', `${metrics.tap_min_px}px`);
    el.style.fontSize = `calc(16px * var(--wu))`;
    el.setAttribute('data-preset', metrics.preset);
  }

  return {
    THETA_PRESETS,
    DISPLAY_PRESETS,
    computeDisplayScale,
    guessDisplayProfile,
    applyToRoot
  };
});
