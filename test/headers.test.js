const { test, describe } = require('node:test');
const assert = require('node:assert');
const { securityHeadersMiddleware } = require('../server/headers');

describe('P09 Security Headers & Transport Hardening', () => {
  function createMockReqRes(path = '/') {
    const headers = {};
    const req = { path };
    const res = {
      setHeader(name, val) {
        headers[name.toLowerCase()] = val;
      },
      removeHeader(name) {
        delete headers[name.toLowerCase()];
      },
      headers
    };
    return { req, res, headers };
  }

  test('removes X-Powered-By header', () => {
    const { req, res, headers } = createMockReqRes();
    headers['x-powered-by'] = 'Express';

    securityHeadersMiddleware(req, res, () => {});
    assert.strictEqual(headers['x-powered-by'], undefined);
  });

  test('sets strict Content Security Policy (CSP)', () => {
    const { req, res, headers } = createMockReqRes();
    securityHeadersMiddleware(req, res, () => {});

    const csp = headers['content-security-policy'];
    assert.ok(csp);
    assert.ok(csp.includes("default-src 'self'"));
    assert.ok(csp.includes("object-src 'none'"));
    assert.ok(csp.includes("frame-ancestors 'self'"));
    assert.ok(csp.includes("base-uri 'none'"));
  });

  test('sets nosniff and referrer headers', () => {
    const { req, res, headers } = createMockReqRes();
    securityHeadersMiddleware(req, res, () => {});

    assert.strictEqual(headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(headers['referrer-policy'], 'no-referrer');
  });

  test('sets Cross-Origin Isolation headers', () => {
    const { req, res, headers } = createMockReqRes();
    securityHeadersMiddleware(req, res, () => {});

    assert.strictEqual(headers['cross-origin-opener-policy'], 'same-origin');
    assert.strictEqual(headers['cross-origin-resource-policy'], 'same-origin');
  });

  test('applies sandbox CSP and inline disposition when serving uploaded SVGs', () => {
    const { req, res, headers } = createMockReqRes('/uploads/icon-123.svg');
    securityHeadersMiddleware(req, res, () => {});

    assert.strictEqual(headers['content-disposition'], 'inline');
    assert.strictEqual(
      headers['content-security-policy'],
      "sandbox; default-src 'none'; style-src 'unsafe-inline'"
    );
  });
});
