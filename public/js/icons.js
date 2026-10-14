/**
 * Client Icon Helper
 */
const IconCatalog = {
  icons: {},

  async init() {
    try {
      const res = await fetch('/api/icons');
      if (res.ok) {
        this.icons = await res.json();
      }
    } catch (e) {
      console.warn('Failed to fetch icon catalog', e);
    }
  },

  render(iconType, iconValue) {
    if (iconType === 'svg' && iconValue) {
      return iconValue;
    }
    if (iconType === 'uploaded' && iconValue) {
      return `<img src="${iconValue}" alt="Icon" loading="lazy" />`;
    }
    // Preset
    if (this.icons[iconValue]) {
      return this.icons[iconValue];
    }
    // Fallback server icon
    return this.icons['server'] || `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"></rect><rect x="2" y="14" width="20" height="8" rx="2"></rect></svg>`;
  }
};
