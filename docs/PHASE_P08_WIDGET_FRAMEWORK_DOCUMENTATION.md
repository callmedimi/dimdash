# DimDash Technical Documentation: Phase P08 Implementation

**Document:** Complete Implementation Guide & Architectural Specification  
**Phase Covered:** **P08:** Widget Framework & Component Catalog  
**System Version:** DimDash Core v2.0  
**Test Coverage:** 241 Automated Tests Passing (100% Pass Rate across 29 Suites)  
**Date:** 2026-10-21  

---

## 1. Executive Summary & Core Paradigm

Phase P08 transforms DimDash widgets from static, hard-coded UI templates into an **extensible, sandboxed widget platform**:
- **Normalized Contract & Manifests:** Every widget defines an air-gapped specification (`type`, `version`, `size`, `schema`, `bindings`, `mount`), enabling lazy loading and instant "Add Widget" palette searches without loading execution code.
- **Strictly Safe Mini-DSL Evaluator:** A custom Pratt / Recursive-Descent parser executing arithmetic, logical operators, comparisons, ternary branches, and formatting helpers with **zero `eval()` or `new Function()`**, eliminating injection risks.
- **Responsive Size-Class Folding (XS–XL):** Widgets automatically adjust their internal content across 5 standard size classes (`xs`, `s`, `m`, `l`, `xl`), ensuring legible rendering on both 10" handhelds and 150" video walls.
- **Zero-Crash Error Isolation:** Throwing widget renders an inline error card and reports to telemetry without crashing the stage canvas or neighboring components.
- **Graceful Missing-Widget Recovery:** Unknown or uninstalled widget types render an informative placeholder while preserving all user configuration properties safely in the board schema.

---

## 2. Widget Lifecycle Contract (`public/js/widgets/registry.js`)

Widgets are declared via `defineWidget(def)`:

```javascript
defineWidget({
  type: 'big_number',
  version: 1,
  label: { en: 'Big Number', fa: 'عدد بزرگ' },
  category: 'data',
  icon: 'hash',
  size: { min: [80, 48], preferred: [200, 110], max: [800, 500], resizable: true },
  schema: {
    label: { type: 'string', label: 'Label' },
    unit: { type: 'string', label: 'Unit' }
  },
  bindings: {
    value: { kind: 'metric', required: true }
  },
  mount(ctx) {
    // ctx: { el, props(), bind(slot), size(), scope, theme, locale, now() }
    return {
      update(props) {},
      resize(w, h, cls) {},
      destroy() {}
    };
  }
});
```

### 2.1 The Context Interface (`ctx`)
- `ctx.el`: The target DOM container element.
- `ctx.props()`: Active configuration properties validated against the widget's schema.
- `ctx.bind(slot)`: Returns a reactive signal for the configured telemetry metric or probe status.
- `ctx.size()`: Returns current `{ w, h, cls }` dimensions and size class.
- `ctx.scope`: Isolated lifecycle scope (`scope.effect(fn)`, `scope.interval(fn, ms)`, `scope.add(cleanup)`). When the widget unmounts, `scope.dispose()` executes all registered cleanups automatically.
- `ctx.theme` & `ctx.locale`: Active theme (`graphite`, `signal`, `paper`, `blueprint`, `oled`) and language (`en`, `fa`).

---

## 3. Safe Expression Evaluator (`public/js/widgets/expr.js`)

To enable users to compute dynamic metrics (e.g. `round(mem.used / mem.total * 100, 1) + '%'`) without exposing arbitrary JavaScript execution:

### 3.1 Security Guarantees
- **No `eval()` or `new Function()`:** The engine uses an AST parser generating pure function closures.
- **Prototype Pollution Defense:** Explicitly blocks access to `__proto__`, `constructor`, `prototype`, `__defineGetter__`, and `__defineSetter__`.
- **Fuzz Hardened:** Handles malformed syntax, unbalanced parentheses, and invalid division by zero gracefully without throwing uncaught exceptions.

### 3.2 Supported Language Features
- **Arithmetic:** `+`, `-`, `*`, `/`, `%` with mathematical operator precedence.
- **Comparisons:** `<`, `<=`, `>`, `>=`, `==`, `!=`.
- **Logical:** `&&`, `||`, `!`.
- **Ternary Branches:** `test ? consequent : alternate`.
- **Member Access:** `obj.prop`, optional chaining `obj?.prop`, array indexing `arr[0]`.
- **Built-in Functions:**
  - Math: `min`, `max`, `round`, `floor`, `ceil`, `abs`, `clamp`, `avg`, `sum`.
  - Formatters: `fmt(val, decimals)`, `bytes(val)`, `pct(val, total)`, `dur(seconds)`.

---

## 4. Built-In Widget Catalog

All built-in widgets reside in `public/js/widgets/catalog/` and adapt across XS–XL sizes:

| Widget Type | XS ($w < 120$) | S ($120 \le w < 220$) | M ($220 \le w < 360$) | L / XL ($w \ge 360$) |
| :--- | :--- | :--- | :--- | :--- |
| **`big_number`** | Value only | Value + Unit | Value + Unit + Delta % | Value + Unit + Delta + Sparkline |
| **`service_tile`** | Icon plate + Pilot light | + Title | + Subtitle, Latency ms | + Heartbeat ECG sparkline |
| **`gauge`** | Discrete LED bar | + Percentage | + Metric label | + Threshold colors |
| **`clock`** | Digital time | Time + Date | Time + Date + Gregorian/Persian | Dual timezones |
| **`custom`** | Declarative node | Full layout | Responsive stack | Custom JSON tree |

---

## 5. Declarative Custom Widgets (Zero Code)

The `custom` widget allows users to construct custom visual layouts using structured JSON without writing any JavaScript:

```json
{
  "type": "stack",
  "children": [
    { "type": "text", "style": "micro", "value": "SYSTEM THERMALS" },
    { "type": "row", "children": [
      { "type": "number", "expr": "round(cpu.temp, 1)" },
      { "type": "text", "value": "°C" },
      { "type": "pilot", "expr": "cpu.temp > 80 ? 'crit' : 'ok'" }
    ]},
    { "type": "bar", "expr": "cpu.temp" }
  ]
}
```

---

## 6. Verification & Test Coverage

- **Automated Test Suite:** `test/widgets.test.js` covers:
  - 80+ expressions verifying arithmetic precedence, logic, comparisons, ternary branches, and formatters.
  - Prototype pollution attacks verified blocked.
  - Source code scanning verifying zero `eval()` or `new Function()`.
  - Fuzz testing across 50 malformed expressions.
  - Widget registration, manifest indexing, size class computation, error isolation, and missing widget recovery.
- **Test Results:** `npm test` runs **241 tests across 29 suites with 0 failures** in ~2.1 seconds.
- **Interactive Dev Tool:** Matrix runner accessible at `public/__widgets.html`.
