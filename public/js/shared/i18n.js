/**
 * DimDash In-House Internationalization (i18n) Engine
 * 100% Air-Gapped & Offline - Zero External NPM Dependencies
 * Supports Persian (fa-IR, RTL) & English (en-US, LTR), ICU-lite plurals,
 * string interpolation, and logical direction enforcement.
 */
(function(global) {
  'use strict';

  const SUPPORTED_LOCALES = ['fa', 'en'];
  const DEFAULT_LOCALE = 'fa';

  let currentLocale = DEFAULT_LOCALE;
  let usePersianDigits = true;
  const dictionaries = {
    fa: {},
    en: {}
  };

  const missingKeyWarnings = new Set();
  const listeners = new Set();

  function getNestedValue(obj, path) {
    if (!obj || typeof obj !== 'object') return undefined;
    const parts = path.split('.');
    let cur = obj;
    for (const part of parts) {
      if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
      cur = cur[part];
    }
    return cur;
  }

  function interpolate(template, params = {}) {
    if (typeof template !== 'string') return '';
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
      if (params[key] !== undefined && params[key] !== null) {
        return String(params[key]);
      }
      return match;
    });
  }

  const DimDashI18n = {
    SUPPORTED_LOCALES,
    DEFAULT_LOCALE,

    init(locale = DEFAULT_LOCALE, initialDicts = {}) {
      if (initialDicts.en) dictionaries.en = initialDicts.en;
      if (initialDicts.fa) dictionaries.fa = initialDicts.fa;
      this.setLocale(locale);
      return this;
    },

    loadTranslations(locale, dict) {
      if (SUPPORTED_LOCALES.includes(locale) && dict && typeof dict === 'object') {
        dictionaries[locale] = { ...dictionaries[locale], ...dict };
        this.notify();
      }
    },

    getLocale() {
      return currentLocale;
    },

    isRTL() {
      return currentLocale === 'fa';
    },

    setLocale(locale) {
      if (!SUPPORTED_LOCALES.includes(locale)) {
        locale = DEFAULT_LOCALE;
      }
      currentLocale = locale;

      // Update DOM <html> element if running in browser
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.lang = locale;
        document.documentElement.dir = locale === 'fa' ? 'rtl' : 'ltr';
        document.documentElement.setAttribute('data-locale', locale);
      }

      this.notify();
    },

    setPersianDigits(enabled) {
      usePersianDigits = !!enabled;
      this.notify();
    },

    isPersianDigits() {
      return usePersianDigits;
    },

    subscribe(fn) {
      if (typeof fn === 'function') {
        listeners.add(fn);
        return () => listeners.delete(fn);
      }
      return () => {};
    },

    notify() {
      listeners.forEach(fn => {
        try { fn(currentLocale); } catch (_) {}
      });
    },

    t(key, params = {}) {
      if (!key || typeof key !== 'string') return '';

      let value = getNestedValue(dictionaries[currentLocale], key);

      // Fallback to English if not found in current locale
      if (value === undefined && currentLocale !== 'en') {
        value = getNestedValue(dictionaries.en, key);
      }

      // Handle pluralization if count parameter is provided
      if (typeof value === 'object' && value !== null && params.count !== undefined) {
        let rule = 'other';
        try {
          const pr = new Intl.PluralRules(currentLocale === 'fa' ? 'fa-IR' : 'en-US');
          rule = pr.select(params.count);
        } catch (_) {}

        value = value[rule] || value.other || value.one || '';
      }

      if (value === undefined) {
        if (!missingKeyWarnings.has(key)) {
          missingKeyWarnings.add(key);
          if (typeof console !== 'undefined' && console.warn) {
            console.warn(`[DimDashI18n] Missing translation key: "${key}" (locale: ${currentLocale})`);
          }
        }
        return key;
      }

      if (typeof value !== 'string') {
        return String(value);
      }

      return interpolate(value, params);
    },

    formatNumber(val, options = {}) {
      if (val === null || val === undefined || isNaN(val)) return '0';
      const num = Number(val);

      if (currentLocale === 'fa' && usePersianDigits) {
        try {
          return new Intl.NumberFormat('fa-IR', options).format(num);
        } catch (_) {
          return String(num).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]);
        }
      }

      return new Intl.NumberFormat('en-US', options).format(num);
    },

    formatDate(date = new Date(), options = {}) {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return '';

      const loc = currentLocale === 'fa' ? 'fa-IR-u-ca-persian' : 'en-US';
      try {
        return new Intl.DateTimeFormat(loc, options).format(d);
      } catch (_) {
        return d.toLocaleDateString();
      }
    },

    getMissingKeys() {
      return Array.from(missingKeyWarnings);
    },

    clearMissingKeys() {
      missingKeyWarnings.clear();
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DimDashI18n;
  } else {
    global.DimDashI18n = DimDashI18n;
  }
})(typeof window !== 'undefined' ? window : globalThis);
