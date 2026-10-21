const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const {
  hashSecret,
  verifySecret,
  SessionStore,
  BruteForceLimiter,
  authorize,
  checkSecretsPermissions,
  hasRoleLevel
} = require('../server/auth');

describe('P09 Auth: Scrypt Hashing & Constant-Time Verification', () => {
  test('hashes secret into standard scrypt format string', () => {
    const secret = 'super-secure-passphrase-2026';
    const hashed = hashSecret(secret);

    assert.ok(typeof hashed === 'string');
    assert.ok(hashed.startsWith('scrypt$32768$8$1$'));

    const parts = hashed.split('$');
    assert.strictEqual(parts.length, 6);
    assert.strictEqual(parts[1], '32768'); // N
    assert.strictEqual(parts[2], '8');     // r
    assert.strictEqual(parts[3], '1');     // p
    assert.strictEqual(parts[4].length, 32); // 16 bytes salt in hex
    assert.strictEqual(parts[5].length, 64); // 32 bytes derived key in hex
  });

  test('generates unique salts across multiple hashes of identical secret', () => {
    const secret = 'same-passphrase';
    const hash1 = hashSecret(secret);
    const hash2 = hashSecret(secret);

    assert.notStrictEqual(hash1, hash2);
    assert.strictEqual(verifySecret(secret, hash1), true);
    assert.strictEqual(verifySecret(secret, hash2), true);
  });

  test('verifies correct secret and rejects incorrect secret', () => {
    const secret = 'admin123456';
    const hashed = hashSecret(secret);

    assert.strictEqual(verifySecret(secret, hashed), true);
    assert.strictEqual(verifySecret('wrong-secret', hashed), false);
    assert.strictEqual(verifySecret('', hashed), false);
    assert.strictEqual(verifySecret(null, hashed), false);
    assert.strictEqual(verifySecret(123456, hashed), false);
  });

  test('handles legacy plaintext fallback with constant-time equality', () => {
    const plaintextPin = '987654';

    assert.strictEqual(verifySecret('987654', plaintextPin), true);
    assert.strictEqual(verifySecret('123456', plaintextPin), false);
    assert.strictEqual(verifySecret('98765', plaintextPin), false); // different length
  });

  test('rejects corrupted or malformed scrypt hash string', () => {
    assert.strictEqual(verifySecret('secret', 'scrypt$invalid$format'), false);
    assert.strictEqual(verifySecret('secret', 'scrypt$32768$8$1$bad$hex'), false);
  });

  test('throws error when hashing invalid secret inputs', () => {
    assert.throws(() => hashSecret(''), /Invalid secret/);
    assert.throws(() => hashSecret(null), /Invalid secret/);
    assert.throws(() => hashSecret(12345), /Invalid secret/);
  });
});

describe('P09 Auth: Session Management & Kiosk Tokens', () => {
  test('creates session with 256-bit entropy ID and CSRF token', () => {
    const store = new SessionStore();
    const session = store.createSession('admin', { ip: '10.0.0.1', userAgent: 'TestBrowser' });

    assert.ok(session.id);
    assert.strictEqual(session.id.length, 64); // 32 bytes hex = 256 bits
    assert.ok(session.csrfToken);
    assert.strictEqual(session.csrfToken.length, 32); // 16 bytes hex = 128 bits
    assert.strictEqual(session.role, 'admin');
    assert.strictEqual(session.ip, '10.0.0.1');
  });

  test('retrieves active session and updates lastActiveAt', () => {
    const store = new SessionStore();
    const session = store.createSession('user');
    const firstActive = session.lastActiveAt;

    const retrieved = store.getSession(session.id);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.id, session.id);
    assert.strictEqual(retrieved.role, 'user');
    assert.ok(retrieved.lastActiveAt >= firstActive);
  });

  test('expires session after idle timeout', () => {
    const store = new SessionStore({ idleTimeoutMs: 50 }); // 50ms idle
    const session = store.createSession('editor');

    // Simulate idle passage
    session.lastActiveAt = Date.now() - 100;
    const expired = store.getSession(session.id);
    assert.strictEqual(expired, null);
  });

  test('expires session after absolute timeout', () => {
    const store = new SessionStore({ absoluteTimeoutMs: 100 });
    const session = store.createSession('admin');

    session.createdAt = Date.now() - 200;
    const expired = store.getSession(session.id);
    assert.strictEqual(expired, null);
  });

  test('rotates session to new ID on privilege elevation', () => {
    const store = new SessionStore();
    const session = store.createSession('user');
    const oldId = session.id;

    const rotated = store.rotateSession(oldId, 'admin');
    assert.ok(rotated);
    assert.notStrictEqual(rotated.id, oldId);
    assert.strictEqual(rotated.role, 'admin');

    // Old session must be invalid
    assert.strictEqual(store.getSession(oldId), null);
    assert.strictEqual(store.getSession(rotated.id).role, 'admin');
  });

  test('revokes session explicitly on logout', () => {
    const store = new SessionStore();
    const session = store.createSession('editor');

    assert.strictEqual(store.revokeSession(session.id), true);
    assert.strictEqual(store.getSession(session.id), null);
    assert.strictEqual(store.revokeSession('non-existent'), false);
  });

  test('lists sanitized sessions without exposing full secret tokens', () => {
    const store = new SessionStore();
    store.createSession('viewer', { ip: '192.168.1.5' });
    const list = store.listSessions();

    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].role, 'viewer');
    assert.strictEqual(list[0].ip, '192.168.1.5');
    assert.ok(list[0].id.endsWith('...'));
    assert.ok(list[0].id.length < 20); // Masked ID
  });

  test('creates and verifies read-only kiosk display tokens', () => {
    const store = new SessionStore();
    const token = store.createDisplayToken('hallway_wall');

    assert.ok(token.startsWith('kiosk_'));
    const verified = store.verifyDisplayToken(token);
    assert.ok(verified);
    assert.strictEqual(verified.role, 'viewer');
    assert.strictEqual(verified.displayProfile, 'hallway_wall');

    assert.strictEqual(store.verifyDisplayToken('invalid_token'), null);
  });
});

describe('P09 Auth: Brute-Force Rate Limiter', () => {
  test('allows up to 4 consecutive failed attempts without delay', () => {
    const limiter = new BruteForceLimiter();
    const key = '192.168.1.100';

    for (let i = 0; i < 4; i++) {
      limiter.recordFailure(key);
      const res = limiter.check(key);
      assert.strictEqual(res.allowed, true);
      assert.strictEqual(res.retryAfterSec, 0);
    }
  });

  test('enforces exponential backoff starting on 5th failed attempt', () => {
    const limiter = new BruteForceLimiter();
    const key = '10.0.0.50';

    for (let i = 0; i < 5; i++) {
      limiter.recordFailure(key);
    }

    const res5 = limiter.check(key);
    assert.strictEqual(res5.allowed, false);
    assert.ok(res5.retryAfterSec >= 1);

    // 6th failure should double/increase backoff
    limiter.recordFailure(key);
    const res6 = limiter.check(key);
    assert.strictEqual(res6.allowed, false);
    assert.ok(res6.retryAfterSec >= 2);
  });

  test('successful authentication clears failure history immediately', () => {
    const limiter = new BruteForceLimiter();
    const key = '10.0.0.88';

    for (let i = 0; i < 6; i++) {
      limiter.recordFailure(key);
    }
    assert.strictEqual(limiter.check(key).allowed, false);

    limiter.recordSuccess(key);
    assert.strictEqual(limiter.check(key).allowed, true);
    assert.strictEqual(limiter.check(key).retryAfterSec, 0);
  });
});

describe('P09 Auth: RBAC Policy Engine (>= 60 Table-Driven Cases)', () => {
  const roles = [
    { roleName: 'null (unauthenticated)', session: null, effectiveRole: 'viewer' },
    { roleName: 'viewer', session: { role: 'viewer' }, effectiveRole: 'viewer' },
    { roleName: 'user', session: { role: 'user' }, effectiveRole: 'user' },
    { roleName: 'editor', session: { role: 'editor' }, effectiveRole: 'editor' },
    { roleName: 'admin', session: { role: 'admin' }, effectiveRole: 'admin' }
  ];

  // 12 Action / Resource combinations
  // Expected allowed roles for each action:
  // 1. read (no resource) -> all
  // 2. read (public) -> all
  // 3. read (user) -> user, editor, admin
  // 4. read (admin) -> admin only
  // 5. interact -> user, editor, admin
  // 6. write -> editor, admin
  // 7. patch -> editor, admin
  // 8. upload -> editor, admin
  // 9. admin -> admin only
  // 10. secrets -> admin only
  // 11. code_widgets -> admin only
  // 12. unknown_action -> none
  const testMatrix = [
    { action: 'read', resource: null, allowedMinRole: 'viewer' },
    { action: 'read', resource: { visibility: 'public' }, allowedMinRole: 'viewer' },
    { action: 'read', resource: { visibility: 'user' }, allowedMinRole: 'user' },
    { action: 'read', resource: { visibility: 'admin' }, allowedMinRole: 'admin' },
    { action: 'interact', resource: null, allowedMinRole: 'user' },
    { action: 'write', resource: null, allowedMinRole: 'editor' },
    { action: 'patch', resource: null, allowedMinRole: 'editor' },
    { action: 'upload', resource: null, allowedMinRole: 'editor' },
    { action: 'admin', resource: null, allowedMinRole: 'admin' },
    { action: 'secrets', resource: null, allowedMinRole: 'admin' },
    { action: 'code_widgets', resource: null, allowedMinRole: 'admin' },
    { action: 'unknown_op', resource: null, allowedMinRole: 'never' }
  ];

  let totalCases = 0;
  for (const roleDef of roles) {
    for (const testCase of testMatrix) {
      totalCases++;
      const isExpected = testCase.allowedMinRole !== 'never' &&
        hasRoleLevel(roleDef.effectiveRole, testCase.allowedMinRole);

      const label = `Case #${totalCases}: Role "${roleDef.roleName}" on action "${testCase.action}" ` +
        `res=${JSON.stringify(testCase.resource)} -> expected ${isExpected ? 'ALLOWED' : 'DENIED'}`;

      test(label, () => {
        const result = authorize(roleDef.session, testCase.action, testCase.resource);
        assert.strictEqual(
          result.authorized,
          isExpected,
          `Failed for role "${roleDef.roleName}", action "${testCase.action}"`
        );
        assert.strictEqual(result.role, roleDef.effectiveRole);
      });
    }
  }

  test('verifies at least 60 RBAC test cases executed', () => {
    assert.ok(totalCases >= 60, `Expected >= 60 test cases, executed: ${totalCases}`);
  });
});

describe('P09 Auth: File Permissions Audit', () => {
  test('checkSecretsPermissions runs safely on existing or non-existing path', () => {
    assert.doesNotThrow(() => {
      checkSecretsPermissions('/non/existent/path/secrets.yaml');
    });
    assert.doesNotThrow(() => {
      checkSecretsPermissions(path.resolve(__dirname, '../data/secrets.yaml'));
    });
  });
});
