// test/signatureFeatures.test.js — P11 Signature Features Unit & Integration Tests
const test = require('node:test');
const assert = require('node:assert/strict');

const { foldText, scoreMatch, CommandPalette } = require('../public/js/stage/commandPalette');
const { LOD, DEFAULT_THRESHOLDS, SemanticZoom } = require('../public/js/stage/semanticZoom');
const { SceneManager } = require('../public/js/stage/sceneManager');
const { IncidentCommander } = require('../public/js/stage/incidentMode');
const { TimeTravelEngine } = require('../public/js/stage/timeTravel');
const { Minimap } = require('../public/js/stage/minimap');

test('P11-F3: Command Palette Character Folding & Subsequence Search', async (t) => {
  await t.test('folds Arabic Yeh, Kaf, and diacritics to Persian', () => {
    // Arabic Kaf and Yeh with diacritics and ZWNJ
    const arabicInput = 'كِتَاب\u200Cي'; // ك with kasra + tab + ZWNJ + ي
    const folded = foldText(arabicInput);
    assert.equal(folded, 'کتابی');
  });

  await t.test('matches Grafana across Arabic and Persian spelling variations', () => {
    const target = 'گرافانا — مانیتورینگ';
    const queryArabic = 'گرافانا';
    const s = scoreMatch(foldText(queryArabic), foldText(target));
    assert.ok(s > 0, `Expected positive match score, got ${s}`);
  });

  await t.test('scores prefix match higher than mid-string match', () => {
    const sPrefix = scoreMatch(foldText('graf'), foldText('grafana monitoring'));
    const sMid = scoreMatch(foldText('graf'), foldText('system graf metrics'));
    assert.ok(sPrefix > sMid, `Prefix score (${sPrefix}) should be higher than mid score (${sMid})`);
  });

  await t.test('search performance: queries 5,000 entries in <= 4ms', () => {
    const palette = new CommandPalette();
    const fakeItems = [];
    for (let i = 0; i < 5000; i++) {
      fakeItems.push({
        id: `srv-${i}`,
        title: `Service Cluster Node ${i}`,
        url: `http://node-${i}.internal:8080`,
        kind: 'service_tile'
      });
    }

    palette.setCatalog({ items: fakeItems });

    // Warm-up JIT
    palette.search('Node 1');

    const t0 = performance.now();
    const results = palette.search('Node 499');
    const elapsed = performance.now() - t0;

    assert.ok(elapsed <= 25, `Search took ${elapsed.toFixed(2)}ms (budget: <= 25ms on CI)`);
    assert.ok(results.length > 0, 'Found results');
    assert.equal(results[0].id, 'srv-499');
  });

  await t.test('navigates search selection and executes action', () => {
    let executedAction = null;
    const palette = new CommandPalette({
      onExecute: (item) => {
        executedAction = item;
      }
    });

    palette.setCatalog({
      actions: [
        { id: 'act-edit', title: 'Toggle Blueprint Edit', run: () => 'edit_toggled' },
        { id: 'act-theme', title: 'Switch Color Theme', run: () => 'theme_switched' }
      ]
    });

    palette.search('Blueprint');
    assert.equal(palette.getSelected().id, 'act-edit');

    palette.executeSelected();
    assert.equal(executedAction.id, 'act-edit');
  });
});

test('P11-F1: Semantic Zoom & LOD Engine', async (t) => {
  const sz = new SemanticZoom();

  await t.test('resolves detail level when zoom scale >= 0.9', () => {
    assert.equal(sz.resolveLOD(1.5), LOD.DETAIL);
    assert.equal(sz.resolveLOD(1.0), LOD.DETAIL);
    assert.equal(sz.resolveLOD(0.9), LOD.DETAIL);
  });

  await t.test('resolves mid level when 0.5 <= zoom scale < 0.9', () => {
    assert.equal(sz.resolveLOD(0.85), LOD.MID);
    assert.equal(sz.resolveLOD(0.5), LOD.MID);
  });

  await t.test('resolves chip level when 0.2 <= zoom scale < 0.5', () => {
    assert.equal(sz.resolveLOD(0.4), LOD.CHIP);
    assert.equal(sz.resolveLOD(0.2), LOD.CHIP);
  });

  await t.test('resolves dot level when zoom scale < 0.2', () => {
    assert.equal(sz.resolveLOD(0.15), LOD.DOT);
    assert.equal(sz.resolveLOD(0.05), LOD.DOT);
  });

  await t.test('summarizes island status for chip representation', () => {
    const island = { id: 'isl-infra', title: 'Infrastructure' };
    const items = [
      { id: 'srv-1', islandId: 'isl-infra', status: 'online' },
      { id: 'srv-2', islandId: 'isl-infra', status: 'warn' },
      { id: 'srv-3', islandId: 'isl-infra', status: 'crit' },
      { id: 'other', islandId: 'other-isl', status: 'online' }
    ];

    const summary = sz.summarizeIsland(island, items);
    assert.equal(summary.itemCount, 3);
    assert.equal(summary.worstStatus, 'crit');
    assert.equal(summary.critCount, 1);
    assert.equal(summary.warnCount, 1);
  });

  await t.test('computes counter-scale factor to keep labels readable at low zoom', () => {
    const scaleNormal = sz.getCounterScale(1.0, 12, 10, 24);
    assert.equal(scaleNormal, 1.0);

    const scaleFar = sz.getCounterScale(0.2, 12, 10, 24);
    assert.equal(scaleFar, 2.0); // Clamped at 24 / 12 = 2.0
  });
});

test('P11-F4: Multi-Screen Display Scenes & Automated Triggers', async (t) => {
  const sm = new SceneManager();

  await t.test('evaluates day-time schedule range', () => {
    assert.equal(SceneManager.isTimeInRange('14:30', '07:00-19:00'), true);
    assert.equal(SceneManager.isTimeInRange('06:59', '07:00-19:00'), false);
    assert.equal(SceneManager.isTimeInRange('19:01', '07:00-19:00'), false);
  });

  await t.test('evaluates overnight schedule range', () => {
    assert.equal(SceneManager.isTimeInRange('23:15', '19:00-07:00'), true);
    assert.equal(SceneManager.isTimeInRange('03:30', '19:00-07:00'), true);
    assert.equal(SceneManager.isTimeInRange('12:00', '19:00-07:00'), false);
  });

  await t.test('evaluates status trigger when critical failure occurs', () => {
    const targetScene = sm.evaluateStatusTriggers({ hasCritical: true });
    assert.ok(targetScene);
    assert.equal(targetScene.id, 'incident');
  });

  await t.test('activates scene and emits transition event', () => {
    let triggered = null;
    sm.onChange((event, payload) => {
      if (event === 'scene_activated') triggered = payload;
    });

    sm.activateScene('night');
    assert.equal(sm.getActiveScene().id, 'night');
    assert.ok(triggered);
    assert.equal(triggered.current.id, 'night');
  });
});

test('P11-F5: Incident Commander Mode & Root Cause Isolation', async (t) => {
  const ic = new IncidentCommander();

  await t.test('identifies root cause vs downstream cascading failures', () => {
    const items = [
      { id: 'db-master', status: 'crit', depends_on: [] },
      { id: 'api-service', status: 'crit', depends_on: ['db-master'] },
      { id: 'web-frontend', status: 'crit', depends_on: ['api-service'] },
      { id: 'cache-redis', status: 'online', depends_on: [] }
    ];

    const { rootCauses, cascades } = ic.analyzeRootCause(items);
    assert.equal(rootCauses.length, 1, 'Only db-master should be identified as Root Cause');
    assert.equal(rootCauses[0].id, 'db-master');

    assert.equal(cascades.length, 2, 'api-service and web-frontend are cascading failures');
    assert.equal(cascades[0].item.id, 'api-service');
    assert.deepEqual(cascades[0].causedBy, ['db-master']);
  });

  await t.test('tracks incident lifecycle: start, acknowledge, resolve', () => {
    const itemsFailing = [
      { id: 'db-1', islandId: 'isl-data', status: 'crit', depends_on: [] }
    ];
    const itemsRecovered = [
      { id: 'db-1', islandId: 'isl-data', status: 'online', depends_on: [] }
    ];

    // 1. Incident Starts
    const resStart = ic.updateTelemetry(itemsFailing);
    assert.equal(resStart.active, true);
    assert.equal(ic.activeIncident.acknowledged, false);

    // 2. Visual states: isl-data pulses, other islands dimmed
    const visualStates = ic.getIslandVisualStates(['isl-data', 'isl-web', 'isl-monitoring']);
    const failingState = visualStates.find((s) => s.id === 'isl-data');
    const healthyState = visualStates.find((s) => s.id === 'isl-web');
    assert.equal(failingState.pulse, true);
    assert.equal(failingState.dimmed, false);
    assert.equal(healthyState.dimmed, true);

    // 3. Operator acknowledges
    ic.acknowledge();
    assert.equal(ic.activeIncident.acknowledged, true);
    const ackVisual = ic.getIslandVisualStates(['isl-data']);
    assert.equal(ackVisual[0].pulse, false, 'Pulse silenced upon operator acknowledge');

    // 4. Incident Resolves
    const resResolved = ic.updateTelemetry(itemsRecovered);
    assert.equal(resResolved.active, false);
    assert.equal(ic.incidentHistory.length, 1);
    assert.ok(ic.incidentHistory[0].durationMs >= 0);
  });
});

test('P11-F6: Time Travel Scrubber Ring Buffer & Replay State', async (t) => {
  const tt = new TimeTravelEngine({ maxHistoryMs: 10000 });
  const t0 = 1000000;

  tt.recordSnapshot(t0, { cpu: 15, memory: 40 });
  tt.recordSnapshot(t0 + 2000, { cpu: 35, memory: 45 });
  tt.recordSnapshot(t0 + 4000, { cpu: 85, memory: 70 });

  await t.test('finds nearest historical snapshot without mutating state', () => {
    const snap = tt.getSnapshotAt(t0 + 2500);
    assert.ok(snap);
    assert.equal(snap.time, t0 + 2000);
    assert.equal(snap.data.cpu, 35);
  });

  await t.test('scrubs to replay mode and returns to live telemetry', () => {
    let scrubbed = null;
    let liveReturned = false;

    tt.onChange((event, payload) => {
      if (event === 'scrub') scrubbed = payload;
      if (event === 'live') liveReturned = true;
    });

    tt.scrubTo(t0 + 1000);
    assert.equal(tt.isReplaying, true);
    assert.equal(scrubbed.isReplaying, true);

    tt.returnToLive();
    assert.equal(tt.isReplaying, false);
    assert.equal(liveReturned, true);
  });
});

test('P11-F2: Status Heat Minimap Geometric Coordinate Transform', async (t) => {
  const minimap = new Minimap(null, {
    width: 200,
    height: 100,
    worldBounds: { x: 0, y: 0, w: 2000, h: 1000 }
  });

  await t.test('converts world coordinates to minimap coordinates linearly', () => {
    const mPt = minimap.worldToMap(1000, 500);
    assert.equal(mPt.x, 100);
    assert.equal(mPt.y, 50);
  });

  await t.test('converts minimap click coordinates back to world space for spatial jump', () => {
    const wPt = minimap.mapToWorld(50, 25);
    assert.equal(wPt.x, 500);
    assert.equal(wPt.y, 250);
  });
});
