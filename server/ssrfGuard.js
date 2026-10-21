/**
 * DimDash SSRF Guard & Outbound Network Policy (P09)
 * Defends against SSRF, Cloud Metadata Theft, DNS Rebinding, and Protocol Abuse
 */
const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// Parse IP string or number to standard dotted IPv4
function normalizeIp(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim().toLowerCase();

  // IPv6 check
  if (net.isIPv6(trimmed)) {
    // Check IPv4-mapped IPv6 (::ffff:127.0.0.1)
    if (trimmed.startsWith('::ffff:')) {
      const v4Part = trimmed.substring(7);
      if (net.isIPv4(v4Part)) return v4Part;
    }
    return trimmed;
  }

  // IPv4 standard
  if (net.isIPv4(trimmed)) {
    return trimmed;
  }

  // Hexadecimal notation (e.g. 0x7f000001 or 0x7f.0.0.1)
  if (trimmed.startsWith('0x')) {
    const num = parseInt(trimmed, 16);
    if (!isNaN(num) && num >= 0 && num <= 0xffffffff) {
      return [
        (num >>> 24) & 255,
        (num >>> 16) & 255,
        (num >>> 8) & 255,
        num & 255
      ].join('.');
    }
  }

  // Pure integer / decimal notation (e.g. 2130706433)
  if (/^\d+$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= 0 && num <= 0xffffffff) {
      return [
        (num >>> 24) & 255,
        (num >>> 16) & 255,
        (num >>> 8) & 255,
        num & 255
      ].join('.');
    }
  }

  // Octal dotted notation (e.g. 0177.0.0.1)
  if (/^0[0-7]+\.[0-9.]+$/.test(trimmed)) {
    const parts = trimmed.split('.').map((p) => {
      return p.startsWith('0') && p.length > 1 ? parseInt(p, 8) : parseInt(p, 10);
    });
    if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
      return parts.join('.');
    }
  }

  return null;
}

// Convert IPv4 string to 32-bit unsigned integer
function ipToInt(ip) {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

// Check if an IPv4 address falls within a CIDR subnet
function isInCidr(ip, cidr) {
  const [range, bits = 32] = cidr.split('/');
  const mask = bits === 0 ? 0 : (~0 << (32 - parseInt(bits, 10))) >>> 0;
  const ipInt = ipToInt(ip);
  const rangeInt = ipToInt(range);
  return (ipInt & mask) === (rangeInt & mask);
}

// Default Denied Subnets
const DEFAULT_DENY_CIDRS = [
  '0.0.0.0/8',          // Current network (only valid as source)
  '127.0.0.0/8',        // Loopback
  '169.254.0.0/16',     // Link-local / AWS / GCP / Azure metadata (169.254.169.254)
  '224.0.0.0/4',        // Multicast
  '240.0.0.0/4',        // Reserved for future use
  '255.255.255.255/32'  // Broadcast
];

/**
 * Validates whether a target IP is permitted
 */
function isIpAllowed(ip, options = {}) {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;

  // IPv6 Checks
  if (net.isIPv6(normalized)) {
    if (normalized === '::1' || normalized === '::') {
      return !!options.allowLoopback;
    }
    if (normalized.startsWith('fe80:') || normalized.startsWith('ff')) {
      return false; // Link-local or multicast IPv6
    }
    return true;
  }

  // IPv4 Checks
  if (normalized === '127.0.0.1' || normalized.startsWith('127.')) {
    return !!options.allowLoopback;
  }

  // Cloud metadata block (strict)
  if (normalized === '169.254.169.254' || isInCidr(normalized, '169.254.0.0/16')) {
    return false;
  }

  for (const denyCidr of DEFAULT_DENY_CIDRS) {
    if (denyCidr.startsWith('127.') && options.allowLoopback) continue;
    if (isInCidr(normalized, denyCidr)) {
      return false;
    }
  }

  return true;
}

/**
 * Validates a target URL against outbound network policy
 * Performs DNS resolution and validates all target IPs to prevent DNS rebinding
 */
async function validateUrl(targetUrl, options = {}) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  // 1. Strict Protocol Enforcement
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Forbidden protocol: "${parsed.protocol}". Only http: and https: are permitted.`);
  }

  const hostname = parsed.hostname;

  // 2. Direct IP Check
  const directIp = normalizeIp(hostname);
  if (directIp) {
    if (!isIpAllowed(directIp, options)) {
      throw new Error(`Destination IP "${directIp}" is in a restricted network range.`);
    }
    return {
      allowed: true,
      url: parsed.href,
      resolvedIp: directIp,
      hostname
    };
  }

  // 3. DNS Resolution & Rebinding Check
  const lookupPromise = options.resolver
    ? options.resolver(hostname)
    : new Promise((resolve, reject) => {
        dns.lookup(hostname, { all: true }, (err, addresses) => {
          if (err) return reject(err);
          resolve(addresses);
        });
      });

  const addresses = await lookupPromise;
  if (!addresses || addresses.length === 0) {
    throw new Error(`Could not resolve hostname "${hostname}"`);
  }

  for (const addr of addresses) {
    const ip = addr.address || addr;
    if (!isIpAllowed(ip, options)) {
      throw new Error(`Hostname "${hostname}" resolved to restricted IP address "${ip}".`);
    }
  }

  return {
    allowed: true,
    url: parsed.href,
    resolvedIp: addresses[0].address || addresses[0],
    hostname
  };
}

module.exports = {
  normalizeIp,
  isInCidr,
  isIpAllowed,
  validateUrl,
  DEFAULT_DENY_CIDRS
};
