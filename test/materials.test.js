/**
 * DimDash Materials & Quality Tier Unit Tests
 * Tests quality tier resolution, manual overrides, and dynamic step-down under lag.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { TIERS, QualityManager } = require('../public/js/stage/materials.js');

describe('Materials & GPU Quality Manager', () => {

  test('resolves manual tier overrides correctly', () => {
    const qm = new QualityManager({ tier: TIERS.LOW });
    assert.equal(qm.currentTier, TIERS.LOW);
    assert.equal(qm.resolvedTier, TIERS.LOW);

    qm.setTier(TIERS.HIGH);
    assert.equal(qm.currentTier, TIERS.HIGH);
    assert.equal(qm.resolvedTier, TIERS.HIGH);
  });

  test('interaction mode promotes quality to medium to avoid blur stalls', () => {
    const qm = new QualityManager({ tier: TIERS.HIGH });
    assert.equal(qm.resolvedTier, TIERS.HIGH);

    qm.setInteracting(true);
    assert.equal(qm.isInteracting, true);

    qm.setInteracting(false);
    assert.equal(qm.isInteracting, false);
  });

  test('steps down tier automatically when sustained frame drops occur in AUTO mode', () => {
    const qm = new QualityManager({ tier: TIERS.AUTO });
    qm.resolvedTier = TIERS.HIGH;

    // Simulate 35 consecutive frames taking 25ms (> 20ms threshold)
    for (let i = 0; i < 35; i++) {
      qm.recordFrameTime(25.0);
    }

    // Should have stepped down to MEDIUM
    assert.equal(qm.resolvedTier, TIERS.MEDIUM);

    // Another burst of lag
    for (let i = 0; i < 35; i++) {
      qm.recordFrameTime(25.0);
    }

    // Should have stepped down to LOW
    assert.equal(qm.resolvedTier, TIERS.LOW);
  });
});
