const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const MotionEngine = require('../public/js/ui/motion.js');
const { runContrastSuite, calcAPCA, calcWCAG } = require('../tools/contrast-check.js');

test('P07 Design System: Spring Physics & Motion Engine', async (t) => {
  await t.test('solveSpring generates settling curve points', () => {
    const { points, duration } = MotionEngine.solveSpring(1, 260, 26, 30);
    assert.strictEqual(points.length, 31);
    assert.strictEqual(points[0], 0.0);
    // Last point should settle close to 1.0 (settled within 1%)
    assert.ok(Math.abs(points[30] - 1.0) < 0.02, `Final point ${points[30]} should settle near 1.0`);
    assert.ok(duration >= 200 && duration <= 1000, `Duration ${duration} should be realistic`);
  });

  await t.test('pointsToCssLinear produces valid CSS linear() string', () => {
    const points = [0, 0.5, 0.9, 1.0];
    const css = MotionEngine.pointsToCssLinear(points);
    assert.ok(css.startsWith('linear('));
    assert.ok(css.includes('0 0%'));
    assert.ok(css.includes('1 100%'));
  });

  await t.test('Fallback bezier returns valid curves when linear() is unsupported', () => {
    const snappy = MotionEngine.getSpringEasing('snappy');
    assert.ok(typeof snappy === 'string' && (snappy.startsWith('linear(') || snappy.startsWith('cubic-bezier(')));

    const soft = MotionEngine.getSpringEasing('soft');
    assert.ok(typeof soft === 'string' && (soft.startsWith('linear(') || soft.startsWith('cubic-bezier(')));

    const bouncy = MotionEngine.getSpringEasing('bouncy');
    assert.ok(typeof bouncy === 'string' && (bouncy.startsWith('linear(') || bouncy.startsWith('cubic-bezier(')));
  });
});

test('P07 Design System: Contrast Ratios (APCA & WCAG 2.1)', async (t) => {
  await t.test('All 5 themes pass APCA Lc >= 75 for body and >= 60 for large text', () => {
    const { results, allPassed } = runContrastSuite();
    assert.strictEqual(allPassed, true, 'Every theme must satisfy contrast thresholds');
    assert.strictEqual(results.length, 5, 'Must test all 5 themes');

    for (const r of results) {
      assert.ok(r.primary.apca >= 75, `${r.theme} primary text APCA ${r.primary.apca} should be >= 75`);
      assert.ok(r.secondary.apca >= 60, `${r.theme} secondary text APCA ${r.secondary.apca} should be >= 60`);
      assert.ok(r.primary.wcag >= 7.0, `${r.theme} primary text WCAG ${r.primary.wcag}:1 should be >= 7.0 (AAA)`);
    }
  });

  await t.test('calcAPCA handles dark on light and light on dark', () => {
    const darkOnLight = calcAPCA([0, 0, 0], [255, 255, 255]);
    assert.ok(darkOnLight >= 90, 'Black on white should have very high contrast');

    const lightOnDark = calcAPCA([255, 255, 255], [0, 0, 0]);
    assert.ok(lightOnDark >= 90, 'White on black should have very high contrast');
  });
});

test('P07 Design System: Token & Material Architecture File Integrity', async (t) => {
  const cssDir = path.join(__dirname, '../public/css');

  await t.test('Required token and theme CSS files exist', () => {
    const requiredFiles = [
      '10-tokens.css',
      '11-themes.css',
      '20-typography.css',
      '50-materials.css',
      'components/pilot-light.css',
      'components/tick-ruler.css',
      'components/heartbeat.css',
      'components/icon-plate.css',
      'components/instruments.css'
    ];

    for (const file of requiredFiles) {
      const p = path.join(cssDir, file);
      assert.ok(fs.existsSync(p), `Missing required CSS file: ${file}`);
      const content = fs.readFileSync(p, 'utf-8');
      assert.ok(content.length > 50, `File ${file} should have meaningful content`);
    }
  });

  await t.test('50-materials.css includes all 6 core materials', () => {
    const p = path.join(cssDir, '50-materials.css');
    const content = fs.readFileSync(p, 'utf-8');
    assert.ok(content.includes('.material-matte'), 'Must include matte material');
    assert.ok(content.includes('.material-glass-static'), 'Must include glass-static material');
    assert.ok(content.includes('.material-paper'), 'Must include paper material');
    assert.ok(content.includes('.material-lcd'), 'Must include lcd material');
    assert.ok(content.includes('.material-blueprint'), 'Must include blueprint material');
    assert.ok(content.includes('.material-signal-plate'), 'Must include signal-plate material');
  });

  await t.test('pilot-light.css defines all 5 status shapes', () => {
    const p = path.join(cssDir, 'components/pilot-light.css');
    const content = fs.readFileSync(p, 'utf-8');
    assert.ok(content.includes('[data-status="ok"]'), 'Must include ok status');
    assert.ok(content.includes('[data-status="warn"]'), 'Must include warn status');
    assert.ok(content.includes('[data-status="crit"]'), 'Must include crit status');
    assert.ok(content.includes('[data-status="info"]'), 'Must include info status');
    assert.ok(content.includes('[data-status="unknown"]'), 'Must include unknown status');
  });

  await t.test('icon-plate.css defines brand, mono, and duotone modes', () => {
    const p = path.join(cssDir, 'components/icon-plate.css');
    const content = fs.readFileSync(p, 'utf-8');
    assert.ok(content.includes('.mode-brand'), 'Must include brand mode');
    assert.ok(content.includes('.mode-mono'), 'Must include mono mode');
    assert.ok(content.includes('.mode-duotone'), 'Must include duotone mode');
  });
});
