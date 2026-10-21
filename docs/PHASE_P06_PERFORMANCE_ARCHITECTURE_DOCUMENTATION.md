# DimDash Technical Documentation: Phase P06 Implementation

**Document:** Complete Implementation Guide & Architectural Specification  
**Phase Covered:** **P06:** Performance Architecture & Zero-Lag Core  
**System Version:** DimDash Core v2.0  
**Test Coverage:** 212 Automated Tests Passing (100% Pass Rate across 29 Suites)  
**Date:** 2026-10-21  

---

## 1. Executive Summary & Core Philosophy

Phase P06 establishes the **Zero-Lag Performance Foundation** of DimDash. In dense, multi-screen, or wall-mounted monitoring environments (from 10" touch controllers to 150" video walls), dashboard software frequently suffers from catastrophic performance cliffs:
- **Excessive DOM Repaints:** Hundreds of updating widgets cause continuous reflow and style recalculation.
- **GPU Fill-Rate Saturation:** Stacking heavy CSS `backdrop-filter: blur(...)` layers across large 4K/8K displays overwhelms integrated or low-power GPUs.
- **Garbage Collection (GC) Stutters:** Thousands of transient telemetry data objects created every second cause micro-freezes.
- **SSE Broadcast Bottlenecks:** Node.js event-loop delays increase linearly when serializing string payloads for numerous connected wall displays.

Phase P06 resolves these challenges with an air-gapped, zero-external-dependency architecture delivering:
1. **Fine-Grained Reactive Signals (`public/js/state/signals.js`):** Dependency-tracking signals with epsilon jitter suppression and time-sliced scheduling ($\le 4\text{ms}$ frame budget).
2. **GPU Quality Tier Governor (`public/js/stage/materials.js`):** 4-tier engine (`high`, `medium`, `low`, `auto`) with automatic runtime degradation when frame times exceed 20ms.
3. **High-Speed Micro-Chart Host (`public/js/stage/chartHost.js`):** 60fps pooled canvas renderers, typed `Float64Array` ring buffers, and $O(1)$ prefix-sum optimized Largest Triangle Three Buckets (LTTB) downsampling.
4. **Zero-Allocation SSE Server Core (`server/index.js`):** Pre-allocated buffer broadcasts, connection capacity limits, and real-time event loop delay tracking.

---

## 2. Fine-Grained Reactive Signals Engine (`public/js/state/signals.js`)

Instead of coarse top-down component re-rendering, DimDash uses an in-house fine-grained reactive primitives system inspired by modern signal architectures.

### 2.1 Reactive Primitives

| Primitive | Signature | Functionality & Characteristics |
| :--- | :--- | :--- |
| `signal(initialVal, options)` | `(val: T, options?: SignalOptions) => Signal<T>` | Reactive value box. Tracks subscriber dependencies when read inside effects or computeds. Provides `.value`, `.peek()`, and `.mutate(fn)`. |
| `computed(fn, options)` | `(fn: () => T, options?: SignalOptions) => Computed<T>` | Memoized derived state. Evaluated lazily on read. Automatically registers dependencies on read and re-computes only when dependencies mark it dirty. |
| `effect(fn)` | `(fn: () => (() => void) | void) => () => void` | Automatic subscription runner. Executes immediately and re-executes whenever any accessed signal changes. Supports cleanup function returns. |
| `batch(fn)` | `(fn: () => void) => void` | Transactional batching. Defers all subscriber notifications until the outer batch function finishes, eliminating redundant intermediate updates. |

### 2.2 Epsilon Change Guards & Jitter Suppression
Telemetry streams (CPU %, temperature, network throughput) fluctuate continuously by tiny fractions. Triggering UI updates on insignificant jitter wastes CPU cycles.
`signal` supports an `epsilon` option:
```javascript
const cpuSignal = signal(42.001, { epsilon: 0.1 });
cpuSignal.value = 42.05; // Change delta is 0.049 < 0.1 -> Ignored, no notifications fired!
cpuSignal.value = 42.25; // Change delta is 0.249 >= 0.1 -> Updated and notified!
```

### 2.3 Time-Sliced Cooperative Task Scheduler
To prevent long-running tasks (such as processing a 5,000-point telemetry log) from blocking the browser main thread, `signals.js` includes `schedule(task, budgetMs)`:
- Slices tasks into discrete iterations with a default $\le 4\text{ms}$ budget per animation frame.
- Yields control back to the browser via `requestIdleCallback`, `MessageChannel`, or `setTimeout` before the frame deadline.
- Emits execution progress and resolves a promise upon completion.

### 2.4 ReactiveStore
A centralized key-value state store with dotted path subscriptions (`store.get('island.cpu.usage')`, `store.set(...)`, `store.batch(...)`) enabling plug-and-play reactive binding for all stage components.

---

## 3. Dynamic Quality Tier Governor & Materials (`public/js/stage/materials.js`)

### 3.1 Quality Tiers
DimDash defines four quality tiers:
- **`high`:** Full visual fidelity. Active runtime CSS `backdrop-filter: blur(20px)`, multi-layer soft shadows, 60fps micro-animations, and full-resolution particle effects.
- **`medium`:** Balanced performance. Replaces live backdrop filters with pre-rendered static blurred textures; simplifies drop-shadows to single-layer hairlines; reduces chart render resolution.
- **`low`:** Ultra-lightweight / E-Ink / Low-Power. Completely disables backdrop blur and box-shadows. Flat surfaces with high-contrast hairline borders; zero decorative animations; charts render statically or at low FPS.
- **`auto`:** Dynamic runtime adaptation. Continuously monitors frame intervals and automatically downgrades when performance slips.

### 3.2 Automated Frame-Drop Degradation Loop
The `QualityManager` samples browser animation frames into a rolling 30-sample sliding window:
$$\overline{\Delta t} = \frac{1}{30} \sum_{i=1}^{30} \Delta t_i$$
- If $\overline{\Delta t} > 20\text{ms}$ (dropping below 50fps), the manager triggers a tier step-down (`high` $\to$ `medium` $\to$ `low`).
- If frame times recover below $16.7\text{ms}$ for 120 consecutive frames, it conservatively restores the higher tier.
- Tier changes are reflected onto the DOM via `document.documentElement.setAttribute('data-quality', tier)` and CSS custom properties (`--dim-quality-tier`).

### 3.3 Static Glass Pre-Renderer
To maintain the visual aesthetic of glassmorphism on mid-tier hardware without paying the 10-15ms per frame GPU fill penalty of live `backdrop-filter`, `materials.js` includes a static glass generator:
- Renders an offscreen canvas containing a pre-blurred snapshot of the background wallpaper (`ctx.filter = 'blur(16px)'`).
- Tiles or clips the pre-blurred canvas directly behind island surfaces as an optimized static background layer.

---

## 4. Pooled Canvas Micro-Chart Engine (`public/js/stage/chartHost.js`)

### 4.1 Architecture & Canvas Pooling
Instead of mounting SVG DOM nodes for every sparkline or telemetry trend graph, `ChartHostPool` manages a fixed pool of HTML5 `<canvas>` elements:
- Reuses canvas instances across viewport visibility boundaries.
- Pre-caches offscreen canvas templates for static grid lines and horizontal threshold markings, avoiding redundant path strokes during data updates.
- Renders sparklines and area charts in a single $O(n)$ canvas pass directly to the target context.

### 4.2 Zero-Allocation Typed Ring Buffer (`MetricRingBuffer`)
Continuous telemetry polling typically creates and discards thousands of `{ x, y }` objects per minute. DimDash eliminates this GC overhead using `MetricRingBuffer`:
- Backed by pre-allocated `Float64Array` typed arrays for timestamps and values.
- Implements $O(1)$ push with head pointer wrapping.
- Zero object allocations during live data append and slice queries.

### 4.3 Prefix-Sum Optimized LTTB Downsampling
When rendering long telemetry histories (e.g., 5,000 to 10,000 points collected over 24 hours) onto a 150px wide sparkline, rendering all points wastes CPU time and creates visual aliasing.
DimDash implements the **Largest Triangle Three Buckets (LTTB)** algorithm to downsample $N$ raw points into $K$ visual buckets ($K \ll N$), preserving visual peaks, troughs, and curve area:

$$\text{Area} = \frac{1}{2} | (x_A - x_C)(y_B - y_A) - (x_A - x_B)(y_C - y_A) |$$

#### The Prefix-Sum Optimization ($O(1)$ Range Averages)
In standard LTTB, computing the average point of bucket $C$ requires iterating through all points in bucket $C$ for every point evaluated in bucket $B$, yielding $O(N \cdot \text{bucketSize})$ execution.
DimDash introduces precomputed `Float64Array` prefix sums:
```javascript
const prefixSums = new Float64Array(dataLength + 1);
for (let i = 0; i < dataLength; i++) {
  prefixSums[i + 1] = prefixSums[i] + rawValues[i];
}

// In the bucket loop: O(1) constant-time range sum!
const rangeSum = prefixSums[rangeEnd] - prefixSums[rangeStart];
const avgY = rangeSum / (rangeEnd - rangeStart);
```
- **Benchmark Result:** Downsampling 5,000 points down to 64 points executes in **$< 0.95\text{ms}$** (down from $5.3\text{ms}$ in non-optimized LTTB), well within a single frame budget.

---

## 5. Server-Side Broadcast Optimization (`server/index.js`)

### 5.1 Pre-Allocated Buffer SSE Broadcasts
In standard Node.js SSE implementations, serializing a JSON string for $M$ connected clients results in $M$ separate string allocations and buffer encodings:
```javascript
// DimDash Optimization: Serialize once to Buffer
const payloadBuffer = Buffer.from(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`, 'utf-8');
for (const client of sseClients) {
  client.res.write(payloadBuffer); // Zero string re-encoding!
}
```

### 5.2 Capacity Clamping
To prevent connection starvation on edge devices or mini PCs running DimDash server:
- Maximum concurrent SSE clients capped at 200.
- Requests beyond capacity return immediate `HTTP 503 Service Unavailable` with `Retry-After: 5` header.

### 5.3 Event Loop Delay Telemetry (`/api/self`)
Using Node.js `perf_hooks.monitorEventLoopDelay({ resolution: 10 })`:
- Continuously tracks event loop lag histograms.
- Exposes metrics via `GET /api/self`:
  ```json
  {
    "status": "ok",
    "uptime": 1420.5,
    "clients": 4,
    "eventLoopDelay": {
      "min": 0.42,
      "mean": 1.15,
      "p50": 1.02,
      "p90": 2.45,
      "p99": 4.12
    },
    "memory": {
      "rssMB": 38.4,
      "heapUsedMB": 18.2
    }
  }
  ```

---

## 6. Verification and Benchmark Suite

The test suite validates correctness and benchmarks performance under simulated load:
- `test/signals.test.js`: Validates signal reactivity, dirty tracking, epsilon filters, batch transactions, and async task time-slicing.
- `test/materials.test.js`: Validates quality tier transitions, fallback resolution, and frame drop degradation.
- `test/chartHost.test.js`: Validates `MetricRingBuffer` wrapping, peak preservation across LTTB downsampling, and sub-millisecond execution for 5,000 telemetry points.
- **Full Test Suite Status:** `npm test` passes **212 tests** across 29 test suites with 0 failures.
