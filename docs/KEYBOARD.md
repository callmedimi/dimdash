# DimDash Keyboard Navigation Specification & Operator Guide

DimDash is designed for 100% keyboard operability without a mouse or touch device. This specification documents the geometric spatial navigation model, roving tabindex architecture, Blueprint/Edit mode keyboard parity, and internationalized RTL considerations.

---

## 1. Spatial Navigation Model

DimDash replaces traditional linear DOM tab indexing with a 2D geometric navigation engine:

- **Roving Tabindex**: Only one element on the dashboard stage has `tabindex="0"` at any time. All other items have `tabindex="-1"`. When the user tabs into the dashboard stage (`role="region"`), the previously focused item (or the first logical item) immediately gains focus.
- **Direction-Weighted Geometric Traversal**:
  When an arrow key (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`) is pressed, the stage engine queries the 2D spatial index for items in the specified direction ray:
  $$\text{dist} = \begin{cases} 
  |dy| + 2 \cdot |dx| & \text{if vertical (Up / Down)} \\ 
  |dx| + 2 \cdot |dy| & \text{if horizontal (Left / Right)} 
  \end{cases}$$
  This weighting guarantees that items directly in the travel vector are preferred over diagonal candidates, preventing jarring visual jumps.

---

## 2. Global Shortcuts & Key Map

| Key | Context | Action | Live Region Announcement |
| :--- | :--- | :--- | :--- |
| **`Tab` / `Shift+Tab`** | Global | Moves focus between top navbar, stage, and inspectors | Read active control |
| **`Arrow Keys`** | Stage | Spatial navigation to nearest item in direction | Item title + status |
| **`Enter`** | Selected Tile | Opens destination URL / launches action | "Launching [name]" |
| **`Enter`** | Selected Island | Enters island scope, focusing first child | "Entered [island name]" |
| **`Escape`** | Island Scope | Ascends to parent island or exits focus mode | "Exited to stage" |
| **`e`** | Global | Toggle Blueprint / Edit Mode | "Edit mode active / view mode" |
| **`?`** | Global | Opens Keyboard Shortcuts modal dialog | "Keyboard shortcuts dialog opened" |
| **`m`** | Global | Toggle Minimap overlay | "Minimap visible / hidden" |
| **`p`** | Global | Cycle display profile (`xs` → `sm` → `md` → `lg` → `xl`) | "Display profile set to [profile]" |
| **`t`** | Global | Cycle color theme (`glass`, `oled`, `signal`, etc.) | "Theme switched to [theme]" |
| **`l`** | Global | Cycle language (`fa` ↔ `en`) | "Language changed to [locale]" |
| **`Ctrl+K` / `/`** | Global | Open Command Palette | "Command palette opened" |

---

## 3. Blueprint / Edit Mode Shortcuts

When Edit Mode is active (`e` key):

| Key Combination | Action | Description |
| :--- | :--- | :--- |
| **`Space` / `c`** | Carry Mode | Pick up item to move; arrow keys now move item by 1 grid unit (`--wu`) |
| **`Shift + Arrow`** | Snap Move | Moves active item by snap step (8 wu or snap guide) |
| **`Alt + Arrow`** | Micro Step | Precision nudging (1 physical px) |
| **`+` / `-`** | Resize | Increase / decrease active item width/height |
| **`Ctrl+Z`** | Undo | Reverses previous patch operation |
| **`Ctrl+Y` / `Ctrl+Shift+Z`** | Redo | Re-applies undone patch operation |
| **`Delete` / `Backspace`** | Remove | Deletes selected item with confirmation prompt |
| **`Escape`** | Cancel / Drop | Drops carried item or exits edit mode |

---

## 4. Internationalization & RTL Navigation

1. **RTL Direction Inversion**:
   In RTL mode (Persian locale `fa`):
   - `ArrowRight` moves to the item visually on the right (which maps to decreasing logical inline coordinate).
   - `ArrowLeft` moves to the item visually on the left.
   - Screen reader announcements preserve the operator's mental model: "Moved left to Redis".
2. **Bidi Text Isolation**:
   All dynamic service names and custom labels are enclosed in `<bdi>` tags to prevent punctuation inversion or bracket flipping when English service names (e.g. `prometheus-node-exporter:9100`) appear inside Persian sentences.

---

## 5. Screen Reader Live Regions

DimDash uses a single polite live region (`#a11yLiveRegion`) configured with:
```html
<div id="a11yLiveRegion" class="sr-only" aria-live="polite" aria-atomic="true"></div>
```
- **Debounced Delivery**: Rapid state changes are batched with a 150ms debounce window to prevent screen reader stuttering.
- **Aggregated Summaries**: If multiple telemetry status changes occur simultaneously, the engine aggregates them: `"3 services changed: Prometheus online; Backup failed"`.
