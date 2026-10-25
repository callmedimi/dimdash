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
      this.boundPointerLeave = this.onPointerLeave.bind(this);
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
      el.addEventListener('pointerleave', this.boundPointerLeave);
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
        el.removeEventListener('pointerleave', this.boundPointerLeave);
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

      let target = itemPl[profile];
      if (target && target.inherit && itemPl[target.inherit]) {
        target = { ...itemPl[target.inherit], ...target };
      }

      if (!target || target.w === undefined) {
        const fallback = itemPl['lg'] || itemPl['md'] || Object.values(itemPl)[0] || null;
        if (fallback) {
          if (fallback.inherit && itemPl[fallback.inherit]) {
            target = { ...itemPl[fallback.inherit], ...fallback, ...(target || {}) };
          } else {
            target = { ...fallback, ...(target || {}) };
          }
        }
      }

      return target ? { ...target } : null;
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
      const existing = this.getItemPlacement(id, profile) || { x: 0, y: 0, w: 100, h: 100 };
      const merged = { ...existing, ...updates };
      if (merged.inherit) {
        delete merged.inherit;
      }
      this.stage.board.layout.placement[id][profile] = merged;
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
      let targetScreenRect = null;

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
          targetScreenRect = sr;
        }
      } else if (window.DimDashOverlay && selectedScreenRects.length === 0) {
        // Direct border grab on unselected item
        const itemEl = e.target.closest('.stage-item');
        if (itemEl && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
          const vpRect = viewportEl.getBoundingClientRect();
          const r = itemEl.getBoundingClientRect();
          const screenBounds = {
            x: r.left - vpRect.left,
            y: r.top - vpRect.top,
            w: r.width,
            h: r.height
          };
          const h = window.DimDashOverlay.StageOverlay.hitTestHandles(screenX, screenY, screenBounds, isCoarse);
          if (h) {
            const id = itemEl.getAttribute('data-id');
            this.selectItem(id, false);
            hitHandle = h;
            handleItemId = id;
            targetScreenRect = {
              id,
              screenX: screenBounds.x,
              screenY: screenBounds.y,
              screenW: screenBounds.w,
              screenH: screenBounds.h
            };
          }
        }
      }

      if (hitHandle && handleItemId) {
        // Start Resize
        const profile = this.stage.currentProfile?.id || 'lg';
        const p = this.getItemPlacement(handleItemId, profile) || { x: 0, y: 0, w: 100, h: 100 };
        const el = this.stage.itemElements?.get(handleItemId);
        const parentId = p.parent || el?.getAttribute('data-parent') || null;
        let parentWorldX = 0;
        let parentWorldY = 0;
        if (parentId) {
          const parentEl = this.stage.itemElements?.get(parentId);
          if (parentEl) {
            parentWorldX = parseFloat(parentEl.style.getPropertyValue('--x')) || 0;
            parentWorldY = parseFloat(parentEl.style.getPropertyValue('--y')) || 0;
          } else {
            const parentP = this.getItemPlacement(parentId, profile);
            if (parentP) {
              parentWorldX = Number(parentP.x) || 0;
              parentWorldY = Number(parentP.y) || 0;
            }
          }
        }

        // Collect direct children if this item is a group / island container
        const childrenStart = [];
        const allItems = this.stage.board?.config?.items || [];
        for (const it of allItems) {
          const itemPl = this.getItemPlacement(it.id, profile);
          const itemEl = this.stage.itemElements?.get(it.id);
          const pId = itemPl?.parent || itemEl?.getAttribute('data-parent') || null;
          if (pId === handleItemId) {
            childrenStart.push({
              id: it.id,
              x: Number(itemPl?.x) || 0,
              y: Number(itemPl?.y) || 0,
              w: Math.max(10, Number(itemPl?.w) || 100),
              h: Math.max(10, Number(itemPl?.h) || 100),
              el: itemEl
            });
          }
        }

        this.transitionTo(STATES.RESIZE, {
          pointerId: e.pointerId,
          handle: hitHandle,
          itemId: handleItemId,
          childrenStart,
          parentId,
          parentWorldX,
          parentWorldY,
          startX: screenX,
          startY: screenY,
          startRect: { ...p },
          startScreenRect: targetScreenRect || { ...selectedScreenRects[0] },
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

    onPointerLeave(e) {
      if (this.state === STATES.IDLE) {
        this.hoverHandle = null;
        if (this.stage?.viewportEl) {
          this.stage.viewportEl.style.cursor = '';
          this.stage.viewportEl.removeAttribute('data-hover-handle');
        }
        this.requestOverlayRedraw({ hoverHandle: null });
      }
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
      const origW = Math.max(10, Number(startRect.w) || 100);
      const origH = Math.max(10, Number(startRect.h) || 100);
      const origX = Number(startRect.x) || 0;
      const origY = Number(startRect.y) || 0;

      const minW = modifiers.minW !== undefined ? modifiers.minW : 20;
      const minH = modifiers.minH !== undefined ? modifiers.minH : 20;

      const keepAspect = !!modifiers.shiftKey;
      const fromCenter = !!modifiers.altKey;
      const origAspect = origW / Math.max(1, origH);

      const dw = Number(dxWu) || 0;
      const dh = Number(dyWu) || 0;

      let deltaW = 0;
      let deltaH = 0;

      if (handle.includes('e')) deltaW = dw;
      if (handle.includes('w')) deltaW = -dw;
      if (handle.includes('s')) deltaH = dh;
      if (handle.includes('n')) deltaH = -dh;

      if (fromCenter) {
        deltaW *= 2;
        deltaH *= 2;
      }

      let newW = Math.max(minW, origW + deltaW);
      let newH = Math.max(minH, origH + deltaH);

      if (keepAspect) {
        if (handle === 'e' || handle === 'w') {
          newH = Math.max(minH, newW / origAspect);
        } else if (handle === 'n' || handle === 's') {
          newW = Math.max(minW, newH * origAspect);
        } else {
          // Corner handles: fit to dominant dimension
          const scaleW = newW / origW;
          const scaleH = newH / origH;
          const scale = Math.max(scaleW, scaleH);
          newW = Math.max(minW, origW * scale);
          newH = Math.max(minH, origH * scale);
        }
      }

      let newX = origX;
      let newY = origY;

      if (fromCenter) {
        newX = origX - (newW - origW) / 2;
        newY = origY - (newH - origH) / 2;
      } else {
        if (handle.includes('w')) {
          newX = origX + (origW - newW);
        }
        if (handle.includes('n')) {
          newY = origY + (origH - newH);
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

      const itemObj = this.stage.board?.config?.items?.find(it => it.id === this.session.itemId);
      const isIsland = itemObj?.kind === 'island';
      const minW = isIsland ? 180 : 80;
      const minH = isIsland ? 100 : 44;

      const resized = InteractionController.calculateResize(
        this.session.startRect,
        this.session.handle,
        dxWu,
        dyWu,
        {
          shiftKey: this.session.shiftKey,
          altKey: this.session.altKey,
          minW,
          minH
        }
      );

      this.session.currentRect = resized;

      // Scale child items proportionally if resizing a group / island container
      if (this.session.childrenStart && this.session.childrenStart.length > 0) {
        const origParentW = Math.max(10, Number(this.session.startRect.w) || 100);
        const origParentH = Math.max(10, Number(this.session.startRect.h) || 100);
        const scaleX = Math.max(0.05, resized.w / origParentW);
        const scaleY = Math.max(0.05, resized.h / origParentH);

        for (const child of this.session.childrenStart) {
          const childW = Math.max(20, Math.round(child.w * scaleX * 10) / 10);
          const childH = Math.max(20, Math.round(child.h * scaleY * 10) / 10);
          const childX = Math.round(child.x * scaleX * 10) / 10;
          const childY = Math.round(child.y * scaleY * 10) / 10;
          child.current = { x: childX, y: childY, w: childW, h: childH };
        }
      }

      if (!this.rafPending) {
        this.rafPending = true;
        requestAnimationFrame(() => {
          this.rafPending = false;
          if (this.state !== STATES.RESIZE) return;

          const el = this.stage.itemElements.get(this.session.itemId);
          if (el) {
            const worldX = (this.session.parentWorldX || 0) + resized.x;
            const worldY = (this.session.parentWorldY || 0) + resized.y;

            el.style.setProperty('--x', worldX);
            el.style.setProperty('--y', worldY);
            el.style.setProperty('--w', resized.w);
            el.style.setProperty('--h', resized.h);

            const wWu = Number(resized.w) || 100;
            const hWu = Number(resized.h) || 100;
            let sizeClass = 'm';
            if (wWu < 130 || hWu < 52) sizeClass = 'xs';
            else if (wWu < 240 && hWu < 95) sizeClass = 's';
            else if (wWu < 360 && hWu < 140) sizeClass = 'm';
            else if (wWu < 540 && hWu < 220) sizeClass = 'l';
            else sizeClass = 'xl';

            const isCard = hWu >= 130 && (hWu / Math.max(1, wWu) >= 0.40);
            el.setAttribute('data-size', sizeClass);
            el.setAttribute('data-card-layout', isCard ? 'stacked' : 'row');
          }

          // Live update child elements inside group
          if (this.session.childrenStart && this.session.childrenStart.length > 0) {
            const parentWorldX = (this.session.parentWorldX || 0) + resized.x;
            const parentWorldY = (this.session.parentWorldY || 0) + resized.y;
            for (const child of this.session.childrenStart) {
              if (child.el && child.current) {
                child.el.style.setProperty('--x', parentWorldX + child.current.x);
                child.el.style.setProperty('--y', parentWorldY + child.current.y);
                child.el.style.setProperty('--w', child.current.w);
                child.el.style.setProperty('--h', child.current.h);
              }
            }
          }

          const worldRect = {
            x: (this.session.parentWorldX || 0) + resized.x,
            y: (this.session.parentWorldY || 0) + resized.y,
            w: resized.w,
            h: resized.h
          };

          this.requestOverlayRedraw({
            activeHandle: this.session.handle,
            sizingInfo: { rect: worldRect },
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
        if (newState === STATES.RESIZE) {
          this.activeHandle = payload?.handle || null;
          if (this.stage?.viewportEl) {
            this.stage.viewportEl.classList.add('is-resizing');
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
            this.stage.viewportEl.style.cursor = cursorMap[payload?.handle] || '';
            this.stage.viewportEl.setAttribute('data-hover-handle', payload?.handle || '');
          }
        }
        this.promoteLayers();
      } else if (newState === STATES.PAN || newState === STATES.LASSO) {
        this.session = payload;
      } else if (newState === STATES.IDLE) {
        this.session = null;
        this.activeHandle = null;
        if (this.stage?.viewportEl) {
          this.stage.viewportEl.classList.remove('is-resizing');
          this.stage.viewportEl.removeAttribute('data-hover-handle');
          this.stage.viewportEl.style.cursor = '';
        }
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
          this.stage.viewportEl.classList.remove('is-resizing');
          this.stage.viewportEl.removeAttribute('data-hover-handle');
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
          const worldX = (this.session.parentWorldX || 0) + this.session.startRect.x;
          const worldY = (this.session.parentWorldY || 0) + this.session.startRect.y;
          el.style.setProperty('--x', worldX);
          el.style.setProperty('--y', worldY);
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
              const islEl = this.stage.itemElements?.get(potentialIsland.id);
              const islP = this.getItemPlacement(potentialIsland.id, profile);
              
              let ix = Number(islP?.x) || 0;
              let iy = Number(islP?.y) || 0;
              let iw = Number(islP?.w) || 200;
              let ih = Number(islP?.h) || 150;

              if (islEl) {
                const elX = parseFloat(islEl.style.getPropertyValue('--x'));
                const elY = parseFloat(islEl.style.getPropertyValue('--y'));
                const elW = parseFloat(islEl.style.getPropertyValue('--w'));
                const elH = parseFloat(islEl.style.getPropertyValue('--h'));
                if (!isNaN(elX)) ix = elX;
                if (!isNaN(elY)) iy = elY;
                if (!isNaN(elW)) iw = elW;
                if (!isNaN(elH)) ih = elH;
              }

              if (cx >= ix && cx <= ix + iw && cy >= iy && cy <= iy + ih) {
                targetIsland = { id: potentialIsland.id, x: ix, y: iy };
                break;
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
        if (profile !== 'lg') {
          this.setItemPlacement(it.id, 'lg', {
            x: finalX,
            y: finalY,
            parent: newParent
          });
        }

        const confItem = this.stage.board.config?.items?.find(x => x.id === it.id);
        if (confItem) {
          confItem.parent = newParent;
        }

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
        if (profile !== 'lg') {
          patches.push({
            op: 'merge',
            path: `/layout/placement/${it.id}/lg`,
            value: { x: finalX, y: finalY, parent: newParent }
          });
        }

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
        if (profile !== 'lg') {
          this.setItemPlacement(id, 'lg', {
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
        if (profile !== 'lg') {
          patches.push({
            op: 'merge',
            path: `/layout/placement/${id}/lg`,
            value: { x: cr.x, y: cr.y, w: cr.w, h: cr.h }
          });
        }

        const inverses = [{
          op: 'merge',
          path: `/layout/placement/${id}/${profile}`,
          value: { x: prevPlacement.x, y: prevPlacement.y, w: prevPlacement.w, h: prevPlacement.h }
        }];
        if (profile !== 'lg') {
          inverses.push({
            op: 'merge',
            path: `/layout/placement/${id}/lg`,
            value: { x: prevPlacement.x, y: prevPlacement.y, w: prevPlacement.w, h: prevPlacement.h }
          });
        }

        // Persist proportionally scaled children placements
        if (this.session.childrenStart && this.session.childrenStart.length > 0) {
          const origParentW = Math.max(10, Number(sr.w) || 100);
          const origParentH = Math.max(10, Number(sr.h) || 100);
          const scaleX = Math.max(0.05, cr.w / origParentW);
          const scaleY = Math.max(0.05, cr.h / origParentH);

          for (const child of this.session.childrenStart) {
            const childPrev = this.getItemPlacement(child.id, profile) || {};
            const childW = Math.max(20, Math.round(child.w * scaleX * 10) / 10);
            const childH = Math.max(20, Math.round(child.h * scaleY * 10) / 10);
            const childX = Math.round(child.x * scaleX * 10) / 10;
            const childY = Math.round(child.y * scaleY * 10) / 10;

            const childPlacement = {
              ...childPrev,
              x: childX,
              y: childY,
              w: childW,
              h: childH
            };

            this.setItemPlacement(child.id, profile, childPlacement);
            if (profile !== 'lg') {
              this.setItemPlacement(child.id, 'lg', childPlacement);
            }

            if (this.stage.spatialIndex) {
              const worldX = (this.session.parentWorldX || 0) + cr.x + childX;
              const worldY = (this.session.parentWorldY || 0) + cr.y + childY;
              this.stage.spatialIndex.update({
                id: child.id,
                x: worldX,
                y: worldY,
                w: childW,
                h: childH
              });
            }

            patches.push({
              op: 'merge',
              path: `/layout/placement/${child.id}/${profile}`,
              value: { x: childX, y: childY, w: childW, h: childH }
            });
            if (profile !== 'lg') {
              patches.push({
                op: 'merge',
                path: `/layout/placement/${child.id}/lg`,
                value: { x: childX, y: childY, w: childW, h: childH }
              });
            }

            inverses.push({
              op: 'merge',
              path: `/layout/placement/${child.id}/${profile}`,
              value: { x: childPrev.x, y: childPrev.y, w: childPrev.w, h: childPrev.h }
            });
            if (profile !== 'lg') {
              inverses.push({
                op: 'merge',
                path: `/layout/placement/${child.id}/lg`,
                value: { x: childPrev.x, y: childPrev.y, w: childPrev.w, h: childPrev.h }
              });
            }
          }
        }

        if (this.stage.spatialIndex) {
          const worldX = (this.session.parentWorldX || 0) + cr.x;
          const worldY = (this.session.parentWorldY || 0) + cr.y;
          this.stage.spatialIndex.update({
            id,
            x: worldX,
            y: worldY,
            w: cr.w,
            h: cr.h
          });
        }

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
        const parentId = p.parent || el?.getAttribute('data-parent') || null;
        let parentWorldX = 0;
        let parentWorldY = 0;
        if (parentId) {
          const parentEl = this.stage.itemElements?.get(parentId);
          if (parentEl) {
            parentWorldX = parseFloat(parentEl.style.getPropertyValue('--x')) || 0;
            parentWorldY = parseFloat(parentEl.style.getPropertyValue('--y')) || 0;
          } else {
            const parentP = this.getItemPlacement(parentId, profile);
            if (parentP) {
              parentWorldX = Number(parentP.x) || 0;
              parentWorldY = Number(parentP.y) || 0;
            }
          }
        }

        const worldX = parentWorldX + newX;
        const worldY = parentWorldY + newY;

        if (el) {
          el.style.setProperty('--x', worldX);
          el.style.setProperty('--y', worldY);
        }

        if (this.stage.spatialIndex) {
          this.stage.spatialIndex.update({ id, x: worldX, y: worldY, w: p.w, h: p.h });
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
      if (!this.stage?.viewportEl) return;
      const selectedScreenRects = this.getSelectedScreenRects();
      let handle = null;

      if (selectedScreenRects.length === 1 && window.DimDashOverlay) {
        const sr = selectedScreenRects[0];
        const screenBounds = {
          x: sr.screenX,
          y: sr.screenY,
          w: sr.screenW,
          h: sr.screenH
        };
        handle = window.DimDashOverlay.StageOverlay.hitTestHandles(screenX, screenY, screenBounds, false);
      } else if (selectedScreenRects.length === 0 && window.DimDashOverlay && this.stage.viewportEl) {
        const vpRect = this.stage.viewportEl.getBoundingClientRect();
        const clientX = vpRect.left + screenX;
        const clientY = vpRect.top + screenY;
        const targetEl = document.elementFromPoint(clientX, clientY);
        const itemEl = targetEl ? targetEl.closest('.stage-item') : null;
        if (itemEl) {
          const r = itemEl.getBoundingClientRect();
          const screenBounds = {
            x: r.left - vpRect.left,
            y: r.top - vpRect.top,
            w: r.width,
            h: r.height
          };
          handle = window.DimDashOverlay.StageOverlay.hitTestHandles(screenX, screenY, screenBounds, false);
        }
      }

      this.hoverHandle = handle || null;

      if (!handle) {
        this.stage.viewportEl.style.cursor = '';
        this.stage.viewportEl.removeAttribute('data-hover-handle');
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
      this.stage.viewportEl.setAttribute('data-hover-handle', handle);
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

          const stageTx = parseFloat(this.stage.canvasEl?.style.getPropertyValue('--stage-tx')) || 0;
          const stageTy = parseFloat(this.stage.canvasEl?.style.getPropertyValue('--stage-ty')) || 0;

          const modelRect = {
            x: (numX + stageTx) * wu * stageScale,
            y: (numY + stageTy) * wu * stageScale,
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
        activeHandle: this.activeHandle || null,
        hoverHandle: this.hoverHandle || null,
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
