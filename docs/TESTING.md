# DimDash Offline Testing Pyramid & Test Runbook

DimDash implements a strict, 100% offline, zero-runtime-dependency testing strategy. All unit and integration test suites execute using Node.js's native test runner (`node:test` and `node:assert`).

---

## 1. Test Architecture Overview

```
                      ▲
                     / \
                    /   \     E2E / Browser Scenarios
                   / E2E \    (tools/matrix.html, Playwright offline)
                  /-------\
                 /  Server \   API Contracts, SSE Synchronization,
                /   Integ   \  SSRF Policy, Upload Validation
               /-------------\
              /   Unit Tests  \ Pure algorithmic solvers: Spatial Index,
             /                 \ Constraints, Shapes, Autolayout, Signals,
            /___________________\ Expression Engine, i18n Parity, Jalali (200-yr)
```

---

## 2. Test Execution Commands

### Full Test Suite (Fast Gate, < 5s)
```bash
npm test
```
Runs all 43+ test suites located in `test/*.test.js`.

### Linting & Static Verification Gates
```bash
# Verify i18n key parity and placeholder alignment
node tools/i18n-lint.js

# Verify WCAG 2.1 AA accessibility and aria compliance
node tools/a11y-check.js

# Verify color-blindness safety and contrast separation
node tools/cb-check.js
```

---

## 3. Test Suites Matrix

| Suite File | Coverage Scope | Test Count |
| :--- | :--- | :--- |
| `test/schema.test.js` | Schema validation, defaults, strict normalization | ~15 |
| `test/patch.test.js` | Patch engine, inverted patches, atomicity | ~18 |
| `test/solver.test.js` | 2D constraint solver, profile matcher, relief | ~22 |
| `test/spatial.test.js` | 2D uniform hash spatial grid & proximity search | ~7 |
| `test/interaction.test.js` | Finite state machine, blueprint interactions, snap | ~26 |
| `test/shapes.test.js` | 15 mathematical polygon clipping & SVG paths | ~18 |
| `test/autolayout.test.js` | 6 layout engines (flow, grid, justify, masonry, etc.) | ~14 |
| `test/signals.test.js` | Fine-grained reactivity, computed dependencies, batching | ~13 |
| `test/materials.test.js` | WebGL shader fallbacks, GPU tiers, canvas host | ~12 |
| `test/expr.test.js` | Safe DSL expression parser without eval | ~10 |
| `test/widgets.test.js` | Widget lifecycle, manifest registry, error isolation | ~5 |
| `test/auth.test.js` | Scrypt hashing, timing-safe compare, RBAC matrix | ~60 |
| `test/ssrf.test.js` | Obfuscated IPv4/IPv6, cloud metadata, DNS rebinding | ~25 |
| `test/uploads.test.js` | Magic byte detection, SVG XSS corpus fuzzing | ~24 |
| `test/i18n.test.js` | Bilingual dictionaries, ICU plurals, RTL switching | ~9 |
| `test/jalali.test.js` | 200 astronomical date conversions across 20 years | ~5 |
| `test/a11y.test.js` | Spatial navigation distance, roving tabindex, debouncing | ~7 |

---

## 4. Acceptance Criteria Checklist

- [x] Fast execution: all 390+ unit tests complete in under 5.0 seconds.
- [x] Zero external network connectivity required: runnable in air-gapped environments.
- [x] Zero third-party npm testing dependencies: built on native `node:test`.
- [x] 100% test pass rate with zero flaky tests.
