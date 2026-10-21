# DimDash Design-Lint Checklist & Anti-Slop Specification

**System Version:** DimDash Core v2.0  
**Phase:** P07 — Design System Anti-Slop  
**Audience:** Core Engineers, PR Reviewers, Automation Linters  

---

## 1. Strictly Banned Patterns (The "Anti-Slop" Contract)

Any Pull Request introducing any of the following visual tropes will be rejected during review unless accompanied by an explicit architectural waiver:

| Banned Pattern | Rationale | Replacement in DimDash |
| :--- | :--- | :--- |
| ❌ **Purple $\to$ Blue "AI Gradients"** | Overused marketing cliché lacking functional semantic meaning. | High-contrast industrial OKLCH palette with single intentional signal accent (Amber, Cyan, Coral, Lime). |
| ❌ **Omnipresent Neon Glows** | Destroys visual contrast and creates GPU fill-rate exhaustion. | Specular 1px edge-light highlight (`inset 0 1px 0 0 oklch(1 0 0 / 0.12)`) and crisp hairline borders. |
| ❌ **Uniform 16px Radius Blur Cards** | Creates monotonous "cookie-cutter" SaaS interfaces. | Role-based radii (`--r-island`, `--r-tile`, `--r-chip`, `--r-input`) paired with 15 mathematical vector shapes. |
| ❌ **Gradient Text** | Severely damages legibility and fails accessibility contrast checks. | Solid, high-contrast typography satisfying APCA $L_c \ge 75$ body / $L_c \ge 60$ header. |
| ❌ **Emojis as Functional Icons** | Unpredictable rendering across operating systems; lacks consistent visual weight. | Curated 24px inline SVG vector icons and normalized Squircle Icon Plates. |
| ❌ **Centred Hero + 3 Identical Cards** | Lazy template layout that wastes spatial display area. | Responsive spatial grid with variable spans, justified linear partitions, and masonry distribution. |
| ❌ **Stacked Heavy Drop Shadows** | Murky visual appearance; heavy GPU composition overhead. | Lightness-based elevation tokens (`surface-0` through `surface-4`) with max single-layer ambient shadow. |
| ❌ **Decorative Blobs & Fake 3D** | Meaningless visual noise with zero operational utility. | Procedural topographic contour fields, blueprint grids, and authentic data charts. |
| ❌ **"Welcome back!" / Lorem Copy** | Patronizing placeholder text that consumes screen estate. | Concise, dry, actionable microcopy naming operational state and telemetry. |

---

## 2. Mandatory Architectural Requirements

Every component, view, and layout in DimDash must satisfy the following criteria:

- [x] **Typographic Hierarchy ($\ge 4$ Roles):**
  Must implement distinct roles: `Hero / Display`, `Title`, `Body`, and `Monospace Micro-Label`.
- [x] **Tabular Figures for Dynamic Metrics:**
  All numbers that update over time must apply `font-variant-numeric: tabular-nums lining-nums` to eliminate layout jitter.
- [x] **Color-Blind Safe Statuses (Shape + Color + Text):**
  Every status must be communicated through geometry as well as color:
  - ● Circle $\to$ OK / Nominal
  - ▲ Triangle $\to$ Warning / Degraded
  - ■ Square $\to$ Critical / Outage
  - ◆ Diamond $\to$ Informational / Notice
  - ○ Hollow Circle $\to$ Unknown / Unpolled
- [x] **APCA Contrast Compliance ($L_c \ge 75 / 60$):**
  All text tokens must pass automated APCA contrast analysis (`node tools/contrast-check.js`).
- [x] **Dual-Script RTL Typography:**
  Persian strings must use native calligraphic font (`Vazirmatn`), line-height $1.70$, zero letter-spacing, and bidirectional `<bdi>` isolation for English metrics.
- [x] **Physics-Based Spring Transitions:**
  Interactive transitions must use damped harmonic motion curves generated via `MotionEngine` with fallback cubic-bezier.
- [x] **Zero-Overhead Degradation:**
  Under `data-quality="low"` or `prefers-reduced-motion`, all transitions collapse to instant or $\le 90\text{ms}$ opacity fades with zero backdrop-filter blur.
