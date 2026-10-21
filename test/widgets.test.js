const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ExprEngine = require('../public/js/widgets/expr.js');
const WidgetRegistry = require('../public/js/widgets/registry.js');

test('P08 Safe Expression Evaluator: Math, Logic & Built-ins', async (t) => {
  // 1. Arithmetic & Precedence
  await t.test('evaluates arithmetic with correct precedence', () => {
    assert.strictEqual(ExprEngine.evaluate('2 + 3 * 4'), 14);
    assert.strictEqual(ExprEngine.evaluate('(2 + 3) * 4'), 20);
    assert.strictEqual(ExprEngine.evaluate('100 - 40 / 2'), 80);
    assert.strictEqual(ExprEngine.evaluate('17 % 5'), 2);
    assert.strictEqual(ExprEngine.evaluate('10 / 2 * 5'), 25);
    assert.strictEqual(ExprEngine.evaluate('-5 + 10'), 5);
    assert.strictEqual(ExprEngine.evaluate('+42'), 42);
    assert.strictEqual(ExprEngine.evaluate('10 / 0'), 0); // safe zero-division
  });

  // 2. Comparisons & Equality
  await t.test('evaluates comparisons and equality', () => {
    assert.strictEqual(ExprEngine.evaluate('5 > 3'), true);
    assert.strictEqual(ExprEngine.evaluate('5 < 3'), false);
    assert.strictEqual(ExprEngine.evaluate('5 >= 5'), true);
    assert.strictEqual(ExprEngine.evaluate('4 <= 5'), true);
    assert.strictEqual(ExprEngine.evaluate('10 == 10'), true);
    assert.strictEqual(ExprEngine.evaluate('10 != 20'), true);
    assert.strictEqual(ExprEngine.evaluate('"foo" == "foo"'), true);
    assert.strictEqual(ExprEngine.evaluate('"foo" != "bar"'), true);
  });

  // 3. Logic & Boolean
  await t.test('evaluates boolean logic and negation', () => {
    assert.strictEqual(ExprEngine.evaluate('true && false'), false);
    assert.strictEqual(ExprEngine.evaluate('true || false'), true);
    assert.strictEqual(ExprEngine.evaluate('!true'), false);
    assert.strictEqual(ExprEngine.evaluate('!false'), true);
    assert.strictEqual(ExprEngine.evaluate('!(5 > 10)'), true);
    assert.strictEqual(ExprEngine.evaluate('true && (5 > 2)'), true);
  });

  // 4. Ternary Conditional
  await t.test('evaluates ternary conditional expressions', () => {
    assert.strictEqual(ExprEngine.evaluate('true ? "yes" : "no"'), 'yes');
    assert.strictEqual(ExprEngine.evaluate('false ? "yes" : "no"'), 'no');
    assert.strictEqual(ExprEngine.evaluate('val > 50 ? "high" : "normal"', { val: 75 }), 'high');
    assert.strictEqual(ExprEngine.evaluate('val > 50 ? "high" : "normal"', { val: 25 }), 'normal');
    assert.strictEqual(ExprEngine.evaluate('val > 80 ? "crit" : (val > 50 ? "warn" : "ok")', { val: 65 }), 'warn');
  });

  // 5. Member Access & Optional Chaining
  await t.test('evaluates member access, optional chaining, and indexing', () => {
    const scope = {
      server: { cpu: { usage: 42.5 } },
      disks: [{ name: 'sda', pct: 68 }]
    };
    assert.strictEqual(ExprEngine.evaluate('server.cpu.usage', scope), 42.5);
    assert.strictEqual(ExprEngine.evaluate('server?.cpu?.usage', scope), 42.5);
    assert.strictEqual(ExprEngine.evaluate('server?.memory?.usage', scope), undefined);
    assert.strictEqual(ExprEngine.evaluate('disks[0].name', scope), 'sda');
    assert.strictEqual(ExprEngine.evaluate('disks[0].pct', scope), 68);
  });

  // 6. Built-in Math Functions
  await t.test('evaluates built-in math functions', () => {
    assert.strictEqual(ExprEngine.evaluate('min(10, 5, 20)'), 5);
    assert.strictEqual(ExprEngine.evaluate('max(10, 5, 20)'), 20);
    assert.strictEqual(ExprEngine.evaluate('round(3.14159, 2)'), 3.14);
    assert.strictEqual(ExprEngine.evaluate('floor(4.9)'), 4);
    assert.strictEqual(ExprEngine.evaluate('ceil(4.1)'), 5);
    assert.strictEqual(ExprEngine.evaluate('abs(-42)'), 42);
    assert.strictEqual(ExprEngine.evaluate('clamp(120, 0, 100)'), 100);
    assert.strictEqual(ExprEngine.evaluate('clamp(-10, 0, 100)'), 0);
    assert.strictEqual(ExprEngine.evaluate('avg(10, 20, 30)'), 20);
    assert.strictEqual(ExprEngine.evaluate('sum(1, 2, 3, 4)'), 10);
  });

  // 7. Formatting & Conversion Built-ins
  await t.test('evaluates formatting built-ins (fmt, bytes, pct, dur)', () => {
    assert.strictEqual(ExprEngine.evaluate('fmt(42.5678, 1)'), '42.6');
    assert.strictEqual(ExprEngine.evaluate('bytes(1024)'), '1 KB');
    assert.strictEqual(ExprEngine.evaluate('bytes(1048576)'), '1 MB');
    assert.strictEqual(ExprEngine.evaluate('bytes(1073741824)'), '1 GB');
    assert.strictEqual(ExprEngine.evaluate('pct(75, 100)'), '75%');
    assert.strictEqual(ExprEngine.evaluate('dur(45)'), '45s');
    assert.strictEqual(ExprEngine.evaluate('dur(135)'), '2m 15s');
    assert.strictEqual(ExprEngine.evaluate('dur(7200)'), '2h');
    assert.strictEqual(ExprEngine.evaluate('dur(90000)'), '1d 1h');
  });

  // 8. Strict Security & Prototype Pollution Protection
  await t.test('blocks prototype access and constructor tampering', () => {
    assert.strictEqual(ExprEngine.evaluate('__proto__'), undefined);
    assert.strictEqual(ExprEngine.evaluate('constructor'), undefined);
    assert.strictEqual(ExprEngine.evaluate('prototype'), undefined);
    assert.strictEqual(ExprEngine.evaluate('obj.__proto__', { obj: {} }), undefined);
    assert.strictEqual(ExprEngine.evaluate('obj["constructor"]', { obj: {} }), undefined);
  });

  // 9. Zero eval/new Function Verification
  await t.test('source code contains strictly zero eval or new Function', () => {
    let exprCode = fs.readFileSync(path.join(__dirname, '../public/js/widgets/expr.js'), 'utf-8');
    // Strip comments
    exprCode = exprCode.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    assert.strictEqual(/\beval\s*\(/.test(exprCode), false, 'expr.js must never call eval()');
    assert.strictEqual(/new\s+Function\b/.test(exprCode), false, 'expr.js must never instantiate new Function()');
  });

  // 10. Robustness & Fuzz Testing (50 random syntax variations)
  await t.test('handles fuzzed and malformed inputs cleanly without throwing', () => {
    const fuzzInputs = [
      '', '   ', '???', '+++', '---', '((((', '))))', '12 + * 4',
      'foo..bar', 'a[?]', 'min()', 'max(,,)', 'null.foo',
      'true ? : 5', '\"unclosed string', '12.34.56',
      'NaN', 'undefined', '!!!---+++', '0 / 0 / 0'
    ];
    for (const input of fuzzInputs) {
      assert.doesNotThrow(() => {
        ExprEngine.evaluate(input);
      }, `Evaluating "${input}" should not throw uncaught error`);
    }
  });
});

test('P08 Widget Registry & Lifecycle Contract', async (t) => {
  await t.test('defines and registers widget with normalized manifest', () => {
    const mockWidget = {
      type: 'mock_test',
      version: 2,
      label: { en: 'Mock', fa: 'ماک' },
      size: { min: [100, 50], preferred: [250, 100] },
      mount(ctx) {
        ctx.el.innerHTML = '<span>Mounted</span>';
        return {
          update: () => {},
          destroy: () => {}
        };
      }
    };

    const registered = WidgetRegistry.register(mockWidget);
    assert.strictEqual(registered.type, 'mock_test');
    assert.strictEqual(registered.version, 2);

    const retrieved = WidgetRegistry.get('mock_test');
    assert.strictEqual(retrieved.type, 'mock_test');

    const manifest = WidgetRegistry.getManifest('mock_test');
    assert.strictEqual(manifest.type, 'mock_test');
    assert.strictEqual(manifest.label.en, 'Mock');
  });

  await t.test('computes size classes (XS, S, M, L, XL) correctly', () => {
    assert.strictEqual(WidgetRegistry.computeSizeClass(90), 'xs');
    assert.strictEqual(WidgetRegistry.computeSizeClass(180), 's');
    assert.strictEqual(WidgetRegistry.computeSizeClass(280), 'm');
    assert.strictEqual(WidgetRegistry.computeSizeClass(450), 'l');
    assert.strictEqual(WidgetRegistry.computeSizeClass(600), 'xl');
  });

  await t.test('missing widget mounts graceful placeholder', () => {
    const dummyEl = {
      innerHTML: '',
      classList: { add: () => {}, remove: () => {} }
    };
    const instance = WidgetRegistry.mount('non_existent_widget', dummyEl);
    assert.ok(dummyEl.innerHTML.includes('MISSING WIDGET'));
    assert.doesNotThrow(() => instance.update());
    assert.doesNotThrow(() => instance.destroy());
  });

  await t.test('error isolation catches throwing widget without crashing', () => {
    WidgetRegistry.register({
      type: 'throwing_widget',
      mount() {
        throw new Error('Simulated mount crash');
      }
    });

    const dummyEl = {
      innerHTML: '',
      classList: { add: () => {}, remove: () => {} }
    };
    const instance = WidgetRegistry.mount('throwing_widget', dummyEl);
    assert.ok(dummyEl.innerHTML.includes('WIDGET ERROR'));
    assert.ok(dummyEl.innerHTML.includes('Simulated mount crash'));
    assert.doesNotThrow(() => instance.update());
    assert.doesNotThrow(() => instance.destroy());
  });

  await t.test('scope disposes subscriptions and intervals cleanly', () => {
    const scope = WidgetRegistry.createScope();
    let cleaned = false;
    scope.add(() => {
      cleaned = true;
    });
    assert.strictEqual(cleaned, false);
    scope.dispose();
    assert.strictEqual(cleaned, true);
  });
});
