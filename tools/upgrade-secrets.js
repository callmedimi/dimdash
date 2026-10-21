/**
 * DimDash Secrets Upgrade Utility (P09)
 * Upgrades legacy plaintext PINs in data/secrets.yaml to scrypt hashes
 * Run: node tools/upgrade-secrets.js
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { hashSecret } = require('../server/auth');

const secretsPath = path.resolve(__dirname, '../data/secrets.yaml');

function upgradeSecrets() {
  if (!fs.existsSync(secretsPath)) {
    console.error(`[Upgrade] secrets.yaml not found at ${secretsPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(secretsPath, 'utf-8');
  let data;
  try {
    data = yaml.load(raw) || {};
  } catch (e) {
    console.error('[Upgrade] Failed to parse secrets.yaml:', e.message);
    process.exit(1);
  }

  let modified = false;

  // Upgrade admin_pin
  if (data.admin_pin && typeof data.admin_pin.value === 'string') {
    const val = data.admin_pin.value;
    if (!val.startsWith('scrypt$')) {
      console.log('[Upgrade] Hashing plaintext admin_pin with scrypt...');
      data.admin_pin.value = hashSecret(val);
      data.admin_pin.hashed = true;
      modified = true;
    }
  }

  // Upgrade user_pin
  if (data.user_pin && typeof data.user_pin.value === 'string') {
    const val = data.user_pin.value;
    if (!val.startsWith('scrypt$')) {
      console.log('[Upgrade] Hashing plaintext user_pin with scrypt...');
      data.user_pin.value = hashSecret(val);
      data.user_pin.hashed = true;
      modified = true;
    }
  }

  if (modified) {
    const newYaml = yaml.dump(data, { indent: 2 });
    fs.writeFileSync(secretsPath, newYaml, { mode: 0o600 });
    console.log('[Upgrade] Successfully upgraded secrets to scrypt hashes (file mode 0600).');
  } else {
    console.log('[Upgrade] All credentials in secrets.yaml are already hashed with scrypt.');
  }
}

if (require.main === module) {
  upgradeSecrets();
}

module.exports = { upgradeSecrets };
