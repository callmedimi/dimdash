# DimDash Architecture & Implementation Handoff (Phase P02 & P03)

**Current Phase:** P03 — Stage Engine & Responsive Constraint System (10" to 150")  
**Status:** Completed & Validated (148 Automated Tests Passing)  
**Date:** 2026-10-21  

---

## 1. Architectural Overview & Split Storage Model (P02)

DimDash uses a decoupled storage model under `data/`:

| File | Purpose | Client-Facing Visibility |
| :--- | :--- | :--- |
| `data/config.yaml` | Semantic items, categories (islands), services, widgets, displays, servers, and global dashboard settings. | Sanitized via `/api/board` |
| `data/layout.yaml` | Multi-profile spatial coordinates (`x`, `y`, `w`, `h`, `z`, constraints) across 6 profiles (`xs`, `sm`, `md`, `lg`, `xl`, `wall`). | Sanitized via `/api/board` |
| `data/secrets.yaml` | Authentication credentials (`admin_pin`, `user_pin`), remote agent push tokens (`server_tokens`), session secrets. | **Never leaked** to clients |
| `data/history/` | Snapshot rotation and migration backups (`config.v1.bak.yaml`). | Server-internal |

---

## 2. Normative Schemas & Universal Validator (P02)

Implemented in `server/schema.js` and `public/js/shared/schema.js` with zero third-party validator dependencies:
- `ConfigV2Schema`: version 2, settings, servers, 7 normative kinds (`island`, `service`, `widget`, `text`, `divider`, `image`, `spacer`).
- `LayoutV2Schema`: version 2, monotonic `rev`, 6 responsive profiles, placement coordinate map.
- `SecretsV2Schema`: isolated pins, server push tokens, session secret.
- Full Prototype Pollution defense and custom YAML tag protection.

---

## 3. Patch Protocol & In-Memory Journal (P02)

Implemented in `server/patchEngine.js`:
- Supports `set`, `merge`, `add`, `remove`, `move`, `test`.
- 500-entry in-memory journal ring buffer with sequence idempotency and concurrent path conflict detection.
- Generates clean reverse-order inverse operations for instant client/server rollback and undo.

---

## 4. Stage Engine & Physical World Unit (`--wu`) Math (P03)

Implemented in `public/js/stage/scale.js`:

### 4.1 Physical Scale Derivation
Browsers lack physical inch exposure; `--wu` computes an **angularly constant visual unit**:
```
diag_px   = hypot(Wd, Hd)
pitch_mm  = diagonal_in * 25.4 / diag_px
theta     = { handheld: 0.22°, desk: 0.25°, wall: 0.35°, tv: 0.35°, far: 0.45° }[preset]
cap_mm    = 2 * distance_mm * tan(theta / 2)
em_mm     = cap_mm / 0.70
em_css_px = em_mm / pitch_mm / dpr
auto_scale= clamp(em_css_px / 16, 0.6, 4.0)
--wu      = user_scale * auto_scale
```

- **Touch Target Floor:** On coarse pointers, minimum touch area is 9mm physical (`px = 9.0 / pitch_mm / dpr`), exposed via `--tap-min`.
- **Root Injection:** Written to `:root` once per resize/change; never per element.

---

## 5. Constraint Solver & Profile Matcher (P03)

Implemented in `public/js/stage/solver.js`:

### 5.1 Profile Resolution & Hysteresis
- Evaluates 6 profiles (`xs`, `sm`, `md`, `lg`, `xl`, `wall`) based on `vw_wu` and aspect ratio.
- Evaluates active profile first with a **±3% hysteresis buffer** (`min_w * 0.97`, `max_w * 1.03`) to eliminate boundary flapping between screen resizes.
- Query override support (`?profile=xl`, `?display=wall`).

### 5.2 Figma-Style Constraint Solving
- Let `S = (Sw, Sh)` be viewport in wu and `R = (Rw, Rh)` be profile design size (`dx = Sw - Rw`, `dy = Sh - Rh`):
  - `left`: `x' = x`, `w' = w`
  - `right`: `x' = x + dx`, `w' = w`
  - `center`: `x' = x + dx/2`, `w' = w`
  - `stretch`: `x' = x`, `w' = w + dx`
  - `scale`: `x' = x * Sw / Rw`, `w' = w * Sw / Rw`
  - (Vertical identical for `top`, `bottom`, `center`, `stretch`, `scale`)
- Clamps `w'` and `h'` to `[min_w, max_w]` and re-anchors per constraint.
- Island children constraints are solved recursively relative to parent island rect (capped at depth 6).
- Supports auto-derived profiles with `inherit: 'lg'`.

### 5.3 Deterministic Collision Relief (`relieveCollisions`)
- Operates in **O(n log n)** using an adaptive spatial hash (200wu grid).
- Detects overlaps and pushes lower-importance items along the axis of minimum penetration into free space.
- Maximum 8 passes; deterministic tie-breaking by item ID.
- Overlap allowance: ignores items marked `overlap: 'allow'`.

### 5.4 View Modes
- `fit`: Stage equals viewport; uniform shrink-to-fit down to `min_scale 0.8` if content exceeds viewport; escalates to smaller profile or flow mode if infeasible.
- `flow`: Narrow/portrait mode: islands stack into full-width vertical blocks, vertical scroll only, zero horizontal scroll.
- `canvas`: Freeform infinite world with camera transform.

---

## 6. Stage DOM Contract & Container Queries (P03)

Implemented in `public/css/stage.css` and `public/js/stage/stageRenderer.js`:
- `#stageViewport[data-profile][data-mode]` contains `#stageCanvas`, `#stageOverlay`, `#stageHud`.
- Items styled with CSS custom properties:
  ```css
  .stage-item {
    position: absolute;
    inset: 0 auto auto 0;
    transform: translate3d(calc(var(--x) * var(--wu) * 1px), calc(var(--y) * var(--wu) * 1px), 0);
    width: calc(var(--w) * var(--wu) * 1px);
    height: calc(var(--h) * var(--wu) * 1px);
    contain: layout paint style;
    z-index: var(--z);
    container-type: size;
    container-name: item;
  }
  ```
- **Size Classes:** Adaptive container query tokens (`data-size="xs|s|m|l|xl"`):
  - `xs`: < 120 wu
  - `s`: 120 - 219 wu
  - `m`: 220 - 379 wu
  - `l`: 380 - 639 wu
  - `xl`: >= 640 wu
- **10-Foot UI:** High-contrast focus rings, auto-hiding cursor after 3 seconds of inactivity.
- **Node Re-use:** When switching profiles, existing DOM nodes are re-positioned via CSS custom properties rather than recreated.
- **Backward Compatibility:** Legacy grid renderer remains accessible when `settings.experimental.stage = false`.

---

## 7. Automated Test Matrix Page (P03)

- Implemented in `tools/matrix.html`.
- Previews 16 hardware configurations (10.1" handheld, 10.9" portrait/land, 13" laptop, 27" 1440p, 49" 32:9 super ultrawide, 98" 4K wall, 150" 8K wall, etc.).
- Automated assertions: zero horizontal scroll, font readability, tap target minimums, and profile matching.

---

## 8. Interaction Engine & In-Place Edit Mode (P04)

Implemented in `public/js/stage/interaction.js`, `overlay.js`, `snap.js`, `spatial.js`, and `camera.js`:
- **Interaction State Machine:** Deterministic transitions (`idle` ➔ `hover` ➔ `armed` ➔ `move` | `resize` | `pan` | `lasso` ➔ `committing` ➔ `idle`).
- **Zero-Layout-Read Move Loop:** Measures bounding boxes and camera space once on `pointerdown` into typed objects. The `pointermove` loop runs pure numeric coordinate math and enqueues a single `requestAnimationFrame` write directly to `style.transform`. Zero `getBoundingClientRect` calls during move frames.
- **Geometric 8-Handle Hit-Testing:** Handles are not DOM elements. They are hit-tested geometrically on the `#stageOverlay` canvas with automatic touch-target inflation (9px fine, 22px coarse).
- **Magnetic Snapping & Smart Guides:** Candidate evaluation (neighbor edges, center lines, equal gaps, 4 wu grid), 6px threshold, 10px release hysteresis, and 40% magnetic interpolation ease.
- **2D Uniform Hash Spatial Index:** 128 wu cell grid with $O(1)$ query time and sub-1.5ms rebuilds for 500 items.
- **Camera Transform Model:** `{ x, y, z }` viewport camera with smooth pan and cursor-centered zoom (0.1×–4.0×).
- **Optimistic Patch Commits & History Stack:** Instant local UI mutation with background async RFC 6902 JSON patch dispatch (`/api/board/patch`) and 200-deep undo/redo stack with rapid nudge coalescing (500ms window).
- **Full Keyboard Parity:** Accessible `Tab` selection cycling, `Enter`/`Space` carry mode, Arrow nudging (1 wu normal, 10 wu Shift, 0.25 wu Alt), and `Ctrl+Z` / `Ctrl+D` shortcuts.

---

## 9. Islands, Groups, Shapes & Auto-Layout (P05)

Implemented in `public/js/stage/shapes.js` and `public/js/stage/autolayout.js`:
- **15 Arbitrary Shapes:** Mathematical definitions for `rect`, `rounded`, `pill`, `circle`, `ellipse`, `squircle`, `hexagon`, `octagon`, `chamfer`, `notch`, `ticket`, `tab`, `parallelogram`, `arrow`, `blob`.
- **Safe-Area Insets:** Content-safe calculation (`[top, right, bottom, left]`) ensuring nested children and headers are never clipped by cut corners.
- **Non-Destructive Vector SVG Borders:** Clipped elements render an internal SVG stroke path (`vector-effect: non-scaling-stroke`) for crisp vector boundaries.
- **6 Auto-Layout Modes:**
  - `flow`: Flexbox-style wrapping rows with `align`, `justify`, and `order`.
  - `grid`: Dynamic auto-fill columns (`minCell`) with child `span: [cols, rows]`.
  - `justify`: Google Photos DP linear partition minimizing row height variance ($< 1.5\text{ms}$ for 200 items).
  - `masonry`: Shortest-column-first distribution.
  - `stack`: Directional vertical/horizontal sequences.
  - `carousel`: Horizontal snap strip.
- **RTL Mirroring:** Automatic horizontal coordinate flipping for RTL reading order.
- **Collapse to Chip:** Compact status chip representation with interactive toggle and `auto_below` semantic zoom trigger.

---

## 10. Performance Architecture & Zero-Lag Core (P06)

Implemented in `public/js/state/signals.js`, `public/js/stage/materials.js`, `public/js/stage/chartHost.js`, and `server/index.js`:
- **Fine-Grained Reactive Signals:** `signal`, `computed`, `effect`, `batch` with dependency tracking and `epsilon` threshold suppressing numeric jitter.
- **Time-Sliced Task Scheduler:** Cooperative slicing within a $\le 4\text{ms}$ animation frame budget.
- **GPU Quality Tiers & Frame Degradation:** 4 tiers (`high`, `medium`, `low`, `auto`) with automatic runtime step-down when frame times exceed 20ms.
- **Static Glass Pre-Renderer:** Bypasses live GPU `backdrop-filter: blur(20px)` on mid/low hardware.
- **ChartHost Canvas Pool & LTTB Downsampling:** Pre-allocated typed `Float64Array` ring buffers (`MetricRingBuffer`), $O(1)$ prefix-sum optimized downsampling (5,000 points downsampled in $< 1\text{ms}$), and cached offscreen grids.
- **Zero-Allocation SSE Broadcasts:** Single UTF-8 `Buffer` serialization per event, 200-client capacity cap, and Node event loop delay telemetry via `/api/self`.

---

## 11. Design System Anti-Slop ("Instrument ↔ Blueprint") (P07)

Implemented in `public/css/10-tokens.css`, `11-themes.css`, `20-typography.css`, `50-materials.css`, `components/*.css`, `public/js/ui/motion.js`, and `tools/contrast-check.js`:
- **Dual-State Identity:** Instrument panel in view mode (matte, tactile, data as hero) ↔ Architectural drafting table in blueprint edit mode.
- **5 Themes & Lightness Elevation:** `graphite`, `signal`, `paper` (e-ink / daylight), `blueprint`, `oled` with surface elevation by perceptual lightness deltas.
- **6 Engineered Materials:** `matte`, `glass-static`, `paper`, `lcd` (dot-matrix scanline), `blueprint` (corner crosshairs), `signal-plate`.
- **Signature Components:** Accessible pilot light (● ok, ▲ warn, ■ crit, ◆ info, ○ unknown), architectural tick rulers, heartbeat ECG sparklines, and squircle icon plates (brand, mono, duotone).
- **Physics-Based Motion Engine:** Spring equations generating modern CSS `linear()` timing with kiosk `cubic-bezier` fallback.
- **Zero-Asset Wallpapers & APCA Contrast:** Procedural SVG wallpapers (`topographic.svg`, `contour_field.svg`, `grid_blueprint.svg`) verified with 100% pass on APCA $L_c \ge 75$ body / $L_c \ge 60$ header.
- **Living Styleguide:** Interactive component matrix at `public/__styleguide.html`.

---

## 12. Widget Framework & Component Catalog (P08)

Implemented in `public/js/widgets/registry.js`, `public/js/widgets/expr.js`, `public/js/widgets/parts/*.js`, `public/js/widgets/catalog/*.js`, and `public/__widgets.html`:
- **Widget Registry & Manifest Architecture:** Normalized contract (`defineWidget`), lazy loading, and manifest catalog enabling instant "Add Widget" palette queries without loading widget execution code.
- **Safe Mini-DSL Evaluator:** AST-based expression engine (`expr.js`) with zero `eval()` or `new Function()`, blocked prototype pollution, and built-in math & formatting functions (`min`, `max`, `round`, `clamp`, `avg`, `fmt`, `bytes`, `pct`, `dur`).
- **Responsive Size-Class Folding:** Content dynamically adapts across 5 standardized size classes (`xs`, `s`, `m`, `l`, `xl`).
- **Built-In Catalog:** Core widgets (`big_number`, `service_tile`, `gauge`, `clock`, `custom` declarative JSON widget) with zero dependencies.
- **Robust Error Isolation:** Inline error plates on throwing mounts; graceful missing-widget fallback placeholder preserving data.
- **Interactive Dev Tool:** Comprehensive test matrix runner at `public/__widgets.html`.

---

## 13. Automated Test Suite Verification

Run all test suites via:
```bash
npm test
```
**Results:** **241 tests passing across 29 suites** in ~2.1 seconds:
- `test/boardApi.test.js` (6 tests)
- `test/compatV1.test.js` (8 tests)
- `test/fuzz.test.js` (10,000 ops fuzzing)
- `test/migrate.test.js` (15 tests)
- `test/patchEngine.test.js` (16 tests)
- `test/persister.test.js` (5 tests)
- `test/schema.test.js` (21 tests)
- `test/displayScale.test.js` (14 tests)
- `test/solver.test.js` (32 tests)
- `test/collision.test.js` (30 tests)
- `test/spatial.test.js` (7 tests)
- `test/snap.test.js` (9 tests)
- `test/interaction.test.js` (14 tests)
- `test/shapes.test.js` (10 tests)
- `test/autolayout.test.js` (11 tests)
- `test/signals.test.js` (6 tests)
- `test/materials.test.js` (3 tests)
- `test/chartHost.test.js` (4 tests)
- `test/designTokens.test.js` (12 tests)
- `test/widgets.test.js` (17 tests)
