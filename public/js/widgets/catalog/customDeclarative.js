/**
 * Built-in Widget: Declarative Custom Widget (Safe JSON-Driven, Zero Code)
 * Renders templates with rows, stacks, text, numbers, bars, and pilot lights
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WidgetCustomDeclarative = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ExprEngine = typeof require !== 'undefined' ? require('../expr.js') : window.ExprEngine;

  return {
    type: 'custom',
    version: 1,
    label: { en: 'Custom (Declarative)', fa: 'سفارشی (اعلانی)' },
    category: 'custom',
    icon: 'layout',
    size: { min: [90, 50], preferred: [240, 120], max: [800, 600], resizable: true },
    schema: {
      template: { type: 'object', label: 'Declarative JSON Template' }
    },
    bindings: {},
    mount(ctx) {
      const container = ctx.el;
      container.innerHTML = `<div class="widget-custom-root" style="display:flex; flex-direction:column; width:100%; height:100%; padding:var(--space-2); box-sizing:border-box;"></div>`;
      const rootEl = container.querySelector('.widget-custom-root');

      function renderNode(node, scope) {
        if (!node || typeof node !== 'object') return null;

        const el = document.createElement('div');

        switch (node.type) {
          case 'row':
            el.style.display = 'flex';
            el.style.flexDirection = 'row';
            el.style.alignItems = node.align || 'center';
            el.style.justifyContent = node.justify || 'space-between';
            el.style.gap = 'var(--space-2)';
            if (Array.isArray(node.children)) {
              node.children.forEach((c) => {
                const childEl = renderNode(c, scope);
                if (childEl) el.appendChild(childEl);
              });
            }
            break;

          case 'stack':
            el.style.display = 'flex';
            el.style.flexDirection = 'column';
            el.style.gap = 'var(--space-1)';
            if (Array.isArray(node.children)) {
              node.children.forEach((c) => {
                const childEl = renderNode(c, scope);
                if (childEl) el.appendChild(childEl);
              });
            }
            break;

          case 'text':
            el.className = node.style === 'micro' ? 'mono-micro' : 'text-body';
            el.textContent = node.expr ? ExprEngine.evaluate(node.expr, scope) : node.value || '';
            break;

          case 'number':
            el.className = 'instrument-hero-val tabular-nums';
            el.textContent = node.expr ? ExprEngine.evaluate(node.expr, scope) : node.value || '0';
            break;

          case 'bar': {
            const pct = node.expr ? Number(ExprEngine.evaluate(node.expr, scope)) || 0 : node.value || 0;
            el.className = 'instrument-segmented-gauge';
            el.innerHTML = Array.from({ length: 10 })
              .map((_, i) => `<span class="instrument-segment ${i < Math.round(pct / 10) ? 'is-active' : ''}"></span>`)
              .join('');
            break;
          }

          case 'pilot': {
            const status = node.expr ? ExprEngine.evaluate(node.expr, scope) : node.status || 'ok';
            el.className = `pilot-light is-${status} size-sm`;
            el.innerHTML = `<span class="pilot-light-glyph"></span>`;
            break;
          }

          default:
            el.textContent = String(node.value || '');
            break;
        }

        return el;
      }

      function update(props = ctx.props()) {
        rootEl.innerHTML = '';
        const tpl = props.template || {
          type: 'stack',
          children: [
            { type: 'text', style: 'micro', value: 'DECLARATIVE WIDGET' },
            { type: 'number', value: '42' }
          ]
        };

        const rendered = renderNode(tpl, props);
        if (rendered) rootEl.appendChild(rendered);
      }

      update(ctx.props());

      return {
        update,
        resize() {}
      };
    }
  };
});
