const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const DimDashI18n = require('../public/js/shared/i18n');

test('P10 i18n: Localization Engine & Dictionaries', async (t) => {
  const enDict = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/i18n/en.json'), 'utf8'));
  const faDict = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/i18n/fa.json'), 'utf8'));

  DimDashI18n.init('fa', { en: enDict, fa: faDict });

  await t.test('initializes with Persian default and RTL direction', () => {
    assert.strictEqual(DimDashI18n.getLocale(), 'fa');
    assert.strictEqual(DimDashI18n.isRTL(), true);
  });

  await t.test('switches locale cleanly to English with LTR direction', () => {
    DimDashI18n.setLocale('en');
    assert.strictEqual(DimDashI18n.getLocale(), 'en');
    assert.strictEqual(DimDashI18n.isRTL(), false);
    assert.strictEqual(DimDashI18n.t('app.title'), 'DimDash');
  });

  await t.test('switches locale back to Persian and translates keys correctly', () => {
    DimDashI18n.setLocale('fa');
    assert.strictEqual(DimDashI18n.getLocale(), 'fa');
    assert.strictEqual(DimDashI18n.isRTL(), true);
    assert.strictEqual(DimDashI18n.t('app.title'), 'دیم‌دش');
    assert.strictEqual(DimDashI18n.t('app.dashboard'), 'پیشخوان');
  });

  await t.test('interpolates variables accurately without string concatenation', () => {
    DimDashI18n.setLocale('fa');
    const msgFa = DimDashI18n.t('widgets.cores', { count: 8 });
    assert.strictEqual(msgFa, '8 هسته');

    DimDashI18n.setLocale('en');
    const msgEn = DimDashI18n.t('widgets.cores', { count: 8 });
    assert.strictEqual(msgEn, '8 Cores');
  });

  await t.test('falls back to English when key is missing in Persian dictionary', () => {
    // Add temporary English-only key
    DimDashI18n.loadTranslations('en', { custom: { english_only: 'Only in English: {val}' } });
    DimDashI18n.setLocale('fa');
    const fallbackVal = DimDashI18n.t('custom.english_only', { val: 'test' });
    assert.strictEqual(fallbackVal, 'Only in English: test');
  });

  await t.test('reports missing key and returns key as fallback', () => {
    DimDashI18n.clearMissingKeys();
    const missing = DimDashI18n.t('nonexistent.deeply.nested.key');
    assert.strictEqual(missing, 'nonexistent.deeply.nested.key');
    assert.ok(DimDashI18n.getMissingKeys().includes('nonexistent.deeply.nested.key'));
  });

  await t.test('formats numbers with Persian and Latin numeral options', () => {
    DimDashI18n.setLocale('fa');
    DimDashI18n.setPersianDigits(true);
    const faNum = DimDashI18n.formatNumber(123456);
    assert.ok(faNum.includes('۱۲۳') || faNum.includes('۱۲۳۴۵۶'));

    DimDashI18n.setPersianDigits(false);
    const latinNum = DimDashI18n.formatNumber(123456);
    assert.strictEqual(latinNum, '123,456');

    DimDashI18n.setLocale('en');
    const enNum = DimDashI18n.formatNumber(123456);
    assert.strictEqual(enNum, '123,456');
  });

  await t.test('notifies subscribers on locale change', () => {
    let notified = false;
    let newLoc = null;
    const unsub = DimDashI18n.subscribe((loc) => {
      notified = true;
      newLoc = loc;
    });

    DimDashI18n.setLocale('en');
    assert.strictEqual(notified, true);
    assert.strictEqual(newLoc, 'en');
    unsub();
  });
});
