/**
 * DimDash v2 Board Manager & Coalesced Persister
 * Manages config.yaml, layout.yaml, and secrets.yaml with atomic writes,
 * SHA-1 echo-suppressed file watching, rolling snapshots, and role-based ACLs.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');
const YAML = require('yaml');

const { validate, ConfigV2Schema, LayoutV2Schema, SecretsV2Schema, safeClone } = require('./schema');
const { migrateV1toV2, migrateV2toV1, isV2, DEFAULT_PROFILES } = require('./migrate');
const PatchEngine = require('./patchEngine');
const { verifySecret, checkSecretsPermissions } = require('./auth');

class BoardManager extends EventEmitter {
  constructor(dataDir) {
    super();
    this.dataDir = dataDir || path.resolve(__dirname, '../data');
    this.configPath = path.join(this.dataDir, 'config.yaml');
    this.layoutPath = path.join(this.dataDir, 'layout.yaml');
    this.secretsPath = path.join(this.dataDir, 'secrets.yaml');
    this.historyDir = path.join(this.dataDir, 'history');

    this.patchEngine = new PatchEngine();

    this.state = {
      rev: 1,
      config: null,
      layout: null,
      secrets: null
    };

    // Coalesced persistence state
    this.dirty = new Set(); // 'config', 'layout'
    this.debounceTimer = null;
    this.maxWaitTimer = null;
    this.isFlushing = false;
    this.lastSnapshotTime = 0;

    // File watcher echo suppression hashes
    this.writtenHashes = {
      config: '',
      layout: ''
    };
    this.watchDebounceTimers = {};
    this.watchers = [];

    // Health state
    this.lastError = null;

    this.ensureDirectories();
    this.initBoard();
    this.setupWatchers();
  }

  ensureDirectories() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.historyDir)) {
      fs.mkdirSync(this.historyDir, { recursive: true });
    }
  }

  computeHash(content) {
    return crypto.createHash('sha1').update(content || '').digest('hex');
  }

  initBoard() {
    // 1. Check if config.yaml exists
    if (!fs.existsSync(this.configPath)) {
      console.log('[BoardManager] No config.yaml found. Generating default v2 board...');
      const defaultV1 = {
        version: "1.0",
        settings: { dashboard_title: "DimDash" },
        categories: [],
        widgets: [],
        servers: [{ id: 'local', name: 'Master Node (Local)', type: 'local', color: '#6366f1' }]
      };
      const migrated = migrateV1toV2(defaultV1);
      this.state.config = migrated.config;
      this.state.layout = migrated.layout;
      this.state.secrets = migrated.secrets;
      this.state.rev = 1;
      this.saveSecretsSync();
      this.markDirty('config');
      this.markDirty('layout');
      this.flushSync();
      return;
    }

    // 2. Read config.yaml
    const rawConfig = fs.readFileSync(this.configPath, 'utf8');
    let parsedConfig;
    try {
      parsedConfig = YAML.parse(rawConfig, { merge: false, maxAliasCount: 50, schema: 'core' });
    } catch (err) {
      console.error('[BoardManager] Error parsing config.yaml:', err.message);
      parsedConfig = {};
    }

    // Check if migration v1 -> v2 is needed
    if (!isV2(parsedConfig)) {
      console.log('[BoardManager] Detected legacy v1 config. Running automatic migration...');
      // Backup v1
      const backupPath = path.join(this.historyDir, 'config.v1.bak.yaml');
      if (!fs.existsSync(backupPath)) {
        try { fs.writeFileSync(backupPath, rawConfig, 'utf8'); } catch (_) {}
      }

      const migrated = migrateV1toV2(parsedConfig);
      this.state.config = migrated.config;
      this.state.layout = migrated.layout;
      this.state.secrets = migrated.secrets;
      this.state.rev = 1;

      // Also load existing layout or secrets if present
      this.loadLayoutAndSecrets();
      this.markDirty('config');
      this.markDirty('layout');
      this.flushSync();
      return;
    }

    this.state.config = parsedConfig;
    this.writtenHashes.config = this.computeHash(rawConfig);

    this.loadLayoutAndSecrets();
    this.state.rev = this.state.layout?.rev || 1;
  }

  loadLayoutAndSecrets() {
    // Load layout.yaml
    if (fs.existsSync(this.layoutPath)) {
      try {
        const rawLayout = fs.readFileSync(this.layoutPath, 'utf8');
        this.state.layout = YAML.parse(rawLayout, { merge: false, maxAliasCount: 50, schema: 'core' });
        this.writtenHashes.layout = this.computeHash(rawLayout);
      } catch (e) {
        console.warn('[BoardManager] Warning reading layout.yaml:', e.message);
      }
    }
    if (!this.state.layout || !isV2(this.state.layout)) {
      this.state.layout = {
        version: 2,
        rev: 1,
        profiles: DEFAULT_PROFILES,
        placement: {}
      };
      this.markDirty('layout');
    }

    // Load secrets.yaml
    if (fs.existsSync(this.secretsPath)) {
      try {
        const rawSecrets = fs.readFileSync(this.secretsPath, 'utf8');
        this.state.secrets = YAML.parse(rawSecrets, { merge: false, maxAliasCount: 50, schema: 'core' });
      } catch (e) {
        console.warn('[BoardManager] Warning reading secrets.yaml:', e.message);
      }
    }
    if (!this.state.secrets || !isV2(this.state.secrets)) {
      this.state.secrets = {
        version: 2,
        admin_pin: null,
        user_pin: null,
        server_tokens: {},
        session_secret: crypto.randomBytes(16).toString('hex')
      };
      this.saveSecretsSync();
    }
  }

  saveSecretsSync() {
    try {
      const yamlStr = YAML.stringify(this.state.secrets, { indent: 2 });
      fs.writeFileSync(this.secretsPath, yamlStr, { encoding: 'utf8', mode: 0o600 });
    } catch (e) {
      console.error('[BoardManager] Failed to save secrets.yaml:', e.message);
    }
  }

  getEffectiveAdminPin() {
    return process.env.ADMIN_PIN || this.state.secrets?.admin_pin?.value || '';
  }

  getEffectiveUserPin() {
    return process.env.USER_PIN || this.state.secrets?.user_pin?.value || '';
  }

  /**
   * Authorization check helper
   */
  authorize(req, action = 'read', itemIds = []) {
    const adminPin = this.getEffectiveAdminPin();
    const userPin = this.getEffectiveUserPin();

    const clientPin = req.headers['x-pin'] || (req.body && req.body.pin) || '';

    let role = 'guest';
    if (!adminPin && !userPin) {
      role = 'admin';
    } else if (adminPin && verifySecret(clientPin, adminPin)) {
      role = 'admin';
    } else if (userPin && verifySecret(clientPin, userPin)) {
      role = 'user';
    } else if (!userPin && adminPin) {
      role = 'user';
    }

    if (action === 'write' || action === 'patch' || action === 'admin') {
      return { authorized: role === 'admin', role };
    }

    return { authorized: true, role };
  }

  /**
   * Return board snapshot sanitized for a specific role ('public' | 'user' | 'admin')
   */
  getSanitizedBoard(role = 'guest') {
    const cfgClone = safeClone(this.state.config) || {};
    const layoutClone = safeClone(this.state.layout) || {};

    // Filter items according to role visibility
    if (Array.isArray(cfgClone.items)) {
      cfgClone.items = cfgClone.items.filter(it => {
        const vis = it.acl?.visibility || 'public';
        if (vis === 'public') return true;
        if (vis === 'user') return role === 'user' || role === 'admin';
        if (vis === 'admin') return role === 'admin';
        return true;
      });
    }

    // Keep placement in sync with visible items
    if (layoutClone.placement && Array.isArray(cfgClone.items)) {
      const visibleIds = new Set(cfgClone.items.map(it => it.id));
      const filteredPlacement = {};
      for (const [id, pl] of Object.entries(layoutClone.placement)) {
        if (visibleIds.has(id)) {
          filteredPlacement[id] = pl;
        }
      }
      layoutClone.placement = filteredPlacement;
    }

    const adminPin = this.getEffectiveAdminPin();
    const userPin = this.getEffectiveUserPin();

    return {
      rev: this.state.rev,
      config: cfgClone,
      layout: layoutClone,
      is_pin_protected: !!adminPin,
      is_user_pin_protected: !!userPin
    };
  }

  /**
   * Apply incoming patch operations and coalesce persistence
   */
  applyPatch(patchRequest, role = 'admin') {
    if (role !== 'admin') {
      throw { status: 401, message: 'Unauthorized: Admin privileges required to modify board' };
    }

    const result = this.patchEngine.applyPatch(this.state, patchRequest);
    if (result.replayed) {
      return result;
    }

    this.state = result.state;
    this.markDirty('config');
    this.emit('patch', {
      rev: this.state.rev,
      ops: patchRequest.ops,
      client: patchRequest.client,
      inverse: result.inverse
    });
    this.emit('change', this.getConfig());

    return result;
  }

  /**
   * Compatibility method returning v1 format for legacy components (prober, clusterManager)
   */
  getConfig() {
    return migrateV2toV1(this.state);
  }

  /**
   * Compatibility method for saving v1 format
   */
  saveConfig(v1Config) {
    const prevPlacement = (this.state.layout && this.state.layout.placement) ? safeClone(this.state.layout.placement) : {};
    const prevItemsMap = new Map();
    if (this.state.config && Array.isArray(this.state.config.items)) {
      this.state.config.items.forEach(it => prevItemsMap.set(it.id, it));
    }

    const migrated = migrateV1toV2(v1Config);

    // Preserve extra v2 item props (like shape, collapse, custom props) when saving via v1 config modal
    if (migrated.config && Array.isArray(migrated.config.items)) {
      migrated.config.items.forEach(item => {
        const prev = prevItemsMap.get(item.id);
        if (prev && prev.props) {
          item.props = { ...prev.props, ...item.props };
        }
      });
    }

    this.state.config = migrated.config;
    if (migrated.layout && migrated.layout.placement) {
      // Preserve custom Blueprint positions/sizes for existing items while updating parent if moved
      for (const [id, newPl] of Object.entries(migrated.layout.placement)) {
        if (prevPlacement[id]) {
          const mergedPl = safeClone(prevPlacement[id]);
          if (mergedPl.lg && newPl.lg && newPl.lg.parent !== undefined) {
            mergedPl.lg.parent = newPl.lg.parent;
          }
          migrated.layout.placement[id] = mergedPl;
        }
      }
      this.state.layout = migrated.layout;
    }
    if (migrated.secrets) {
      this.state.secrets = migrated.secrets;
      this.saveSecretsSync();
    }
    this.state.rev += 1;
    if (this.state.layout) this.state.layout.rev = this.state.rev;
    this.markDirty('config');
    this.markDirty('layout');
    this.emit('change', this.getConfig());
    this.emit('patch', {
      rev: this.state.rev,
      ops: [{ op: 'set', path: '/items', value: this.state.config.items }],
      client: 'legacy-api',
      inverse: []
    });
    return { success: true };
  }

  /**
   * Coalesced persistence with 400ms trailing debounce and 2s max-wait
   */
  markDirty(fileKey) {
    this.dirty.add(fileKey);

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.flushDirty();
    }, 400);
    if (typeof this.debounceTimer.unref === 'function') this.debounceTimer.unref();

    if (!this.maxWaitTimer) {
      this.maxWaitTimer = setTimeout(() => {
        this.flushDirty();
      }, 2000);
      if (typeof this.maxWaitTimer.unref === 'function') this.maxWaitTimer.unref();
    }
  }

  async flushDirty() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.maxWaitTimer) clearTimeout(this.maxWaitTimer);
    this.debounceTimer = null;
    this.maxWaitTimer = null;

    if (this.dirty.size === 0 || this.isFlushing) return;
    this.isFlushing = true;

    const filesToSave = Array.from(this.dirty);
    this.dirty.clear();

    try {
      for (const key of filesToSave) {
        if (key === 'config') {
          await this.atomicWriteFile(this.configPath, this.state.config, 'config');
        } else if (key === 'layout') {
          await this.atomicWriteFile(this.layoutPath, this.state.layout, 'layout');
        }
      }

      this.createRollingSnapshot();
    } catch (err) {
      console.error('[BoardManager] Error during coalesced write:', err.message);
      this.lastError = err.message;
    } finally {
      this.isFlushing = false;
    }
  }

  flushSync() {
    if (this.dirty.has('config')) {
      const yamlStr = YAML.stringify(this.state.config, { indent: 2 });
      this.writtenHashes.config = this.computeHash(yamlStr);
      fs.writeFileSync(this.configPath, yamlStr, 'utf8');
      this.dirty.delete('config');
    }
    if (this.dirty.has('layout')) {
      const yamlStr = YAML.stringify(this.state.layout, { indent: 2 });
      this.writtenHashes.layout = this.computeHash(yamlStr);
      fs.writeFileSync(this.layoutPath, yamlStr, 'utf8');
      this.dirty.delete('layout');
    }
  }

  async atomicWriteFile(targetPath, dataObj, key) {
    const yamlStr = YAML.stringify(dataObj, { indent: 2 });
    const hash = this.computeHash(yamlStr);
    this.writtenHashes[key] = hash;

    const tempPath = `${targetPath}.tmp`;
    const bakPath = `${targetPath}.bak`;

    // 1. Write to temp file & fsync
    const fh = await fs.promises.open(tempPath, 'w');
    await fh.writeFile(yamlStr, 'utf8');
    await fh.sync();
    await fh.close();

    // 2. Backup current target
    if (fs.existsSync(targetPath)) {
      try {
        await fs.promises.copyFile(targetPath, bakPath);
      } catch (_) {}
    }

    // 3. Atomic rename
    await fs.promises.rename(tempPath, targetPath);
  }

  createRollingSnapshot() {
    const now = Date.now();
    // At most 1 snapshot per 60s
    if (now - this.lastSnapshotTime < 60000) return;
    this.lastSnapshotTime = now;

    try {
      const snapName = `snap_${now}_rev${this.state.rev}.yaml`;
      const snapPath = path.join(this.historyDir, snapName);
      const combined = {
        timestamp: now,
        rev: this.state.rev,
        config: this.state.config,
        layout: this.state.layout
      };
      fs.writeFileSync(snapPath, YAML.stringify(combined, { indent: 2 }), 'utf8');

      // Keep latest 30 snapshots
      const files = fs.readdirSync(this.historyDir).filter(f => f.startsWith('snap_'));
      if (files.length > 30) {
        files.sort().slice(0, files.length - 30).forEach(f => {
          try { fs.unlinkSync(path.join(this.historyDir, f)); } catch (_) {}
        });
      }
    } catch (_) {}
  }

  /**
   * File Watcher with SHA-1 Echo Suppression
   */
  setupWatchers() {
    this.watchFile(this.configPath, 'config');
    this.watchFile(this.layoutPath, 'layout');
  }

  watchFile(filePath, key) {
    try {
      const watcher = fs.watch(filePath, () => {
        if (this.watchDebounceTimers[key]) clearTimeout(this.watchDebounceTimers[key]);
        this.watchDebounceTimers[key] = setTimeout(() => {
          this.handleExternalModification(filePath, key);
        }, 300);
      });
      if (typeof watcher.unref === 'function') watcher.unref();
      this.watchers.push(watcher);
    } catch (err) {
      console.warn(`[BoardManager] Watcher warning for ${filePath}: ${err.message}`);
    }
  }

  close() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.maxWaitTimer) clearTimeout(this.maxWaitTimer);
    for (const w of this.watchers) {
      try { w.close(); } catch (_) {}
    }
  }

  handleExternalModification(filePath, key) {
    if (!fs.existsSync(filePath)) return;

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const hash = this.computeHash(raw);

      // Echo suppression: Ignore if hash matches our last write
      if (hash === this.writtenHashes[key]) {
        return;
      }

      console.log(`[BoardManager] Detected external modification on ${key}.yaml`);
      const parsed = YAML.parse(raw, { merge: false, maxAliasCount: 50, schema: 'core' });
      const schema = key === 'config' ? ConfigV2Schema : LayoutV2Schema;
      const valid = validate(schema, parsed);

      if (!valid.ok) {
        console.warn(`[BoardManager] External edit on ${key}.yaml invalid. Serving last good state:`, valid.errors);
        this.lastError = `Invalid YAML in ${key}.yaml: ${valid.errors.map(e => e.msg).join(', ')}`;
        this.emit('config_error', { file: key, errors: valid.errors });
        return;
      }

      // Valid external edit: Update in-memory state
      this.lastError = null;
      this.writtenHashes[key] = hash;
      this.state[key] = parsed;
      this.state.rev += 1;
      if (this.state.layout) this.state.layout.rev = this.state.rev;

      this.emit('reload', { key, rev: this.state.rev });
      this.emit('change', this.getConfig());
    } catch (err) {
      console.warn(`[BoardManager] Error reading external modification: ${err.message}`);
      this.lastError = err.message;
      this.emit('config_error', { file: key, error: err.message });
    }
  }

  getHealth() {
    return {
      status: this.lastError ? 'degraded' : 'healthy',
      rev: this.state.rev,
      error: this.lastError,
      dirty: Array.from(this.dirty)
    };
  }
}

module.exports = BoardManager;
