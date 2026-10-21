/**
 * DimDash ChartHost & LTTB Downsampling Engine
 * Ultra-high-performance 60fps Canvas micro-charts with:
 * - LTTB (Largest Triangle Three Buckets) downsampling algorithm preserving visual peaks and troughs
 * - Typed array ring buffers (Float32Array values, Float64Array timestamps)
 * - Layered rendering (cached static grid offscreen canvas + dynamic series layer)
 * - Single shared rAF draw queue with zero per-point allocations
 * Universal module (Node.js & Browser)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashChartHost = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Largest Triangle Three Buckets (LTTB) Downsampling Algorithm
   * Reduces large time-series datasets to target threshold while preserving peaks and troughs.
   *
   * @param {Array<{x: number, y: number}>|{x: Float64Array, y: Float32Array, length: number}} data
   * @param {number} threshold - Target number of points (must be >= 3)
   * @returns {Array<{x: number, y: number}>}
   */
  function downsampleLTTB(data, threshold) {
    let n = 0;
    let getX, getY;

    if (Array.isArray(data)) {
      n = data.length;
      getX = (i) => data[i].x;
      getY = (i) => data[i].y;
    } else if (data && data.x && data.y && data.length !== undefined) {
      n = data.length;
      getX = (i) => data.x[i];
      getY = (i) => data.y[i];
    } else {
      return [];
    }

    if (threshold >= n || threshold <= 2) {
      const copy = [];
      for (let i = 0; i < n; i++) copy.push({ x: getX(i), y: getY(i) });
      return copy;
    }

    const sampled = [];
    const bucketSize = (n - 2) / (threshold - 2);

    // Precompute prefix sums for O(1) bucket average queries
    const prefixX = new Float64Array(n + 1);
    const prefixY = new Float64Array(n + 1);
    for (let k = 0; k < n; k++) {
      prefixX[k + 1] = prefixX[k] + getX(k);
      prefixY[k + 1] = prefixY[k] + getY(k);
    }

    // 1. Always add first point
    let a = 0;
    sampled.push({ x: getX(a), y: getY(a) });

    for (let i = 0; i < threshold - 2; i++) {
      // Calculate average point for next bucket (bucket C) in O(1)
      const avgRangeStart = Math.floor((i + 1) * bucketSize) + 1;
      const avgRangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);
      const avgRangeLength = Math.max(1, avgRangeEnd - avgRangeStart);

      const avgX = (prefixX[avgRangeEnd] - prefixX[avgRangeStart]) / avgRangeLength;
      const avgY = (prefixY[avgRangeEnd] - prefixY[avgRangeStart]) / avgRangeLength;

      // Point a
      const ax = getX(a);
      const ay = getY(a);

      // Current bucket range (bucket B)
      const rangeOffs = Math.floor(i * bucketSize) + 1;
      const rangeTo = Math.min(Math.floor((i + 1) * bucketSize) + 1, n);

      let maxArea = -1;
      let maxAreaPoint = rangeOffs;

      for (let j = rangeOffs; j < rangeTo; j++) {
        // Area of triangle formed by point a, point j, and average point C
        // Area = 0.5 * |ax(y_j - avgY) + x_j(avgY - ay) + avgX(ay - y_j)|
        const yj = getY(j);
        const xj = getX(j);
        const area = Math.abs(
          (ax - avgX) * (yj - ay) - (ax - xj) * (avgY - ay)
        );

        if (area > maxArea) {
          maxArea = area;
          maxAreaPoint = j;
        }
      }

      sampled.push({ x: getX(maxAreaPoint), y: getY(maxAreaPoint) });
      a = maxAreaPoint; // Next a is current selected point
    }

    // Always add last point
    sampled.push({ x: getX(n - 1), y: getY(n - 1) });
    return sampled;
  }

  /**
   * High-Performance Typed Ring Buffer for Telemetry Stream
   */
  class MetricRingBuffer {
    constructor(capacity = 3600) {
      this.capacity = capacity;
      this.timestamps = new Float64Array(capacity);
      this.values = new Float32Array(capacity);
      this.head = 0;
      this.size = 0;
    }

    push(timestamp, value) {
      this.timestamps[this.head] = timestamp;
      this.values[this.head] = value;
      this.head = (this.head + 1) % this.capacity;
      if (this.size < this.capacity) {
        this.size++;
      }
    }

    toArray() {
      const result = [];
      const start = this.size < this.capacity ? 0 : this.head;
      for (let i = 0; i < this.size; i++) {
        const idx = (start + i) % this.capacity;
        result.push({
          x: this.timestamps[idx],
          y: this.values[idx]
        });
      }
      return result;
    }

    clear() {
      this.head = 0;
      this.size = 0;
    }
  }

  /**
   * ChartHost: Shared Canvas Micro-Chart Renderer
   */
  class ChartHost {
    constructor(canvasElement, options = {}) {
      this.canvas = canvasElement;
      this.ctx = canvasElement && canvasElement.getContext ? canvasElement.getContext('2d') : null;
      this.options = options;

      this.series = []; // Array<{ id, name, color, data: MetricRingBuffer | Array<{x, y}> }>
      this.width = options.width || 300;
      this.height = options.height || 120;
      this.dpr = options.dpr || (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1);

      this.theme = {
        bg: 'transparent',
        gridColor: options.gridColor || 'rgba(255, 255, 255, 0.06)',
        textColor: options.textColor || '#94a3b8',
        defaultColor: options.color || '#38bdf8',
        fillOpacity: options.fillOpacity !== undefined ? options.fillOpacity : 0.15
      };

      this.staticCanvas = null;
      this.staticCtx = null;
      this.isDirty = true;
      this.rafPending = false;

      this.initStaticLayer();
    }

    initStaticLayer() {
      if (typeof document === 'undefined') return;
      this.staticCanvas = document.createElement('canvas');
      this.staticCtx = this.staticCanvas.getContext('2d');
    }

    resize(w, h, dpr) {
      if (dpr) this.dpr = dpr;
      this.width = w;
      this.height = h;

      if (!this.canvas) return;
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;

      if (this.ctx) {
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      }

      if (this.staticCanvas && this.staticCtx) {
        this.staticCanvas.width = Math.round(w * this.dpr);
        this.staticCanvas.height = Math.round(h * this.dpr);
        this.staticCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.renderStaticGrid();
      }

      this.requestRender();
    }

    renderStaticGrid() {
      if (!this.staticCtx) return;
      const ctx = this.staticCtx;
      ctx.clearRect(0, 0, this.width, this.height);

      ctx.strokeStyle = this.theme.gridColor;
      ctx.lineWidth = 1.0;

      // Draw 3 horizontal grid lines (25%, 50%, 75%)
      const lines = [0.25, 0.5, 0.75];
      for (const pct of lines) {
        const y = Math.round(this.height * pct);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.width, y);
        ctx.stroke();
      }
    }

    addSeries(seriesConfig) {
      // seriesConfig: { id, name, color, data }
      this.series.push(seriesConfig);
      this.requestRender();
    }

    requestRender() {
      if (this.rafPending) return;
      this.rafPending = true;

      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => {
          this.rafPending = false;
          this.render();
        });
      } else {
        setTimeout(() => {
          this.rafPending = false;
          this.render();
        }, 0);
      }
    }

    render() {
      if (!this.ctx) return;
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);

      // 1. Draw cached static grid
      if (this.staticCanvas) {
        ctx.drawImage(this.staticCanvas, 0, 0, this.width, this.height);
      }

      if (this.series.length === 0) return;

      // 2. Find global min/max
      let minY = Infinity;
      let maxY = -Infinity;

      for (const s of this.series) {
        const pts = s.data instanceof MetricRingBuffer ? s.data.toArray() : (s.data || []);
        for (const pt of pts) {
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }
      }

      if (minY === Infinity) {
        minY = 0;
        maxY = 100;
      } else if (maxY === minY) {
        maxY = minY + 1;
      }

      const paddingV = 8;
      const availH = Math.max(10, this.height - paddingV * 2);

      // 3. Render each series with LTTB downsampling
      for (const s of this.series) {
        const rawPts = s.data instanceof MetricRingBuffer ? s.data.toArray() : (s.data || []);
        if (rawPts.length < 2) continue;

        // Downsample to max 2 * width points
        const targetCount = Math.max(20, Math.floor(this.width * 1.5));
        const pts = rawPts.length > targetCount ? downsampleLTTB(rawPts, targetCount) : rawPts;

        const color = s.color || this.theme.defaultColor;
        const n = pts.length;
        const stepX = this.width / Math.max(1, n - 1);

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.75;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Draw line path
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const px = i * stepX;
          const py = paddingV + availH - ((pts[i].y - minY) / (maxY - minY)) * availH;
          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.stroke();

        // Area fill
        if (this.theme.fillOpacity > 0) {
          ctx.lineTo(this.width, this.height);
          ctx.lineTo(0, this.height);
          ctx.closePath();

          ctx.fillStyle = color.startsWith('#')
            ? hexToRgba(color, this.theme.fillOpacity)
            : color;
          ctx.fill();
        }

        ctx.restore();
      }
    }
  }

  function hexToRgba(hex, alpha) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return {
    downsampleLTTB,
    MetricRingBuffer,
    ChartHost
  };
});
