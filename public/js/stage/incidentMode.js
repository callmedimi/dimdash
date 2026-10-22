/**
 * DimDash Incident Commander Mode (F5)
 * Root-cause analysis via dependency graphs, calm status-driven pulses,
 * unaffected island dimming, and incident lifecycle timeline tracking.
 * Universal Module (Node.js & Browser)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashIncidentMode = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class IncidentCommander {
    constructor(options = {}) {
      this.enabled = options.enabled !== false;
      this.activeIncident = null;
      this.incidentHistory = [];
      this.listeners = new Set();
    }

    /**
     * Computes root-cause failure analysis from item dependencies.
     * items: list of items with id, status, depends_on: [id]
     */
    analyzeRootCause(items = []) {
      const failingItems = items.filter(
        (it) => it.status === 'crit' || it.status === 'offline' || it.status === 'error'
      );
      if (failingItems.length === 0) return { rootCauses: [], cascades: [] };

      const failingMap = new Map(failingItems.map((it) => [it.id, it]));
      const rootCauses = [];
      const cascades = [];

      for (const item of failingItems) {
        // Check if any upstream dependency of this item is also failing
        const upstreamFailing = (item.depends_on || []).filter((depId) => failingMap.has(depId));
        if (upstreamFailing.length === 0) {
          // No upstream failure explains this -> this is a Root Cause!
          rootCauses.push(item);
        } else {
          // Upstream failure exists -> this is a downstream cascade
          cascades.push({
            item,
            causedBy: upstreamFailing
          });
        }
      }

      return { rootCauses, cascades };
    }

    /**
     * Evaluates current board telemetry and updates incident lifecycle state.
     */
    updateTelemetry(items = [], islands = []) {
      const { rootCauses, cascades } = this.analyzeRootCause(items);
      const isIncidentActive = rootCauses.length > 0;

      if (isIncidentActive) {
        if (!this.activeIncident) {
          // New incident started
          this.activeIncident = {
            id: `inc-${Date.now()}`,
            startedAt: Date.now(),
            acknowledged: false,
            rootCauses: rootCauses.map((r) => r.id),
            cascades: cascades.map((c) => c.item.id),
            failingIslandIds: Array.from(new Set(rootCauses.map((r) => r.islandId).filter(Boolean)))
          };
          this._notify('incident_start', this.activeIncident);
        } else {
          // Update existing incident
          this.activeIncident.rootCauses = rootCauses.map((r) => r.id);
          this.activeIncident.cascades = cascades.map((c) => c.item.id);
          this.activeIncident.failingIslandIds = Array.from(
            new Set(rootCauses.map((r) => r.islandId).filter(Boolean))
          );
          this._notify('incident_update', this.activeIncident);
        }
      } else if (this.activeIncident) {
        // Incident resolved
        const resolvedIncident = {
          ...this.activeIncident,
          resolvedAt: Date.now(),
          durationMs: Date.now() - this.activeIncident.startedAt
        };
        this.incidentHistory.unshift(resolvedIncident);
        this.activeIncident = null;
        this._notify('incident_resolved', resolvedIncident);
      }

      return {
        active: !!this.activeIncident,
        incident: this.activeIncident,
        rootCauses,
        cascades
      };
    }

    acknowledge() {
      if (this.activeIncident) {
        this.activeIncident.acknowledged = true;
        this.activeIncident.acknowledgedAt = Date.now();
        this._notify('incident_acknowledged', this.activeIncident);
        return true;
      }
      return false;
    }

    /**
     * Determines visual styling for islands in incident mode:
     * - Failing islands: pulse = true, dimmed = false
     * - Healthy islands: pulse = false, dimmed = true (35% opacity)
     */
    getIslandVisualStates(islandIds = []) {
      if (!this.activeIncident) {
        return islandIds.map((id) => ({ id, dimmed: false, pulse: false }));
      }

      const failingSet = new Set(this.activeIncident.failingIslandIds);
      return islandIds.map((id) => ({
        id,
        dimmed: !failingSet.has(id),
        pulse: failingSet.has(id) && !this.activeIncident.acknowledged
      }));
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
          console.error('[IncidentCommander] listener error:', e);
        }
      }
    }
  }

  return {
    IncidentCommander
  };
});
