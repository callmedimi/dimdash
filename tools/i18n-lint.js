#!/usr/bin/env node
/**
 * DimDash i18n Linter
 * Ensures 100% key parity between en.json and fa.json,
 * validates placeholder syntax, and checks for mismatched interpolation variables.
 */

const fs = require('fs');
const path = require('path');

const i18nDir = path.resolve(__dirname, '../public/i18n');
const enPath = path.join(i18nDir, 'en.json');
const faPath = path.join(i18nDir, 'fa.json');

function extractKeys(obj, prefix = '') {
  let result = {};
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      result = { ...result, ...extractKeys(v, fullKey) };
    } else {
      result[fullKey] = String(v);
    }
  }
  return result;
}

function extractPlaceholders(str) {
  const matches = str.match(/\{([a-zA-Z0-9_]+)\}/g) || [];
  return matches.map(m => m.replace(/[\{\}]/g, '')).sort();
}

function lint() {
  console.log('[i18n-lint] Checking localization files...');

  if (!fs.existsSync(enPath)) {
    console.error(`[Error] Missing ${enPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(faPath)) {
    console.error(`[Error] Missing ${faPath}`);
    process.exit(1);
  }

  const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const faData = JSON.parse(fs.readFileSync(faPath, 'utf8'));

  const enKeys = extractKeys(enData);
  const faKeys = extractKeys(faData);

  const errors = [];

  // 1. Check for keys in EN missing in FA
  for (const k of Object.keys(enKeys)) {
    if (!(k in faKeys)) {
      errors.push(`Missing key in fa.json: "${k}"`);
    }
  }

  // 2. Check for keys in FA missing in EN
  for (const k of Object.keys(faKeys)) {
    if (!(k in enKeys)) {
      errors.push(`Missing key in en.json: "${k}"`);
    }
  }

  // 3. Check placeholder consistency
  for (const [k, enStr] of Object.entries(enKeys)) {
    if (k in faKeys) {
      const faStr = faKeys[k];
      const enParams = extractPlaceholders(enStr);
      const faParams = extractPlaceholders(faStr);

      const enSet = new Set(enParams);
      const faSet = new Set(faParams);

      for (const p of enParams) {
        if (!faSet.has(p)) {
          errors.push(`Placeholder mismatch in "${k}": {${p}} present in en.json but missing in fa.json`);
        }
      }
      for (const p of faParams) {
        if (!enSet.has(p)) {
          errors.push(`Placeholder mismatch in "${k}": {${p}} present in fa.json but missing in en.json`);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error(`\n[i18n-lint] Found ${errors.length} error(s):`);
    errors.forEach(e => console.error(`  ❌ ${e}`));
    process.exit(1);
  }

  console.log(`[i18n-lint] ✅ All ${Object.keys(enKeys).length} keys match perfectly across en.json and fa.json!`);
}

lint();
