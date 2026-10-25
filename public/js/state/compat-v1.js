/**
 * DimDash v1 Compatibility Adapter
 * Exposes legacy AppState.config.categories and AppState.config.widgets
 * derived seamlessly from v2 Spatial Board model until P05.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CompatV1 = factory();
    root.DimDashCompat = root.CompatV1;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function deriveV1FromV2(v2Board) {
    if (!v2Board || typeof v2Board !== 'object') {
      return { version: '1.0', categories: [], widgets: [], servers: [], settings: {} };
    }

    // If already v1, return as is
    if (v2Board.version === '1.0' || (v2Board.categories && !v2Board.items)) {
      return v2Board;
    }

    const config = v2Board.config || v2Board;
    const layout = v2Board.layout || {};
    const placement = layout.placement || {};

    const items = Array.isArray(config.items) ? config.items : [];
    const settings = config.settings || {};
    const servers = Array.isArray(config.servers) ? config.servers : [];

    const categories = [];
    const widgets = [];

    // 1. Separate islands, services, widgets
    const islands = items.filter(it => it.kind === 'island');
    const widgetItems = items.filter(it => it.kind === 'widget');
    const serviceItems = items.filter(it => it.kind === 'service');

    // 2. Extract widgets
    for (const w of widgetItems) {
      widgets.push({
        id: w.id,
        type: w.type || 'clock_widget',
        title: w.title || 'Widget',
        server_id: w.props?.server_id || w.bind?.server_id || 'local',
        color: w.props?.color || '#38bdf8',
        size: w.props?.size || 'normal',
        align: w.props?.align || 'center',
        calendar_mode: w.props?.calendar_mode,
        time_format: w.props?.time_format,
        show_seconds: w.props?.show_seconds
      });
    }

    // 3. Extract categories and their child tiles
    for (const isl of islands) {
      if (isl.id === 'it_island_widgets') continue;

      const childServices = serviceItems.filter(s => {
        const pl = placement[s.id]?.lg || placement[s.id] || {};
        return pl.parent === isl.id;
      });

      // Sort children by order in flow mode or array index
      childServices.sort((a, b) => {
        const orderA = placement[a.id]?.xs?.order ?? 0;
        const orderB = placement[b.id]?.xs?.order ?? 0;
        return orderA - orderB;
      });

      const tiles = childServices.map(s => ({
        id: s.id,
        title: s.title || '',
        subtitle: s.subtitle || '',
        target_url: s.props?.target_url || '',
        open_in_new_tab: s.props?.open_in_new_tab !== false,
        visibility: s.acl?.visibility === 'user' ? 'pin_protected' : 'public',
        icon_type: s.props?.icon_type || 'image',
        icon_value: s.props?.icon_value || '',
        icon_plate: s.props?.icon_plate || s.props?.iconPlate || undefined,
        bg_style: s.props?.bg_style || s.props?.bgStyle || undefined,
        bg_color: s.props?.bg_color || s.props?.bgColor || undefined,
        probe: s.probe || { type: 'none' }
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
        bg_style: isl.props?.bgStyle || isl.props?.bg_style || 'transparent',
        icon_plate: isl.props?.iconPlate || isl.props?.icon_plate || undefined,
        col_start: isl.props?.colStart || '1',
        tiles
      });
    }

    return {
      version: '1.0',
      settings: {
        dashboard_title: settings.title || 'DimDash',
        locale: settings.locale || 'fa',
        calendar: settings.calendar || 'both',
        quality: settings.quality || 'auto',
        theme: settings.theme ? JSON.parse(JSON.stringify(settings.theme)) : {},
        search: settings.search ? JSON.parse(JSON.stringify(settings.search)) : { enabled: true }
      },
      categories,
      widgets,
      servers,
      is_pin_protected: !!v2Board.is_pin_protected,
      is_user_pin_protected: !!v2Board.is_user_pin_protected
    };
  }

  return {
    deriveV1FromV2
  };
});
