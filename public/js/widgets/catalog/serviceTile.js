/**
 * Built-in Widget: Service Tile
 * Responsive at XS, S, M, L, XL
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WidgetServiceTile = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return {
    type: 'service_tile',
    version: 1,
    label: { en: 'Service Tile', fa: 'کاشی سرویس' },
    category: 'services',
    icon: 'server',
    size: { min: [90, 48], preferred: [240, 68], max: [600, 160], resizable: true },
    schema: {
      title: { type: 'string', label: 'Service Name', default: 'Service' },
      subtitle: { type: 'string', label: 'Host / IP' },
      url: { type: 'string', label: 'Target URL' },
      icon: { type: 'string', label: 'Icon', default: 'server' },
      plateMode: { type: 'string', label: 'Plate Mode', default: 'brand' }
    },
    bindings: {
      status: { kind: 'status' },
      latency: { kind: 'metric' }
    },
    mount(ctx) {
      const container = ctx.el;
      container.innerHTML = `
        <div class="instrument-tile widget-service-tile-root" style="width:100%; height:100%; box-sizing:border-box;">
          <div class="instrument-tile-start">
            <div class="icon-plate widget-tile-plate mode-brand size-sm">
              <span class="icon-plate-fallback">S</span>
            </div>
            <div class="instrument-tile-meta">
              <span class="instrument-tile-title widget-tile-title">Service</span>
              <span class="instrument-tile-sub widget-tile-sub" style="display:none;"></span>
            </div>
          </div>
          <div class="instrument-tile-end">
            <div class="instrument-heartbeat widget-tile-heartbeat" style="display:none;">
              <svg class="heartbeat-sparkline" viewBox="0 0 48 16">
                <path class="heartbeat-line" d="M0,8 L14,8 L18,2 L22,14 L26,5 L30,8 L44,8" />
                <circle class="heartbeat-beacon heartbeat-pulse" cx="44" cy="8" r="2.5" />
              </svg>
              <span class="heartbeat-latency widget-tile-latency"></span>
            </div>
            <div class="pilot-light is-ok size-sm widget-tile-pilot">
              <span class="pilot-light-glyph"></span>
            </div>
          </div>
        </div>
      `;

      const titleEl = container.querySelector('.widget-tile-title');
      const subEl = container.querySelector('.widget-tile-sub');
      const pilotEl = container.querySelector('.widget-tile-pilot');
      const heartbeatEl = container.querySelector('.widget-tile-heartbeat');
      const latencyEl = container.querySelector('.widget-tile-latency');
      const plateEl = container.querySelector('.widget-tile-plate');

      function applyLayout(cls) {
        if (cls === 'xs') {
          titleEl.style.display = 'none';
          subEl.style.display = 'none';
          heartbeatEl.style.display = 'none';
        } else if (cls === 's') {
          titleEl.style.display = 'block';
          subEl.style.display = 'none';
          heartbeatEl.style.display = 'none';
        } else if (cls === 'm') {
          titleEl.style.display = 'block';
          subEl.style.display = 'block';
          heartbeatEl.style.display = 'none';
        } else {
          // L & XL
          titleEl.style.display = 'block';
          subEl.style.display = 'block';
          heartbeatEl.style.display = 'inline-flex';
        }
      }

      function update(props = ctx.props()) {
        if (props.title) titleEl.textContent = props.title;
        if (props.subtitle) {
          subEl.textContent = props.subtitle;
          subEl.style.display = 'block';
        }
        if (props.status) {
          pilotEl.className = `pilot-light is-${props.status} size-sm widget-tile-pilot`;
        }
        if (props.latency !== undefined) {
          latencyEl.textContent = `${props.latency}ms`;
        }
        if (props.icon) {
          plateEl.innerHTML = `<span class="icon-plate-fallback">${props.icon.substring(0, 2).toUpperCase()}</span>`;
        }
      }

      applyLayout(ctx.size().cls);
      update(ctx.props());

      return {
        update,
        resize(w, h, cls) {
          applyLayout(cls);
        }
      };
    }
  };
});
