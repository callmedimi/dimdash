/**
 * Built-in Widget: Clock & Calendar
 * Responsive at XS, S, M, L, XL with Dual Gregorian & Jalali support
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WidgetClock = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return {
    type: 'clock',
    version: 1,
    label: { en: 'Clock', fa: 'ساعت' },
    category: 'time',
    icon: 'clock',
    size: { min: [80, 48], preferred: [200, 90], max: [600, 300], resizable: true },
    schema: {
      showSeconds: { type: 'boolean', label: 'Show Seconds', default: false },
      showDate: { type: 'boolean', label: 'Show Date', default: true },
      calendar: { type: 'string', label: 'Calendar (gregorian|persian)', default: 'gregorian' }
    },
    bindings: {},
    mount(ctx) {
      const container = ctx.el;
      container.innerHTML = `
        <div class="widget-clock-root" style="display:flex; flex-direction:column; justify-content:center; align-items:center; width:100%; height:100%; padding:var(--space-2); text-align:center; box-sizing:border-box;">
          <div class="clock-display tabular-nums" style="font-size:var(--text-display); font-weight:var(--weight-bold); line-height:1; color:var(--text-primary);">
            00:00
          </div>
          <div class="widget-clock-date text-caption" style="display:none; margin-top:var(--space-1); color:var(--text-muted);">
            Date
          </div>
        </div>
      `;

      const timeEl = container.querySelector('.clock-display');
      const dateEl = container.querySelector('.widget-clock-date');

      function tick() {
        const now = new Date();
        const hrs = String(now.getHours()).padStart(2, '0');
        const mins = String(now.getMinutes()).padStart(2, '0');
        const secs = String(now.getSeconds()).padStart(2, '0');

        const props = ctx.props();
        timeEl.textContent = props.showSeconds ? `${hrs}:${mins}:${secs}` : `${hrs}:${mins}`;

        if (dateEl.style.display !== 'none') {
          if (props.calendar === 'persian') {
            try {
              dateEl.textContent = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
              }).format(now);
            } catch {
              dateEl.textContent = now.toLocaleDateString();
            }
          } else {
            dateEl.textContent = now.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric'
            });
          }
        }
      }

      function applyLayout(cls) {
        if (cls === 'xs') {
          dateEl.style.display = 'none';
        } else {
          dateEl.style.display = 'block';
        }
      }

      applyLayout(ctx.size().cls);
      tick();

      // Tick every second via scoped interval (zero leaks)
      ctx.scope.interval(tick, 1000);

      return {
        update() {
          tick();
        },
        resize(w, h, cls) {
          applyLayout(cls);
        }
      };
    }
  };
});
