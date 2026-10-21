const { test, describe } = require('node:test');
const assert = require('node:assert');
const { deriveV1FromV2 } = require('../public/js/state/compat-v1');

describe('Client Compatibility Adapter (compat-v1.js)', () => {
  test('deriveV1FromV2 returns empty structure for null or empty input', () => {
    const res = deriveV1FromV2(null);
    assert.strictEqual(res.version, '1.0');
    assert.deepStrictEqual(res.categories, []);
    assert.deepStrictEqual(res.widgets, []);
  });

  test('deriveV1FromV2 passes through already v1 config without alteration', () => {
    const v1 = {
      version: '1.0',
      categories: [{ id: 'c1', name: 'Cat 1', tiles: [] }],
      widgets: []
    };
    const res = deriveV1FromV2(v1);
    assert.strictEqual(res, v1);
  });

  test('deriveV1FromV2 accurately extracts categories and islands', () => {
    const v2Board = {
      rev: 5,
      config: {
        version: 2,
        settings: { title: 'DimDash Lab' },
        items: [
          { id: 'isl_net', kind: 'island', title: 'Network Infrastructure', props: { color: '#6366f1', icon: 'server', layoutMode: 'grid' } }
        ]
      },
      layout: {
        placement: {
          isl_net: { lg: { x: 0, y: 0, w: 500, h: 300 } }
        }
      }
    };

    const res = deriveV1FromV2(v2Board);
    assert.strictEqual(res.settings.dashboard_title, 'DimDash Lab');
    assert.strictEqual(res.categories.length, 1);
    assert.strictEqual(res.categories[0].id, 'isl_net');
    assert.strictEqual(res.categories[0].name, 'Network Infrastructure');
    assert.strictEqual(res.categories[0].layout, 'grid');
  });

  test('deriveV1FromV2 nests services into their parent island', () => {
    const v2Board = {
      config: {
        version: 2,
        items: [
          { id: 'isl_1', kind: 'island', title: 'Island 1' },
          { id: 'srv_1', kind: 'service', title: 'Service 1', props: { target_url: 'http://srv1.lan' } },
          { id: 'srv_2', kind: 'service', title: 'Service 2', props: { target_url: 'http://srv2.lan' } }
        ]
      },
      layout: {
        placement: {
          srv_1: { lg: { parent: 'isl_1' } },
          srv_2: { lg: { parent: 'isl_1' } }
        }
      }
    };

    const res = deriveV1FromV2(v2Board);
    assert.strictEqual(res.categories.length, 1);
    assert.strictEqual(res.categories[0].tiles.length, 2);
    assert.strictEqual(res.categories[0].tiles[0].title, 'Service 1');
    assert.strictEqual(res.categories[0].tiles[1].title, 'Service 2');
  });

  test('deriveV1FromV2 sorts child tiles by placement.xs.order', () => {
    const v2Board = {
      config: {
        version: 2,
        items: [
          { id: 'isl_1', kind: 'island', title: 'Island 1' },
          { id: 'srv_a', kind: 'service', title: 'Tile A' },
          { id: 'srv_b', kind: 'service', title: 'Tile B' }
        ]
      },
      layout: {
        placement: {
          srv_a: { lg: { parent: 'isl_1' }, xs: { order: 2 } },
          srv_b: { lg: { parent: 'isl_1' }, xs: { order: 1 } }
        }
      }
    };

    const res = deriveV1FromV2(v2Board);
    assert.strictEqual(res.categories[0].tiles[0].title, 'Tile B');
    assert.strictEqual(res.categories[0].tiles[1].title, 'Tile A');
  });

  test('deriveV1FromV2 extracts widgets from items array', () => {
    const v2Board = {
      config: {
        version: 2,
        items: [
          { id: 'w_clock', kind: 'widget', type: 'clock_widget', title: 'Clock', props: { calendar_mode: 'both', show_seconds: true } },
          { id: 'w_cpu', kind: 'widget', type: 'cpu_gauge', title: 'CPU Usage', props: { server_id: 'local' } }
        ]
      }
    };

    const res = deriveV1FromV2(v2Board);
    assert.strictEqual(res.widgets.length, 2);
    assert.strictEqual(res.widgets[0].type, 'clock_widget');
    assert.strictEqual(res.widgets[0].calendar_mode, 'both');
    assert.strictEqual(res.widgets[1].type, 'cpu_gauge');
  });

  test('deriveV1FromV2 maps acl visibility user to pin_protected', () => {
    const v2Board = {
      config: {
        version: 2,
        items: [
          { id: 'isl_1', kind: 'island', title: 'Island' },
          { id: 'srv_secret', kind: 'service', title: 'Secret App', acl: { visibility: 'user' } }
        ]
      },
      layout: {
        placement: { srv_secret: { lg: { parent: 'isl_1' } } }
      }
    };

    const res = deriveV1FromV2(v2Board);
    assert.strictEqual(res.categories[0].tiles[0].visibility, 'pin_protected');
  });

  test('deriveV1FromV2 preserves probe configurations', () => {
    const v2Board = {
      config: {
        version: 2,
        items: [
          { id: 'isl_1', kind: 'island', title: 'Island' },
          { id: 'srv_mon', kind: 'service', title: 'Monitored', probe: { type: 'http_status', host: '10.0.0.1', port: 443 } }
        ]
      },
      layout: {
        placement: { srv_mon: { lg: { parent: 'isl_1' } } }
      }
    };

    const res = deriveV1FromV2(v2Board);
    assert.deepStrictEqual(res.categories[0].tiles[0].probe, { type: 'http_status', host: '10.0.0.1', port: 443 });
  });
});
