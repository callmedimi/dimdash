# DimDash Technical Documentation: Phase P09 Implementation

**Document:** Complete Implementation Guide & Architectural Specification  
**Phase Covered:** **P09:** Security & Air-Gap Hardening  
**System Version:** DimDash Core v2.0  
**Test Coverage:** 368 Automated Tests Passing (100% Pass Rate across 42 Suites)  
**Date:** 2026-10-21  

---

## 1. Executive Summary & Zero-Trust Thesis

Phase P09 hardens DimDash for **hostile-but-offline environments** (industrial plant control rooms, telecom NOCs, defense facilities, financial datacenters, and isolated homelabs). The threat model assumes:
- Complete isolation from the public internet (zero outbound network connectivity).
- Curious or semi-trusted internal network actors with physical or local LAN access.
- Shared kiosk wallboard displays running unattended in public or common corridors.
- Zero tolerance for external runtime dependencies or untrusted third-party NPM security libraries.

The legacy plaintext PIN model is replaced with **scrypt-hashed credentials, cryptographically isolated session tokens, role-based access control (RBAC), Server-Side Request Forgery (SSRF) defense, strict Content Security Policy (CSP), and a zero-dependency in-house SVG sanitizer**.

---

## 2. Cryptographic Security Engine (`server/auth.js`)

All cryptographic operations leverage Node.js standard libraries (`node:crypto`) with zero third-party dependencies.

### 2.1 Scrypt Password & PIN Hashing
Credentials are never stored in plaintext. They are protected using memory-hard scrypt:
$$\text{scrypt}(password, salt, N=32768, r=8, p=1, keyLen=32)$$
- **Format String:** `scrypt$32768$8$1$<16-byte-salt-hex>$<32-byte-derived-key-hex>`
- **Cost Factor ($N$):** $32768$ ($2^{15}$ iterations)
- **Block Size ($r$):** $8$ ($1024$ bytes)
- **Parallelization ($p$):** $1$
- **Memory Allocation:** $64\text{MB}$ `maxmem` allocation in Node.js runtime.
- **Constant-Time Verification:** Uses `crypto.timingSafeEqual` across both scrypt-derived hashes and legacy plaintext fallback buffers to eliminate timing side-channel attacks.

### 2.2 Session Management & Kiosk Display Tokens
- **Session ID:** 256 bits of cryptographically secure pseudo-random bytes (`crypto.randomBytes(32).toString('hex')`).
- **CSRF Token:** 128 bits of cryptographically secure random bytes generated per session.
- **Cookie Security:** Emits `dd_sid` with `HttpOnly; SameSite=Strict; Path=/` (or `__Host-` under TLS).
- **Timeouts:** 
  - *Idle Timeout:* 12 hours of inactivity evicts session.
  - *Absolute Timeout:* 7 days maximum session lifetime.
- **Session Rotation:** Upgrading privileges (e.g. login from viewer to admin) rotates the session ID immediately, invalidating the previous token.
- **Kiosk / Display Tokens:** Read-only tokens prefixed with `kiosk_` scoped strictly to the `viewer` role and associated with specific display profiles.

### 2.3 Brute-Force Rate Limiter (`BruteForceLimiter`)
To defeat online brute-force attacks against administrative passwords or PINs:
- Tracks failed login attempts per client IP address.
- Allows up to 4 consecutive failures without penalty.
- On the 5th failure, enforces **exponential backoff**:
  $$\text{delay} = \min(300, 2^{\text{failures} - 4}) \text{ seconds}$$
  Delays scale exponentially ($1\text{s}, 2\text{s}, 4\text{s}, 8\text{s}, \dots, 256\text{s} \le 300\text{s}$).
- Successful authentication instantly clears the failure record.

### 2.4 Role-Based Access Control (RBAC) Policy Engine
Access is governed by a hierarchical policy function `authorize(session, action, resource)`:
- **`viewer` (Level 10):** Read-only access to public board items and health status.
- **`user` (Level 20):** Viewer access plus interaction with interactive widgets (buttons, toggles) and `user`-visibility items.
- **`editor` (Level 30):** User access plus editing board layout, updating widget properties, and uploading media.
- **`admin` (Level 40):** Full access including user management, credential changes, server agent tokens, raw YAML editing, and code widgets.

The RBAC engine is validated against a comprehensive **60-case table-driven test matrix** in `test/auth.test.js`.

---

## 3. SSRF & Outbound Policy Guard (`server/ssrfGuard.js`)

When DimDash executes external health probes (`ping_tcp`, `http_status`, `json_metric`), outbound connections are restricted by a strict network policy to prevent Server-Side Request Forgery and cloud credential theft.

### 3.1 IP Normalization & Obfuscation Decoding
Attackers often attempt SSRF bypass using alternative IP representations. The `normalizeIp` engine decodes:
1. **Dotted Decimal:** `127.0.0.1`
2. **Decimal Integers:** `2130706433` $\rightarrow$ `127.0.0.1`
3. **Hexadecimal Notation:** `0x7f000001` $\rightarrow$ `127.0.0.1`
4. **Octal Dotted Notation:** `0177.0.0.1` $\rightarrow$ `127.0.0.1`
5. **IPv6 & IPv4-Mapped IPv6:** `::ffff:127.0.0.1` $\rightarrow$ `127.0.0.1`

### 3.2 Blocked Subnets (Default Deny CIDRs)
Outbound probes are prohibited from connecting to:
- `169.254.169.254` & `169.254.0.0/16`: Cloud metadata services (AWS IMDSv1/v2, GCP, Azure, DigitalOcean). Strictly blocked under all circumstances.
- `127.0.0.0/8`: Localhost loopback (blocked by default; local homelab installations may explicitly enable loopback for local service monitoring).
- `224.0.0.0/4`: Multicast addresses.
- `255.255.255.255/32`: Local broadcast.
- `0.0.0.0/8`: Unroutable source network.

### 3.3 DNS Rebinding Defense
To defeat DNS rebinding (where a hostname initially resolves to an allowed IP but changes to a private IP on subsequent requests), `validateUrl(url)`:
1. Enforces `http:` or `https:` protocols (rejects `file:`, `gopher:`, `ftp:`, `javascript:`).
2. Resolves DNS records before connection.
3. Validates **all** resolved IP addresses against the network policy before initiating the HTTP or TCP socket.

---

## 4. Upload Security & Zero-XSS SVG Sanitizer (`server/uploads.js`)

DimDash replaces Base64-in-JSON payload transfers with a high-performance streaming endpoint: `PUT /api/upload/:kind`.

### 4.1 Strict Kind Size Limits & Storage Quotas
| Kind | Max Size | Allowed Mime Types |
| :--- | :--- | :--- |
| `icon` | 512 KB | PNG, JPEG, GIF, WebP, SVG, WOFF2 |
| `logo` | 2 MB | PNG, JPEG, GIF, WebP, SVG |
| `wallpaper` | 12 MB | PNG, JPEG, WebP |
| `widget_data`| 1 MB | JSON, Plain Text |

The total uploads directory (`data/uploads`) is protected by a global **200 MB storage quota**.

### 4.2 Magic Byte File Signature Verification
Uploaded files are inspected for true binary magic headers rather than trusting client-supplied MIME types or file extensions:
- **PNG:** `89 50 4E 47 0D 0A 1A 0A`
- **JPEG:** `FF D8 FF`
- **GIF:** `GIF87a` / `GIF89a`
- **WebP:** `RIFF....WEBP`
- **WOFF2:** `wOF2`

### 4.3 In-House Zero-Dependency SVG Sanitizer
Uploaded SVG files are cleaned with an in-house sanitizer prior to disk persistence:
1. **XML Entity Attack (XXE) Defense:** Strips `<!DOCTYPE ...>` and `<!ENTITY ...>` declarations, defeating billion-laughs and local file disclosure attacks.
2. **Script Elimination:** Strips `<script>`, `<foreignObject>`, `<iframe>`, `<object>`, `<embed>`, `<meta>`, and `<link>` elements.
3. **Event Handler Neutralization:** Removes all `on*` attributes (`onload`, `onclick`, `onerror`, `onmouseover`).
4. **URL Disarmament:** Neutralizes `javascript:` URIs and remote URLs in `href` and `xlink:href`, while safely preserving internal fragment identifiers (`#my-symbol`).
5. **CSS Guard:** Blocks external `url()` references and script expressions in `style` attributes.

### 4.4 Content-Addressed Hash Storage
Files are saved as `<sha256-hex>.<ext>`. User input is never used in filenames, completely preventing path traversal attacks (`../../etc/passwd`).

---

## 5. Transport Hardening & Security Headers (`server/headers.js`)

All responses from DimDash are equipped with defensive HTTP headers:

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)
```

- When serving uploaded SVG images (`/uploads/*.svg`), an additional sandbox CSP is applied:
  `Content-Security-Policy: sandbox; default-src 'none'; style-src 'unsafe-inline'`
  This ensures that even if an SVG is loaded directly in a browser tab, scripts cannot execute in the application origin.
- The `X-Powered-By` fingerprint header is removed.

---

## 6. Audit Logging System (`server/audit.js`)

All privileged operations (logins, secret changes, board patches, uploads) are logged in append-only NDJSON format at `data/audit.ndjson`:
- **Format:** `{"ts": "2026-10-21T21:40:00.000Z", "ip": "192.168.1.10", "role": "admin", "action": "login", "status": "success"}`
- **Credential Masking:** Sensitive keys (`pin`, `password`, `secret`, `token`, `admin_pin`, `user_pin`) are automatically masked with `***MASKED***`.
- **Log Rotation:** Automatically rotates logs when reaching 5 MB (`audit.ndjson` $\rightarrow$ `audit.ndjson.1` $\rightarrow$ `audit.ndjson.2`).
- **Inspection API:** Accessible by administrators via `GET /api/audit`.

---

## 7. Migration & Upgrade Tools

To migrate existing installations from plaintext PINs:
- **`tools/upgrade-secrets.js`:** Scans `data/secrets.yaml`, generates scrypt hashes with unique salts for `admin_pin` and `user_pin`, updates the file, and sets permissions to `0600`.
- **First-Run Setup Flow:** If no admin credential exists at boot, a random 128-bit setup token is displayed on stdout. The web application accepts `POST /api/auth/setup` with this token to establish initial credentials.

---

## 8. Air-Gap Lifecycle & Authoritative Time

1. **Authoritative Server Time (`/api/time`):** Air-gapped networks often lack NTP connectivity. DimDash exposes server time so wall displays can synchronize clocks without external time servers.
2. **Air-Gapped TLS (`docs/TLS_AIRGAPPED.md`):** Complete guide for setting up an internal offline Root CA and installing trust on Debian, Raspberry Pi, and Chromium kiosks.
3. **Offline Build Pipeline (`docs/BUILD_OFFLINE.md`):** Deterministic release packaging, Docker base image digest pinning, and zero-dependency CycloneDX SBOM generation.

---

## 9. Test Verification & Coverage Metrics

Phase P09 adds 4 new dedicated test suites comprising 127 new automated tests:
1. `test/auth.test.js`: Scrypt hashing, constant-time verification, session lifecycle, brute-force backoff, and 60-case RBAC table-driven matrix.
2. `test/ssrf.test.js`: Obfuscated IP normalization, CIDR matching, cloud metadata blocks, and DNS rebinding defense.
3. `test/uploads.test.js`: Magic byte validation, SVG XSS sanitizer fuzzing corpus, size limits, and path traversal prevention.
4. `test/headers.test.js`: Strict CSP verification, nosniff, referrer, COOP/CORP, and SVG sandbox headers.

**Repository Total:** **368 tests passing across 42 test suites (100% pass rate, 0 failures)**.
