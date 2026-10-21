/**
 * DimDash Motion Engine (P07)
 * Physics-based Spring Curve Generator to CSS linear() with Kiosk Bezier Fallback
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MotionEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Solve damped harmonic oscillator:
   * m * x''(t) + c * x'(t) + k * x(t) = 0
   * with initial conditions x(0) = 0, x'(0) = 0, target = 1
   */
  function solveSpring(mass, stiffness, damping, samples = 30) {
    const m = Math.max(0.01, mass);
    const k = Math.max(0.01, stiffness);
    const c = Math.max(0, damping);

    const omega0 = Math.sqrt(k / m);
    const zeta = c / (2 * Math.sqrt(m * k));

    const points = [];
    // Estimate settling duration (approx 4 / (zeta * omega0))
    const duration = zeta < 1 ? Math.min(2.0, Math.max(0.3, 4.0 / (zeta * omega0))) : 0.6;

    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * duration;
      let val = 1.0;

      if (zeta < 1.0) {
        // Underdamped
        const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
        val = 1 - Math.exp(-zeta * omega0 * t) * (Math.cos(omegaD * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(omegaD * t));
      } else if (zeta === 1.0) {
        // Critically damped
        val = 1 - Math.exp(-omega0 * t) * (1 + omega0 * t);
      } else {
        // Overdamped
        const r1 = -omega0 * (zeta - Math.sqrt(zeta * zeta - 1));
        const r2 = -omega0 * (zeta + Math.sqrt(zeta * zeta - 1));
        val = 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
      }

      points.push(Number(val.toFixed(4)));
    }

    return { points, duration: Math.round(duration * 1000) };
  }

  /**
   * Convert sample points to CSS linear(...) easing function
   */
  function pointsToCssLinear(points) {
    const n = points.length - 1;
    const parts = points.map((p, idx) => {
      const pct = Math.round((idx / n) * 100);
      return `${p} ${pct}%`;
    });
    return `linear(${parts.join(', ')})`;
  }

  // Pre-configured Presets
  const SPRING_PRESETS = {
    snappy: {
      mass: 1,
      stiffness: 260,
      damping: 26,
      fallbackBezier: 'cubic-bezier(0.18, 0.89, 0.32, 1.28)'
    },
    soft: {
      mass: 1,
      stiffness: 170,
      damping: 22,
      fallbackBezier: 'cubic-bezier(0.25, 1.0, 0.5, 1.0)'
    },
    bouncy: {
      mass: 1,
      stiffness: 200,
      damping: 14,
      fallbackBezier: 'cubic-bezier(0.34, 1.56, 0.64, 1.0)'
    }
  };

  /**
   * Check if CSS linear() easing is supported by the browser
   */
  function isLinearSupported() {
    if (typeof window === 'undefined' || !window.CSS || typeof window.CSS.supports !== 'function') {
      return false;
    }
    return window.CSS.supports('animation-timing-function', 'linear(0, 1)');
  }

  /**
   * Generate CSS easing string for a preset or custom spring
   */
  function getSpringEasing(presetName) {
    const config = SPRING_PRESETS[presetName] || SPRING_PRESETS.snappy;
    if (!isLinearSupported()) {
      return config.fallbackBezier;
    }
    const { points } = solveSpring(config.mass, config.stiffness, config.damping, 24);
    return pointsToCssLinear(points);
  }

  /**
   * Inject generated spring curves into :root CSS custom properties
   */
  function injectSpringTokens() {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const snappy = getSpringEasing('snappy');
    const soft = getSpringEasing('soft');
    const bouncy = getSpringEasing('bouncy');

    root.style.setProperty('--ease-spring-snappy', snappy);
    root.style.setProperty('--ease-spring-soft', soft);
    root.style.setProperty('--ease-spring-bouncy', bouncy);
  }

  // Auto-initialize in browser environment
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectSpringTokens);
    } else {
      injectSpringTokens();
    }
  }

  return {
    solveSpring,
    pointsToCssLinear,
    isLinearSupported,
    getSpringEasing,
    injectSpringTokens,
    SPRING_PRESETS
  };
});
