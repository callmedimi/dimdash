#!/usr/bin/env node
/**
 * DimDash v1 -> v2 Migration CLI
 * Usage: node tools/migrate.js [--dry-run] [--force]
 */

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const { migrateV1toV2, isV2 } = require('../server/migrate');
const { validate, ConfigV2Schema, LayoutV2Schema, SecretsV2Schema } = require('../server/schema');

const DATA_DIR = path.resolve(__dirname, '../data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.yaml');
const LAYOUT_PATH = path.join(DATA_DIR, 'layout.yaml');
const SECRETS_PATH = path.join(DATA_DIR, 'secrets.yaml');
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const BACKUP_V1_PATH = path.join(HISTORY_DIR, 'config.v1.bak.yaml');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');

console.log('🚀 DimDash Data Model v2 Migration Tool');
console.log('========================================');

if (!fs.existsSync(CONFIG_PATH)) {
  console.error(`❌ Error: Config file not found at ${CONFIG_PATH}`);
  process.exit(1);
}

const rawConfig = fs.readFileSync(CONFIG_PATH, 'utf8');
let parsed;
try {
  parsed = YAML.parse(rawConfig);
} catch (e) {
  console.error(`❌ Error parsing YAML: ${e.message}`);
  process.exit(1);
}

if (isV2(parsed) && !isForce) {
  console.log('ℹ️  Config is already schema v2. No migration needed (use --force to re-migrate).');
  process.exit(0);
}

console.log('📦 Reading v1 configuration...');
const oldCategoryCount = Array.isArray(parsed.categories) ? parsed.categories.length : 0;
let oldTileCount = 0;
if (Array.isArray(parsed.categories)) {
  for (const c of parsed.categories) {
    if (Array.isArray(c.tiles)) oldTileCount += c.tiles.length;
  }
}
const oldWidgetCount = Array.isArray(parsed.widgets) ? parsed.widgets.length : 0;
console.log(`   - Categories: ${oldCategoryCount}`);
console.log(`   - Tiles:      ${oldTileCount}`);
console.log(`   - Widgets:    ${oldWidgetCount}`);

console.log('🔄 Executing migration to v2 (Spatial Board)...');
const migrated = migrateV1toV2(parsed);

// Validate migrated models
const validConfig = validate(ConfigV2Schema, migrated.config);
const validLayout = validate(LayoutV2Schema, migrated.layout);
const validSecrets = validate(SecretsV2Schema, migrated.secrets);

if (!validConfig.ok) {
  console.error('❌ Validation failed for migrated config.yaml:', validConfig.errors);
  process.exit(1);
}
if (!validLayout.ok) {
  console.error('❌ Validation failed for migrated layout.yaml:', validLayout.errors);
  process.exit(1);
}
if (!validSecrets.ok) {
  console.error('❌ Validation failed for migrated secrets.yaml:', validSecrets.errors);
  process.exit(1);
}

const newItemsCount = migrated.config.items.length;
const newPlacementsCount = Object.keys(migrated.layout.placement).length;
console.log('✅ Migration succeeded:');
console.log(`   - Items created:     ${newItemsCount}`);
console.log(`   - Placements mapped: ${newPlacementsCount}`);
console.log(`   - Secrets isolated:  ${migrated.secrets.admin_pin ? 'Admin PIN, ' : ''}${Object.keys(migrated.secrets.server_tokens).length} server tokens`);

if (isDryRun) {
  console.log('\n[DRY RUN] No files were written to disk.');
  console.log('Summary of generated files:');
  console.log(`   - ${CONFIG_PATH} (${YAML.stringify(migrated.config).length} bytes)`);
  console.log(`   - ${LAYOUT_PATH} (${YAML.stringify(migrated.layout).length} bytes)`);
  console.log(`   - ${SECRETS_PATH} (${YAML.stringify(migrated.secrets).length} bytes)`);
  process.exit(0);
}

// 1. Ensure history dir and backup v1 config
if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUP_V1_PATH)) {
  fs.writeFileSync(BACKUP_V1_PATH, rawConfig, 'utf8');
  console.log(`💾 Saved v1 backup to: ${BACKUP_V1_PATH}`);
}

// 2. Write v2 files
fs.writeFileSync(CONFIG_PATH, YAML.stringify(migrated.config, { indent: 2 }), 'utf8');
fs.writeFileSync(LAYOUT_PATH, YAML.stringify(migrated.layout, { indent: 2 }), 'utf8');
fs.writeFileSync(SECRETS_PATH, YAML.stringify(migrated.secrets, { indent: 2 }), { encoding: 'utf8', mode: 0o600 });

console.log('🎉 Successfully upgraded to DimDash v2 data model!');
console.log(`   - Config:  ${CONFIG_PATH}`);
console.log(`   - Layout:  ${LAYOUT_PATH}`);
console.log(`   - Secrets: ${SECRETS_PATH} (chmod 0600)`);
