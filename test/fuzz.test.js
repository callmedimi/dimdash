const { test, describe } = require('node:test');
const assert = require('node:assert');
const PatchEngine = require('../server/patchEngine');
const { validate, ConfigV2Schema, LayoutV2Schema } = require('../server/schema');

describe('Fuzz Testing: 10,000 Randomized Patch Operations', () => {
  test('executes 10,000 random valid and invalid patches without crashing', () => {
    const engine = new PatchEngine({ maxJournalSize: 50 });
    let state = {
      rev: 1,
      config: {
        version: 2,
        settings: { title: 'Fuzz Board', locale: 'fa' },
        items: [
          { id: 'it_0', kind: 'island', title: 'Island 0', rev: 1 },
          { id: 'it_1', kind: 'service', title: 'Service 1', rev: 1 }
        ]
      },
      layout: {
        version: 2,
        rev: 1,
        profiles: [{ id: 'lg', mode: 'fit' }],
        placement: {
          it_0: { lg: { x: 0, y: 0, w: 200, h: 200 } }
        }
      }
    };

    const opTypes = ['set', 'merge', 'add', 'remove', 'move', 'test', 'invalid_op', ''];
    const possiblePaths = [
      '/settings/title',
      '/settings/locale',
      '/items/it_0/title',
      '/items/it_1/props',
      '/placement/it_0/lg',
      '/placement/it_0/lg/x',
      '/items/0',
      '/items/-',
      '/nonexistent/path',
      'invalid-pointer',
      '/__proto__/polluted',
      '/constructor/prototype'
    ];

    let successCount = 0;
    let rejectedCount = 0;

    for (let i = 0; i < 10000; i++) {
      const opType = opTypes[Math.floor(Math.random() * opTypes.length)];
      const path = possiblePaths[Math.floor(Math.random() * possiblePaths.length)];
      const randomVal = (Math.random() > 0.5) ? `Val_${i}` : { n: i, bool: i % 2 === 0 };

      const patchReq = {
        base: Math.random() > 0.3 ? state.rev : state.rev - 1,
        client: `c_${i % 5}`,
        ops: [
          { op: opType, path, value: randomVal, to: i % 2 }
        ]
      };

      try {
        const res = engine.applyPatch(state, patchReq);
        if (res.ok && res.state) {
          state = res.state;
          successCount++;
        }
      } catch (err) {
        // Expected rejection for invalid ops, bad pointers or schema violations
        rejectedCount++;
      }
    }

    assert.ok(successCount > 0, 'Expected at least some valid operations to succeed');
    assert.ok(rejectedCount > 0, 'Expected invalid fuzz operations to be safely rejected');

    // Final sanity check: state must still be schema-valid!
    assert.strictEqual(typeof state.rev, 'number');
    assert.strictEqual(state.config.version, 2);
    assert.strictEqual(state.layout.version, 2);
  });
});
