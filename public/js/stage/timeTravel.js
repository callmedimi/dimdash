/**
 * DimDash Time-Travel Scrubber (F6)
 * Scrub dashboard telemetry back in time across the 48-hour status buffer
 * with blueprint-tinted replay watermark and zero persistent state mutation.
 * Universal Module (Node.js & Browser)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashTimeTravel = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class TimeTravelEngine {
    constructor(options = {}) {
      this.maxHistoryMs = options.maxHistoryMs || 48 * 3600 * 1000; // 48h
      this.isReplaying = false;
      this.replayTime = null;
      this.snapshots = new Map(); // timestamp -> snapshot payload
      this.listeners = new Set();
    }

    /**
     * Stores a telemetry snapshot in the ring buffer
     */
    recordSnapshot(timestamp, snapshot) {
      const t = typeof timestamp === 'number' ? timestamp : Date.now();
      this.snapshots.set(t, snapshot);

      // Evict snapshots older than maxHistoryMs relative to the newest recorded timestamp
      let newest = t;
      for (const [k] of this.snapshots) {
        if (k > newest) newest = k;
      }
      const cutoff = newest - this.maxHistoryMs;

      for (const [k] of this.snapshots) {
        if (k < cutoff) {
          this.snapshots.delete(k);
        } else {
          break; // Map maintains insertion order
        }
      }
    }

    /**
     * Finds nearest snapshot at or immediately preceding target timestamp t
     */
    getSnapshotAt(targetTime) {
      if (this.snapshots.size === 0) return null;

      let nearestTime = null;
      let nearestDist = Infinity;

      for (const [t] of this.snapshots) {
        if (t <= targetTime) {
          const dist = targetTime - t;
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestTime = t;
          }
        }
      }

      if (nearestTime !== null) {
        return {
          time: nearestTime,
          deltaMs: targetTime - nearestTime,
          data: this.snapshots.get(nearestTime)
        };
      }

      // If all snapshots are in the future of targetTime, return earliest
      const firstEntry = this.snapshots.entries().next().value;
      return firstEntry ? { time: firstEntry[0], deltaMs: firstEntry[0] - targetTime, data: firstEntry[1] } : null;
    }

    /**
     * Enters replay mode at target timestamp
     */
    scrubTo(timestamp) {
      this.isReplaying = true;
      this.replayTime = timestamp;
      const snap = this.getSnapshotAt(timestamp);
      this._notify('scrub', { isReplaying: true, time: timestamp, snapshot: snap });
      return snap;
    }

    /**
     * Exits replay mode and returns to real-time live telemetry
     */
    returnToLive() {
      if (!this.isReplaying) return;
      this.isReplaying = false;
      this.replayTime = null;
      this._notify('live', { isReplaying: false, time: Date.now() });
    }

    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    _notify(event, payload) {
      for (const fn of this.listeners) {
        try {
          fn(event, payload);
        } catch (e) {
          console.error('[TimeTravel] listener error:', e);
        }
      }
    }
  }

  return {
    TimeTravelEngine
  };
});
