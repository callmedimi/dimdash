const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  normalizeIp,
  isInCidr,
  isIpAllowed,
  validateUrl,
  DEFAULT_DENY_CIDRS
} = require('../server/ssrfGuard');

describe('P09 SSRF Guard: IP Normalization & Obfuscation Decoding', () => {
  test('normalizes standard dotted IPv4 strings', () => {
    assert.strictEqual(normalizeIp('192.168.1.1'), '192.168.1.1');
    assert.strictEqual(normalizeIp('127.0.0.1'), '127.0.0.1');
    assert.strictEqual(normalizeIp('  10.0.0.1  '), '10.0.0.1');
  });

  test('normalizes decimal / integer IP representations', () => {
    // 2130706433 = 127.0.0.1
    assert.strictEqual(normalizeIp('2130706433'), '127.0.0.1');
    // 2852039166 = 169.254.169.254
    assert.strictEqual(normalizeIp('2852039166'), '169.254.169.254');
  });

  test('normalizes hexadecimal IP representations', () => {
    // 0x7f000001 = 127.0.0.1
    assert.strictEqual(normalizeIp('0x7f000001'), '127.0.0.1');
    // 0xa9fea9fe = 169.254.169.254
    assert.strictEqual(normalizeIp('0xa9fea9fe'), '169.254.169.254');
  });

  test('normalizes octal dotted notation', () => {
    // 0177.0.0.1 = 127.0.0.1 (0177 octal is 127)
    assert.strictEqual(normalizeIp('0177.0.0.1'), '127.0.0.1');
  });

  test('normalizes IPv6 and IPv4-mapped IPv6', () => {
    assert.strictEqual(normalizeIp('::1'), '::1');
    assert.strictEqual(normalizeIp('::ffff:127.0.0.1'), '127.0.0.1');
    assert.strictEqual(normalizeIp('::ffff:192.168.1.1'), '192.168.1.1');
  });

  test('returns null for invalid inputs or out-of-range addresses', () => {
    assert.strictEqual(normalizeIp('invalid-host'), null);
    assert.strictEqual(normalizeIp('999.999.999.999'), null);
    assert.strictEqual(normalizeIp(''), null);
    assert.strictEqual(normalizeIp(null), null);
    assert.strictEqual(normalizeIp(12345), null);
  });
});

describe('P09 SSRF Guard: CIDR Range Matching', () => {
  test('matches loopback in 127.0.0.0/8', () => {
    assert.strictEqual(isInCidr('127.0.0.1', '127.0.0.0/8'), true);
    assert.strictEqual(isInCidr('127.255.255.254', '127.0.0.0/8'), true);
    assert.strictEqual(isInCidr('128.0.0.1', '127.0.0.0/8'), false);
  });

  test('matches cloud metadata in 169.254.0.0/16', () => {
    assert.strictEqual(isInCidr('169.254.169.254', '169.254.0.0/16'), true);
    assert.strictEqual(isInCidr('169.254.1.1', '169.254.0.0/16'), true);
    assert.strictEqual(isInCidr('169.255.1.1', '169.254.0.0/16'), false);
  });

  test('matches RFC1918 private subnets', () => {
    assert.strictEqual(isInCidr('10.0.5.1', '10.0.0.0/8'), true);
    assert.strictEqual(isInCidr('192.168.50.2', '192.168.0.0/16'), true);
    assert.strictEqual(isInCidr('172.16.10.5', '172.16.0.0/12'), true);
    assert.strictEqual(isInCidr('172.32.0.1', '172.16.0.0/12'), false);
  });
});

describe('P09 SSRF Guard: IP Policy Enforcement (isIpAllowed)', () => {
  test('strictly blocks AWS / GCP / Azure cloud metadata address (169.254.169.254)', () => {
    assert.strictEqual(isIpAllowed('169.254.169.254'), false);
    assert.strictEqual(isIpAllowed('169.254.169.254', { allowLoopback: true }), false);
    assert.strictEqual(isIpAllowed('2852039166'), false); // decimal notation
    assert.strictEqual(isIpAllowed('0xa9fea9fe'), false); // hex notation
  });

  test('blocks loopback by default and allows when explicitly configured', () => {
    assert.strictEqual(isIpAllowed('127.0.0.1'), false);
    assert.strictEqual(isIpAllowed('127.0.1.1'), false);
    assert.strictEqual(isIpAllowed('::1'), false);

    assert.strictEqual(isIpAllowed('127.0.0.1', { allowLoopback: true }), true);
    assert.strictEqual(isIpAllowed('::1', { allowLoopback: true }), true);
  });

  test('blocks multicast, broadcast, and unroutable zero network', () => {
    assert.strictEqual(isIpAllowed('0.0.0.0'), false);
    assert.strictEqual(isIpAllowed('224.0.0.1'), false);       // Multicast
    assert.strictEqual(isIpAllowed('239.255.255.250'), false); // SSDP Multicast
    assert.strictEqual(isIpAllowed('255.255.255.255'), false); // Broadcast
  });

  test('blocks IPv6 link-local and multicast', () => {
    assert.strictEqual(isIpAllowed('fe80::1'), false);
    assert.strictEqual(isIpAllowed('ff02::1'), false);
  });

  test('allows permitted internal LAN and public addresses', () => {
    assert.strictEqual(isIpAllowed('192.168.1.100'), true);
    assert.strictEqual(isIpAllowed('10.200.1.1'), true);
    assert.strictEqual(isIpAllowed('1.1.1.1'), true);
    assert.strictEqual(isIpAllowed('8.8.8.8'), true);
  });
});

describe('P09 SSRF Guard: URL Validation & DNS Rebinding Defense', () => {
  test('rejects non-http/https protocols (file:, gopher:, ftp:, javascript:)', async () => {
    await assert.rejects(
      () => validateUrl('file:///etc/passwd'),
      /Forbidden protocol/
    );
    await assert.rejects(
      () => validateUrl('gopher://127.0.0.1:70'),
      /Forbidden protocol/
    );
    await assert.rejects(
      () => validateUrl('ftp://example.com/test'),
      /Forbidden protocol/
    );
    await assert.rejects(
      () => validateUrl('javascript:alert(1)'),
      /Forbidden protocol/
    );
  });

  test('rejects direct cloud metadata IP in URL', async () => {
    await assert.rejects(
      () => validateUrl('http://169.254.169.254/latest/meta-data/'),
      /restricted network range/
    );
  });

  test('rejects direct loopback IP in URL when loopback not allowed', async () => {
    await assert.rejects(
      () => validateUrl('http://127.0.0.1:8080/admin'),
      /restricted network range/
    );
  });

  test('allows direct loopback IP in URL when allowLoopback is true', async () => {
    const res = await validateUrl('http://127.0.0.1:8080/health', { allowLoopback: true });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.resolvedIp, '127.0.0.1');
  });

  test('detects DNS rebinding attack via stub resolver returning cloud metadata IP', async () => {
    // Simulated malicious DNS that resolves attacker-domain.com to cloud metadata IP
    const stubResolver = async (host) => [{ address: '169.254.169.254' }];

    await assert.rejects(
      () => validateUrl('http://attacker-rebinding.com/steal', { resolver: stubResolver }),
      /resolved to restricted IP address "169.254.169.254"/
    );
  });

  test('detects DNS rebinding attack resolving to loopback', async () => {
    const stubResolver = async (host) => [{ address: '127.0.0.1' }];

    await assert.rejects(
      () => validateUrl('http://rebinding-to-localhost.org/secret', { resolver: stubResolver }),
      /resolved to restricted IP address "127.0.0.1"/
    );
  });

  test('passes validation for safe host resolving to internal LAN IP', async () => {
    const stubResolver = async (host) => [{ address: '192.168.1.42' }];

    const res = await validateUrl('http://nas.local:8080/status', { resolver: stubResolver });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.resolvedIp, '192.168.1.42');
    assert.strictEqual(res.hostname, 'nas.local');
  });
});
