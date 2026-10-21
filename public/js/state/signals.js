/**
 * DimDash Reactive Signals & Time-Sliced Scheduler
 * Ultra-lightweight, zero-dependency fine-grained reactivity.
 * Features:
 * - Signal, Computed, Effect with automatic dependency tracking
 * - Batching to coalesce multiple signal updates
 * - Epsilon change guards to prevent redundant DOM updates on micro-jitter
 * - Time-sliced scheduler queue (<= 4ms slice per frame)
 * Universal module (Node.js & Browser)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashSignals = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let currentSubscriber = null;
  const subscriberStack = [];

  let isBatching = false;
  const pendingEffects = new Set();

  /**
   * Signal: reactive state cell
   */
  class Signal {
    constructor(initialValue, options = {}) {
      this._value = initialValue;
      this.subscribers = new Set();
      this.options = options;
      // Optional epsilon for numbers: ignores updates where |v - old| < epsilon
      this.epsilon = options.epsilon !== undefined ? options.epsilon : 0;
    }

    get value() {
      if (currentSubscriber) {
        this.subscribers.add(currentSubscriber);
        currentSubscriber.dependencies.add(this);
      }
      return this._value;
    }

    set value(newValue) {
      if (this.epsilon > 0 && typeof this._value === 'number' && typeof newValue === 'number') {
        if (Math.abs(newValue - this._value) < this.epsilon) {
          return; // Suppress micro-jitter update
        }
      } else if (this._value === newValue) {
        return;
      }

      this._value = newValue;
      this.notify();
    }

    peek() {
      return this._value;
    }

    notify() {
      for (const sub of Array.from(this.subscribers)) {
        if (isBatching) {
          pendingEffects.add(sub);
        } else {
          sub.run();
        }
      }
    }

    subscribe(callback) {
      const sub = {
        run: () => callback(this._value),
        dependencies: new Set()
      };
      this.subscribers.add(sub);
      return () => this.subscribers.delete(sub);
    }
  }

  /**
   * Computed: memoized derived reactive value
   */
  class Computed {
    constructor(fn) {
      this.fn = fn;
      this._value = undefined;
      this.dirty = true;
      this.subscribers = new Set();
      this.dependencies = new Set();

      this.runner = {
        run: () => {
          this.dirty = true;
          this.notify();
        },
        dependencies: this.dependencies
      };
    }

    get value() {
      if (currentSubscriber) {
        this.subscribers.add(currentSubscriber);
        currentSubscriber.dependencies.add(this);
      }

      if (this.dirty) {
        this.cleanup();
        subscriberStack.push(this.runner);
        currentSubscriber = this.runner;
        try {
          this._value = this.fn();
          this.dirty = false;
        } finally {
          subscriberStack.pop();
          currentSubscriber = subscriberStack[subscriberStack.length - 1] || null;
        }
      }
      return this._value;
    }

    peek() {
      return this.value;
    }

    cleanup() {
      for (const dep of this.dependencies) {
        dep.subscribers.delete(this.runner);
      }
      this.dependencies.clear();
    }

    notify() {
      for (const sub of Array.from(this.subscribers)) {
        if (isBatching) {
          pendingEffects.add(sub);
        } else {
          sub.run();
        }
      }
    }
  }

  /**
   * Effect: runs side-effect and re-executes whenever dependencies change
   */
  class Effect {
    constructor(fn) {
      this.fn = fn;
      this.dependencies = new Set();
      this.disposed = false;

      this.runner = {
        run: () => this.execute(),
        dependencies: this.dependencies
      };

      this.execute();
    }

    execute() {
      if (this.disposed) return;
      this.cleanup();

      subscriberStack.push(this.runner);
      currentSubscriber = this.runner;
      try {
        this.fn();
      } finally {
        subscriberStack.pop();
        currentSubscriber = subscriberStack[subscriberStack.length - 1] || null;
      }
    }

    cleanup() {
      for (const dep of this.dependencies) {
        dep.subscribers.delete(this.runner);
      }
      this.dependencies.clear();
    }

    dispose() {
      this.disposed = true;
      this.cleanup();
    }
  }

  function signal(initialValue, options) {
    return new Signal(initialValue, options);
  }

  function computed(fn) {
    return new Computed(fn);
  }

  function effect(fn) {
    const eff = new Effect(fn);
    return () => eff.dispose();
  }

  function batch(fn) {
    if (isBatching) {
      return fn();
    }
    isBatching = true;
    try {
      return fn();
    } finally {
      isBatching = false;
      const effectsToRun = Array.from(pendingEffects);
      pendingEffects.clear();
      for (const eff of effectsToRun) {
        eff.run();
      }
    }
  }

  /**
   * Time-Sliced Work Scheduler
   * Runs tasks in time slices <= budgetMs per frame.
   */
  class TimeSlicedScheduler {
    constructor(budgetMs = 4) {
      this.budgetMs = budgetMs;
      this.queue = [];
      this.isProcessing = false;
      this.rafHandle = null;
    }

    enqueue(task) {
      this.queue.push(task);
      this.schedule();
    }

    schedule() {
      if (this.isProcessing || this.queue.length === 0) return;
      if (typeof requestAnimationFrame !== 'undefined') {
        if (!this.rafHandle) {
          this.rafHandle = requestAnimationFrame(() => this.process());
        }
      } else {
        setTimeout(() => this.process(), 0);
      }
    }

    process() {
      this.rafHandle = null;
      this.isProcessing = true;
      const startTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());

      while (this.queue.length > 0) {
        const task = this.queue.shift();
        try {
          task();
        } catch (err) {
          console.error('[TimeSlicedScheduler] Task error:', err);
        }

        const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
        if (elapsed >= this.budgetMs && this.queue.length > 0) {
          // Yield to next frame
          this.isProcessing = false;
          this.schedule();
          return;
        }
      }

      this.isProcessing = false;
    }

    clear() {
      this.queue = [];
      if (this.rafHandle && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.rafHandle);
      }
      this.rafHandle = null;
      this.isProcessing = false;
    }
  }

  /**
   * Normalised Reactive Store for Stage and Widgets
   */
  class ReactiveStore {
    constructor() {
      this.signals = new Map(); // key -> Signal
      this.scheduler = new TimeSlicedScheduler(4); // 4ms budget
    }

    get(key, defaultValue = null, options = {}) {
      let sig = this.signals.get(key);
      if (!sig) {
        sig = new Signal(defaultValue, options);
        this.signals.set(key, sig);
      }
      return sig;
    }

    set(key, value) {
      const sig = this.get(key);
      sig.value = value;
    }

    /**
     * Applies delta updates from server SSE (e.g. telemetry_delta)
     * with epsilon filtering and time-sliced batching
     */
    applyDelta(deltaMap) {
      this.scheduler.enqueue(() => {
        batch(() => {
          for (const [k, v] of Object.entries(deltaMap)) {
            this.set(k, v);
          }
        });
      });
    }

    clear() {
      this.signals.clear();
      this.scheduler.clear();
    }
  }

  return {
    Signal,
    Computed,
    Effect,
    signal,
    computed,
    effect,
    batch,
    TimeSlicedScheduler,
    ReactiveStore
  };
});
