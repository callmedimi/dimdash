const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const BoardManager = require('../server/boardManager');
const { BruteForceLimiter } = require('../server/auth');

function mkBoard(env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-hard-'));
  const old = { a: process.env.ADMIN_PIN, u: process.env.USER_PIN };
  if (env.admin) process.env.ADMIN_PIN = env.admin; else delete process.env.ADMIN_PIN;
  if (env.user) process.env.USER_PIN = env.user; else delete process.env.USER_PIN;
  const bm = new BoardManager(dir);
  bm.pinLimiter = new BruteForceLimiter();
  bm.close();
  return { bm, restore() {
    if (old.a === undefined) delete process.env.ADMIN_PIN; else process.env.ADMIN_PIN = old.a;
    if (old.u === undefined) delete process.env.USER_PIN; else process.env.USER_PIN = old.u;
    fs.rmSync(dir, { recursive: true, force: true });
  } };
}
const req = (extra = {}) => ({ headers: {}, body: {}, ip: '10.0.0.9', ...extra });

describe('Hardening: BoardManager.authorize', () => {
  test('upload/secrets/code_widgets need admin; read is open', () => {
    const { bm, restore } = mkBoard({ admin: 'adminpw', user: 'userpw' });
    try {
      for (const a of ['upload', 'secrets', 'code_widgets', 'patch', 'write', 'admin']) {
        assert.equal(bm.authorize(req(), a).authorized, false, a);
        assert.equal(bm.authorize(req({ headers: { 'x-pin': 'userpw' } }), a).authorized, false, a + ' user pin');
        assert.equal(bm.authorize(req({ headers: { 'x-pin': 'adminpw' } }), a).authorized, true, a + ' admin pin');
      }
      assert.equal(bm.authorize(req(), 'read').authorized, true);
    } finally { restore(); }
  });

  test('login session is honoured; non admin/user session roles are ignored', () => {
    const { bm, restore } = mkBoard({ admin: 'adminpw', user: 'userpw' });
    try {
      assert.equal(bm.authorize(req({ session: { role: 'admin' } }), 'upload').authorized, true);
      assert.equal(bm.authorize(req({ session: { role: 'user' } }), 'upload').authorized, false);
      assert.equal(bm.authorize(req({ session: { role: 'editor' } }), 'upload').authorized, false);
    } finally { restore(); }
  });

  test('wrong PINs on any endpoint lock the client out (even the right PIN afterwards)', () => {
    const { bm, restore } = mkBoard({ admin: 'adminpw', user: 'userpw' });
    try {
      for (let i = 0; i < 6; i++) bm.authorize(req({ headers: { 'x-pin': 'nope' + i } }), 'patch');
      assert.equal(bm.authorize(req({ headers: { 'x-pin': 'adminpw' } }), 'patch').authorized, false);
      // another client is unaffected
      assert.equal(bm.authorize(req({ ip: '10.0.0.10', headers: { 'x-pin': 'adminpw' } }), 'patch').authorized, true);
    } finally { restore(); }
  });

  test('a correct user PIN is not counted as an attack', () => {
    const { bm, restore } = mkBoard({ admin: 'adminpw', user: 'userpw' });
    try {
      for (let i = 0; i < 10; i++) assert.equal(bm.authorize(req({ headers: { 'x-pin': 'userpw' } }), 'read').role, 'user');
      assert.equal(bm.authorize(req({ headers: { 'x-pin': 'adminpw' } }), 'patch').authorized, true);
    } finally { restore(); }
  });
});

describe('Secrets survive ordinary config saves (regression)', () => {
  const { verifySecret } = require('../server/auth');

  function boardWithSecrets() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-sec-'));
    delete process.env.ADMIN_PIN; delete process.env.USER_PIN;
    const bm = new BoardManager(dir);
    bm.close();
    return { bm, dir };
  }

  test('saving without pin fields keeps stored PINs and agent tokens', () => {
    const { bm, dir } = boardWithSecrets();
    try {
      const cfg = bm.getConfig();
      cfg.servers = [{ id: 'local', type: 'local', name: 'L' }, { id: 'n1', type: 'agent_push', name: 'N1', token: 'tok-1' }];
      cfg.settings.admin_pin = 'secret-admin';
      cfg.settings.user_pin = 'secret-user';
      bm.saveConfig(cfg);
      assert.ok(verifySecret('secret-admin', bm.getEffectiveAdminPin()));
      assert.ok(String(bm.state.secrets.admin_pin.value).startsWith('scrypt$'), 'PIN must be stored hashed');

      // what the UI holds: PINs and tokens stripped (see sanitizeConfig)
      const ui = bm.getConfig();
      delete ui.settings.admin_pin; delete ui.settings.user_pin;
      ui.servers = ui.servers.map(({ token, ...s }) => s);
      ui.categories = [];
      bm.saveConfig(ui);

      assert.ok(verifySecret('secret-admin', bm.getEffectiveAdminPin()), 'admin PIN wiped by a normal save');
      assert.ok(verifySecret('secret-user', bm.getEffectiveUserPin()), 'user PIN wiped by a normal save');
      assert.equal(bm.state.secrets.server_tokens.n1, 'tok-1', 'agent token wiped by a normal save');
    } finally { bm.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('empty string disables a PIN, a new token replaces, a removed server drops its token', () => {
    const { bm, dir } = boardWithSecrets();
    try {
      const cfg = bm.getConfig();
      cfg.servers = [{ id: 'local', type: 'local', name: 'L' }, { id: 'n1', type: 'agent_push', name: 'N1', token: 'a' }];
      cfg.settings.admin_pin = 'secret-admin';
      bm.saveConfig(cfg);

      const c2 = bm.getConfig();
      c2.settings.admin_pin = '';
      c2.servers = [{ id: 'local', type: 'local', name: 'L' }];
      bm.saveConfig(c2);
      assert.equal(bm.getEffectiveAdminPin(), '');
      assert.deepEqual(bm.state.secrets.server_tokens, {});
    } finally { bm.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
