/**
 * DimDash Physical & Pixel Display Scale Engine
 * Computes responsive World Unit (--wu) based on screen pixel dimensions,
 * plus physical display scale helpers across 10" to 150" displays.
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
   * Compute pure pixel-proportional scale (--wu and --font-scale) directly from viewport pixel size.
   * Ensures 100% consistent proportions across normal monitors (720p/1080p/1440p) and huge 4K/8K video walls.
   * @param {Object} options
   *   - width_px: Viewport width in CSS px
   *   - height_px: Viewport height in CSS px
   *   - ref_w: Reference design canvas width in px (default: 1840)
   *   - ref_h: Reference design canvas height in px (default: 920)
   *   - user_scale: Manual multiplier (default: 1)
   *   - is_coarse: Boolean indicating touch / coarse pointer
   * @returns {Object} pixel scale metrics
   */
  function computePixelScale(options = {}) {
    const userScale = Math.max(0.2, Number(options.user_scale) || 1.0);
    const widthCss = Math.max(200, Number(options.width_px) || 1920);
    const heightCss = Math.max(200, Number(options.height_px) || 1080);
    const refW = Math.max(320, Number(options.ref_w || options.ref_width_px) || 1920);
    const refH = Math.max(320, Number(options.ref_h || options.ref_height_px) || 1080);
    const isCoarse = !!options.is_coarse;

    let autoScale = 1.0;
    let presetName = 'desk';

    if (widthCss <= 640) {
      // Mobile flow viewport: scale relative to 390px mobile baseline
      autoScale = Math.min(Math.max(widthCss / 390, 0.78), 1.25);
      presetName = 'handheld';
    } else {
      // Desktop monitors, laptops, ultrawides, and video walls:
      // Scale strictly by pixel ratio against reference canvas bounds so nothing overflows or jumbles
      const scaleX = widthCss / refW;
      const scaleY = heightCss / refH;
      autoScale = Math.min(scaleX, scaleY);
      autoScale = Math.min(Math.max(autoScale, 0.45), 8.0);
      presetName = widthCss >= 3200 ? 'wall' : 'desk';
    }

    const wu = Number((autoScale * userScale).toFixed(4));
    const fontScale = Number(Math.min(Math.max((widthCss / 1920) * userScale, 0.75), 5.0).toFixed(4));
    const tapMinPx = Math.max(32, Math.round((isCoarse ? 44 : 36) * Math.min(Math.max(wu, 0.8), 2.5)));

    return {
      wu,
      font_scale: fontScale,
      auto_scale: Number(autoScale.toFixed(4)),
      user_scale: userScale,
      em_css_px: Number((16 * wu).toFixed(2)),
      tap_min_px: tapMinPx,
      preset: presetName,
      is_coarse: isCoarse,
      width_px: widthCss,
      height_px: heightCss,
      vw_wu: Math.round(widthCss / wu),
      vh_wu: Math.round(heightCss / wu)
    };
  }

  /**
   * Compute physical display metrics and --wu
   * @param {Object} options
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

    const wu = Number(metrics.wu) || 1.0;
    const fontScale = Number(metrics.font_scale) || wu;
    el.style.setProperty('--wu', wu);
    el.style.setProperty('--font-scale', fontScale);
    el.style.setProperty('--tap-min', `${metrics.tap_min_px || 40}px`);
    // Root font-size scales proportionally to viewport pixel size (--wu) for all rem-based UI,
    // while stage items use pure px * var(--wu) so nothing ever double-scales.
    const rootFontPx = Math.min(Math.max(16 * wu, 11), 64);
    el.style.fontSize = `${rootFontPx.toFixed(2)}px`;
    if (metrics.preset) {
      el.setAttribute('data-preset', metrics.preset);
    }
  }

  // Auto-initialize pixel-based root scale in browser environments (Dashboard, Server Monitor, Admin Studio)
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    let scaleRaf = null;
    const syncGlobalViewportScale = () => {
      scaleRaf = null;
      // If StageRenderer is actively managing a visible stage viewport, let StageRenderer drive it
      const stageVp = document.getElementById('stageViewport');
      if (stageVp && stageVp.style.display !== 'none' && window.StageRenderer && window.StageRenderer.viewport) {
        return;
      }
      const vw = Math.max(window.innerWidth || 1920, 200);
      const vh = Math.max(window.innerHeight || 1080, 200);
      const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      const metrics = computePixelScale({
        width_px: vw,
        height_px: vh,
        ref_w: 1920,
        ref_h: 1080,
        user_scale: 1.0,
        is_coarse: isCoarse
      });
      applyToRoot(metrics, document.documentElement);
    };

    syncGlobalViewportScale();
    window.addEventListener('resize', () => {
      if (!scaleRaf) {
        scaleRaf = window.requestAnimationFrame(syncGlobalViewportScale);
      }
    }, { passive: true });
  }

  return {
    THETA_PRESETS,
    DISPLAY_PRESETS,
    computePixelScale,
    computeDisplayScale,
    guessDisplayProfile,
    applyToRoot
  };
});
