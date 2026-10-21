/**
 * DimDash Security & Authentication Engine (P09)
 * Scrypt Password Hashing, Session Management, CSRF Defense, Brute-Force Throttling, and RBAC
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// --------------------------------------------------------------------------
// 1. Scrypt Password Hashing (Air-Gapped & Constant-Time)
// --------------------------------------------------------------------------
const SCRYPT_PARAMS = {
  N: 32768, // 2^15
  r: 8,
  p: 1,
  saltLen: 16,
  keyLen: 32,
  maxmem: 64 * 1024 * 1024
};

function hashSecret(secret) {
  if (typeof secret !== 'string' || !secret) {
    throw new Error('[Auth] Invalid secret: non-empty string required');
  }
  const salt = crypto.randomBytes(SCRYPT_PARAMS.saltLen);
  const derivedKey = crypto.scryptSync(secret, salt, SCRYPT_PARAMS.keyLen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: SCRYPT_PARAMS.maxmem
  });

  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

function verifySecret(secret, stored) {
  if (typeof secret !== 'string' || !stored || typeof stored !== 'string') {
    return false;
  }

  // 1. Scrypt Hashed Secret
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 6) return false;

    const N = parseInt(parts[1], 10);
    const r = parseInt(parts[2], 10);
    const p = parseInt(parts[3], 10);
    if (isNaN(N) || isNaN(r) || isNaN(p) || N <= 0 || r <= 0 || p <= 0) return false;

    // Salt and Hash must be valid hex strings of proper length (16-byte salt = 32 hex, 32-byte key = 64 hex)
    if (!/^[0-9a-fA-F]{32}$/.test(parts[4]) || !/^[0-9a-fA-F]{64}$/.test(parts[5])) {
      return false;
    }

    const salt = Buffer.from(parts[4], 'hex');
    const expectedHash = Buffer.from(parts[5], 'hex');
    if (salt.length !== 16 || expectedHash.length !== 32) return false;

    try {
      const derivedKey = crypto.scryptSync(secret, salt, expectedHash.length, {
        N,
        r,
        p,
        maxmem: SCRYPT_PARAMS.maxmem
      });
      return crypto.timingSafeEqual(derivedKey, expectedHash);
    } catch {
      return false;
    }
  }

  // 2. Legacy Plaintext Fallback (Constant-time comparison)
  const a = Buffer.from(String(secret), 'utf-8');
  const b = Buffer.from(String(stored), 'utf-8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// --------------------------------------------------------------------------
// 2. Session Store & Token Manager
// --------------------------------------------------------------------------
class SessionStore {
  constructor(options = {}) {
    this.sessions = new Map();
    this.displayTokens = new Map(); // Kiosk / Display tokens: token -> { role: 'viewer', displayProfile }
    this.idleTimeoutMs = options.idleTimeoutMs || 12 * 60 * 60 * 1000; // 12 hours
    this.absoluteTimeoutMs = options.absoluteTimeoutMs || 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  createSession(role = 'viewer', meta = {}) {
    const id = crypto.randomBytes(32).toString('hex');
    const csrfToken = crypto.randomBytes(16).toString('hex');
    const now = Date.now();

    const session = {
      id,
      role,
      csrfToken,
      ip: meta.ip || '127.0.0.1',
      userAgent: meta.userAgent || '',
      createdAt: now,
      lastActiveAt: now
    };

    this.sessions.set(id, session);
    return session;
  }

  getSession(id) {
    if (!id || !this.sessions.has(id)) return null;
    const session = this.sessions.get(id);
    const now = Date.now();

    // Check timeouts
    if (now - session.lastActiveAt > this.idleTimeoutMs || now - session.createdAt > this.absoluteTimeoutMs) {
      this.sessions.delete(id);
      return null;
    }

    session.lastActiveAt = now;
    return session;
  }

  rotateSession(oldId, newRole = null) {
    const oldSession = this.sessions.get(oldId);
    if (!oldSession) return null;

    this.sessions.delete(oldId);
    return this.createSession(newRole || oldSession.role, {
      ip: oldSession.ip,
      userAgent: oldSession.userAgent
    });
  }

  revokeSession(id) {
    return this.sessions.delete(id);
  }

  listSessions() {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id.substring(0, 8) + '...',
      role: s.role,
      ip: s.ip,
      createdAt: new Date(s.createdAt).toISOString(),
      lastActiveAt: new Date(s.lastActiveAt).toISOString()
    }));
  }

  // Display / Kiosk Token Management (Read-Only)
  createDisplayToken(displayProfile = 'default') {
    const token = 'kiosk_' + crypto.randomBytes(24).toString('hex');
    this.displayTokens.set(token, {
      role: 'viewer',
      displayProfile,
      createdAt: Date.now()
    });
    return token;
  }

  verifyDisplayToken(token) {
    if (!token || !this.displayTokens.has(token)) return null;
    return this.displayTokens.get(token);
  }
}

// --------------------------------------------------------------------------
// 3. Brute-Force Rate Limiter (Exponential Backoff)
// --------------------------------------------------------------------------
class BruteForceLimiter {
  constructor() {
    this.attempts = new Map(); // key -> { failures, lockUntil }
  }

  recordFailure(key) {
    const now = Date.now();
    const entry = this.attempts.get(key) || { failures: 0, lockUntil: 0 };
    entry.failures += 1;

    // After 5 failures, start exponential backoff (1s, 2s, 4s, 8s, up to 300s)
    if (entry.failures >= 5) {
      const exponent = Math.min(entry.failures - 4, 8); // max 2^8 = 256s
      const delayMs = Math.min(300, Math.pow(2, exponent)) * 1000;
      entry.lockUntil = now + delayMs;
    }

    this.attempts.set(key, entry);
  }

  recordSuccess(key) {
    this.attempts.delete(key);
  }

  check(key) {
    const now = Date.now();
    const entry = this.attempts.get(key);
    if (!entry) return { allowed: true, retryAfterSec: 0 };

    if (entry.lockUntil > now) {
      const retryAfterSec = Math.ceil((entry.lockUntil - now) / 1000);
      return { allowed: false, retryAfterSec };
    }

    return { allowed: true, retryAfterSec: 0 };
  }
}

// --------------------------------------------------------------------------
// 4. Role-Based Access Control (RBAC) Policy Engine
// --------------------------------------------------------------------------
const ROLES = {
  viewer: 10,
  user: 20,
  editor: 30,
  admin: 40
};

function hasRoleLevel(role, requiredRole) {
  const current = ROLES[role] || 0;
  const required = ROLES[requiredRole] || 999;
  return current >= required;
}

function authorize(session, action, resource = null) {
  const role = session?.role || 'viewer';

  switch (action) {
    case 'read':
      if (!resource) return { authorized: true, role };
      // Check item ACL visibility
      if (resource.visibility === 'public') return { authorized: true, role };
      if (resource.visibility === 'user') {
        return { authorized: hasRoleLevel(role, 'user'), role };
      }
      if (resource.visibility === 'admin') {
        return { authorized: hasRoleLevel(role, 'admin'), role };
      }
      return { authorized: true, role };

    case 'interact': // Widget interaction, clicking buttons
      return { authorized: hasRoleLevel(role, 'user'), role };

    case 'write': // Updating layout or content
    case 'patch':
    case 'upload':
      return { authorized: hasRoleLevel(role, 'editor'), role };

    case 'admin': // Managing users, secrets, servers, audit logs, raw YAML
    case 'secrets':
    case 'code_widgets':
      return { authorized: hasRoleLevel(role, 'admin'), role };

    default:
      return { authorized: false, role };
  }
}

// Check secrets.yaml file permissions
function checkSecretsPermissions(secretsFilePath) {
  try {
    if (fs.existsSync(secretsFilePath)) {
      const stats = fs.statSync(secretsFilePath);
      const mode = stats.mode & 0o777;
      if ((mode & 0o044) !== 0) {
        console.warn(`[DimDash Security Warning] "${secretsFilePath}" is world-readable (mode 0${mode.toString(8)}). Recommended: chmod 0600.`);
      }
    }
  } catch {}
}

module.exports = {
  SCRYPT_PARAMS,
  hashSecret,
  verifySecret,
  SessionStore,
  BruteForceLimiter,
  ROLES,
  hasRoleLevel,
  authorize,
  checkSecretsPermissions
};
