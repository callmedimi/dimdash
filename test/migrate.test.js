const { test, describe } = require('node:test');
const assert = require('node:assert');
const { migrateV1toV2, migrateV2toV1, isV2 } = require('../server/migrate');
const { validate, ConfigV2Schema, LayoutV2Schema, SecretsV2Schema } = require('../server/schema');

describe('v1 to v2 and v2 to v1 Migration', () => {
  test('Fixture 1: Empty v1 config migrates cleanly to v2', () => {
    const v1Empty = { version: '1.0', categories: [], widgets: [], servers: [], settings: {} };
    const res = migrateV1toV2(v1Empty);

    assert.strictEqual(res.config.version, 2);
    assert.strictEqual(res.layout.version, 2);
    assert.strictEqual(res.secrets.version, 2);
    assert.deepStrictEqual(res.config.items, []);

    assert.strictEqual(validate(ConfigV2Schema, res.config).ok, true);
    assert.strictEqual(validate(LayoutV2Schema, res.layout).ok, true);
  });

  test('Fixture 2: Tiny config (1 category, 1 tile, 1 widget) maps cleanly', () => {
    const v1Tiny = {
      version: '1.0',
      settings: { dashboard_title: 'Tiny Lab', admin_pin: '9999' },
      categories: [
        {
          id: 'cat_net',
          name: 'Network',
          color: '#10b981',
          layout: 'wide',
          tiles: [
            { id: 't_router', title: 'OpenWrt', target_url: 'http://192.168.1.1', probe: { type: 'ping_tcp', host: '192.168.1.1', port: 80 } }
          ]
        }
      ],
      widgets: [
        { id: 'w_clock', type: 'clock_widget', title: 'Clock' }
      ]
    };

    const res = migrateV1toV2(v1Tiny);
    assert.strictEqual(res.config.settings.title, 'Tiny Lab');
    assert.strictEqual(res.secrets.admin_pin.value, '9999');
    assert.strictEqual(res.config.settings.admin_pin, undefined); // Isolated from config

    // Check items: 1 widgets island + 1 widget item + 1 network island + 1 service item = 4 items
    assert.strictEqual(res.config.items.length, 4);

    const island = res.config.items.find(it => it.kind === 'island' && it.title === 'Network');
    assert.ok(island);
    assert.strictEqual(island.props.color, '#10b981');
    assert.strictEqual(island.props.layoutMode, 'flow');

    const service = res.config.items.find(it => it.kind === 'service' && it.title === 'OpenWrt');
    assert.ok(service);
    assert.strictEqual(service.probe.type, 'ping_tcp');

    // Layout check
    const servicePlacement = res.layout.placement[service.id];
    assert.ok(servicePlacement);
    assert.strictEqual(servicePlacement.lg.parent, island.id);
  });

  test('Fixture 3: Large scale config (300 tiles across 10 categories) executes under 50ms', () => {
    const categories = [];
    let tileIdCounter = 0;
    for (let c = 0; c < 10; c++) {
      const tiles = [];
      for (let t = 0; t < 30; t++) {
        tiles.push({
          id: `tile_${tileIdCounter++}`,
          title: `Service ${tileIdCounter}`,
          target_url: `http://srv-${tileIdCounter}.lan`,
          visibility: 'public'
        });
      }
      categories.push({
        id: `cat_${c}`,
        name: `Category ${c}`,
        tiles
      });
    }

    const start = Date.now();
    const res = migrateV1toV2({ version: '1.0', categories });
    const duration = Date.now() - start;

    assert.ok(duration < 100, `Migration took ${duration}ms, expected < 100ms`);
    // 10 islands + 300 services = 310 items
    assert.strictEqual(res.config.items.length, 310);
    assert.strictEqual(Object.keys(res.layout.placement).length, 310);
    assert.strictEqual(validate(ConfigV2Schema, res.config).ok, true);
  });

  test('Fixture 4: Unicode, Persian, and RTL titles preserve completely', () => {
    const v1Persian = {
      version: '1.0',
      settings: { dashboard_title: 'داشبورد اختصاصی هوم‌لب ایران' },
      categories: [
        {
          id: 'cat_fa',
          name: 'پایش و نظارت شبکه',
          tiles: [
            { id: 't_fa1', title: 'گرافانا توحید', subtitle: 'تحلیل داده‌های سرور مرکز', target_url: 'https://grafana.lan' },
            { id: 't_fa2', title: 'زبیکس اصفهان', subtitle: 'هشدارهای لحظه‌ای', target_url: 'http://zabbix.lan' }
          ]
        }
      ]
    };

    const res = migrateV1toV2(v1Persian);
    const island = res.config.items.find(it => it.kind === 'island');
    assert.strictEqual(island.title, 'پایش و نظارت شبکه');

    const srv1 = res.config.items.find(it => it.title === 'گرافانا توحید');
    assert.ok(srv1);
    assert.strictEqual(srv1.subtitle, 'تحلیل داده‌های سرور مرکز');
  });

  test('Fixture 5: Missing optional fields and malformed structures do not crash', () => {
    const v1Sparse = {
      categories: [
        { name: null, tiles: [{ id: null }] },
        null,
        { tiles: null }
      ]
    };

    const res = migrateV1toV2(v1Sparse);
    assert.strictEqual(res.config.version, 2);
    assert.ok(res.config.items.length >= 1);
    assert.strictEqual(validate(ConfigV2Schema, res.config).ok, true);
  });

  test('Idempotency: migrating already v2 model returns identical data', () => {
    const v2Model = {
      version: 2,
      settings: { title: 'DimDash v2' },
      servers: [],
      items: [{ id: 'it_1', kind: 'island', title: 'Main' }]
    };

    assert.strictEqual(isV2(v2Model), true);
    const res = migrateV1toV2(v2Model);
    assert.strictEqual(res.isAlreadyV2, true);
    assert.strictEqual(res.config.version, 2);
    assert.strictEqual(res.config.items[0].id, 'it_1');
  });

  test('Down-migration v2 -> v1 produces valid v1 config matching original items', () => {
    const v1Original = {
      version: '1.0',
      settings: { dashboard_title: 'Rollback Test', admin_pin: '1234' },
      categories: [
        {
          id: 'cat_prod',
          name: 'Production',
          tiles: [
            { id: 'tile_app', title: 'App Server', target_url: 'https://app.lan' }
          ]
        }
      ],
      widgets: [
        { id: 'w_cpu', type: 'cpu_gauge', title: 'CPU' }
      ]
    };

    const v2 = migrateV1toV2(v1Original);
    const v1Rollback = migrateV2toV1(v2);

    assert.strictEqual(v1Rollback.version, '1.0');
    assert.strictEqual(v1Rollback.settings.dashboard_title, 'Rollback Test');
    assert.strictEqual(v1Rollback.settings.admin_pin, '1234');
    assert.strictEqual(v1Rollback.categories.length, 1);
    assert.strictEqual(v1Rollback.categories[0].name, 'Production');
    assert.strictEqual(v1Rollback.categories[0].tiles.length, 1);
    assert.strictEqual(v1Rollback.categories[0].tiles[0].title, 'App Server');
    assert.strictEqual(v1Rollback.widgets.length, 1);
    assert.strictEqual(v1Rollback.widgets[0].title, 'CPU');
  });

  test('preserves custom theme and appearance properties', () => {
    const v1 = {
      settings: {
        theme: {
          accent_color: '#3f407d',
          glass_opacity: 0.85,
          glass_blur: 16,
          card_style: 'pill'
        }
      }
    };
    const res = migrateV1toV2(v1);
    assert.strictEqual(res.config.settings.theme.accent_color, '#3f407d');
    assert.strictEqual(res.config.settings.theme.glass_opacity, 0.85);
    assert.strictEqual(res.config.settings.theme.card_style, 'pill');
  });

  test('preserves search preferences and hotkey configuration', () => {
    const v1 = {
      settings: {
        search: { enabled: true, focus_hotkey: 'k', instant_filter: false }
      }
    };
    const res = migrateV1toV2(v1);
    assert.strictEqual(res.config.settings.search.focus_hotkey, 'k');
    assert.strictEqual(res.config.settings.search.instant_filter, false);
  });

  test('preserves server definitions and custom telemetry colors', () => {
    const v1 = {
      servers: [
        { id: 'srv_remote1', name: 'Remote Edge', type: 'agent_push', color: '#10b981' }
      ]
    };
    const res = migrateV1toV2(v1);
    assert.strictEqual(res.config.servers.length, 1);
    assert.strictEqual(res.config.servers[0].id, 'srv_remote1');
    assert.strictEqual(res.config.servers[0].color, '#10b981');
  });

  test('maps open_in_new_tab flag explicitly to service props', () => {
    const v1 = {
      categories: [
        {
          name: 'Cat',
          tiles: [
            { id: 't_sametab', title: 'Internal', open_in_new_tab: false },
            { id: 't_newtab', title: 'External', open_in_new_tab: true }
          ]
        }
      ]
    };
    const res = migrateV1toV2(v1);
    const item1 = res.config.items.find(it => it.title === 'Internal');
    const item2 = res.config.items.find(it => it.title === 'External');
    assert.strictEqual(item1.props.open_in_new_tab, false);
    assert.strictEqual(item2.props.open_in_new_tab, true);
  });

  test('preserves category background style and custom tile sizes in island props', () => {
    const v1 = {
      categories: [
        {
          name: 'Styled',
          tile_size: 'large',
          tile_style: 'grid',
          bg_style: 'glass'
        }
      ]
    };
    const res = migrateV1toV2(v1);
    const island = res.config.items.find(it => it.kind === 'island');
    assert.strictEqual(island.props.tileSize, 'large');
    assert.strictEqual(island.props.tileStyle, 'grid');
    assert.strictEqual(island.props.bgStyle, 'glass');
  });

  test('shelf packing assigns valid positive coordinates for all items in lg profile', () => {
    const v1 = {
      categories: [
        { name: 'C1', tiles: [{ id: 't1' }, { id: 't2' }] },
        { name: 'C2', tiles: [{ id: 't3' }] }
      ]
    };
    const res = migrateV1toV2(v1);
    for (const [id, pl] of Object.entries(res.layout.placement)) {
      assert.ok(pl.lg.x >= 0, `Item ${id} x must be >= 0`);
      assert.ok(pl.lg.y >= 0, `Item ${id} y must be >= 0`);
      assert.ok(pl.lg.w > 0, `Item ${id} w must be > 0`);
      assert.ok(pl.lg.h > 0, `Item ${id} h must be > 0`);
    }
  });

  test('down-migration preserves theme settings in v1 output', () => {
    const v2 = {
      config: {
        version: 2,
        settings: {
          title: 'Theme Down-Migrate',
          theme: { accent_color: '#ff0055' }
        },
        items: []
      }
    };
    const v1 = migrateV2toV1(v2);
    assert.strictEqual(v1.settings.theme.accent_color, '#ff0055');
  });

  test('down-migration handles empty or null placement map without error', () => {
    const v2 = {
      config: {
        version: 2,
        items: [{ id: 'it_isl', kind: 'island', title: 'Island No Layout' }]
      },
      layout: { placement: null }
    };
    const v1 = migrateV2toV1(v2);
    assert.strictEqual(v1.categories.length, 1);
    assert.strictEqual(v1.categories[0].name, 'Island No Layout');
  });
});

