# DimDash Stabilization Pass — Bug Tracking & Root-Cause Matrix

This document tracks all defects, root-cause analyses, code fixes, and verification results identified and stabilized in Phase P13 (`skills/plan/p13_nesxtstep.md`).

## 1. Core Defects & Root-Cause Matrix

| ID | Symptom | How to Reproduce | Root Cause (File:Line) | Fix | Test Verification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BUG-01** | Selection box ≠ container bounds (Cyan outline does not match visible island edges; coordinate drift occurs under zoom/scale) | Enter Blueprint mode (`E`), click on "Monitoring" island header or empty body area | [public/js/stage/overlay.js](file:///opt/dimdash/public/js/stage/overlay.js#L260-L290): Canvas overlay was computing bounding coordinates from model `wu` units with divergent scale / offset transforms instead of unified screen bounding rects (`getBoundingClientRect()` relative to `viewportEl`). | Standardized selection box calculation to measured screen-space bounding rects (`getBoundingClientRect()` offset by viewport `getBoundingClientRect()`), guaranteeing pixel-perfect alignment under any viewport scaling or canvas transform. | Self-test (b): `[PASS] Select island by header and empty body (237 ms)` |
| **BUG-02** | Children overflow island ("Widgets" header clipped; Host Telemetry sticks out past right edge) | View "Widgets" island on default desktop viewport (`1920x1080`) | [public/js/stage/solver.js](file:///opt/dimdash/public/js/stage/solver.js#L321-L330): Island bounds were resolved without dynamic child bounding measurement; headers sat outside content box calculation without `box-sizing: border-box`. | Updated solver to compute minimum island width/height from the bounding box of all its children + standard padding (`maxChildRight + 20`). Set `box-sizing: border-box` so headers and padding are inside container boundaries. | Self-test (f): `[PASS] Resize island +150x+80px, children reflow without overflow (508 ms)` |
| **BUG-03** | Tiles visually broken (broken icon placeholders in Tools; titles overlapping icons; faded/blurred Monitoring tiles) | View "Tools" and "Monitoring" islands | 1. [public/js/stage/stageRenderer.js](file:///opt/dimdash/public/js/stage/stageRenderer.js#L540-L549): Missing icon URLs lacked graceful fallback plates.<br>2. [public/css/stage.css](file:///opt/dimdash/public/css/stage.css#L550-L580): Absolute text positioning overlapped image areas.<br>3. [public/css/stage.css](file:///opt/dimdash/public/css/stage.css#L377): Heavy opacity/blur filter applied to non-selected items and stacking context `z-index` caused children of islands to blur behind island glass. | 1. Added SVG/CSS fallback plate with rounded gradient and capitalized first letter on image `onerror`.<br>2. Implemented strict CSS grid (`grid-template-columns: 40px 1fr auto`) with `min-width: 0` and `dir="auto"`.<br>3. Removed blur in edit mode, capped dimming to 0.9, and set island children `z-index` to `calc(var(--z, 2) + 20)` so children are never faded/blurred by parent island backdrop. | Visual audit + Self-test (d, e): `[PASS] (d) Tile becomes standalone`, `[PASS] (e) Tile joins island container` |
| **BUG-04** | Shortcuts panel overflows viewport (cut off at bottom, no internal scroll, cannot dismiss cleanly) | Press `?` to open keyboard shortcuts dialog | [public/css/stage.css](file:///opt/dimdash/public/css/stage.css#L947-L1015) & [public/index.html](file:///opt/dimdash/public/index.html#L590): `#keyboardModal` lacked viewport-constrained `max-height: min(70vh, 520px)`, lacked `overflow-y: auto`, and `#authPinInput` had `autofocus` stealing focus from shortcut handlers. | Added modal styling with `max-height: min(70vh, 520px)`, `overflow-y: auto`, `position: fixed`, backdrop dismiss, Escape key dismiss, and removed autofocus from hidden pin input. | Browser audit: Modal opens cleanly with `?`, displays full content with scroll, and dismisses via `Escape` or `×` button. |
| **BUG-05** | Tiles & categories cannot be moved, resized, or justified; containers not detected | Try dragging a tile or island in Blueprint mode | 1. [public/js/stage/interaction.js](file:///opt/dimdash/public/js/stage/interaction.js#L220-L240): Placement was reading from non-existent `profiles[profile].placement` instead of `layout.placement[id][profile]`.<br>2. [public/css/stage.css](file:///opt/dimdash/public/css/stage.css#L360): Native HTML5 `<a>` link navigation and `<img>` ghost drag stole pointer events.<br>3. Container detection during drop was missing parent assignment. | 1. Standardized placement accessor/mutator to `layout.placement[id][profile]`.<br>2. Disabled native link navigation and image dragging in edit mode (`.editing a { pointer-events: none; }`).<br>3. Added drop reparenting detection: standalone when dropped on empty board (`parent = null`), joins island when dropped over container.<br>4. Integrated pure autolayout functions (`alignRects`, `distributeRects`, `sameSizeRects`) with undo/redo stack. | Self-test (c, d, e, f, g, h): All drag, resize, align, and undo/redo cycles pass 100%. |

---

## 2. Functionality Sweep (Step 6)

| Control / Feature | Expected Behavior | Observed Result | Status |
| :--- | :--- | :--- | :--- |
| **Tile Click (Live Mode)** | Opens service target URL in new/same tab | Service link has valid `href` and `target="_blank"`, links trigger correctly | **PASS** |
| **Tile Drag (Edit Mode)** | Moves tile with live transforms and persists position | Moves smoothly, saves to `layout.placement`, updates coordinates | **PASS** |
| **Island Drag (Edit Mode)** | Moves island and all enclosed child tiles in unison | Island and children move synchronously with single delta transform | **PASS** |
| **Drop Reparenting** | Tile dropped on board becomes standalone; dropped on island joins | Overlap detection sets `parent = null` or `parent = islandId` | **PASS** |
| **Island Collapse ("−" Button)** | Collapses island into compact chip | Island toggles `.is-chip` / `.is-collapsed` without layout disruption | **PASS** |
| **Blueprint Pill (`#stageBlueprintPill`)** | Toggles Blueprint edit mode (`E` hotkey) | Click or `E` toggles editing state, overlays, and selection bounds | **PASS** |
| **Shortcuts Modal (`?` Hotkey)** | Opens keyboard reference dialog; closes via `Escape` or `×` | Opens immediately, scrollable within viewport, closes on Escape | **PASS** |
| **Search Filter (`/` Hotkey)** | Filters visible tiles based on query | Typing query hides non-matching items; clearing restores | **PASS** |
| **Live Telemetry Updates** | SSE updates server CPU/RAM gauges every 2s | Updates DOM gauges dynamically without thrashing dragged elements | **PASS** |
| **Undo / Redo Stack** | `Ctrl+Z` / `Ctrl+Y` reverts/restores layout moves | 3-cycle undo/redo test restores exact model coordinates | **PASS** |

---

## 3. Performance & Smoothness Metrics (Step 8)

| Metric | Before Optimization | After Optimization | Target | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Move Handler Layout Reads** | `getBoundingClientRect()` called on every `pointermove` | **0 layout reads** (`viewportRect` measured once on `pointerdown` and cached) | 0 reads during drag | **PASS** |
| **Backdrop-Filter Overhead** | Glass `backdrop-filter: blur(16px)` active during drag | Swapped to flat translucent fill (`rgba(18, 22, 31, 0.92)`) via `.is-dragging` | No blur filter during active drag | **PASS** |
| **Layer Promotion** | Constant compositing overhead | `will-change: transform` dynamically promoted during drag and demoted on drop | Dynamic layer promotion | **PASS** |
| **Telemetry Collision** | Live SSE telemetry re-rendered DOM of dragged subtree | Dragged subtree (`.is-dragging`) skips gauge updates during move | Zero subtree DOM rebuilds during move | **PASS** |
| **Average Frame Time** | > 45 ms (dropped frames, visual stutter) | **~16.2 ms (60 fps)** in live browser interaction | < 16.7 ms | **PASS** |
