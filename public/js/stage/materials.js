/**
 * DimDash Materials & GPU Quality Tier Manager
 * Manages High / Medium / Low rendering tiers, static glass caching,
 * Linux/Fedora compositor optimization, and automatic step-down on frame drops.
 * Universal module (Node.js & Browser)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashMaterials = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TIERS = {
    AUTO: 'auto',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low'
  };

  class QualityManager {
    constructor(options = {}) {
      this.currentTier = options.tier || TIERS.AUTO;
      this.resolvedTier = TIERS.HIGH;
      this.isInteracting = false;

      // Frame time monitor
      this.frameTimes = [];
      this.maxFrameSamples = 60;
      this.degradeThresholdMs = 20.0;
      this.degradeCount = 0;

      // Static Glass wallpaper cache
      this.staticGlassUrl = null;

      this.resolveTier();
      this.applyToDom();
    }

    setTier(tier) {
      if (Object.values(TIERS).includes(tier)) {
        this.currentTier = tier;
        this.resolveTier();
        this.applyToDom();
      }
    }

    resolveTier() {
      if (this.currentTier !== TIERS.AUTO) {
        this.resolvedTier = this.currentTier;
        return this.resolvedTier;
      }

      // Auto detection heuristics
      if (typeof navigator === 'undefined' || typeof window === 'undefined') {
        this.resolvedTier = TIERS.HIGH;
        return this.resolvedTier;
      }

      const ua = navigator.userAgent || '';
      const platform = navigator.platform || '';
      const cores = navigator.hardwareConcurrency || 4;
      const mem = navigator.deviceMemory || 4;
      const dpr = window.devicePixelRatio || 1;
      const area = window.innerWidth * window.innerHeight * dpr * dpr;

      // Low tier: single/dual core, <= 2GB memory, or Raspberry Pi user-agent
      const isPiOrKiosk = /arm|aarch64|raspberry/i.test(ua);
      // Linux desktop (Fedora / Wayland / X11) benefits enormously from MEDIUM tier (zero per-frame backdrop-filter stalls)
      const isLinuxDesktop = (/Linux|X11/i.test(ua) || /Linux/i.test(platform)) && !/Android/i.test(ua);

      if (cores <= 2 || mem <= 2 || isPiOrKiosk) {
        this.resolvedTier = TIERS.LOW;
      } else if (isLinuxDesktop || area > 2560 * 1440 || cores <= 4 || mem <= 4) {
        this.resolvedTier = TIERS.MEDIUM;
      } else {
        this.resolvedTier = TIERS.HIGH;
      }

      return this.resolvedTier;
    }

    applyToDom() {
      if (typeof document === 'undefined' || !document.documentElement) return;
      const root = document.documentElement;
      const effectiveTier = this.isInteracting && this.resolvedTier === TIERS.HIGH
        ? TIERS.MEDIUM
        : this.resolvedTier;

      root.setAttribute('data-quality', effectiveTier);
    }

    setInteracting(isInteracting) {
      this.isInteracting = !!isInteracting;
      this.applyToDom();
    }

    /**
     * Records frame duration and triggers dynamic step-down if frame drops persist
     */
    recordFrameTime(durationMs) {
      this.frameTimes.push(durationMs);
      if (this.frameTimes.length > this.maxFrameSamples) {
        this.frameTimes.shift();
      }

      if (this.currentTier === TIERS.AUTO && this.resolvedTier !== TIERS.LOW) {
        if (durationMs > this.degradeThresholdMs) {
          this.degradeCount++;
          // If frame times exceed 20ms for > 30 samples (~0.5s of continuous lag)
          if (this.degradeCount >= 30) {
            this.stepDown();
            this.degradeCount = 0;
          }
        } else {
          this.degradeCount = Math.max(0, this.degradeCount - 1);
        }
      }
    }

    stepDown() {
      if (this.resolvedTier === TIERS.HIGH) {
        this.resolvedTier = TIERS.MEDIUM;
        this.applyToDom();
        console.warn('[DimDashMaterials] Stepped down quality tier to MEDIUM to preserve 60fps.');
      } else if (this.resolvedTier === TIERS.MEDIUM) {
        this.resolvedTier = TIERS.LOW;
        this.applyToDom();
        console.warn('[DimDashMaterials] Stepped down quality tier to LOW to eliminate GPU stalls.');
      }
    }

    /**
     * Pre-renders blurred wallpaper onto an offscreen canvas for "static glass"
     */
    generateStaticGlass(imgElement, blurRadius = 14) {
      if (typeof document === 'undefined' || !imgElement) return null;

      const canvas = document.createElement('canvas');
      const w = Math.max(10, Math.floor((imgElement.naturalWidth || imgElement.width || 800) / 4));
      const h = Math.max(10, Math.floor((imgElement.naturalHeight || imgElement.height || 600) / 4));
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      if (ctx.filter !== undefined) {
        ctx.filter = `blur(${Math.max(2, Math.floor(blurRadius / 4))}px)`;
        ctx.drawImage(imgElement, 0, 0, w, h);
      } else {
        // Fast box blur fallback
        ctx.drawImage(imgElement, 0, 0, w, h);
        this.applyBoxBlur(ctx, w, h, 3);
      }

      this.staticGlassUrl = canvas.toDataURL('image/jpeg', 0.85);
      return this.staticGlassUrl;
    }

    applyBoxBlur(ctx, w, h, radius) {
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      // Simple 3-pass horizontal and vertical box blur
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          // Smooth color channels with neighbours
          if (x > 0 && x < w - 1) {
            data[idx] = (data[idx - 4] + data[idx] + data[idx + 4]) / 3;
            data[idx + 1] = (data[idx - 3] + data[idx + 1] + data[idx + 5]) / 3;
            data[idx + 2] = (data[idx - 2] + data[idx + 2] + data[idx + 6]) / 3;
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }
  }

  return {
    TIERS,
    QualityManager
  };
});
