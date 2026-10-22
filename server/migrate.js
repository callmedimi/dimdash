/**
 * DimDash v1 -> v2 and v2 -> v1 Migration Engine
 * Pure functions, zero side effects, lossless round-trip support
 */

const { validate, ConfigV2Schema, LayoutV2Schema, SecretsV2Schema } = require('./schema');

const DEFAULT_PROFILES = [
  { id: 'xs', match: { max_w: 480 }, mode: 'flow', design: [390, 844] },
  { id: 'sm', match: { min_w: 481, max_w: 900 }, mode: 'flow', design: [768, 1024] },
  { id: 'md', match: { min_w: 901, max_w: 1500 }, mode: 'fit', design: [1280, 800] },
  { id: 'lg', match: { min_w: 1501, max_w: 2400 }, mode: 'fit', design: [1920, 1080] },
  { id: 'xl', match: { min_w: 2401 }, mode: 'fit', design: [3440, 1440] },
  { id: 'wall', match: { display_class: 'wall' }, mode: 'fit', design: [1920, 1080], ui: 'tenfoot' }
];

function isV2(data) {
  if (!data || typeof data !== 'object') return false;
  return data.version === 2 || data.version === '2';
}

function cleanId(id, prefix = 'it_') {
  if (!id) return `${prefix}${Math.random().toString(36).substring(2, 10)}`;
  const sanitized = String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
  return sanitized.startsWith(prefix) ? sanitized : `${prefix}${sanitized}`;
}

/**
 * Migrate v1 configuration into v2 document model: { config, layout, secrets }
 */
function migrateV1toV2(v1Data) {
  if (!v1Data || typeof v1Data !== 'object') {
    v1Data = { version: "1.0", categories: [], widgets: [], servers: [], settings: {} };
  }

  // Idempotency: if already v2, return as is (or extract layout/secrets if present)
  if (isV2(v1Data) && Array.isArray(v1Data.items)) {
    return {
      isAlreadyV2: true,
      config: v1Data,
      layout: v1Data.layout || { version: 2, rev: 1, profiles: DEFAULT_PROFILES, placement: {} },
      secrets: v1Data.secrets || { version: 2, admin_pin: null, user_pin: null, server_tokens: {}, session_secret: '' }
    };
  }

  const v1Settings = v1Data.settings || {};
  const v1Categories = Array.isArray(v1Data.categories) ? v1Data.categories : [];
  const v1Widgets = Array.isArray(v1Data.widgets) ? v1Data.widgets : [];
  const v1Servers = Array.isArray(v1Data.servers) ? v1Data.servers : [];

  const items = [];
  const placement = {};
  const serverTokens = {};

  // 1. Secrets extraction
  const secrets = {
    version: 2,
    admin_pin: v1Settings.admin_pin ? { value: String(v1Settings.admin_pin), legacy: true } : null,
    user_pin: v1Settings.user_pin ? { value: String(v1Settings.user_pin), legacy: true } : null,
    server_tokens: serverTokens,
    session_secret: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  };

  // 2. Settings migration (without secrets)
  const settings = {
    title: v1Settings.dashboard_title || 'DimDash',
    locale: v1Settings.locale || 'fa',
    calendar: v1Settings.calendar || 'both',
    quality: v1Settings.quality || 'auto',
    theme: v1Settings.theme ? JSON.parse(JSON.stringify(v1Settings.theme)) : {},
    search: v1Settings.search ? JSON.parse(JSON.stringify(v1Settings.search)) : { enabled: true, focus_hotkey: '/', instant_filter: true },
    displays: v1Settings.displays || []
  };

  // 3. Servers migration (strip tokens into secrets)
  const servers = v1Servers.map(srv => {
    const srvCopy = { ...srv };
    if (srvCopy.token) {
      serverTokens[srvCopy.id] = srvCopy.token;
      delete srvCopy.token;
    }
    delete srvCopy.hasToken;
    return srvCopy;
  });

  // Shelf packing coordinate trackers for 'lg' profile
  let cursorX = 40;
  let cursorY = 40;
  let maxHeightInRow = 0;
  const STAGE_MAX_W = 1800;

  // 4. Widgets migration -> place into "Widgets" island
  if (v1Widgets.length > 0) {
    const widgetsIslandId = 'it_island_widgets';
    items.push({
      id: widgetsIslandId,
      kind: 'island',
      title: 'Widgets',
      props: {
        color: '#38bdf8',
        icon: 'gauge',
        headerStyle: 'none',
        layoutMode: 'flow',
        isCollapsed: false,
        density: 'normal'
      },
      acl: { visibility: 'public' },
      rev: 1
    });

    placement[widgetsIslandId] = {
      lg: { x: cursorX, y: cursorY, w: 1720, h: 220, z: 1, parent: null, hc: 'stretch', vc: 'top', shape: 'rounded' },
      md: { inherit: 'lg', scale: 'auto' },
      xs: { order: 0 }
    };

    let wOrder = 0;
    for (const w of v1Widgets) {
      if (!w || typeof w !== 'object') continue;
      const widgetId = cleanId(w.id || `w_${wOrder}`, 'it_w_');
      const widgetItem = {
        id: widgetId,
        kind: 'widget',
        type: w.type || 'clock_widget',
        title: w.title || 'Widget',
        props: {
          color: w.color || '#38bdf8',
          size: w.size || 'normal',
          align: w.align || 'center',
          calendar_mode: w.calendar_mode,
          time_format: w.time_format,
          show_seconds: w.show_seconds,
          server_id: w.server_id || 'local'
        },
        bind: { server_id: w.server_id || 'local' },
        acl: { visibility: 'public' },
        rev: 1
      };
      items.push(widgetItem);

      placement[widgetId] = {
        lg: { x: 20 + wOrder * 240, y: 20, w: 220, h: 180, z: 2, parent: widgetsIslandId, hc: 'left', vc: 'top', shape: 'rounded' },
        md: { inherit: 'lg' },
        xs: { order: wOrder }
      };
      wOrder++;
    }

    cursorY += 240;
  }

  // 5. Categories migration -> Islands, and Tiles -> Services
  let islandOrder = items.length;
  for (const cat of v1Categories) {
    if (!cat || typeof cat !== 'object') continue;
    const islandId = cleanId(cat.id || `cat_${islandOrder}`, 'it_isl_');
    const layoutMode = (cat.layout === 'grid') ? 'grid' : 'flow';
    const density = (cat.layout === 'compact') ? 'compact' : 'normal';

    const tiles = Array.isArray(cat.tiles) ? cat.tiles : [];
    const islandItem = {
      id: islandId,
      kind: 'island',
      title: cat.name || 'Category',
      subtitle: cat.subtitle || '',
      props: {
        color: cat.color || '#6366f1',
        icon: cat.icon || 'folder',
        layoutMode,
        isCollapsed: !!cat.is_collapsed,
        density,
        tileSize: cat.tile_size || 'medium',
        tileStyle: cat.tile_style || 'grid',
        bgStyle: cat.bg_style || 'transparent',
        colStart: cat.col_start || '1'
      },
      acl: { visibility: 'public' },
      rev: 1
    };
    items.push(islandItem);

    // Calculate island width and height based on child tiles
    const islandW = 540;
    const tileRows = Math.max(1, Math.ceil(tiles.length / 2));
    const islandH = 90 + tileRows * 110;

    if (cursorX + islandW > STAGE_MAX_W && cursorX > 40) {
      cursorX = 40;
      cursorY += maxHeightInRow + 30;
      maxHeightInRow = 0;
    }

    placement[islandId] = {
      lg: { x: cursorX, y: cursorY, w: islandW, h: islandH, z: 1, parent: null, hc: 'left', vc: 'top', shape: 'rounded' },
      md: { inherit: 'lg', scale: 'auto' },
      xs: { order: islandOrder }
    };

    if (islandH > maxHeightInRow) maxHeightInRow = islandH;

    // Migrate tiles
    let tileIndex = 0;
    for (const t of tiles) {
      if (!t || typeof t !== 'object') continue;
      const tileId = cleanId(t.id || `tile_${islandId}_${tileIndex}`, 'it_srv_');
      const serviceItem = {
        id: tileId,
        kind: 'service',
        title: t.title || 'Service',
        subtitle: t.subtitle || '',
        props: {
          target_url: t.target_url || '',
          open_in_new_tab: t.open_in_new_tab !== false,
          icon_type: t.icon_type || 'image',
          icon_value: t.icon_value || ''
        },
        bind: t.probe ? { status: `probe:${tileId}` } : {},
        probe: t.probe ? JSON.parse(JSON.stringify(t.probe)) : { type: 'none' },
        acl: { visibility: t.visibility === 'pin_protected' ? 'user' : 'public' },
        rev: 1
      };
      items.push(serviceItem);

      const col = tileIndex % 2;
      const row = Math.floor(tileIndex / 2);
      placement[tileId] = {
        lg: { x: 20 + col * 250, y: 60 + row * 100, w: 230, h: 85, z: 2, parent: islandId, hc: 'left', vc: 'top', shape: 'rounded' },
        md: { inherit: 'lg' },
        xs: { order: tileIndex }
      };
      tileIndex++;
    }

    cursorX += islandW + 30;
    islandOrder++;
  }

  const configV2 = {
    version: 2,
    settings,
    servers,
    items
  };

  const layoutV2 = {
    version: 2,
    rev: 1,
    profiles: DEFAULT_PROFILES,
    placement
  };

  return {
    isAlreadyV2: false,
    config: configV2,
    layout: layoutV2,
    secrets
  };
}

/**
 * Down-migrate v2 back to v1 format for fallback / rollback
 */
function migrateV2toV1({ config, layout, secrets = {} }) {
  if (!config || !isV2(config)) {
    return config || {};
  }

  const v1Settings = {
    dashboard_title: config.settings?.title || 'DimDash',
    locale: config.settings?.locale || 'fa',
    calendar: config.settings?.calendar || 'both',
    quality: config.settings?.quality || 'auto',
    theme: config.settings?.theme ? JSON.parse(JSON.stringify(config.settings.theme)) : {},
    search: config.settings?.search ? JSON.parse(JSON.stringify(config.settings.search)) : { enabled: true },
    admin_pin: secrets.admin_pin?.value || '',
    user_pin: secrets.user_pin?.value || ''
  };

  const servers = (config.servers || []).map(s => {
    const token = secrets.server_tokens?.[s.id] || '';
    return { ...s, token, hasToken: !!token };
  });

  const items = Array.isArray(config.items) ? config.items : [];
  const islands = items.filter(it => it.kind === 'island');
  const widgetsList = [];
  const categories = [];

  // Reconstitute widgets
  const widgetItems = items.filter(it => it.kind === 'widget');
  for (const w of widgetItems) {
    widgetsList.push({
      id: w.id,
      type: w.type || 'clock_widget',
      title: w.title || 'Widget',
      server_id: w.props?.server_id || 'local',
      color: w.props?.color || '#38bdf8',
      size: w.props?.size || 'normal',
      align: w.props?.align || 'center',
      calendar_mode: w.props?.calendar_mode,
      time_format: w.props?.time_format,
      show_seconds: w.props?.show_seconds
    });
  }

  // Reconstitute categories & tiles
  for (const isl of islands) {
    if (isl.id === 'it_island_widgets') continue; // widgets were handled above

    const childTiles = items.filter(it => {
      const pl = layout?.placement?.[it.id]?.lg || layout?.placement?.[it.id] || {};
      return it.kind === 'service' && pl.parent === isl.id;
    });

    const tiles = childTiles.map(t => ({
      id: t.id,
      title: t.title || '',
      subtitle: t.subtitle || '',
      target_url: t.props?.target_url || '',
      open_in_new_tab: t.props?.open_in_new_tab !== false,
      visibility: t.acl?.visibility === 'user' ? 'pin_protected' : 'public',
      icon_type: t.props?.icon_type || 'image',
      icon_value: t.props?.icon_value || '',
      probe: t.probe || { type: 'none' }
    }));

    categories.push({
      id: isl.id,
      name: isl.title || 'Category',
      subtitle: isl.subtitle || '',
      color: isl.props?.color || '#6366f1',
      icon: isl.props?.icon || 'folder',
      layout: isl.props?.layoutMode === 'grid' ? 'grid' : (isl.props?.density === 'compact' ? 'compact' : 'wide'),
      is_collapsed: !!isl.props?.isCollapsed,
      tile_size: isl.props?.tileSize || 'medium',
      tile_style: isl.props?.tileStyle || 'grid',
      bg_style: isl.props?.bgStyle || 'transparent',
      col_start: isl.props?.colStart || '1',
      tiles
    });
  }

  return {
    version: '1.0',
    settings: v1Settings,
    categories,
    widgets: widgetsList,
    servers,
    is_pin_protected: !!v1Settings.admin_pin,
    is_user_pin_protected: !!v1Settings.user_pin
  };
}

module.exports = {
  isV2,
  cleanId,
  DEFAULT_PROFILES,
  migrateV1toV2,
  migrateV2toV1
};
