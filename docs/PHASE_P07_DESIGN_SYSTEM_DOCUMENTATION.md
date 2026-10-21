# DimDash Technical Documentation: Phase P07 Implementation

**Document:** Complete Implementation Guide & Architectural Specification  
**Phase Covered:** **P07:** Design System: A Crafted Identity (Anti "AI-Slop")  
**System Version:** DimDash Core v2.0  
**Test Coverage:** 224 Automated Tests Passing (100% Pass Rate across 29 Suites)  
**Date:** 2026-10-21  

---

## 1. Executive Summary & Design Paradigm

Phase P07 implements a **bespoke, token-driven design system** that eliminates generic SaaS templates and artificial intelligence boilerplate ("AI-slop"). DimDash establishes an unmistakable identity anchored in precision industrial instruments and architectural technical drawings.

### 1.1 The Dual-State Thesis: "Instrument ↔ Blueprint"
- **View Mode = Precision Instrument Console:**
  - Matte, tactile, and typographic.
  - Data is the hero: numbers are front-and-center, using tabular figures to eliminate jitter.
  - Calm and understated during nominal conditions; immediate, clear, and high-visibility during alerts.
- **Edit Mode = Drafting Table (Blueprint):**
  - Content transforms into a technical schematic with 1px hairline registration marks, corner brackets (`+`), proximity dot grids, and dimension tags.
  - Transition into and out of blueprint mode is compositor-only and completes in $\le 220\text{ms}$.

---

## 2. Token Architecture & Layered CSS System

The token foundation is organized into modern CSS cascade layers and files under `public/css/`:

```
public/css/
├── 10-tokens.css         # OKLCH color palettes, spatial scale (--wu), role radii, shadows, motion
├── 11-themes.css         # 5 complete themes: Graphite, Signal, Paper, Blueprint, OLED
├── 20-typography.css     # Inter + Vazirmatn variable typography, tabular numbers, RTL engine
├── 50-materials.css      # 6 engineered materials with performance classes (@layer materials)
└── components/
    ├── pilot-light.css   # Shape + color + motion status indicators
    ├── tick-ruler.css    # Corner registration brackets, scales, and tick shimmer loaders
    ├── heartbeat.css     # Latency sparkline ECG with pulsing alive beacon
    ├── icon-plate.css    # Squircle icon normalizer (Brand, Mono, Duotone)
    └── instruments.css   # Big-number heroes, segmented LED gauges, tactile controls
```

### 2.1 OKLCH Color Space & Lightness Elevation
Instead of murky layered box shadows, DimDash defines surfaces by **perceptual lightness steps**:
- `surface-0`: Stage canvas backdrop / wallpaper scrim.
- `surface-1`: Grid lines and grouped container beds.
- `surface-2`: Island cards and primary panels.
- `surface-3`: Nested tiles, controls, and active items.
- `surface-4`: Popovers, modals, and tooltips.

### 2.2 Curated Signal Accents
- **Default: Signal Amber** (`oklch(0.80 0.16 75)`): High-visibility industrial amber.
- **Signal Cyan** (`oklch(0.78 0.14 210)`): Architectural blueprint cyan.
- **Coral** (`oklch(0.75 0.17 35)`): Thermal warning coral.
- **Lime** (`oklch(0.82 0.18 135)`): Nominal status matrix green.

---

## 3. The 5 Themes

Theme switching is performed via `:root[data-theme="..."]`:

| Theme ID | Aesthetic & Target Environment | Tone | Defining Characteristics |
| :--- | :--- | :--- | :--- |
| **`graphite`** | Default dark matte console. | Dark | Matte dark surfaces, balanced contrast, amber signal accent. |
| **`signal`** | 10-foot UI, video walls (70"–150"), far viewing. | Dark | Maximum contrast, bolder font weights, stark borders, zero subtle greys. |
| **`paper`** | Daylight ambient, e-ink displays, office desks. | Light | Warm off-white paper tone (`oklch(0.96 0.01 80)`), micro-grain texture, deep ink typography. |
| **`blueprint`** | Technical drafting table & edit mode. | Dark | Architectural navy/cyan (`oklch(0.18 0.05 235)`), cyan hairlines, corner registration crosshairs. |
| **`oled`** | True black for OLED screens & battery conservation. | Dark | `#000000` base, zero pixel glow, high-contrast crisp text. |

---

## 4. The 6 Engineered Materials (`50-materials.css`)

All materials are declared inside `@layer materials` with explicit performance classifications:

1. **`material-matte` (Class A: Free):** Flat surface, hairline border with 8% lightness delta, 1px top edge specular highlight (`inset 0 1px 0 0 oklch(1 0 0 / 0.12)`).
2. **`material-glass-static` (Class B: Cheap):** Translucent surface with static pre-blurred wallpaper backing or adaptive blur on high GPU tier.
3. **`material-paper` (Class A: Free):** Warm daylight surface with procedural 6px micro-grain noise and ink hairlines.
4. **`material-lcd` (Class A: Free):** Retro-industrial dot matrix background pattern, segmented green/amber numerals, and 2% horizontal scanlines.
5. **`material-blueprint` (Class A: Free):** Transparent navy with 1px accent hairline border and corner registration crosshairs (`+`).
6. **`material-signal-plate` (Class A: Free):** Bold saturated top header bar with stark typography for high-priority alert cards.

---

## 5. Signature Instrument Components

### 5.1 The Pilot Light (`components/pilot-light.css`)
Guarantees **color-blind accessibility** by combining **shape + color + text/aria + micro-motion**:

| Status | Shape Glyph | Color Token | Micro-Motion Behavior |
| :--- | :--- | :--- | :--- |
| **OK** | ● Solid Circle | `--status-ok` (`#22c55e`) | Static resting glow. |
| **Warn** | ▲ Triangle | `--status-warn` (`#f59e0b`) | Solid attention marker. |
| **Crit** | ■ Square | `--status-crit` (`#ef4444`) | Subtle 1.8s breath pulse (`@keyframes pilot-pulse`). |
| **Info** | ◆ Diamond | `--status-info` (`#3b82f6`) | Solid informational beacon. |
| **Unknown** | ○ Hollow Circle | `--status-unknown` (`#71717a`)| Transparent fill, 1.5px outline ring. |

*Motion automatically halts under `prefers-reduced-motion` and `[data-quality="low"]`.*

### 5.2 The Tick Ruler & Registration Brackets (`components/tick-ruler.css`)
- **Corner Brackets (`.tick-corner`):** Architectural registration marks at the 4 corners (`tl`, `tr`, `bl`, `br`), framing cards cleanly without heavy drop shadows.
- **Linear Scales (`.tick-ruler-x` / `.tick-ruler-y`):** Repeating CSS gradients generating 1px tick marks every 4px or 8px.
- **Structured Shimmer (`.tick-shimmer`):** Replaces blurred pastel skeletons with architectural hairline slide animations.

### 5.3 The Latency Heartbeat (`components/heartbeat.css`)
A minimal SVG polyline ECG sparkline terminating in a circular beacon that blinks upon probe confirmation, confirming the target server is alive.

### 5.4 The Icon Plate Normalizer (`components/icon-plate.css`)
Normalizes all icons (Heimdall 680+ app icons, custom PNGs, SVG vectors) into uniform squircle plates:
- **`mode-brand`:** Original logo colors on neutral surface.
- **`mode-mono`:** Silhouette icon tinted with `currentColor` or accent.
- **`mode-duotone`:** Plate background tinted with extracted accent; icon in bright monochrome.
- **Fallback Letter Glyph:** Renders the first letter of the service name in bold display font if an image fails to load.

---

## 6. Physics-Based Motion Engine (`public/js/ui/motion.js`)

DimDash solves the damped harmonic oscillator equation in JavaScript to output modern CSS `linear()` timing functions:

$$m \frac{d^2 x}{dt^2} + c \frac{dx}{dt} + k x = 0$$

- **Presets:**
  - `snappy` ($m=1, k=260, c=26$): Crisp, responsive UI feedback.
  - `soft` ($m=1, k=170, c=22$): Smooth reveals for drawers and modals.
  - `bouncy` ($m=1, k=200, c=14$): Tactile toggle switches and badges.
- **Kiosk Fallback:** When `CSS.supports('animation-timing-function', 'linear(0, 1)')` is false, it transparently falls back to pre-calibrated `cubic-bezier(...)` curves.

---

## 7. Contrast Verification & Test Results

### 7.1 Automated APCA Contrast Suite (`tools/contrast-check.js`)
Meets Acceptance Criterion 3:
- **Graphite:** Body $L_c = 98.1$ (WCAG 14.23:1), Secondary $L_c = 71.2$ (WCAG 9.31:1) $\to$ **PASS**
- **Signal:** Body $L_c = 104.0$ (WCAG 16.28:1), Secondary $L_c = 85.6$ (WCAG 12.45:1) $\to$ **PASS**
- **Paper:** Body $L_c = 91.0$ (WCAG 14.85:1), Secondary $L_c = 77.4$ (WCAG 8.59:1) $\to$ **PASS**
- **Blueprint:** Body $L_c = 95.9$ (WCAG 13.11:1), Secondary $L_c = 73.7$ (WCAG 9.28:1) $\to$ **PASS**
- **OLED:** Body $L_c = 105.3$ (WCAG 18.26:1), Secondary $L_c = 77.1$ (WCAG 11.78:1) $\to$ **PASS**

### 7.2 Full Test Suite
- Total automated tests passing: **224 tests** across 29 suites with **0 failures**.
- Living styleguide accessible at `public/__styleguide.html`.
