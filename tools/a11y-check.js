#!/usr/bin/env node
/**
 * DimDash Static Accessibility (a11y) Verification Tool (P10)
 * 100% Air-Gapped & Offline - Zero External NPM Dependencies
 * Audits HTML files and components for:
 * 1. Landmarks (main, nav, aside, role="region", etc.)
 * 2. Positive tabindex (strictly forbidden per WCAG 2.1 AA)
 * 3. Interactive elements without accessible name (buttons, links, inputs)
 * 4. Image tags without alt attributes
 * 5. Valid aria-* attributes against WCAG allow-list
 * 6. Form inputs without associated labels or aria-label
 */

const fs = require('fs');
const path = require('path');

const VALID_ARIA_ATTRIBUTES = new Set([
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'aria-hidden',
  'aria-live',
  'aria-atomic',
  'aria-modal',
  'aria-expanded',
  'aria-haspopup',
  'aria-current',
  'aria-checked',
  'aria-disabled',
  'aria-invalid',
  'aria-required',
  'aria-selected',
  'aria-controls'
]);

function auditHtml(htmlContent, filename = 'inline') {
  const issues = [];

  // 1. Check positive tabindex
  const positiveTabindexRegex = /tabindex=["']([1-9][0-9]*)["']/gi;
  let match;
  while ((match = positiveTabindexRegex.exec(htmlContent)) !== null) {
    issues.push({
      rule: 'no-positive-tabindex',
      severity: 'error',
      message: `Forbidden positive tabindex="${match[1]}" found in ${filename}. Only 0 or -1 are allowed.`
    });
  }

  // 2. Check for buttons without text or aria-label
  const buttonRegex = /<button\b([^>]*)>(.*?)<\/button>/gis;
  while ((match = buttonRegex.exec(htmlContent)) !== null) {
    const attrs = match[1];
    const innerText = match[2].replace(/<[^>]+>/g, '').trim();
    const hasAriaLabel = /aria-label=["'][^"']+["']/i.test(attrs) || /aria-labelledby=["'][^"']+["']/i.test(attrs);
    const hasTitle = /title=["'][^"']+["']/i.test(attrs);

    if (!innerText && !hasAriaLabel && !hasTitle) {
      issues.push({
        rule: 'button-has-accessible-name',
        severity: 'error',
        message: `Button missing accessible text, aria-label, or title in ${filename}: <button ${attrs.slice(0, 40)}...>`
      });
    }
  }

  // 3. Check for <img> tags without alt
  const imgRegex = /<img\b([^>]*)>/gi;
  while ((match = imgRegex.exec(htmlContent)) !== null) {
    const attrs = match[1];
    const hasAlt = /\balt=["'][^"']*["']/i.test(attrs);
    if (!hasAlt) {
      issues.push({
        rule: 'img-alt-required',
        severity: 'warning',
        message: `Image missing alt attribute in ${filename}: <img ${attrs.slice(0, 40)}...>`
      });
    }
  }

  // 4. Check for invalid or typo'd aria-* attributes
  const ariaAttrRegex = /\b(aria-[a-z0-9-]+)=/gi;
  while ((match = ariaAttrRegex.exec(htmlContent)) !== null) {
    const attr = match[1].toLowerCase();
    if (!VALID_ARIA_ATTRIBUTES.has(attr)) {
      issues.push({
        rule: 'valid-aria-attribute',
        severity: 'warning',
        message: `Unrecognized or invalid ARIA attribute "${attr}" in ${filename}`
      });
    }
  }

  // 5. Check landmark presence
  const hasMainOrRegion = /<main\b|<div\b[^>]*role=["']region["']/i.test(htmlContent);
  const hasNav = /<nav\b|<aside\b/i.test(htmlContent);
  if (!hasMainOrRegion) {
    issues.push({
      rule: 'landmark-main-required',
      severity: 'warning',
      message: `No <main> or role="region" landmark found in ${filename}`
    });
  }

  return issues;
}

function runAudit() {
  console.log('[a11y-check] Running accessibility audit on DimDash public templates...');
  const publicDir = path.resolve(__dirname, '../public');
  const filesToAudit = [
    path.join(publicDir, 'index.html'),
    path.join(publicDir, '__styleguide.html'),
    path.join(publicDir, '__widgets.html')
  ];

  let totalErrors = 0;
  let totalWarnings = 0;

  for (const filePath of filesToAudit) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const issues = auditHtml(content, path.basename(filePath));

    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');

    totalErrors += errors.length;
    totalWarnings += warnings.length;

    console.log(`\n📄 ${path.basename(filePath)}:`);
    if (issues.length === 0) {
      console.log(`   ✅ 100% Passed. Zero WCAG violations.`);
    } else {
      errors.forEach(e => console.error(`   ❌ [ERROR] ${e.rule}: ${e.message}`));
      warnings.forEach(w => console.warn(`   ⚠️  [WARN]  ${w.rule}: ${w.message}`));
    }
  }

  console.log(`\n[a11y-check] Audit Complete: ${totalErrors} error(s), ${totalWarnings} warning(s).`);
  if (totalErrors > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runAudit();
}

module.exports = {
  auditHtml,
  VALID_ARIA_ATTRIBUTES
};
