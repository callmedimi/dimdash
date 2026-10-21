const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { app, boardManager } = require('../server/index');

describe('Board HTTP API & Compatibility', () => {
  let server;
  let baseUrl;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise(r => server.close(r));
    }
  });

  test('GET /api/board returns sanitized board with ETag', async () => {
    const res = await fetch(`${baseUrl}/api/board`);
    assert.strictEqual(res.status, 200);

    const etag = res.headers.get('etag');
    assert.ok(etag);

    const body = await res.json();
    assert.strictEqual(body.rev, boardManager.state.rev);
    assert.strictEqual(body.config.version, 2);
    assert.strictEqual(body.layout.version, 2);
    assert.strictEqual(body.secrets, undefined); // Secrets never exposed

    // Check 304 Not Modified
    const res304 = await fetch(`${baseUrl}/api/board`, {
      headers: { 'If-None-Match': etag }
    });
    assert.strictEqual(res304.status, 304);
  });

  test('POST /api/board/patch applies patch and returns rev and inverse', async () => {
    const currentRev = boardManager.state.rev;
    const patchBody = {
      base: currentRev,
      client: 'c_test_api',
      seq: 101,
      ops: [
        { op: 'set', path: '/settings/title', value: 'API Tested Title' }
      ]
    };

    const res = await fetch(`${baseUrl}/api/board/patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchBody)
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.rev, currentRev + 1);
    assert.ok(Array.isArray(body.inverse));
  });

  test('GET /api/board/since/:rev returns ops since revision', async () => {
    const res = await fetch(`${baseUrl}/api/board/since/0`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.ops));
    assert.ok(body.ops.length > 0);
  });

  test('GET /api/board/health returns board health status', async () => {
    const res = await fetch(`${baseUrl}/api/board/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, 'healthy');
    assert.strictEqual(typeof body.rev, 'number');
  });

  test('GET /api/config returns v1 format with Deprecation header', async () => {
    const res = await fetch(`${baseUrl}/api/config`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('deprecation'));

    const body = await res.json();
    assert.strictEqual(body.version, '1.0');
    assert.ok(Array.isArray(body.categories));
  });

  test('POST /api/config saves v1 format with Deprecation header', async () => {
    const v1Config = boardManager.getConfig();
    v1Config.settings.dashboard_title = 'Saved Via Legacy API';

    const res = await fetch(`${baseUrl}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: v1Config })
    });

    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('deprecation'));
    const body = await res.json();
    assert.strictEqual(body.success, true);
  });
});
