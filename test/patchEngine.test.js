const { test, describe } = require('node:test');
const assert = require('node:assert');
const PatchEngine = require('../server/patchEngine');

describe('PatchEngine & Protocol', () => {
  function getSampleState() {
    return {
      rev: 10,
      config: {
        version: 2,
        settings: { title: 'DimDash', locale: 'fa' },
        items: [
          { id: 'it_isl1', kind: 'island', title: 'Home' },
          { id: 'it_srv1', kind: 'service', title: 'Grafana', props: { color: '#blue' } },
          { id: 'it_srv2', kind: 'service', title: 'Prometheus' }
        ]
      },
      layout: {
        version: 2,
        rev: 10,
        profiles: [{ id: 'lg', mode: 'fit' }],
        placement: {
          it_srv1: { lg: { x: 10, y: 20, w: 200, h: 100 } }
        }
      }
    };
  }

  test('applies "set" op to update scalar and object values and generates inverse', () => {
    const engine = new PatchEngine();
    const state = getSampleState();

    const patch = {
      base: 10,
      client: 'c_1',
      ops: [
        { op: 'set', path: '/settings/title', value: 'Updated Title' },
        { op: 'set', path: '/placement/it_srv1/lg', value: { x: 50, y: 60, w: 220, h: 110 } }
      ]
    };

    const res = engine.applyPatch(state, patch);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.rev, 11);
    assert.strictEqual(res.state.config.settings.title, 'Updated Title');
    assert.strictEqual(res.state.layout.placement.it_srv1.lg.x, 50);

    // Verify inverse ops (un为其 reversed order for rollback execution)
    assert.strictEqual(res.inverse.length, 2);
    assert.deepStrictEqual(res.inverse[1], { op: 'set', path: '/settings/title', value: 'DimDash' });
    assert.deepStrictEqual(res.inverse[0], { op: 'set', path: '/placement/it_srv1/lg', value: { x: 10, y: 20, w: 200, h: 100 } });
  });

  test('applies "merge" op to merge object properties and generates inverse', () => {
    const engine = new PatchEngine();
    const state = getSampleState();

    const patch = {
      base: 10,
      client: 'c_1',
      ops: [
        { op: 'merge', path: '/items/it_srv1/props', value: { color: '#red', icon: 'server' } }
      ]
    };

    const res = engine.applyPatch(state, patch);
    const item = res.state.config.items.find(it => it.id === 'it_srv1');
    assert.strictEqual(item.props.color, '#red');
    assert.strictEqual(item.props.icon, 'server');

    // Inverse should restore previous props
    assert.deepStrictEqual(res.inverse[0].value, { color: '#blue' });
  });

  test('applies "add" and "remove" ops on items array with inverses', () => {
    const engine = new PatchEngine();
    const state = getSampleState();

    // 1. Add item
    const newItem = { id: 'it_new', kind: 'service', title: 'New Item' };
    const addPatch = {
      base: 10,
      client: 'c_1',
      ops: [{ op: 'add', path: '/items/-', value: newItem }]
    };

    const resAdd = engine.applyPatch(state, addPatch);
    assert.strictEqual(resAdd.state.config.items.length, 4);
    assert.strictEqual(resAdd.state.config.items[3].id, 'it_new');
    assert.deepStrictEqual(resAdd.inverse[0], { op: 'remove', path: '/items/-' });

    // 2. Remove item
    const removePatch = {
      base: 11,
      client: 'c_1',
      ops: [{ op: 'remove', path: '/items/it_new' }]
    };

    const resRemove = engine.applyPatch(resAdd.state, removePatch);
    assert.strictEqual(resRemove.state.config.items.length, 3);
    assert.deepStrictEqual(resRemove.inverse[0].op, 'add');
    assert.strictEqual(resRemove.inverse[0].value.id, 'it_new');
  });

  test('applies "move" op to reorder array elements and generates inverse', () => {
    const engine = new PatchEngine();
    const state = getSampleState();

    const patch = {
      base: 10,
      client: 'c_1',
      ops: [{ op: 'move', path: '/items/0', to: 2 }]
    };

    const res = engine.applyPatch(state, patch);
    assert.strictEqual(res.state.config.items[2].id, 'it_isl1');
    assert.deepStrictEqual(res.inverse[0], { op: 'move', path: '/items/0', to: 0 });
  });

  test('applies "test" op successfully when value matches and fails with 409 when stale', () => {
    const engine = new PatchEngine();
    const state = getSampleState();

    const passPatch = {
      base: 10,
      client: 'c_1',
      ops: [
        { op: 'test', path: '/settings/locale', value: 'fa' },
        { op: 'set', path: '/settings/locale', value: 'en' }
      ]
    };
    const resPass = engine.applyPatch(state, passPatch);
    assert.strictEqual(resPass.state.config.settings.locale, 'en');

    // Stale test fails
    const failPatch = {
      base: 11,
      client: 'c_2',
      ops: [
        { op: 'test', path: '/settings/locale', value: 'fa' } // Currently 'en'
      ]
    };
    assert.throws(() => {
      engine.applyPatch(resPass.state, failPatch);
    }, (err) => err.status === 409);
  });

  test('detects concurrent path conflicts from journal', () => {
    const engine = new PatchEngine();
    let state = getSampleState();

    // Client 1 updates /settings/title at rev 10 -> committed at rev 11
    const patch1 = {
      base: 10,
      client: 'c_1',
      ops: [{ op: 'set', path: '/settings/title', value: 'Client 1 Title' }]
    };
    const res1 = engine.applyPatch(state, patch1);
    state = res1.state;

    // Client 2 submits patch based on old rev 10 also touching /settings/title
    const patch2 = {
      base: 10,
      client: 'c_2',
      ops: [{ op: 'set', path: '/settings/title', value: 'Client 2 Title' }]
    };
    const res2 = engine.applyPatch(state, patch2);
    assert.strictEqual(res2.conflicts.length, 1);
    assert.strictEqual(res2.conflicts[0], '/settings/title');
  });

  test('handles client sequence idempotency (replays ignored)', () => {
    const engine = new PatchEngine();
    const state = getSampleState();

    const patch = {
      base: 10,
      client: 'c_idemp',
      seq: 1,
      ops: [{ op: 'set', path: '/settings/title', value: 'Once' }]
    };

    const res1 = engine.applyPatch(state, patch);
    assert.strictEqual(res1.replayed, undefined);

    // Replay same patch with same or lower seq
    const res2 = engine.applyPatch(res1.state, patch);
    assert.strictEqual(res2.replayed, true);
    assert.strictEqual(res2.rev, res1.rev);
  });

  test('journal maintains ring buffer and truncates at max size', () => {
    const engine = new PatchEngine({ maxJournalSize: 10 });
    let state = getSampleState();

    for (let i = 0; i < 25; i++) {
      const patch = {
        base: state.rev,
        client: 'c_ring',
        ops: [{ op: 'set', path: '/settings/title', value: `Title ${i}` }]
      };
      state = engine.applyPatch(state, patch).state;
    }

    assert.strictEqual(engine.journal.length, 10);
    assert.strictEqual(engine.journal[engine.journal.length - 1].ops[0].value, 'Title 24');
  });

  test('applies deep nested path setting with automatic path creation', () => {
    const engine = new PatchEngine();
    const state = getSampleState();

    const patch = {
      base: 10,
      client: 'c_deep',
      ops: [{ op: 'set', path: '/placement/it_srv1/lg/shape', value: 'hexagon' }]
    };

    const res = engine.applyPatch(state, patch);
    assert.strictEqual(res.state.layout.placement.it_srv1.lg.shape, 'hexagon');
  });

  test('removing nonexistent path succeeds silently without throwing', () => {
    const engine = new PatchEngine();
    const state = getSampleState();

    const patch = {
      base: 10,
      client: 'c_rm',
      ops: [{ op: 'remove', path: '/settings/nonexistent' }]
    };

    const res = engine.applyPatch(state, patch);
    assert.strictEqual(res.ok, true);
  });

  test('merge op with non-object throws 400 bad request', () => {
    const engine = new PatchEngine();
    const state = getSampleState();

    const badPatch = {
      base: 10,
      client: 'c_bad',
      ops: [{ op: 'merge', path: '/settings', value: 'not an object' }]
    };

    assert.throws(() => engine.applyPatch(state, badPatch), (err) => err.status === 400);
  });

  test('move op with non-array container throws 400', () => {
    const engine = new PatchEngine();
    const state = getSampleState();

    const badPatch = {
      base: 10,
      client: 'c_bad_move',
      ops: [{ op: 'move', path: '/settings/title', to: 0 }]
    };

    assert.throws(() => engine.applyPatch(state, badPatch), (err) => err.status === 400);
  });

  test('ops array exceeding 200 items throws 400', () => {
    const engine = new PatchEngine();
    const state = getSampleState();

    const massiveOps = [];
    for (let i = 0; i < 205; i++) {
      massiveOps.push({ op: 'set', path: '/settings/title', value: `V_${i}` });
    }

    assert.throws(() => engine.applyPatch(state, { base: 10, client: 'c_mass', ops: massiveOps }), (err) => err.status === 400);
  });

  test('empty ops array throws 400', () => {
    const engine = new PatchEngine();
    const state = getSampleState();

    assert.throws(() => engine.applyPatch(state, { base: 10, client: 'c_empty', ops: [] }), (err) => err.status === 400);
  });

  test('applying inverse ops restores exact original state (Rollback / Undo)', () => {
    const engine = new PatchEngine();
    const originalState = getSampleState();

    const forwardPatch = {
      base: 10,
      client: 'c_undo',
      ops: [
        { op: 'set', path: '/settings/title', value: 'Brand New Title' },
        { op: 'set', path: '/settings/locale', value: 'en' },
        { op: 'add', path: '/items/-', value: { id: 'it_temp', kind: 'service', title: 'Temp' } }
      ]
    };

    const resForward = engine.applyPatch(originalState, forwardPatch);
    assert.strictEqual(resForward.state.config.settings.title, 'Brand New Title');
    assert.strictEqual(resForward.state.config.items.length, 4);

    // Apply inverse ops as an undo patch
    const undoPatch = {
      base: resForward.rev,
      client: 'c_undo',
      ops: resForward.inverse
    };

    const resUndo = engine.applyPatch(resForward.state, undoPatch);
    assert.strictEqual(resUndo.state.config.settings.title, 'DimDash');
    assert.strictEqual(resUndo.state.config.settings.locale, 'fa');
    assert.strictEqual(resUndo.state.config.items.length, 3);
    assert.strictEqual(resUndo.state.config.items.find(it => it.id === 'it_temp'), undefined);
  });

  test('journal query returns empty array when fromRev equals head revision', () => {
    const engine = new PatchEngine();
    const state = getSampleState();

    const patch = {
      base: 10,
      client: 'c_j',
      ops: [{ op: 'set', path: '/settings/title', value: 'Rev 11' }]
    };
    const res = engine.applyPatch(state, patch);

    const ops = engine.getOpsSince(res.rev);
    assert.deepStrictEqual(ops, []);
  });
});

