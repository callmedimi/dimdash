const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  detectFileType,
  sanitizeSvg,
  saveUpload,
  KIND_LIMITS,
  GLOBAL_UPLOAD_QUOTA
} = require('../server/uploads');

describe('P09 Uploads: Magic Byte File Type Detection', () => {
  test('detects PNG image from 8-byte magic signature', () => {
    const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const res = detectFileType(pngBuf);
    assert.ok(res);
    assert.strictEqual(res.ext, 'png');
    assert.strictEqual(res.mime, 'image/png');
  });

  test('detects JPEG image from SOI marker', () => {
    const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const res = detectFileType(jpegBuf);
    assert.ok(res);
    assert.strictEqual(res.ext, 'jpg');
    assert.strictEqual(res.mime, 'image/jpeg');
  });

  test('detects GIF image from GIF89a / GIF87a magic', () => {
    const gifBuf = Buffer.from('GIF89a\x01\x00\x01\x00');
    const res = detectFileType(gifBuf);
    assert.ok(res);
    assert.strictEqual(res.ext, 'gif');
    assert.strictEqual(res.mime, 'image/gif');
  });

  test('detects WebP image from RIFF/WEBP header', () => {
    const webpBuf = Buffer.alloc(16);
    webpBuf.write('RIFF', 0);
    webpBuf.writeUInt32LE(8, 4);
    webpBuf.write('WEBP', 8);
    const res = detectFileType(webpBuf);
    assert.ok(res);
    assert.strictEqual(res.ext, 'webp');
    assert.strictEqual(res.mime, 'image/webp');
  });

  test('detects WOFF2 font from wOF2 signature', () => {
    const woffBuf = Buffer.from('wOF2\x00\x01\x00\x00');
    const res = detectFileType(woffBuf);
    assert.ok(res);
    assert.strictEqual(res.ext, 'woff2');
    assert.strictEqual(res.mime, 'font/woff2');
  });

  test('detects SVG vector graphics from XML or svg root tag', () => {
    const svg1 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle r="50"/></svg>');
    assert.strictEqual(detectFileType(svg1)?.ext, 'svg');

    const svg2 = Buffer.from('<?xml version="1.0"?>\n<svg viewBox="0 0 10 10"></svg>');
    assert.strictEqual(detectFileType(svg2)?.ext, 'svg');
  });

  test('rejects executables, shell scripts, and unknown binary formats', () => {
    // Linux ELF binary
    const elfBuf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
    assert.strictEqual(detectFileType(elfBuf), null);

    // Windows PE binary (MZ)
    const peBuf = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
    assert.strictEqual(detectFileType(peBuf), null);

    // Shell script
    const shBuf = Buffer.from('#!/bin/bash\necho "pwned"\n');
    assert.strictEqual(detectFileType(shBuf), null);
  });
});

describe('P09 Uploads: SVG Sanitizer XSS Corpus & Fuzzing', () => {
  test('strips explicit <script> tags and enclosed code', () => {
    const malicious = '<svg><script>alert("XSS")</script><circle r="10"/></svg>';
    const clean = sanitizeSvg(malicious);
    assert.ok(!clean.includes('script'));
    assert.ok(!clean.includes('alert'));
    assert.ok(clean.includes('circle'));
  });

  test('strips case-varied script tags (<ScRiPt>)', () => {
    const malicious = '<svg><ScRiPt type="text/javascript">document.location="http://evil.com"</sCrIpt></svg>';
    const clean = sanitizeSvg(malicious);
    assert.ok(!clean.toLowerCase().includes('script'));
    assert.ok(!clean.includes('evil.com'));
  });

  test('strips on* event handler attributes', () => {
    const malicious = '<svg onload="alert(1)"><rect width="10" height="10" onmouseover="stealCookies()" onclick=\'run()\'/></svg>';
    const clean = sanitizeSvg(malicious);
    assert.ok(!clean.includes('onload'));
    assert.ok(!clean.includes('onmouseover'));
    assert.ok(!clean.includes('onclick'));
    assert.ok(!clean.includes('alert(1)'));
    assert.ok(!clean.includes('stealCookies'));
  });

  test('strips <foreignObject> containers embedding HTML', () => {
    const malicious = '<svg><foreignObject width="100" height="100"><body xmlns="http://www.w3.org/1999/xhtml"><iframe src="http://evil.com"></iframe></body></foreignObject></svg>';
    const clean = sanitizeSvg(malicious);
    assert.ok(!clean.includes('foreignObject'));
    assert.ok(!clean.includes('iframe'));
    assert.ok(!clean.includes('evil.com'));
  });

  test('strips javascript: and external href / xlink:href URLs', () => {
    const malicious = '<svg><a xlink:href="javascript:alert(1)"><text>Click</text></a><image href="http://evil.com/logger.php"/></svg>';
    const clean = sanitizeSvg(malicious);
    assert.ok(!clean.includes('javascript:'));
    assert.ok(!clean.includes('http://evil.com'));
  });

  test('preserves internal fragment references (#id) for symbols and clips', () => {
    const safeSvg = '<svg><defs><g id="star"><polygon points="5,5 10,10 0,10"/></g></defs><use href="#star" x="20"/></svg>';
    const clean = sanitizeSvg(safeSvg);
    assert.ok(clean.includes('href="#star"'));
    assert.ok(clean.includes('id="star"'));
  });

  test('neutralizes XXE entity expansions and DOCTYPE declarations', () => {
    const xxe = '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg><text>&xxe;</text></svg>';
    const clean = sanitizeSvg(xxe);
    assert.ok(!clean.includes('<!DOCTYPE'));
    assert.ok(!clean.includes('<!ENTITY'));
    assert.ok(!clean.includes('/etc/passwd'));
  });

  test('strips dangerous CSS expressions and external url() in style attributes', () => {
    const malicious = '<svg><rect style="background: url(javascript:alert(1))" /><circle style="fill: url(http://evil.com/bg.png)" /></svg>';
    const clean = sanitizeSvg(malicious);
    assert.ok(!clean.includes('javascript:'));
    assert.ok(!clean.includes('http://evil.com'));
  });

  test('preserves safe CSS styling in style attributes', () => {
    const safe = '<svg><rect style="fill: #3498db; stroke-width: 2px" /></svg>';
    const clean = sanitizeSvg(safe);
    assert.ok(clean.includes('style="fill: #3498db; stroke-width: 2px"'));
  });
});

describe('P09 Uploads: saveUpload & Storage Safety', () => {
  let tmpDir;

  test('setup scratch directory for uploads', () => {
    tmpDir = path.join(os.tmpdir(), 'dimdash_test_uploads_' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  test('saves valid PNG file with content-addressed hash filename', () => {
    const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x11, 0x22]);
    const res = saveUpload(tmpDir, pngBuf, 'icon');

    assert.ok(res.fileName.endsWith('.png'));
    assert.strictEqual(res.fileName.length, 32 + 4); // 32 hex chars + .png
    assert.ok(fs.existsSync(path.join(tmpDir, res.fileName)));
    assert.strictEqual(res.mime, 'image/png');
  });

  test('sanitizes SVG before writing to disk', () => {
    const dirtySvg = Buffer.from('<svg onload="alert(1)"><script>bad()</script><rect width="10" height="10"/></svg>');
    const res = saveUpload(tmpDir, dirtySvg, 'icon');

    const written = fs.readFileSync(path.join(tmpDir, res.fileName), 'utf-8');
    assert.ok(!written.includes('onload'));
    assert.ok(!written.includes('script'));
    assert.ok(written.includes('rect'));
  });

  test('enforces per-kind size limits (e.g. icon capped at 512KB)', () => {
    const hugeIcon = Buffer.alloc(512 * 1024 + 1024);
    // Write PNG header
    hugeIcon.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);

    assert.throws(
      () => saveUpload(tmpDir, hugeIcon, 'icon'),
      /exceeds limit/
    );
  });

  test('prevents path traversal — filename has zero directories or dots', () => {
    const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const res = saveUpload(tmpDir, jpegBuf, 'logo');

    assert.ok(!res.fileName.includes('/'));
    assert.ok(!res.fileName.includes('\\'));
    assert.ok(!res.fileName.includes('..'));
  });

  test('cleanup scratch directory', () => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
