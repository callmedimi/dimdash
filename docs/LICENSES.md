# DimDash Asset & License Audit

**System Version:** DimDash Core v2.0  
**Phase:** P07 — Design System Anti-Slop  
**Audience:** Compliance, Legal, Air-Gap Packaging  

---

## 1. Typography Licenses (Self-Hosted OFL WOFF2)

All font files bundled in `public/fonts/` are 100% self-hosted, offline-ready, and distributed under the permissive **SIL Open Font License (OFL) version 1.1**:

### 1. Inter Variable & Static (`inter-400.woff2`, `inter-600.woff2`, `inter-700.woff2`)
- **Author:** Rasmus Andersson (rsms.me)
- **License:** SIL Open Font License, Version 1.1
- **Copyright:** Copyright (c) 2016-2024 The Inter Project Authors
- **Permitted Uses:** Commercial and non-commercial embedding, bundling, redistribution, and self-hosting.
- **Air-Gap Verification:** Font files are served directly from the local Node.js server. No requests are made to Google Fonts or remote font CDNs.

### 2. Vazirmatn Variable & Static (`vazirmatn-400.woff2`, `vazirmatn-600.woff2`)
- **Author:** Saber Rastikerdar (rastikerdar.github.io)
- **License:** SIL Open Font License, Version 1.1
- **Copyright:** Copyright (c) 2015-2022 Saber Rastikerdar
- **Permitted Uses:** Free commercial and non-commercial embedding, redistribution, and self-hosting for Persian/Arabic typography.

---

## 2. Iconography & Vector Assets

### 1. Core UI Vector Sprites
- **Location:** Embedded in `public/js/icons.js` and CSS vector paths.
- **License:** MIT License / Public Domain vectors.
- **Design Specifications:** 24px grid, 1.5px/2.0px stroke, rounded joins, square caps, tintable via `currentColor`.

### 2. Heimdall Application Icon Catalog
- **Location:** `public/icons/heimdall/` (~680 app icons).
- **Origin:** Heimdall Application Dashboard community icon set.
- **License:** MIT License.
- **Trademark Notice:** Application logos and trademarks (e.g. Proxmox, Docker, Plex, AdGuard) remain the intellectual property of their respective trademark holders. DimDash normalizes these assets into uniform squircle plates for internal homelab dashboard identification under fair use principles.

---

## 3. Air-Gap & Privacy Guarantee

- **Zero Remote CDN Requests:** DimDash does not reference external stylesheets, JavaScript libraries, tracking pixels, or remote font CDNs.
- **Offline Integrity:** All CSS, fonts, SVG vectors, and procedural wallpapers execute locally inside the private network boundary.
