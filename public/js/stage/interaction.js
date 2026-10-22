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
      const wasEditing = this.isEditing;
      this.isEditing = !!isEditing;
      if (this.stage?.viewportEl) {
        this.stage.viewportEl.classList.toggle('editing', this.isEditing);
        document.body.classList.toggle('stage-editing', this.isEditing);
        document.body.classList.toggle('blueprint-mode', this.isEditing);
      }
      const pill = this.stage?.container?.querySelector('#stageBlueprintPill') || document.getElementById('stageBlueprintPill');
      if (pill) {
        pill.classList.toggle('active', this.isEditing);
        const pillText = pill.querySelector('.pill-text') || pill.querySelector('span:last-child');
        if (pillText) {
          pillText.textContent = this.isEditing ? 'Blueprint Mode [E] — Active' : 'Blueprint Mode [E]';
        }
      }
      if (!this.isEditing) {
        this.clearSelection();
        this.state = STATES.IDLE;
        if (wasEditing && typeof window !== 'undefined' && window.showToast) {
          window.showToast('💾 Exited Blueprint Edit Mode. Layout saved.', 'info');
        }
      } else {
        if (!wasEditing && typeof window !== 'undefined' && window.showToast) {
          window.showToast('📐 Blueprint Mode Active: Click to select, drag to move, drag corners to resize.', 'info');
        }
      }
      this.requestOverlayRedraw();
    }

    setEditMode(isEditing) {
      return this.setEditing(isEditing);
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

    getItemPlacement(id, profileId = null) {
      if (!this.stage?.board?.layout) return null;
      const profile = profileId || this.stage.currentProfile?.id || 'lg';
      const placementMap = this.stage.board.layout.placement || {};
      const itemPl = placementMap[id];
      if (!itemPl) return null;
      if (itemPl[profile]) return itemPl[profile];
      return itemPl['lg'] || itemPl['md'] || Object.values(itemPl)[0] || null;
    }

    setItemPlacement(id, profileId, updates) {
      if (!this.stage?.board?.layout) return;
      const profile = profileId || this.stage.currentProfile?.id || 'lg';
      if (!this.stage.board.layout.placement) {
        this.stage.board.layout.placement = {};
      }
      if (!this.stage.board.layout.placement[id]) {
        this.stage.board.layout.placement[id] = {};
      }
      if (!this.stage.board.layout.placement[id][profile]) {
        const fallback = this.getItemPlacement(id, profile) || { x: 0, y: 0, w: 100, h: 100 };
        this.stage.board.layout.placement[id][profile] = { ...fallback };
      }
      Object.assign(this.stage.board.layout.placement[id][profile], updates);
    }

    getSelectedWorldRects() {
      if (!this.stage?.board?.layout) return [];
      const profile = this.stage.currentProfile?.id || 'lg';
      const rects = [];

      for (const id of this.selectedIds) {
        const p = this.getItemPlacement(id, profile);
        if (p) {
          rects.push({
            id,
            x: Number(p.x) || 0,
            y: Number(p.y) || 0,
            w: Number(p.w) || 100,
            h: Number(p.h) || 100,
            z: p.z || 1,
            parent: p.parent || null
          });
        }
      }
      return rects;
    }

    getSelectedScreenRects() {
      if (!this.stage?.viewportEl) return [];
      const vpRect = this.stage.viewportEl.getBoundingClientRect();
      const rects = [];

      for (const id of this.selectedIds) {
        const el = this.stage.itemElements?.get(id);
        if (el) {
          const elRect = el.getBoundingClientRect();
          rects.push({
            id,
            screenX: elRect.left - vpRect.left,
            screenY: elRect.top - vpRect.top,
            screenW: elRect.width,
            screenH: elRect.height,
            x: elRect.left - vpRect.left,
            y: elRect.top - vpRect.top,
            w: elRect.width,
            h: elRect.height
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
      this.cachedViewportRect = rect;
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      // STEP 0: Hit-test probe behind ?debug=1
      if (window.location.search.includes('debug=1')) {
        const elements = document.elementsFromPoint(e.clientX, e.clientY);
        console.log('[DEBUG Hit-Test Probe]', {
          point: { clientX: e.clientX, clientY: e.clientY, screenX, screenY },
          elementsUnderPoint: elements.map(el => el.id || el.getAttribute('data-id') || el.className),
          topOverlay: elements[0]?.className
        });
      }

      // 1. Check Handle Hit Test on currently selected items (Source of truth: measured screen bounds)
      const selectedScreenRects = this.getSelectedScreenRects();
      let hitHandle = null;
      let handleItemId = null;

      if (window.DimDashOverlay && selectedScreenRects.length === 1) {
        const sr = selectedScreenRects[0];
        const screenBounds = {
          x: sr.screenX,
          y: sr.screenY,
          w: sr.screenW,
          h: sr.screenH
        };
        hitHandle = window.DimDashOverlay.StageOverlay.hitTestHandles(screenX, screenY, screenBounds, isCoarse);
        if (hitHandle) {
          handleItemId = sr.id;
        }
      }

      if (hitHandle && handleItemId) {
        // Start Resize
        const profile = this.stage.currentProfile?.id || 'lg';
        const p = this.getItemPlacement(handleItemId, profile) || { x: 0, y: 0, w: 100, h: 100 };
        this.transitionTo(STATES.RESIZE, {
          pointerId: e.pointerId,
          handle: hitHandle,
          itemId: handleItemId,
          startX: screenX,
          startY: screenY,
          startRect: { ...p },
          startScreenRect: { ...selectedScreenRects[0] },
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          ctrlKey: e.ctrlKey || e.metaKey
        });
        try { viewportEl.setPointerCapture(e.pointerId); } catch (_) {}
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

        // Measure once before move loop starts
        const profile = this.stage.currentProfile?.id || 'lg';
        const dragItems = [];

        for (const selId of this.selectedIds) {
          const p = this.getItemPlacement(selId, profile);
          const el = this.stage.itemElements.get(selId);
          if (p && el) {
            const itemObj = this.stage.board.config?.items?.find(it => it.id === selId);
            const childElements = [];

            // If selected item is an island, collect its child elements to move with it
            if (itemObj?.kind === 'island') {
              for (const childIt of (this.stage.board.config?.items || [])) {
                const childP = this.getItemPlacement(childIt.id, profile);
                if (childP?.parent === selId) {
                  const childEl = this.stage.itemElements.get(childIt.id);
                  if (childEl) childElements.push({ id: childIt.id, el: childEl });
                }
              }
            }

            dragItems.push({
              id: selId,
              el,
              kind: itemObj?.kind || 'widget',
              parent: p.parent || null,
              origX: Number(p.x) || 0,
              origY: Number(p.y) || 0,
              w: Number(p.w) || 100,
              h: Number(p.h) || 100,
              childElements
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

        try { viewportEl.setPointerCapture(e.pointerId); } catch (_) {}
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
      const rect = (this.session && this.cachedViewportRect) ? this.cachedViewportRect : viewportEl.getBoundingClientRect();
      if (!this.session) {
        this.cachedViewportRect = rect;
      }
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
      const stageScale = this.stage.stageScale || 1.0;
      const dxScreen = screenX - this.session.startX;
      const dyScreen = screenY - this.session.startY;

      let dxWu = dxScreen / (wu * stageScale);
      let dyWu = dyScreen / (wu * stageScale);

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
      try {
        if (!this.session.ctrlKey && window.DimDashSnap && this.stage.spatialIndex) {
          const neighbours = this.stage.spatialIndex.getNeighbours(candidateRect, 400);
          const snapped = window.DimDashSnap.computeSnap(
            candidateRect,
            neighbours,
            {
              thresholdScreenPx: 6,
              releaseScreenPx: 10,
              zoom: stageScale,
              wu: wu,
              gridStep: 4,
              useGrid: true,
              magneticFactor: 0.4
            },
            this.session.activeSnap
          );

          if (snapped) {
            this.session.activeSnap = snapped.activeSnapLines || snapped.activeSnap;
            if (typeof snapped.x === 'number') dxWu = snapped.x - primary.origX;
            if (typeof snapped.y === 'number') dyWu = snapped.y - primary.origY;
            snapGuides = snapped.guides || [];
          }
        }
      } catch (snapErr) {
        console.error('[DimDash Snapping Error]', snapErr);
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
            item.el.style.transform = `translate3d(calc((var(--x, 0) * var(--wu) + ${pxDx.toFixed(1)}) * 1px), calc((var(--y, 0) * var(--wu) + ${pxDy.toFixed(1)}) * 1px), 0)`;
            item.el.style.zIndex = '999';

            // Also move children if item is an island
            if (item.childElements && item.childElements.length > 0) {
              for (const child of item.childElements) {
                child.el.style.transform = `translate3d(calc((var(--x, 0) * var(--wu) + ${pxDx.toFixed(1)}) * 1px), calc((var(--y, 0) * var(--wu) + ${pxDy.toFixed(1)}) * 1px), 0)`;
                child.el.style.zIndex = '1000';
              }
            }
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
      const stageScale = this.stage.stageScale || 1.0;
      const dxScreen = screenX - this.session.startX;
      const dyScreen = screenY - this.session.startY;

      const dxWu = dxScreen / (wu * stageScale);
      const dyWu = dyScreen / (wu * stageScale);

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
          it.el.classList.add('is-dragging');
          if (it.childElements) {
            for (const child of it.childElements) {
              child.el.style.willChange = 'transform';
              child.el.classList.add('is-dragging');
            }
          }
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
            el.classList.remove('is-dragging');
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
      if (!this.stage.board?.layout) return;

      const patches = [];
      const inverses = [];
      const dxWu = this.session.currentDxWu || 0;
      const dyWu = this.session.currentDyWu || 0;
      // Clean up temporary DOM transforms and zIndex
      for (const it of this.session.dragItems) {
        it.el.style.transform = '';
        it.el.style.zIndex = '';
        if (it.childElements) {
          for (const child of it.childElements) {
            child.el.style.transform = '';
            child.el.style.zIndex = '';
          }
        }
      }

      // Check if distance > 1wu so tiny clicks are not treated as moves
      const movedDist = Math.hypot(dxWu, dyWu);
      if (movedDist < 1) {
        return;
      }

      for (const it of this.session.dragItems) {
        let finalX = Math.round(it.origX + dxWu);
        let finalY = Math.round(it.origY + dyWu);
        let newParent = it.parent;

        // If this is a child tile/widget (not an island), check if dropped into an island or onto empty board
        if (it.kind !== 'island') {
          let globalX = finalX;
          let globalY = finalY;
          if (it.parent) {
            const parentP = this.getItemPlacement(it.parent, profile);
            if (parentP) {
              globalX = (Number(parentP.x) || 0) + finalX;
              globalY = (Number(parentP.y) || 0) + finalY;
            }
          }

          const cx = globalX + it.w / 2;
          const cy = globalY + it.h / 2;

          let targetIsland = null;
          for (const potentialIsland of (this.stage.board.config?.items || [])) {
            if (potentialIsland.kind === 'island' && potentialIsland.id !== it.id) {
              const islP = this.getItemPlacement(potentialIsland.id, profile);
              if (islP) {
                const ix = Number(islP.x) || 0;
                const iy = Number(islP.y) || 0;
                const iw = Number(islP.w) || 200;
                const ih = Number(islP.h) || 150;
                if (cx >= ix && cx <= ix + iw && cy >= iy && cy <= iy + ih) {
                  targetIsland = { id: potentialIsland.id, x: ix, y: iy };
                  break;
                }
              }
            }
          }

          if (targetIsland) {
            newParent = targetIsland.id;
            finalX = Math.round(globalX - targetIsland.x);
            finalY = Math.round(globalY - targetIsland.y);
          } else {
            newParent = null;
            finalX = Math.round(globalX);
            finalY = Math.round(globalY);
          }
        }

        const prevPlacement = this.getItemPlacement(it.id, profile) || {};
        this.setItemPlacement(it.id, profile, {
          x: finalX,
          y: finalY,
          parent: newParent
        });

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
          path: `/layout/placement/${it.id}/${profile}`,
          value: { x: finalX, y: finalY, parent: newParent }
        });

        inverses.push({
          op: 'merge',
          path: `/layout/placement/${it.id}/${profile}`,
          value: { x: prevPlacement.x, y: prevPlacement.y, parent: prevPlacement.parent || null }
        });
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
        this.stage.render();
      }
    }

    commitResize() {
      if (!this.session || !this.session.currentRect) return;
      const profile = this.stage.currentProfile?.id || 'lg';
      if (!this.stage.board?.layout) return;

      const id = this.session.itemId;
      const sr = this.session.startRect;
      const cr = this.session.currentRect;

      if (cr.x !== sr.x || cr.y !== sr.y || cr.w !== sr.w || cr.h !== sr.h) {
        const prevPlacement = this.getItemPlacement(id, profile) || {};
        this.setItemPlacement(id, profile, {
          x: cr.x,
          y: cr.y,
          w: cr.w,
          h: cr.h
        });

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
          path: `/layout/placement/${id}/${profile}`,
          value: { x: cr.x, y: cr.y, w: cr.w, h: cr.h }
        }];

        const inverses = [{
          op: 'merge',
          path: `/layout/placement/${id}/${profile}`,
          value: { x: prevPlacement.x, y: prevPlacement.y, w: prevPlacement.w, h: prevPlacement.h }
        }];

        this.history.push({
          type: 'resize',
          targetId: id,
          patches,
          inverse: inverses,
          isCoalesceable: false
        });

        this.sendPatch(patches);
        this.stage.render();
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

      // E key (or Persian layout 'ث'): toggle edit mode
      if (e.code === 'KeyE' || e.key === 'e' || e.key === 'E' || e.key === 'ث') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          this.toggleEditing();
          return;
        }
      }

      if (!this.isEditing) return;

      // Esc: clear selection, cancel carry mode, or exit edit mode
      if (e.key === 'Escape') {
        e.preventDefault();
        if (this.selectedIds.size > 0 || this.carryActive) {
          this.clearSelection();
          this.carryActive = false;
        } else {
          this.setEditing(false);
        }
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
      if (!this.stage.board?.layout) return;

      const patches = [];
      const inverses = [];

      for (const id of this.selectedIds) {
        const p = this.getItemPlacement(id, profile);
        if (!p) continue;

        const origX = Number(p.x) || 0;
        const origY = Number(p.y) || 0;
        const newX = Math.round(origX + dx);
        const newY = Math.round(origY + dy);

        this.setItemPlacement(id, profile, { x: newX, y: newY });

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
          path: `/layout/placement/${id}/${profile}`,
          value: { x: newX, y: newY }
        });

        inverses.push({
          op: 'merge',
          path: `/layout/placement/${id}/${profile}`,
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
      this.stage.render();
    }

    redo() {
      const patchOps = this.history.redo();
      if (!patchOps) return;
      this.applyOpsLocally(patchOps);
      this.sendPatch(patchOps);
      this.stage.render();
    }

    applyOpsLocally(ops) {
      const profile = this.stage.currentProfile?.id || 'lg';
      if (!this.stage.board?.layout?.placement) return;

      for (const op of ops) {
        if ((op.op === 'merge' || op.op === 'set') && op.path.includes('/placement/')) {
          const parts = op.path.split('/');
          const itemId = parts[parts.length - 2];
          const profId = parts[parts.length - 1] || profile;
          if (itemId && op.value) {
            this.setItemPlacement(itemId, profId, op.value);
          }
        }
      }
    }

    deleteSelected() {
      const profile = this.stage.currentProfile?.id || 'lg';
      const items = this.stage.board.config?.items || [];
      const placementMap = this.stage.board.layout.placement;
      if (!placementMap) return;

      const patches = [];
      const inverses = [];

      for (const id of this.selectedIds) {
        const p = this.getItemPlacement(id, profile);
        const itemIdx = items.findIndex(it => it.id === id);
        const item = items[itemIdx];

        if (p && item) {
          patches.push({ op: 'remove', path: `/layout/placement/${id}` });
          patches.push({ op: 'remove', path: `/config/items/${itemIdx}` });

          inverses.push({ op: 'set', path: `/layout/placement/${id}/${profile}`, value: p });
          inverses.push({ op: 'add', path: `/config/items/-`, value: item });

          delete placementMap[id];
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
        this.stage.render();
      }
    }

    duplicateSelected() {
      const profile = this.stage.currentProfile?.id || 'lg';
      const items = this.stage.board.config?.items || [];
      const placementMap = this.stage.board.layout.placement;
      if (!placementMap) return;

      const newIds = [];
      for (const id of this.selectedIds) {
        const item = items.find(it => it.id === id);
        const p = this.getItemPlacement(id, profile);
        if (!item || !p) continue;

        const newId = `${item.id}_copy_${Math.floor(Math.random() * 1000)}`;
        const newItem = JSON.parse(JSON.stringify(item));
        newItem.id = newId;
        newItem.title = `${item.title || 'Item'} (Copy)`;

        const newPlacement = {
          ...p,
          x: (Number(p.x) || 0) + 16,
          y: (Number(p.y) || 0) + 16
        };

        items.push(newItem);
        this.setItemPlacement(newId, profile, newPlacement);
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

      this.clipboard = [];
      for (const id of this.selectedIds) {
        const item = items.find(it => it.id === id);
        const p = this.getItemPlacement(id, profile);
        if (item && p) {
          this.clipboard.push({ item: JSON.parse(JSON.stringify(item)), placement: { ...p } });
        }
      }
    }

    pasteClipboard() {
      if (!this.clipboard || this.clipboard.length === 0) return;
      const profile = this.stage.currentProfile?.id || 'lg';
      const items = this.stage.board.config?.items || [];

      const newIds = [];
      for (const entry of this.clipboard) {
        const newId = `${entry.item.id}_${Math.floor(Math.random() * 1000)}`;
        const newItem = JSON.parse(JSON.stringify(entry.item));
        newItem.id = newId;

        const newPlacement = {
          ...entry.placement,
          x: (Number(entry.placement.x) || 0) + 20,
          y: (Number(entry.placement.y) || 0) + 20
        };

        items.push(newItem);
        this.setItemPlacement(newId, profile, newPlacement);
        newIds.push(newId);
      }

      this.stage.render();
      this.clearSelection();
      newIds.forEach(id => this.selectedIds.add(id));
      this.syncSelectionDom();
      this.requestOverlayRedraw();
    }

    /* -------------------------------------------------------------
     * Pure Alignment & Sizing Actions (STEP 3)
     * ------------------------------------------------------------- */
    alignSelected(alignment = 'left') {
      if (this.selectedIds.size <= 1 || !window.DimDashAutoLayout) return;
      const profile = this.stage.currentProfile?.id || 'lg';
      const selectedWorld = this.getSelectedWorldRects();
      if (selectedWorld.length <= 1) return;

      const aligned = window.DimDashAutoLayout.alignRects(selectedWorld, alignment);
      const patches = [];
      const inverses = [];

      for (const item of aligned) {
        const orig = selectedWorld.find(w => w.id === item.id);
        if (!orig || (orig.x === item.x && orig.y === item.y)) continue;

        const prevP = this.getItemPlacement(item.id, profile) || {};
        this.setItemPlacement(item.id, profile, { x: item.x, y: item.y });

        patches.push({
          op: 'merge',
          path: `/layout/placement/${item.id}/${profile}`,
          value: { x: item.x, y: item.y }
        });
        inverses.push({
          op: 'merge',
          path: `/layout/placement/${item.id}/${profile}`,
          value: { x: prevP.x, y: prevP.y }
        });
      }

      if (patches.length > 0) {
        this.history.push({
          type: 'align',
          patches,
          inverse: inverses,
          isCoalesceable: false
        });
        this.sendPatch(patches);
        this.stage.render();
      }
    }

    distributeSelected(direction = 'horizontal') {
      if (this.selectedIds.size <= 2 || !window.DimDashAutoLayout) return;
      const profile = this.stage.currentProfile?.id || 'lg';
      const selectedWorld = this.getSelectedWorldRects();
      if (selectedWorld.length <= 2) return;

      const distributed = window.DimDashAutoLayout.distributeRects(selectedWorld, direction);
      const patches = [];
      const inverses = [];

      for (const item of distributed) {
        const orig = selectedWorld.find(w => w.id === item.id);
        if (!orig || (orig.x === item.x && orig.y === item.y)) continue;

        const prevP = this.getItemPlacement(item.id, profile) || {};
        this.setItemPlacement(item.id, profile, { x: item.x, y: item.y });

        patches.push({
          op: 'merge',
          path: `/layout/placement/${item.id}/${profile}`,
          value: { x: item.x, y: item.y }
        });
        inverses.push({
          op: 'merge',
          path: `/layout/placement/${item.id}/${profile}`,
          value: { x: prevP.x, y: prevP.y }
        });
      }

      if (patches.length > 0) {
        this.history.push({
          type: 'distribute',
          patches,
          inverse: inverses,
          isCoalesceable: false
        });
        this.sendPatch(patches);
        this.stage.render();
      }
    }

    sameSizeSelected(dimension = 'width') {
      if (this.selectedIds.size <= 1 || !window.DimDashAutoLayout) return;
      const profile = this.stage.currentProfile?.id || 'lg';
      const selectedWorld = this.getSelectedWorldRects();
      if (selectedWorld.length <= 1) return;

      const resized = window.DimDashAutoLayout.sameSizeRects(selectedWorld, dimension);
      const patches = [];
      const inverses = [];

      for (const item of resized) {
        const orig = selectedWorld.find(w => w.id === item.id);
        if (!orig || (orig.w === item.w && orig.h === item.h)) continue;

        const prevP = this.getItemPlacement(item.id, profile) || {};
        this.setItemPlacement(item.id, profile, { w: item.w, h: item.h });

        patches.push({
          op: 'merge',
          path: `/layout/placement/${item.id}/${profile}`,
          value: { w: item.w, h: item.h }
        });
        inverses.push({
          op: 'merge',
          path: `/layout/placement/${item.id}/${profile}`,
          value: { w: prevP.w, h: prevP.h }
        });
      }

      if (patches.length > 0) {
        this.history.push({
          type: 'same_size',
          patches,
          inverse: inverses,
          isCoalesceable: false
        });
        this.sendPatch(patches);
        this.stage.render();
      }
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
      const selectedScreenRects = this.getSelectedScreenRects();
      if (selectedScreenRects.length !== 1 || !window.DimDashOverlay) {
        this.stage.viewportEl.style.cursor = '';
        return;
      }

      const sr = selectedScreenRects[0];
      const screenBounds = {
        x: sr.screenX,
        y: sr.screenY,
        w: sr.screenW,
        h: sr.screenH
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
      const selectedRects = this.getSelectedScreenRects();

      // Collect debug items if ?debug=1
      let debugItems = [];
      const isDebug = window.location.search.includes('debug=1');
      if (isDebug && this.stage.itemElements) {
        const vpRect = this.stage.viewportEl?.getBoundingClientRect();
        const profile = this.stage.currentProfile?.id || 'lg';
        const stageScale = this.stage.stageScale || 1.0;

        for (const [id, el] of this.stage.itemElements.entries()) {
          const elRect = el.getBoundingClientRect();
          const p = this.getItemPlacement(id, profile);
          const item = this.stage.board.config?.items?.find(it => it.id === id);

          const domRect = vpRect ? {
            x: elRect.left - vpRect.left,
            y: elRect.top - vpRect.top,
            w: elRect.width,
            h: elRect.height
          } : null;

          const numX = parseFloat(el.style.getPropertyValue('--x')) || (p ? Number(p.x) : 0);
          const numY = parseFloat(el.style.getPropertyValue('--y')) || (p ? Number(p.y) : 0);
          const numW = parseFloat(el.style.getPropertyValue('--w')) || (p ? Number(p.w) : 100);
          const numH = parseFloat(el.style.getPropertyValue('--h')) || (p ? Number(p.h) : 100);

          const modelRect = {
            x: numX * wu * stageScale,
            y: numY * wu * stageScale,
            w: numW * wu * stageScale,
            h: numH * wu * stageScale
          };

          debugItems.push({
            id,
            kind: item?.kind || el.getAttribute('data-kind') || 'item',
            modelRect,
            domRect
          });
        }
      }

      this.stage.overlayRenderer.render({
        isEditing: this.isEditing,
        camera,
        wu,
        selectedRects,
        debugItems,
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
