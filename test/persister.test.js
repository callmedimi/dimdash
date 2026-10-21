const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const YAML = require('yaml');
const BoardManager = require('../server/boardManager');

describe('BoardManager & Coalesced Persister', () => {
  function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'dimdash-test-'));
  }

  test('auto-creates v2 board files if missing in directory', () => {
    const tempDir = createTempDir();
    let manager;
    try {
      manager = new BoardManager(tempDir);
      assert.strictEqual(manager.state.rev, 1);
      assert.ok(fs.existsSync(path.join(tempDir, 'config.yaml')));
      assert.ok(fs.existsSync(path.join(tempDir, 'layout.yaml')));
      assert.ok(fs.existsSync(path.join(tempDir, 'secrets.yaml')));
    } finally {
      if (manager) manager.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('coalesces rapid patch writes into single atomic disk flush', async () => {
    const tempDir = createTempDir();
    let manager;
    try {
      manager = new BoardManager(tempDir);

      // Perform 10 rapid patches
      for (let i = 0; i < 10; i++) {
        manager.applyPatch({
          base: manager.state.rev,
          client: 'c_rapid',
          ops: [{ op: 'set', path: '/settings/title', value: `Title ${i}` }]
        });
      }

      assert.strictEqual(manager.state.rev, 11);
      assert.strictEqual(manager.state.config.settings.title, 'Title 9');

      // Wait 500ms for debounced coalesced flush
      await new Promise(r => setTimeout(r, 550));

      const onDisk = YAML.parse(fs.readFileSync(path.join(tempDir, 'config.yaml'), 'utf8'));
      assert.strictEqual(onDisk.settings.title, 'Title 9');
    } finally {
      if (manager) manager.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('echo suppression ignores file changes matching our written SHA-1 hash', async () => {
    const tempDir = createTempDir();
    let manager;
    try {
      manager = new BoardManager(tempDir);
      let reloadEmitted = false;
      manager.on('reload', () => { reloadEmitted = true; });

      // Trigger flush
      manager.markDirty('config');
      await manager.flushDirty();

      // Simulate watcher event firing on the exact file we just wrote
      manager.handleExternalModification(manager.configPath, 'config');
      assert.strictEqual(reloadEmitted, false);
    } finally {
      if (manager) manager.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('invalid external YAML edit leaves last good state intact and surfaces error', async () => {
    const tempDir = createTempDir();
    let manager;
    try {
      manager = new BoardManager(tempDir);
      const initialTitle = manager.state.config.settings.title;

      let errorEmitted = false;
      manager.on('config_error', () => { errorEmitted = true; });

      // Overwrite config.yaml with corrupted invalid YAML
      fs.writeFileSync(path.join(tempDir, 'config.yaml'), 'version: "invalid"\nitems: "not an array"', 'utf8');

      manager.handleExternalModification(manager.configPath, 'config');

      // Assert error emitted and state intact
      assert.strictEqual(errorEmitted, true);
      assert.strictEqual(manager.state.config.settings.title, initialTitle);
      assert.strictEqual(manager.getHealth().status, 'degraded');
    } finally {
      if (manager) manager.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('atomic write guarantees .tmp and .bak operations and valid files', async () => {
    const tempDir = createTempDir();
    let manager;
    try {
      manager = new BoardManager(tempDir);
      await manager.atomicWriteFile(path.join(tempDir, 'layout.yaml'), { version: 2, rev: 42 }, 'layout');

      const content = YAML.parse(fs.readFileSync(path.join(tempDir, 'layout.yaml'), 'utf8'));
      assert.strictEqual(content.rev, 42);
      assert.ok(fs.existsSync(path.join(tempDir, 'layout.yaml.bak')));
    } finally {
      if (manager) manager.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
