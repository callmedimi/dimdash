# DimDash Signature Features Guide (F1–F6)

This document provides user and administrator documentation for DimDash's signature features that deliver unmatched speed, spatial intelligence, and resilience in air-gapped environments.

---

## 1. F3 — Command Palette (`Ctrl+K` / `/`)

- **Overview**: Instant global command palette enabling keyboard-first navigation and control across items, islands, display scenes, and system actions.
- **Search Tolerance**: Built-in Persian & Arabic character folding:
  - Automatically folds Arabic `ي` / `ى` $\to$ `ی` and `ك` $\to$ `ک`.
  - Ignores diacritics (fatha, kasra, damma, tanwin) and Zero-Width Non-Joiner (ZWNJ `\u200C`).
  - Typing "گرافانا" or "grafana" instantly finds the target.
- **Speed**: Subsequence fuzzy scoring with early rejection guarantees $\le 4\text{ ms}$ query latency across 5,000 entities.
- **Keyboard Traversal**:
  - `↑` / `↓` moves selection.
  - `Enter` executes action or flies camera to target.
  - `Escape` dismisses palette.

---

## 2. F1 — Semantic Zoom & Level of Detail (LOD)

- **Overview**: Smooth transition between content depths based on camera zoom scale without re-triggering expensive layout reflows:
  - **Detail** ($z \ge 0.9$): Complete widget rendering, live sparklines, charts, and metrics.
  - **Mid** ($0.5 \le z < 0.9$): Compact size-class representation; secondary descriptions collapsed.
  - **Chip** ($0.2 \le z < 0.5$): Islands collapse into status pills showing title, badge count, and worst-status pilot light.
  - **Dot** ($z < 0.2$): High-level world map representation rendering minimal high-contrast status dots.
- **Counter-Scale Labels**: Mathematical text counter-scaling ensures critical labels remain legible at extreme zoom-out.

---

## 3. F4 — Multi-Screen Display Scenes (`sceneManager.js`)

- **Overview**: Scene orchestrator designed for multi-monitor command centers and NOC walls.
- **Built-in Trio**:
  - `day` (Default Theme, full brightness, scheduled 07:00–19:00).
  - `night` (OLED Theme, low luminance, scheduled 19:00–07:00).
  - `incident` (Signal Theme, auto-triggered on any critical failure).
  - `wall` (NOC video wall preset, 1.2x scale).
- **Automation**: Evaluates time-of-day schedules and status rules automatically with cross-fade visual transitions.

---

## 4. F5 — Incident Commander Mode (`incidentMode.js`)

- **Overview**: High-visibility automated triage mode activated when critical infrastructure failures occur.
- **Root-Cause Isolation**: Leverages item dependency graphs (`depends_on: [item_id]`) to distinguish between root failures and downstream cascading alerts.
- **Calm Focus**:
  - Dims healthy/unaffected islands to 35% opacity.
  - Elevates failing islands to the foreground with a calm pulse.
  - Provides a single-click "Acknowledge" button to silence pulses while retaining triage records.
  - Automatically logs outage duration and displays recovery toast upon restoration.

---

## 5. F6 — Time-Travel Scrubber (`timeTravel.js`)

- **Overview**: Bottom-docked historical telemetry scrubber spanning up to 48 hours of metrics and probe statuses.
- **Replay Watermark**: Displays an unmistakable blueprint-tinted watermark across the stage so operators never mistake historic replay for live telemetry.
- **Safe Isolation**: Client-side scrubbing communicates with `/api/replay?t=` and never mutates persistent state.
- **One-Click Live**: Clicking the "LIVE" button instantly reconnects to real-time telemetry.

---

## 6. F2 — Status Heat Minimap (`minimap.js`)

- **Overview**: Lightweight HTML5 `<canvas>` minimap fixed in the corner.
- **Status Tints**: Island rectangles are rendered with real-time status colors (emerald `#10b981`, amber `#f59e0b`, rose `#ef4444`).
- **Spatial Jump**: Clicking anywhere on the minimap immediately jumps the spatial camera to that coordinate in world space.
