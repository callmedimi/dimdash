/**
 * Client Icon Helper
 * Supports SVG Vectors, Uploaded Icons, and 680+ Heimdall Foundation App Icons
 */
const IconCatalog = {
  icons: {},
  heimdallApps: [],

  async init() {
    try {
      const [resIcons, resHeimdall] = await Promise.all([
        fetch('/api/icons'),
        fetch('/api/icons/heimdall')
      ]);
      if (resIcons.ok) {
        this.icons = await resIcons.json();
      }
      if (resHeimdall.ok) {
        this.heimdallApps = await resHeimdall.json();
      }
    } catch (e) {
      console.warn('Failed to fetch icon catalog', e);
    }
  },

  getAll() {
    return this.icons;
  },

  getHeimdallApps() {
    return this.heimdallApps;
  },

  render(iconType, iconValue) {
    if (!iconValue) {
      return this.icons['server'] || `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"></rect><rect x="2" y="14" width="20" height="8" rx="2"></rect></svg>`;
    }

    // 1. Raw inline SVG string
    if (typeof iconValue === 'string' && iconValue.trim().startsWith('<svg')) {
      return iconValue;
    }

    // 2. Direct Image URL (uploaded, Heimdall path, relative or full URL)
    if (iconType === 'uploaded' || iconType === 'image' || iconValue.startsWith('/') || iconValue.startsWith('data:image/') || iconValue.startsWith('http://') || iconValue.startsWith('https://')) {
      return `<img src="${iconValue}" alt="" style="width:100%; height:100%; object-fit:contain; overflow:hidden;" loading="lazy" onerror="this.style.display='none'" />`;
    }

    // 3. Preset lookup in vector catalog (e.g. 'server', 'docker', 'cpu', 'pihole', etc.)
    const val = this.icons[iconValue];
    if (val) {
      if (typeof val === 'string' && val.trim().startsWith('<svg')) {
        return val;
      }
      if (typeof val === 'string' && (val.startsWith('/') || val.startsWith('http'))) {
        return `<img src="${val}" alt="" style="width:100%; height:100%; object-fit:contain; overflow:hidden;" loading="lazy" onerror="this.style.display='none'" />`;
      }
    }

    // 4. Heimdall Foundation catalog lookup by App ID or App Name
    const hApp = this.heimdallApps.find(a => a.id === iconValue.toLowerCase() || a.name.toLowerCase() === iconValue.toLowerCase());
    if (hApp && hApp.icon_url) {
      return `<img src="${hApp.icon_url}" alt="" style="width:100%; height:100%; object-fit:contain; overflow:hidden;" loading="lazy" onerror="this.style.display='none'" />`;
    }

    // 5. Fallback server icon
    const fallback = this.icons['server'];
    if (fallback && typeof fallback === 'string' && fallback.trim().startsWith('<svg')) {
      return fallback;
    }
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"></rect><rect x="2" y="14" width="20" height="8" rx="2"></rect></svg>`;
  }
};

/**
 * Automatically detects and removes solid backgrounds (white, black, or corner-sampled colors)
 * from uploaded images, creating a transparent PNG with anti-aliased edge feathering.
 */
function stripImageBackground(dataUrl, tolerance = 38) {
  return new Promise((resolve) => {
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/svg+xml')) {
      resolve(dataUrl);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        // Sample the 4 corner pixels
        const corners = [
          [0, 0],
          [w - 1, 0],
          [0, h - 1],
          [w - 1, h - 1]
        ];

        // If any corner is already transparent, keep original
        let hasAlphaAlready = false;
        for (const [cx, cy] of corners) {
          const idx = (cy * w + cx) * 4;
          if (data[idx + 3] < 180) {
            hasAlphaAlready = true;
            break;
          }
        }

        if (hasAlphaAlready) {
          resolve(dataUrl);
          return;
        }

        // Calculate average background color from the 4 corners
        let bgR = 0, bgG = 0, bgB = 0;
        for (const [cx, cy] of corners) {
          const idx = (cy * w + cx) * 4;
          bgR += data[idx];
          bgG += data[idx + 1];
          bgB += data[idx + 2];
        }
        bgR = Math.round(bgR / corners.length);
        bgG = Math.round(bgG / corners.length);
        bgB = Math.round(bgB / corners.length);

        const tolSq = tolerance * tolerance;
        const featherSq = (tolerance * 1.6) * (tolerance * 1.6);

        // Strip matching background pixels
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const dr = r - bgR;
          const dg = g - bgG;
          const db = b - bgB;
          const distSq = dr * dr + dg * dg + db * db;

          if (distSq <= tolSq) {
            data[i + 3] = 0; // transparent
          } else if (distSq < featherSq) {
            const factor = (distSq - tolSq) / (featherSq - tolSq);
            data[i + 3] = Math.round(data[i + 3] * factor);
          }
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        console.warn('Could not strip image background:', err);
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

window.IconCatalog = IconCatalog;
window.stripImageBackground = stripImageBackground;
