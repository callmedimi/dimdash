/**
 * DimDash Widget Catalog Entry Point (P08)
 * Registers built-in widgets into WidgetRegistry
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WidgetCatalog = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const Registry = typeof require !== 'undefined' ? require('./registry.js') : window.WidgetRegistry;
  const BigNumber = typeof require !== 'undefined' ? require('./catalog/bigNumber.js') : window.WidgetBigNumber;
  const ServiceTile = typeof require !== 'undefined' ? require('./catalog/serviceTile.js') : window.WidgetServiceTile;
  const Gauge = typeof require !== 'undefined' ? require('./catalog/gauge.js') : window.WidgetGauge;
  const Clock = typeof require !== 'undefined' ? require('./catalog/clock.js') : window.WidgetClock;
  const CustomDeclarative = typeof require !== 'undefined' ? require('./catalog/customDeclarative.js') : window.WidgetCustomDeclarative;

  function initCatalog() {
    if (BigNumber) Registry.register(BigNumber);
    if (ServiceTile) Registry.register(ServiceTile);
    if (Gauge) Registry.register(Gauge);
    if (Clock) Registry.register(Clock);
    if (CustomDeclarative) Registry.register(CustomDeclarative);
  }

  // Auto-init
  initCatalog();

  return {
    initCatalog
  };
});
