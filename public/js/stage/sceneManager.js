/**
 * DimDash Scene Manager (F4)
 * Multi-display scene orchestrator with automated schedule triggers,
 * status-rule activations, and zero-DOM-recreation cross-fades.
 * Universal Module (Node.js & Browser)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashSceneManager = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_SCENES = [
    {
      id: 'day',
      name: 'Day Operations',
      theme: 'default',
      profile: null,
      camera: { x: 0, y: 0, z: 1.0 },
      schedule: '07:00-19:00',
      dimmedIslands: []
    },
    {
      id: 'night',
      name: 'Night Watch (OLED)',
      theme: 'oled',
      profile: null,
      camera: { x: 0, y: 0, z: 1.0 },
      schedule: '19:00-07:00',
      dimmedIslands: []
    },
    {
      id: 'incident',
      name: 'Incident Commander',
      theme: 'signal',
      profile: null,
      camera: { x: 0, y: 0, z: 1.0 },
      rule: 'has_critical',
      dimmedIslands: []
    },
    {
      id: 'wall',
      name: 'NOC Video Wall',
      theme: 'glass',
      profile: 'wall',
      camera: { x: 0, y: 0, z: 1.2 },
      dimmedIslands: []
    }
  ];

  class SceneManager {
    constructor(options = {}) {
      this.scenes = options.scenes ? [...options.scenes] : [...DEFAULT_SCENES];
      this.activeSceneId = options.initialSceneId || 'day';
      this.listeners = new Set();
    }

    getScenes() {
      return [...this.scenes];
    }

    getScene(id) {
      return this.scenes.find((s) => s.id === id) || null;
    }

    getActiveScene() {
      return this.getScene(this.activeSceneId) || this.scenes[0];
    }

    addScene(scene) {
      if (!scene || !scene.id) return;
      this.scenes = this.scenes.filter((s) => s.id !== scene.id);
      this.scenes.push(scene);
      this._notify('scenes_changed', this.scenes);
    }

    activateScene(sceneId) {
      const target = this.getScene(sceneId);
      if (!target || target.id === this.activeSceneId) return target;

      const prev = this.getActiveScene();
      this.activeSceneId = target.id;
      this._notify('scene_activated', { current: target, previous: prev });
      return target;
    }

    /**
     * Checks if a given time HH:MM falls within a range like "07:00-19:00" or "20:00-06:00"
     */
    static isTimeInRange(timeStr, rangeStr) {
      if (!timeStr || !rangeStr) return false;
      const [start, end] = rangeStr.split('-');
      if (!start || !end) return false;

      const toMins = (t) => {
        const [h, m] = t.split(':').map((n) => parseInt(n, 10));
        return h * 60 + (m || 0);
      };

      const curM = toMins(timeStr);
      const startM = toMins(start);
      const endM = toMins(end);

      if (startM <= endM) {
        return curM >= startM && curM < endM;
      }
      // Overnight range, e.g. 19:00 to 07:00
      return curM >= startM || curM < endM;
    }

    /**
     * Evaluates schedule rules against current time (HH:MM)
     */
    evaluateSchedule(currentTimeStr) {
      for (const scene of this.scenes) {
        if (scene.schedule && SceneManager.isTimeInRange(currentTimeStr, scene.schedule)) {
          return scene;
        }
      }
      return null;
    }

    /**
     * Evaluates status triggers (e.g. has_critical)
     */
    evaluateStatusTriggers(statusSummary = {}) {
      if (statusSummary.hasCritical) {
        const incidentScene = this.scenes.find((s) => s.rule === 'has_critical');
        if (incidentScene) return incidentScene;
      }
      return null;
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
          console.error('[SceneManager] listener error:', e);
        }
      }
    }
  }

  return {
    DEFAULT_SCENES,
    SceneManager
  };
});
