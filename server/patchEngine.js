/**
 * DimDash v2 Patch Protocol Engine & Op Journal
 * RFC-inspired JSON-Patch with path-level conflict resolution and inverse generation
 */

const { safeClone } = require('./schema');

class PatchEngine {
  constructor(options = {}) {
    this.maxJournalSize = options.maxJournalSize || 500;
    this.journal = []; // Ring buffer of { rev, client, seq, timestamp, ops, paths }
    this.clientSeqs = new Map(); // client -> last processed seq
    this.purgedUpToRev = 0;
  }

  /**
   * Split a JSON pointer into token segments: /foo/bar/0 -> ['foo', 'bar', '0']
   */
  parsePath(path) {
    if (!path || typeof path !== 'string' || !path.startsWith('/')) {
      throw new Error(`Invalid JSON pointer path: ${path}`);
    }
    return path.split('/').slice(1).map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  }

  /**
   * Resolve target container and key from document using path tokens.
   * Special handling: If array container and token is not an integer, match by item.id.
   */
  resolvePath(doc, tokens, createMissing = false) {
    let current = doc;
    for (let i = 0; i < tokens.length - 1; i++) {
      const token = tokens[i];
      if (current === null || typeof current !== 'object') {
        if (!createMissing) return null;
      }

      if (Array.isArray(current)) {
        let index = /^\d+$/.test(token) ? parseInt(token, 10) : -1;
        if (index === -1) {
          // Lookup by ID
          index = current.findIndex(item => item && item.id === token);
        }
        if (index === -1) {
          if (!createMissing) return null;
          const newObj = { id: token };
          current.push(newObj);
          current = newObj;
          continue;
        }
        current = current[index];
      } else {
        if (!(token in current)) {
          if (!createMissing) return null;
          current[token] = {};
        }
        current = current[token];
      }
    }

    const lastToken = tokens[tokens.length - 1];
    return { container: current, key: lastToken };
  }

  getValue(doc, path) {
    const tokens = this.parsePath(path);
    const resolved = this.resolvePath(doc, tokens, false);
    if (!resolved || !resolved.container) return undefined;

    const { container, key } = resolved;
    if (Array.isArray(container)) {
      if (/^\d+$/.test(key)) {
        return container[parseInt(key, 10)];
      }
      return container.find(item => item && item.id === key);
    }
    return container[key];
  }

  /**
   * Apply an array of patch ops to state { config, layout } in-memory.
   * Returns: { ok: true, state, inverse, conflicts } or throws error with status code
   */
  applyPatch(state, patchRequest) {
    const { base, client, seq, ops } = patchRequest;

    if (!Array.isArray(ops) || ops.length === 0) {
      throw { status: 400, message: 'Empty ops array' };
    }
    if (ops.length > 200) {
      throw { status: 400, message: 'Exceeded maximum 200 ops per patch' };
    }

    // Idempotency check: if client supplied seq, check for duplicate
    if (client && seq !== undefined) {
      const lastSeq = this.clientSeqs.get(client) || 0;
      if (seq <= lastSeq) {
        return {
          ok: true,
          replayed: true,
          rev: state.rev,
          state,
          inverse: [],
          conflicts: []
        };
      }
    }

    // Check conflicts against journal if base < state.rev
    const conflicts = [];
    if (base !== undefined && base < state.rev) {
      const recentOps = this.getOpsSince(base);
      const recentPaths = new Set();
      for (const entry of recentOps) {
        if (entry.client !== client) {
          for (const p of entry.paths) recentPaths.add(p);
        }
      }

      for (const op of ops) {
        if (recentPaths.has(op.path)) {
          conflicts.push(op.path);
        }
      }
    }

    // Clone working state
    const newState = {
      config: safeClone(state.config),
      layout: safeClone(state.layout),
      rev: (state.rev || 1) + 1
    };

    const inverseOps = [];
    const touchedPaths = new Set();

    for (const op of ops) {
      const { op: opType, path, value, to } = op;
      touchedPaths.add(path);

      // Determine root document: /placement, /profiles -> layout; else config
      const isLayoutPath = path.startsWith('/placement') || path.startsWith('/profiles') || path.startsWith('/layout');
      const rootDoc = isLayoutPath ? (path.startsWith('/layout') ? newState : newState.layout) : newState.config;
      const effectivePath = isLayoutPath && !path.startsWith('/layout') ? path : path;

      const previousValue = this.getValue(rootDoc, effectivePath);

      switch (opType) {
        case 'test': {
          const currentVal = this.getValue(rootDoc, effectivePath);
          if (JSON.stringify(currentVal) !== JSON.stringify(value)) {
            throw { status: 409, message: `Test op failed at path: ${path}. Expected: ${JSON.stringify(value)}, got: ${JSON.stringify(currentVal)}` };
          }
          break;
        }

        case 'set': {
          const tokens = this.parsePath(effectivePath);
          const resolved = this.resolvePath(rootDoc, tokens, true);
          if (!resolved) throw { status: 400, message: `Could not resolve path: ${path}` };

          const { container, key } = resolved;
          if (Array.isArray(container)) {
            const idx = /^\d+$/.test(key) ? parseInt(key, 10) : container.findIndex(it => it && it.id === key);
            if (idx >= 0 && idx < container.length) {
              container[idx] = safeClone(value);
            } else if (key === '-' || idx === -1) {
              container.push(safeClone(value));
            }
          } else {
            container[key] = safeClone(value);
          }

          if (previousValue === undefined) {
            inverseOps.unshift({ op: 'remove', path });
          } else {
            inverseOps.unshift({ op: 'set', path, value: safeClone(previousValue) });
          }
          break;
        }

        case 'merge': {
          if (!value || typeof value !== 'object') {
            throw { status: 400, message: `Merge op requires an object value at path: ${path}` };
          }
          const tokens = this.parsePath(effectivePath);
          const resolved = this.resolvePath(rootDoc, tokens, true);
          if (!resolved) throw { status: 400, message: `Could not resolve path: ${path}` };

          const { container, key } = resolved;
          const targetObj = Array.isArray(container)
            ? (/^\d+$/.test(key) ? container[parseInt(key, 10)] : container.find(it => it && it.id === key))
            : container[key];

          const prevClone = safeClone(targetObj || {});
          if (targetObj && typeof targetObj === 'object') {
            Object.assign(targetObj, safeClone(value));
          } else if (Array.isArray(container)) {
            container.push(safeClone(value));
          } else {
            container[key] = safeClone(value);
          }

          inverseOps.unshift({ op: 'set', path, value: prevClone });
          break;
        }

        case 'add': {
          const tokens = this.parsePath(effectivePath);
          const resolved = this.resolvePath(rootDoc, tokens, true);
          if (!resolved) throw { status: 400, message: `Could not resolve path: ${path}` };

          const { container, key } = resolved;
          if (Array.isArray(container)) {
            const idx = /^\d+$/.test(key) ? parseInt(key, 10) : (key === '-' ? container.length : -1);
            if (idx >= 0 && idx <= container.length) {
              container.splice(idx, 0, safeClone(value));
            } else {
              container.push(safeClone(value));
            }
          } else {
            container[key] = safeClone(value);
          }

          inverseOps.unshift({ op: 'remove', path });
          break;
        }

        case 'remove': {
          const tokens = this.parsePath(effectivePath);
          const resolved = this.resolvePath(rootDoc, tokens, false);
          if (resolved && resolved.container) {
            const { container, key } = resolved;
            if (Array.isArray(container)) {
              const idx = key === '-'
                ? container.length - 1
                : (/^\d+$/.test(key) ? parseInt(key, 10) : container.findIndex(it => it && it.id === key));
              if (idx >= 0 && idx < container.length) container.splice(idx, 1);
            } else {
              delete container[key];
            }
          }

          if (previousValue !== undefined) {
            inverseOps.unshift({ op: 'add', path, value: safeClone(previousValue) });
          }
          break;
        }

        case 'move': {
          const tokens = this.parsePath(effectivePath);
          const resolved = this.resolvePath(rootDoc, tokens, false);
          if (!resolved || !Array.isArray(resolved.container)) {
            throw { status: 400, message: `Move op target must be an array element at path: ${path}` };
          }
          const { container, key } = resolved;
          const fromIdx = /^\d+$/.test(key) ? parseInt(key, 10) : container.findIndex(it => it && it.id === key);
          const toIdx = typeof to === 'number' ? to : parseInt(to, 10);

          if (fromIdx >= 0 && toIdx >= 0 && toIdx < container.length) {
            const [item] = container.splice(fromIdx, 1);
            container.splice(toIdx, 0, item);
            inverseOps.unshift({ op: 'move', path, to: fromIdx });
          }
          break;
        }

        default:
          throw { status: 400, message: `Unsupported patch op: ${opType}` };
      }
    }

    // Update layout rev monotonic
    newState.layout.rev = newState.rev;

    // Append to op journal ring buffer
    const journalEntry = {
      rev: newState.rev,
      client: client || 'anonymous',
      seq: seq !== undefined ? seq : null,
      timestamp: Date.now(),
      ops: safeClone(ops),
      paths: Array.from(touchedPaths)
    };

    this.journal.push(journalEntry);
    if (this.journal.length > this.maxJournalSize) {
      const purged = this.journal.shift();
      if (purged) {
        this.purgedUpToRev = Math.max(this.purgedUpToRev, purged.rev);
      }
    }

    if (client && seq !== undefined) {
      this.clientSeqs.set(client, seq);
    }

    return {
      ok: true,
      rev: newState.rev,
      state: newState,
      inverse: inverseOps,
      conflicts
    };
  }

  getOpsSince(rev) {
    return this.journal.filter(entry => entry.rev > rev);
  }

  isPurged(rev) {
    return rev < this.purgedUpToRev;
  }

  getEarliestRev() {
    if (this.journal.length === 0) return 0;
    return this.journal[0].rev;
  }
}

module.exports = PatchEngine;
