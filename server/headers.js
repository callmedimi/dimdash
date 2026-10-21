/**
 * DimDash Security Headers Middleware (P09)
 * Strict Content Security Policy (CSP), Transport Hardening, and Frame Isolation
 */

function securityHeadersMiddleware(req, res, next) {
  // Remove fingerprinting header
  res.removeHeader('X-Powered-By');

  // Strict Content Security Policy (CSP)
  // Air-gapped self-hosted policy with zero remote font/script dependencies
  const cspPolicy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'"
  ].join('; ');

  res.setHeader('Content-Security-Policy', cspPolicy);

  // MIME sniffing defense
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Referrer leakage prevention
  res.setHeader('Referrer-Policy', 'no-referrer');

  // Cross-Origin Isolation
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  // Restrict browser features (camera, mic, sensors, payments)
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)'
  );

  // If serving an uploaded file, apply extra sandbox headers
  if (req.path.startsWith('/uploads/')) {
    res.setHeader('Content-Disposition', 'inline');
    if (req.path.endsWith('.svg')) {
      res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'");
    }
  }

  next();
}

module.exports = {
  securityHeadersMiddleware
};
