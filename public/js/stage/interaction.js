/**
 * DimDash Interaction Engine & State Machine
 * WYSIWYG, in-place direct manipulation on the Stage:
 * Move, Resize, Pan, Marquee Lasso, Carry Mode, Magnetic Snap, and Optimistic Patch Commits.
 * Universal module (Node.js & Browser)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashInteraction = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Interaction State Machine States
  const STATES = {
    IDLE: 'idle',
    HOVER: 'hover',
    ARMED: 'armed',
    MOVE: 'move',
    RESIZE: 'resize',
    PAN: 'pan',
    LASSO: 'lasso',
    CARRY: 'carry',
    COMMITTING: 'committing'
  };

  class HistoryController {
    constructor(maxEntries = 200) {
      this.maxEntries = maxEntries;
      this.undoStack = [];
      this.redoStack = [];
      this.lastActionTime = 0;
      this.coalesceThreshold = 500; // ms
    }

    push(entry) {
      // entry: { type: 'move'|'resize'|'delete'|'add', patches: [...], inverse: [...] }
      const now = Date.now();
      const last = this.undoStack[this.undoStack.length - 1];

      // Coalesce arrow key bursts on the same target
      if (
        last &&
        last.type === entry.type &&
        last.targetId === entry.targetId &&
        now - this.lastActionTime < this.coalesceThreshold &&
        entry.isCoalesceable
      ) {
        last.patches = entry.patches;
        // keep original inverse of first action in burst
        this.lastActionTime = now;
        return;
      }

      this.undoStack.push(entry);
      if (this.undoStack.length > this.maxEntries) {
        this.undoStack.shift();
      }
      this.redoStack = []; // clear redo stack on new action
      this.lastActionTime = now;
    }

    canUndo() {
      return this.undoStack.length > 0;
    }

    canRedo() {
      return this.redoStack.length > 0;
    }

    undo() {
      if (!this.canUndo()) return null;
      const entry = this.undoStack.pop();
      this.redoStack.push(entry);
      return entry.inverse;
    }

    redo() {
      if (!this.canRedo()) return null;
      const entry = this.redoStack.pop();
      this.undoStack.push(entry);
      return entry.patches;
    }

    clear() {
      this.undoStack = [];
      this.redoStack = [];
    }
  }

  class InteractionController {
    constructor(stageRenderer, options = {}) {
      this.stage = stageRenderer;
      this.options = options;

      this.isEditing = false;
      this.state = STATES.IDLE;
      this.selectedIds = new Set();
      this.activeHandle = null;

      this.history = new HistoryController(options.maxUndo || 200);

      // Captured drag/interaction session
      this.session = null;
      this.rafPending = false;
      this.promoteTimer = null;

      // Clipboard for copy/paste
      this.clipboard = null;

      // Keyboard carry state
      this.carryActive = false;

      // Event listener references for clean teardown
      this.boundPointerDown = this.onPointerDown.bind(this);
      this.boundPointerMove = this.onPointerMove.bind(this);
      this.boundPointerUp = this.onPointerUp.bind(this);
      this.boundPointerCancel = this.onPointerCancel.bind(this);
      this.boundKeyDown = this.onKeyDown.bind(this);
      this.boundWheel = this.onWheel.bind(this);

      if (this.stage && this.stage.viewportEl) {
        this.attachEvents();
      }
    }

    setEditing(isEditing) {
      this.isEditing = !!isEditing;
      if (this.stage?.viewportEl) {
        this.stage.viewportEl.classList.toggle('editing', this.isEditing);
        document.body.classList.toggle('stage-editing', this.isEditing);
      }
      if (!this.isEditing) {
        this.clearSelection();
        this.state = STATES.IDLE;
      }
      this.requestOverlayRedraw();
    }

    toggleEditing() {
      this.setEditing(!this.isEditing);
    }

    attachEvents() {
      const el = this.stage.viewportEl;
      if (!el) return;

      el.addEventListener('pointerdown', this.boundPointerDown);
      el.addEventListener('pointermove', this.boundPointerMove);
      el.addEventListener('pointerup', this.boundPointerUp);
      el.addEventListener('pointercancel', this.boundPointerCancel);
      el.addEventListener('wheel', this.boundWheel, { passive: false });
      window.addEventListener('keydown', this.boundKeyDown);
    }

    detachEvents() {
      const el = this.stage?.viewportEl;
      if (el) {
        el.removeEventListener('pointerdown', this.boundPointerDown);
        el.removeEventListener('pointermove', this.boundPointerMove);
        el.removeEventListener('pointerup', this.boundPointerUp);
        el.removeEventListener('pointercancel', this.boundPointerCancel);
        el.removeEventListener('wheel', this.boundWheel);
      }
      window.removeEventListener('keydown', this.boundKeyDown);
    }

    /* -------------------------------------------------------------
     * Selection Management
     * ------------------------------------------------------------- */
    selectItem(id, multi = false) {
      if (!multi) {
        this.selectedIds.clear();
      }
      if (id) {
        this.selectedIds.add(id);
      }
      this.syncSelectionDom();
      this.requestOverlayRedraw();
    }

    toggleItemSelection(id) {
      if (this.selectedIds.has(id)) {
        this.selectedIds.delete(id);
      } else {
        this.selectedIds.add(id);
      }
      this.syncSelectionDom();
      this.requestOverlayRedraw();
    }

    clearSelection() {
      this.selectedIds.clear();
      this.syncSelectionDom();
      this.requestOverlayRedraw();
    }

    syncSelectionDom() {
      if (!this.stage?.itemElements) return;
      for (const [id, el] of this.stage.itemElements.entries()) {
        const isSelected = this.selectedIds.has(id);
        el.classList.toggle('is-selected', isSelected);
      }
    }

    getSelectedWorldRects() {
      if (!this.stage?.board?.layout) return [];
      const profile = this.stage.currentProfile?.id || 'lg';
      const placement = this.stage.board.layout.profiles?.[profile]?.placement || {};
      const rects = [];

      for (const id of this.selectedIds) {
        const p = placement[id];
        if (p) {
          rects.push({
            id,
            x: p.x,
            y: p.y,
            w: p.w,
            h: p.h,
            z: p.z || 1
          });
        }
      }
      return rects;
    }

    /* -------------------------------------------------------------
     * Pointer Event Handlers
     * ------------------------------------------------------------- */
    onPointerDown(e) {
      if (!this.isEditing) return;

      const viewportEl = this.stage.viewportEl;
      const camera = this.stage.camera || { x: 0, y: 0, z: 1 };
      const wu = this.stage.metrics ? this.stage.metrics.wu : 1.0;
      const isCoarse = e.pointerType === 'touch' || window.matchMedia?.('(pointer: coarse)').matches;

      const rect = viewportEl.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      // 1. Check Handle Hit Test on currently selected items
      const selectedRects = this.getSelectedWorldRects();
      let hitHandle = null;
      let handleItemId = null;

      if (window.DimDashOverlay && selectedRects.length === 1) {
        const sr = selectedRects[0];
        const screenBounds = {
          x: sr.x * wu * camera.z + camera.x,
          y: sr.y * wu * camera.z + camera.y,
          w: sr.w * wu * camera.z,
          h: sr.h * wu * camera.z
        };
        hitHandle = window.DimDashOverlay.StageOverlay.hitTestHandles(screenX, screenY, screenBounds, isCoarse);
        if (hitHandle) {
          handleItemId = sr.id;
        }
      }

      if (hitHandle && handleItemId) {
        // Start Resize
        this.transitionTo(STATES.RESIZE, {
          pointerId: e.pointerId,
          handle: hitHandle,
          itemId: handleItemId,
          startX: screenX,
          startY: screenY,
          startRect: { ...selectedRects[0] },
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          ctrlKey: e.ctrlKey || e.metaKey
        });
        viewportEl.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }

      // 2. Check Item Hit
      const itemEl = e.target.closest('.stage-item');
      if (itemEl) {
        const id = itemEl.getAttribute('data-id');
        const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;

        if (isMulti) {
          this.toggleItemSelection(id);
        } else if (!this.selectedIds.has(id)) {
          this.selectItem(id, false);
        }

        // Measure once before move loop starts (Read Once)
        const profile = this.stage.currentProfile?.id || 'lg';
        const placement = this.stage.board.layout.profiles?.[profile]?.placement || {};
        const dragItems = [];

        for (const selId of this.selectedIds) {
          const p = placement[selId];
          const el = this.stage.itemElements.get(selId);
          if (p && el) {
            dragItems.push({
              id: selId,
              el,
              origX: p.x,
              origY: p.y,
              w: p.w,
              h: p.h
            });
          }
        }

        this.transitionTo(STATES.MOVE, {
          pointerId: e.pointerId,
          startX: screenX,
          startY: screenY,
          dragItems,
          snapGuides: [],
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          ctrlKey: e.ctrlKey || e.metaKey
        });

        viewportEl.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }

      // 3. Middle mouse button or Space + Click -> Pan
      if (e.button === 1 || e.spaceKey) {
        this.transitionTo(STATES.PAN, {
          pointerId: e.pointerId,
          startX: screenX,
          startY: screenY
        });
        viewportEl.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }

      // 4. Clicked on Empty Stage -> Clear selection or Start Lasso Marquee
      if (!e.shiftKey && !e.ctrlKey) {
        this.clearSelection();
      }

      this.transitionTo(STATES.LASSO, {
        pointerId: e.pointerId,
        startX: screenX,
        startY: screenY,
        currentX: screenX,
        currentY: screenY
      });
      viewportEl.setPointerCapture(e.pointerId);
    }

    onPointerMove(e) {
      if (!this.isEditing) return;

      const viewportEl = this.stage.viewportEl;
      const rect = viewportEl.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      const camera = this.stage.camera || { x: 0, y: 0, z: 1 };
      const wu = this.stage.metrics ? this.stage.metrics.wu : 1.0;

      // Update hover handle cursor if idle
      if (this.state === STATES.IDLE) {
        this.updateHoverCursor(screenX, screenY, camera, wu);
        this.requestOverlayRedraw({ pointerPos: { screenX, screenY } });
        return;
      }

      if (!this.session || this.session.pointerId !== e.pointerId) return;

      this.session.shiftKey = e.shiftKey;
      this.session.altKey = e.altKey;
      this.session.ctrlKey = e.ctrlKey || e.metaKey;

      if (this.state === STATES.PAN) {
        const dx = screenX - this.session.startX;
        const dy = screenY - this.session.startY;
        this.session.startX = screenX;
        this.session.startY = screenY;

        if (this.stage.camera) {
          this.stage.camera.pan(dx, dy);
          this.stage.camera.applyToElement(this.stage.canvasEl);
          this.requestOverlayRedraw();
        }
        return;
      }

      if (this.state === STATES.LASSO) {
        this.session.currentX = screenX;
        this.session.currentY = screenY;
        this.updateLassoSelection(camera, wu);
        this.requestOverlayRedraw({
          marquee: {
            startX: this.session.startX,
            startY: this.session.startY,
            currentX: screenX,
            currentY: screenY
          }
        });
        return;
      }

      if (this.state === STATES.MOVE) {
        this.updateMoveLoop(screenX, screenY, camera, wu);
        return;
      }

      if (this.state === STATES.RESIZE) {
        this.updateResizeLoop(screenX, screenY, camera, wu);
        return;
      }
    }

    onPointerUp(e) {
      if (!this.session || this.session.pointerId !== e.pointerId) return;

      const viewportEl = this.stage.viewportEl;
      try {
        if (viewportEl && viewportEl.hasPointerCapture(e.pointerId)) {
          viewportEl.releasePointerCapture(e.pointerId);
        }
      } catch (err) {}

      if (this.state === STATES.MOVE) {
        this.commitMove();
      } else if (this.state === STATES.RESIZE) {
        this.commitResize();
      }

      this.transitionTo(STATES.IDLE);
    }

    onPointerCancel(e) {
      if (!this.session || this.session.pointerId !== e.pointerId) return;
      this.rollbackSessionTransforms();
      this.transitionTo(STATES.IDLE);
    }

    onWheel(e) {
      if (!this.isEditing && this.stage.currentMode !== 'canvas') return;

      e.preventDefault();
      const camera = this.stage.camera;
      if (!camera) return;

      const viewportEl = this.stage.viewportEl;
      const rect = viewportEl.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaZ) > 0) {
        // Zoom
        const zoomDelta = -e.deltaY * 0.002;
        const zoomFactor = Math.exp(zoomDelta);
        camera.zoomAt(zoomFactor, cursorX, cursorY);
      } else {
        // Pan
        camera.pan(-e.deltaX, -e.deltaY);
      }

      camera.applyToElement(this.stage.canvasEl);
      this.requestOverlayRedraw();
    }

    /* -------------------------------------------------------------
     * High-Speed Zero-Layout-Read Move Loop
     * ------------------------------------------------------------- */
    updateMoveLoop(screenX, screenY, camera, wu) {
      const dxScreen = screenX - this.session.startX;
      const dyScreen = screenY - this.session.startY;

      let dxWu = dxScreen / (wu * camera.z);
      let dyWu = dyScreen / (wu * camera.z);

      // Shift = Axis lock
      if (this.session.shiftKey) {
        if (Math.abs(dxWu) > Math.abs(dyWu)) {
          dyWu = 0;
        } else {
          dxWu = 0;
        }
      }

      const primary = this.session.dragItems[0];
      if (!primary) return;

      let candidateRect = {
        x: primary.origX + dxWu,
        y: primary.origY + dyWu,
        w: primary.w,
        h: primary.h
      };

      // Magnetic Snapping
      let snapGuides = [];
      if (!this.session.ctrlKey && window.DimDashSnap && this.stage.spatialIndex) {
        const neighbours = this.stage.spatialIndex.getNeighbours(candidateRect, 400);
        const snapped = window.DimDashSnap.computeSnap(
          candidateRect,
          neighbours,
          {
            thresholdScreenPx: 6,
            releaseScreenPx: 10,
            zoom: camera.z,
            wu: wu,
            gridStep: 4,
            useGrid: true,
            magneticFactor: 0.4
          },
          this.session.activeSnap
        );

        this.session.activeSnap = snapped.activeSnap;
        dxWu += snapped.dx;
        dyWu += snapped.dy;
        snapGuides = snapped.guides || [];
      }

      this.session.currentDxWu = dxWu;
      this.session.currentDyWu = dyWu;
      this.session.snapGuides = snapGuides;

      // Pure number computation; schedule single transform write
      if (!this.rafPending) {
        this.rafPending = true;
        requestAnimationFrame(() => {
          this.rafPending = false;
          if (this.state !== STATES.MOVE) return;

          const pxDx = this.session.currentDxWu * wu;
          const pxDy = this.session.currentDyWu * wu;

          for (const item of this.session.dragItems) {
            item.el.style.transform = `translate3d(${pxDx.toFixed(1)}px, ${pxDy.toFixed(1)}px, 0)`;
          }

          this.requestOverlayRedraw({
            snapGuides: this.session.snapGuides,
            pointerPos: { screenX, screenY }
          });
        });
      }
    }

    /* -------------------------------------------------------------
     * Resize Loop & Math
     * ------------------------------------------------------------- */
    static calculateResize(startRect, handle, dxWu, dyWu, modifiers = {}) {
      let { x, y, w, h } = startRect;
      const minW = 20;
      const minH = 20;

      const keepAspect = !!modifiers.shiftKey;
      const fromCenter = !!modifiers.altKey;
      const origAspect = startRect.w / startRect.h;

      let dw = 0;
      let dh = 0;

      if (handle.includes('e')) dw = dxWu;
      if (handle.includes('w')) dw = -dxWu;
      if (handle.includes('s')) dh = dyWu;
      if (handle.includes('n')) dh = -dyWu;

      if (fromCenter) {
        dw *= 2;
        dh *= 2;
      }

      let newW = Math.max(minW, startRect.w + dw);
      let newH = Math.max(minH, startRect.h + dh);

      if (keepAspect) {
        if (handle === 'e' || handle === 'w') {
          newH = Math.max(minH, newW / origAspect);
        } else if (handle === 'n' || handle === 's') {
          newW = Math.max(minW, newH * origAspect);
        } else {
          // Corner handles: fit to dominant dimension
          const scaleW = newW / startRect.w;
          const scaleH = newH / startRect.h;
          const scale = Math.max(scaleW, scaleH);
          newW = Math.max(minW, startRect.w * scale);
          newH = Math.max(minH, startRect.h * scale);
        }
      }

      let newX = startRect.x;
      let newY = startRect.y;

      if (fromCenter) {
        newX = startRect.x - (newW - startRect.w) / 2;
        newY = startRect.y - (newH - startRect.h) / 2;
      } else {
        if (handle.includes('w')) {
          newX = startRect.x + (startRect.w - newW);
        }
        if (handle.includes('n')) {
          newY = startRect.y + (startRect.h - newH);
        }
      }

      return {
        x: Math.round(newX),
        y: Math.round(newY),
        w: Math.round(newW),
        h: Math.round(newH)
      };
    }

    updateResizeLoop(screenX, screenY, camera, wu) {
      const dxScreen = screenX - this.session.startX;
      const dyScreen = screenY - this.session.startY;

      const dxWu = dxScreen / (wu * camera.z);
      const dyWu = dyScreen / (wu * camera.z);

      const resized = InteractionController.calculateResize(
        this.session.startRect,
        this.session.handle,
        dxWu,
        dyWu,
        {
          shiftKey: this.session.shiftKey,
          altKey: this.session.altKey
        }
      );

      this.session.currentRect = resized;

      if (!this.rafPending) {
        this.rafPending = true;
        requestAnimationFrame(() => {
          this.rafPending = false;
          if (this.state !== STATES.RESIZE) return;

          const el = this.stage.itemElements.get(this.session.itemId);
          if (el) {
            el.style.setProperty('--x', resized.x);
            el.style.setProperty('--y', resized.y);
            el.style.setProperty('--w', resized.w);
            el.style.setProperty('--h', resized.h);
          }

          this.requestOverlayRedraw({
            activeHandle: this.session.handle,
            sizingInfo: { rect: resized },
            pointerPos: { screenX, screenY }
          });
        });
      }
    }

    /* -------------------------------------------------------------
     * State Machine Transitions
     * ------------------------------------------------------------- */
    transitionTo(newState, payload = {}) {
      const oldState = this.state;
      this.state = newState;

      // Exit old state
      if (oldState === STATES.MOVE || oldState === STATES.RESIZE) {
        this.demoteLayers();
      }

      // Enter new state
      if (newState === STATES.MOVE || newState === STATES.RESIZE) {
        this.session = payload;
        this.promoteLayers();
      } else if (newState === STATES.PAN || newState === STATES.LASSO) {
        this.session = payload;
      } else if (newState === STATES.IDLE) {
        this.session = null;
        this.activeHandle = null;
        this.requestOverlayRedraw();
      }
    }

    promoteLayers() {
      if (this.stage?.viewportEl) {
        this.stage.viewportEl.classList.add('is-interacting');
      }
      if (this.session?.dragItems) {
        for (const it of this.session.dragItems) {
          it.el.style.willChange = 'transform';
        }
      }
    }

    demoteLayers() {
      clearTimeout(this.promoteTimer);
      this.promoteTimer = setTimeout(() => {
        if (this.stage?.viewportEl) {
          this.stage.viewportEl.classList.remove('is-interacting');
        }
        if (this.stage?.itemElements) {
          for (const el of this.stage.itemElements.values()) {
            el.style.willChange = '';
          }
        }
      }, 150);
    }

    rollbackSessionTransforms() {
      if (this.session?.dragItems) {
        for (const it of this.session.dragItems) {
          it.el.style.transform = '';
        }
      }
      if (this.session?.itemId && this.session?.startRect) {
        const el = this.stage.itemElements.get(this.session.itemId);
        if (el) {
          el.style.setProperty('--x', this.session.startRect.x);
          el.style.setProperty('--y', this.session.startRect.y);
          el.style.setProperty('--w', this.session.startRect.w);
          el.style.setProperty('--h', this.session.startRect.h);
        }
      }
    }

    /* -------------------------------------------------------------
     * Optimistic Patch Commits
     * ------------------------------------------------------------- */
    commitMove() {
      if (!this.session || !this.session.dragItems) return;
      const profile = this.stage.currentProfile?.id || 'lg';
      const placement = this.stage.board.layout.profiles?.[profile]?.placement;
      if (!placement) return;

      const patches = [];
      const inverses = [];

      for (const it of this.session.dragItems) {
        it.el.style.transform = '';
        const finalX = Math.round(it.origX + (this.session.currentDxWu || 0));
        const finalY = Math.round(it.origY + (this.session.currentDyWu || 0));

        if (finalX !== it.origX || finalY !== it.origY) {
          // Mutate local state immediately
          placement[it.id] = {
            ...placement[it.id],
            x: finalX,
            y: finalY
          };

          it.el.style.setProperty('--x', finalX);
          it.el.style.setProperty('--y', finalY);

          // Update spatial index
          if (this.stage.spatialIndex) {
            this.stage.spatialIndex.update({
              id: it.id,
              x: finalX,
              y: finalY,
              w: it.w,
              h: it.h
            });
          }

          patches.push({
            op: 'merge',
            path: `/layout/profiles/${profile}/placement/${it.id}`,
            value: { x: finalX, y: finalY }
          });

          inverses.push({
            op: 'merge',
            path: `/layout/profiles/${profile}/placement/${it.id}`,
            value: { x: it.origX, y: it.origY }
          });
        }
      }

      if (patches.length > 0) {
        this.history.push({
          type: 'move',
          targetId: this.session.dragItems[0]?.id,
          patches,
          inverse: inverses,
          isCoalesceable: false
        });

        this.sendPatch(patches);
      }
    }

    commitResize() {
      if (!this.session || !this.session.currentRect) return;
      const profile = this.stage.currentProfile?.id || 'lg';
      const placement = this.stage.board.layout.profiles?.[profile]?.placement;
      if (!placement) return;

      const id = this.session.itemId;
      const sr = this.session.startRect;
      const cr = this.session.currentRect;

      if (cr.x !== sr.x || cr.y !== sr.y || cr.w !== sr.w || cr.h !== sr.h) {
        placement[id] = {
          ...placement[id],
          x: cr.x,
          y: cr.y,
          w: cr.w,
          h: cr.h
        };

        if (this.stage.spatialIndex) {
          this.stage.spatialIndex.update({
            id,
            x: cr.x,
            y: cr.y,
            w: cr.w,
            h: cr.h
          });
        }

        const patches = [{
          op: 'merge',
          path: `/layout/profiles/${profile}/placement/${id}`,
          value: { x: cr.x, y: cr.y, w: cr.w, h: cr.h }
        }];

        const inverses = [{
          op: 'merge',
          path: `/layout/profiles/${profile}/placement/${id}`,
          value: { x: sr.x, y: sr.y, w: sr.w, h: sr.h }
        }];

        this.history.push({
          type: 'resize',
          targetId: id,
          patches,
          inverse: inverses,
          isCoalesceable: false
        });

        this.sendPatch(patches);
      }
    }

    sendPatch(patches) {
      if (typeof fetch === 'undefined') return;
      const rev = this.stage.board?.layout?.rev || 1;

      fetch('/api/board/patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: 'ui_blueprint',
          base: rev,
          seq: Date.now(),
          ops: patches
        })
      })
      .then(res => res.json())
      .then(data => {
        if (!data.ok) {
          console.warn('[DimDashInteraction] Patch rejected by server:', data);
          // Rollback if conflict
          if (data.status === 409) {
            this.stage.render();
          }
        } else if (data.rev && this.stage.board?.layout) {
          this.stage.board.layout.rev = data.rev;
        }
      })
      .catch(err => {
        console.error('[DimDashInteraction] Patch network error:', err);
      });
    }

    /* -------------------------------------------------------------
     * Keyboard Navigation & Parity
     * ------------------------------------------------------------- */
    onKeyDown(e) {
      // Don't intercept if user is typing in an input/textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }

      // E key: toggle edit mode
      if (e.key === 'e' || e.key === 'E') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          this.toggleEditing();
          return;
        }
      }

      if (!this.isEditing) return;

      // Esc: clear selection or cancel carry mode
      if (e.key === 'Escape') {
        e.preventDefault();
        this.clearSelection();
        this.carryActive = false;
        return;
      }

      // Ctrl+Z: Undo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        this.undo();
        return;
      }

      // Ctrl+Shift+Z or Ctrl+Y: Redo
      if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) ||
        ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y'))
      ) {
        e.preventDefault();
        this.redo();
        return;
      }

      // Tab / Shift+Tab: cycle selection
      if (e.key === 'Tab') {
        e.preventDefault();
        this.cycleSelection(e.shiftKey);
        return;
      }

      // Enter / Space: toggle keyboard carry mode
      if ((e.key === 'Enter' || e.key === ' ') && this.selectedIds.size > 0) {
        e.preventDefault();
        this.carryActive = !this.carryActive;
        this.announceA11y(this.carryActive ? 'Carrying item. Use arrows to move.' : 'Item dropped.');
        return;
      }

      // Arrow keys: move selected items
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (this.selectedIds.size > 0) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : e.altKey ? 0.25 : 1;
          let dx = 0;
          let dy = 0;
          if (e.key === 'ArrowLeft') dx = -step;
          if (e.key === 'ArrowRight') dx = step;
          if (e.key === 'ArrowUp') dy = -step;
          if (e.key === 'ArrowDown') dy = step;
          this.nudgeSelection(dx, dy);
        }
        return;
      }

      // Delete / Backspace: remove item
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedIds.size > 0) {
          e.preventDefault();
          this.deleteSelected();
        }
        return;
      }

      // Ctrl+D: duplicate item
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        if (this.selectedIds.size > 0) {
          e.preventDefault();
          this.duplicateSelected();
        }
        return;
      }

      // Ctrl+C / Ctrl+V: Copy/Paste
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        this.copySelected();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        this.pasteClipboard();
      }
    }

    nudgeSelection(dx, dy) {
      const profile = this.stage.currentProfile?.id || 'lg';
      const placement = this.stage.board.layout.profiles?.[profile]?.placement;
      if (!placement) return;

      const patches = [];
      const inverses = [];

      for (const id of this.selectedIds) {
        const p = placement[id];
        if (!p) continue;

        const origX = p.x;
        const origY = p.y;
        const newX = origX + dx;
        const newY = origY + dy;

        p.x = newX;
        p.y = newY;

        const el = this.stage.itemElements.get(id);
        if (el) {
          el.style.setProperty('--x', newX);
          el.style.setProperty('--y', newY);
        }

        if (this.stage.spatialIndex) {
          this.stage.spatialIndex.update({ id, x: newX, y: newY, w: p.w, h: p.h });
        }

        patches.push({
          op: 'merge',
          path: `/layout/profiles/${profile}/placement/${id}`,
          value: { x: newX, y: newY }
        });

        inverses.push({
          op: 'merge',
          path: `/layout/profiles/${profile}/placement/${id}`,
          value: { x: origX, y: origY }
        });
      }

      if (patches.length > 0) {
        this.history.push({
          type: 'nudge',
          targetId: Array.from(this.selectedIds)[0],
          patches,
          inverse: inverses,
          isCoalesceable: true
        });

        this.sendPatch(patches);
        this.requestOverlayRedraw();
      }
    }

    cycleSelection(reverse = false) {
      const items = this.stage.board?.config?.items || [];
      if (items.length === 0) return;

      const ids = items.map(it => it.id);
      let curIndex = -1;

      if (this.selectedIds.size > 0) {
        const lastSelected = Array.from(this.selectedIds)[this.selectedIds.size - 1];
        curIndex = ids.indexOf(lastSelected);
      }

      let nextIndex;
      if (reverse) {
        nextIndex = curIndex <= 0 ? ids.length - 1 : curIndex - 1;
      } else {
        nextIndex = curIndex >= ids.length - 1 ? 0 : curIndex + 1;
      }

      this.selectItem(ids[nextIndex], false);
    }

    undo() {
      const inverseOps = this.history.undo();
      if (!inverseOps) return;
      this.applyOpsLocally(inverseOps);
      this.sendPatch(inverseOps);
      this.requestOverlayRedraw();
    }

    redo() {
      const patchOps = this.history.redo();
      if (!patchOps) return;
      this.applyOpsLocally(patchOps);
      this.sendPatch(patchOps);
      this.requestOverlayRedraw();
    }

    applyOpsLocally(ops) {
      const profile = this.stage.currentProfile?.id || 'lg';
      const placement = this.stage.board.layout.profiles?.[profile]?.placement;
      if (!placement) return;

      for (const op of ops) {
        if (op.op === 'merge' && op.path.includes('/placement/')) {
          const parts = op.path.split('/');
          const itemId = parts[parts.length - 1];
          if (placement[itemId]) {
            Object.assign(placement[itemId], op.value);
            const el = this.stage.itemElements.get(itemId);
            if (el) {
              if (op.value.x !== undefined) el.style.setProperty('--x', op.value.x);
              if (op.value.y !== undefined) el.style.setProperty('--y', op.value.y);
              if (op.value.w !== undefined) el.style.setProperty('--w', op.value.w);
              if (op.value.h !== undefined) el.style.setProperty('--h', op.value.h);
            }
          }
        }
      }
    }

    deleteSelected() {
      // Deletes items from layout & config
      const profile = this.stage.currentProfile?.id || 'lg';
      const items = this.stage.board.config?.items || [];
      const placement = this.stage.board.layout.profiles?.[profile]?.placement;
      if (!placement) return;

      const patches = [];
      const inverses = [];

      for (const id of this.selectedIds) {
        const p = placement[id];
        const itemIdx = items.findIndex(it => it.id === id);
        const item = items[itemIdx];

        if (p && item) {
          patches.push({ op: 'remove', path: `/layout/profiles/${profile}/placement/${id}` });
          patches.push({ op: 'remove', path: `/config/items/${itemIdx}` });

          inverses.push({ op: 'set', path: `/layout/profiles/${profile}/placement/${id}`, value: p });
          inverses.push({ op: 'add', path: `/config/items/-`, value: item });

          delete placement[id];
          items.splice(itemIdx, 1);

          const el = this.stage.itemElements.get(id);
          if (el) el.remove();
          this.stage.itemElements.delete(id);
        }
      }

      this.clearSelection();

      if (patches.length > 0) {
        this.history.push({
          type: 'delete',
          patches,
          inverse: inverses,
          isCoalesceable: false
        });
        this.sendPatch(patches);
        this.requestOverlayRedraw();
      }
    }

    duplicateSelected() {
      const profile = this.stage.currentProfile?.id || 'lg';
      const items = this.stage.board.config?.items || [];
      const placement = this.stage.board.layout.profiles?.[profile]?.placement;
      if (!placement) return;

      const newIds = [];
      for (const id of this.selectedIds) {
        const item = items.find(it => it.id === id);
        const p = placement[id];
        if (!item || !p) continue;

        const newId = `${item.id}_copy_${Math.floor(Math.random() * 1000)}`;
        const newItem = JSON.parse(JSON.stringify(item));
        newItem.id = newId;
        newItem.title = `${item.title || 'Item'} (Copy)`;

        const newPlacement = {
          ...p,
          x: p.x + 16,
          y: p.y + 16
        };

        items.push(newItem);
        placement[newId] = newPlacement;
        newIds.push(newId);
      }

      this.stage.render();
      this.clearSelection();
      newIds.forEach(id => this.selectedIds.add(id));
      this.syncSelectionDom();
      this.requestOverlayRedraw();
    }

    copySelected() {
      const profile = this.stage.currentProfile?.id || 'lg';
      const items = this.stage.board.config?.items || [];
      const placement = this.stage.board.layout.profiles?.[profile]?.placement || {};

      this.clipboard = [];
      for (const id of this.selectedIds) {
        const item = items.find(it => it.id === id);
        const p = placement[id];
        if (item && p) {
          this.clipboard.push({ item: JSON.parse(JSON.stringify(item)), placement: { ...p } });
        }
      }
    }

    pasteClipboard() {
      if (!this.clipboard || this.clipboard.length === 0) return;
      const profile = this.stage.currentProfile?.id || 'lg';
      const items = this.stage.board.config?.items || [];
      const placement = this.stage.board.layout.profiles?.[profile]?.placement;
      if (!placement) return;

      const newIds = [];
      for (const entry of this.clipboard) {
        const newId = `${entry.item.id}_${Math.floor(Math.random() * 1000)}`;
        const newItem = JSON.parse(JSON.stringify(entry.item));
        newItem.id = newId;

        const newPlacement = {
          ...entry.placement,
          x: entry.placement.x + 20,
          y: entry.placement.y + 20
        };

        items.push(newItem);
        placement[newId] = newPlacement;
        newIds.push(newId);
      }

      this.stage.render();
      this.clearSelection();
      newIds.forEach(id => this.selectedIds.add(id));
      this.syncSelectionDom();
      this.requestOverlayRedraw();
    }

    /* -------------------------------------------------------------
     * Marquee & Hover Utilities
     * ------------------------------------------------------------- */
    updateLassoSelection(camera, wu) {
      const s = this.session;
      const x1 = Math.min(s.startX, s.currentX);
      const x2 = Math.max(s.startX, s.currentX);
      const y1 = Math.min(s.startY, s.currentY);
      const y2 = Math.max(s.startY, s.currentY);

      // Convert marquee to world rect
      const worldBox = {
        x: (x1 - camera.x) / (wu * camera.z),
        y: (y1 - camera.y) / (wu * camera.z),
        w: (x2 - x1) / (wu * camera.z),
        h: (y2 - y1) / (wu * camera.z)
      };

      if (this.stage.spatialIndex) {
        const intersecting = this.stage.spatialIndex.queryRect(worldBox);
        this.selectedIds.clear();
        intersecting.forEach(it => this.selectedIds.add(it.id));
        this.syncSelectionDom();
      }
    }

    updateHoverCursor(screenX, screenY, camera, wu) {
      if (!this.stage.viewportEl) return;
      const selectedRects = this.getSelectedWorldRects();
      if (selectedRects.length !== 1 || !window.DimDashOverlay) {
        this.stage.viewportEl.style.cursor = '';
        return;
      }

      const sr = selectedRects[0];
      const screenBounds = {
        x: sr.x * wu * camera.z + camera.x,
        y: sr.y * wu * camera.z + camera.y,
        w: sr.w * wu * camera.z,
        h: sr.h * wu * camera.z
      };

      const handle = window.DimDashOverlay.StageOverlay.hitTestHandles(screenX, screenY, screenBounds, false);
      if (!handle) {
        this.stage.viewportEl.style.cursor = '';
        return;
      }

      const cursorMap = {
        nw: 'nwse-resize',
        se: 'nwse-resize',
        ne: 'nesw-resize',
        sw: 'nesw-resize',
        n: 'ns-resize',
        s: 'ns-resize',
        e: 'ew-resize',
        w: 'ew-resize'
      };
      this.stage.viewportEl.style.cursor = cursorMap[handle] || '';
    }

    requestOverlayRedraw(extra = {}) {
      if (!this.stage?.overlayRenderer) return;

      const wu = this.stage.metrics ? this.stage.metrics.wu : 1.0;
      const camera = this.stage.camera || { x: 0, y: 0, z: 1 };
      const selectedRects = this.getSelectedWorldRects();

      this.stage.overlayRenderer.render({
        isEditing: this.isEditing,
        camera,
        wu,
        selectedRects,
        ...extra
      });
    }

    announceA11y(text) {
      let liveRegion = document.getElementById('stageLiveRegion');
      if (!liveRegion) {
        liveRegion = document.createElement('div');
        liveRegion.id = 'stageLiveRegion';
        liveRegion.className = 'sr-only';
        liveRegion.setAttribute('aria-live', 'assertive');
        document.body.appendChild(liveRegion);
      }
      liveRegion.textContent = text;
    }

    destroy() {
      this.detachEvents();
      this.clearSelection();
      this.history.clear();
    }
  }

  return {
    STATES,
    HistoryController,
    InteractionController
  };
});
