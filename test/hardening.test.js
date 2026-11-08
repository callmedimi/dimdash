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
