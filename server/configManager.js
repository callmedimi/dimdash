const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const EventEmitter = require('events');

class ConfigManager extends EventEmitter {
  constructor(configPath) {
    super();
    this.configPath = configPath || path.resolve(__dirname, '../data/config.yaml');
    this.dataDir = path.dirname(this.configPath);
    this.currentConfig = null;
    this.isWriting = false;
    this.debounceTimer = null;

    this.ensureDirectory();
    this.loadConfig();
    this.watchFile();
  }

  ensureDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  loadConfig() {
    try {
      if (!fs.existsSync(this.configPath)) {
        throw new Error(`Config file not found at ${this.configPath}`);
      }
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const parsed = YAML.parse(raw);
      
      // Basic sanity checks
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Config file root must be a YAML object');
      }
      
      parsed.settings = parsed.settings || {};
      parsed.categories = Array.isArray(parsed.categories) ? parsed.categories : [];
      
      this.currentConfig = parsed;
      return this.currentConfig;
    } catch (err) {
      console.error(`[ConfigManager] Error reading YAML config: ${err.message}`);
      if (!this.currentConfig) {
        // Fallback minimal in-memory structure
        this.currentConfig = {
          version: "1.0",
          settings: { dashboard_title: "DimDash" },
          categories: []
        };
      }
      return this.currentConfig;
    }
  }

  getConfig() {
    return this.currentConfig;
  }

  saveConfig(newConfig) {
    this.isWriting = true;
    try {
      this.ensureDirectory();

      // Normalize structure
      newConfig.version = newConfig.version || "1.0";
      newConfig.settings = newConfig.settings || {};
      newConfig.categories = Array.isArray(newConfig.categories) ? newConfig.categories : [];

      const yamlStr = YAML.stringify(newConfig, { indent: 2 });
      const tempPath = `${this.configPath}.tmp`;
      const backupPath = `${this.configPath}.bak`;

      // 1. Atomic write to temp file
      fs.writeFileSync(tempPath, yamlStr, 'utf8');

      // 2. Backup current config if it exists
      if (fs.existsSync(this.configPath)) {
        try {
          fs.copyFileSync(this.configPath, backupPath);
        } catch (_) {}
      }

      // 3. Rename atomic
      fs.renameSync(tempPath, this.configPath);

      this.currentConfig = newConfig;
      this.emit('change', this.currentConfig);
      return { success: true };
    } catch (err) {
      console.error(`[ConfigManager] Failed to save config: ${err.message}`);
      return { success: false, error: err.message };
    } finally {
      setTimeout(() => {
        this.isWriting = false;
      }, 500);
    }
  }

  watchFile() {
    try {
      fs.watch(this.configPath, (eventType) => {
        if (this.isWriting) return;
        if (eventType === 'change' || eventType === 'rename') {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = setTimeout(() => {
            console.log('[ConfigManager] Detected external YAML modification. Reloading...');
            this.loadConfig();
            this.emit('change', this.currentConfig);
          }, 300);
        }
      });
    } catch (err) {
      console.warn(`[ConfigManager] File watcher warning: ${err.message}`);
    }
  }
}

module.exports = ConfigManager;
