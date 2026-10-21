/**
 * DimDash Reactive Signals & Store Unit Tests
 * Tests signals, computed cells, effects, epsilon guards, batching, and store deltas.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { signal, computed, effect, batch, ReactiveStore } = require('../public/js/state/signals.js');

describe('Reactive Signals Engine', () => {

  test('signal stores initial value and notifies subscribers on update', () => {
    const count = signal(10);
    assert.equal(count.value, 10);

    let observed = 0;
    count.subscribe(val => { observed = val; });

    count.value = 25;
    assert.equal(observed, 25);
    assert.equal(count.value, 25);
  });

  test('epsilon change guard prevents notifications on micro-jitter', () => {
    // Epsilon = 0.5 (e.g. gauge changes < 0.5% ignored)
    const cpu = signal(50.0, { epsilon: 0.5 });
    let notifyCount = 0;

    cpu.subscribe(() => { notifyCount++; });

    // Update with delta 0.2 < 0.5 epsilon -> suppressed!
    cpu.value = 50.2;
    assert.equal(notifyCount, 0);
    assert.equal(cpu.peek(), 50.0);

    // Update with delta 0.8 > 0.5 epsilon -> fires!
    cpu.value = 50.8;
    assert.equal(notifyCount, 1);
    assert.equal(cpu.value, 50.8);
  });

  test('computed values auto-track dependencies and memoize', () => {
    const a = signal(5);
    const b = signal(10);
    let computeRuns = 0;

    const sum = computed(() => {
      computeRuns++;
      return a.value + b.value;
    });

    assert.equal(sum.value, 15);
    assert.equal(computeRuns, 1);

    // Reading again without changes uses memoized cache
    assert.equal(sum.value, 15);
    assert.equal(computeRuns, 1);

    // Change dependency -> dirty flag set
    a.value = 12;
    assert.equal(sum.value, 22);
    assert.equal(computeRuns, 2);
  });

  test('effect automatically runs and cleans up on dispose', () => {
    const temp = signal(20);
    let output = '';

    const dispose = effect(() => {
      output = `Temperature is ${temp.value}C`;
    });

    assert.equal(output, 'Temperature is 20C');

    temp.value = 24;
    assert.equal(output, 'Temperature is 24C');

    // Dispose
    dispose();
    temp.value = 35;
    assert.equal(output, 'Temperature is 24C'); // Not updated after dispose
  });

  test('batch coalesces multiple writes into a single effect execution', () => {
    const x = signal(0);
    const y = signal(0);
    let effectCount = 0;

    effect(() => {
      // read both
      const _ = x.value + y.value;
      effectCount++;
    });

    assert.equal(effectCount, 1); // initial run

    batch(() => {
      x.value = 10;
      y.value = 20;
      x.value = 30;
    });

    // Ran only once for the batch instead of 3 times
    assert.equal(effectCount, 2);
  });

  test('ReactiveStore applies delta updates cleanly', () => {
    const store = new ReactiveStore();
    const cpuSig = store.get('server:local.cpu', 0);
    const memSig = store.get('server:local.mem', 0);

    let observedCpu = 0;
    cpuSig.subscribe(v => { observedCpu = v; });

    store.set('server:local.cpu', 65);
    assert.equal(observedCpu, 65);

    store.set('server:local.mem', 80);
    assert.equal(memSig.value, 80);
  });
});
