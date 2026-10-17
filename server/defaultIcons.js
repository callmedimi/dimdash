/**
 * Embedded SVG Icons for Air-Gapped Homelab Services.
 * Zero external requests or CDNs. Clean, crisp, brand-colored SVG vector icons.
 */
const DEFAULT_ICONS = {
  // --- Homelab & Media Server Icons (from Heimdall & Popular Self-Hosted) ---
  gateway: `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="2" fill="#E53935"/><path d="M7 6V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" stroke="#B71C1C" stroke-width="2"/><line x1="3" y1="11" x2="21" y2="11" stroke="#FFCDD2" stroke-width="1.5"/><circle cx="12" cy="11" r="1.5" fill="#FFF"/><path d="M9 14l2 2 4-4" stroke="#FFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  
  router: `<svg viewBox="0 0 24 24" fill="none"><polygon points="12 2 21 7 21 17 12 22 3 17 3 7 12 2" fill="#1E88E5"/><polygon points="12 4.5 19 8.5 19 15.5 12 19.5 5 15.5 5 8.5 12 4.5" fill="#1565C0"/><text x="12" y="15" fill="#FFF" font-family="sans-serif" font-weight="bold" font-size="9" text-anchor="middle">N</text></svg>`,
  
  pihole: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" fill="#C2185B"/><circle cx="9.5" cy="9.5" r="2.2" fill="#FFF"/><circle cx="14.5" cy="9.5" r="2.2" fill="#FFF"/><circle cx="12" cy="14.5" r="2.5" fill="#FFF"/><circle cx="8" cy="14" r="1.8" fill="#FFF"/><circle cx="16" cy="14" r="1.8" fill="#FFF"/><circle cx="12" cy="8" r="1.5" fill="#FFF"/><path d="M12 2.5v3M10 3l2 2 2-2" stroke="#4CAF50" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  
  cosmos: `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="3" fill="#1A237E"/><rect x="5" y="6" width="14" height="12" rx="1.5" stroke="#42A5F5" stroke-width="1.5"/><line x1="8" y1="10" x2="8.01" y2="10" stroke="#42A5F5" stroke-width="2.5" stroke-linecap="round"/><line x1="8" y1="14" x2="8.01" y2="14" stroke="#42A5F5" stroke-width="2.5" stroke-linecap="round"/><circle cx="15" cy="12" r="2" fill="#42A5F5"/></svg>`,
  
  comet: `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" fill="#0288D1"/><rect x="5" y="7" width="14" height="2.5" rx="1" fill="#FFF"/><rect x="5" y="11" width="14" height="2.5" rx="1" fill="#FFF"/><rect x="5" y="15" width="14" height="2.5" rx="1" fill="#FFF"/><circle cx="16" cy="8.2" r="0.8" fill="#0288D1"/><circle cx="16" cy="12.2" r="0.8" fill="#0288D1"/><circle cx="16" cy="16.2" r="0.8" fill="#0288D1"/></svg>`,
  
  portainer: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7v10l10 5 10-5V7L12 2z" fill="#0091EA"/><path d="M12 2v10l10-5M12 12l-10-5" stroke="#FFF" stroke-width="1.5"/><rect x="7" y="13" width="3" height="3" fill="#FFF"/><rect x="14" y="13" width="3" height="3" fill="#FFF"/><rect x="10.5" y="15" width="3" height="3" fill="#FFF"/></svg>`,
  
  airsonic: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="4" fill="#1565C0"/><path d="M5 12h2M8 9v6M10 7v10M12 5v14M14 8v8M16 10v4M18 11v2M20 12h-1" stroke="#64B5F6" stroke-width="2" stroke-linecap="round"/></svg>`,
  
  freshrss: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#0288D1"/><circle cx="6.5" cy="17.5" r="2" fill="#FFF"/><path d="M4.5 10.5a9 9 0 0 1 9 9" stroke="#FFF" stroke-width="2.5" stroke-linecap="round"/><path d="M4.5 5.5a14 14 0 0 1 14 14" stroke="#FFF" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  
  plex: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#E5A00D"/><polygon points="10 7 16 12 10 17 8 17 14 12 8 7" fill="#111"/><polygon points="12 7 17 12 12 17" fill="#FFF"/></svg>`,
  
  moments: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="7" r="3.5" fill="#E91E63"/><circle cx="17" cy="12" r="3.5" fill="#2196F3"/><circle cx="12" cy="17" r="3.5" fill="#4CAF50"/><circle cx="7" cy="12" r="3.5" fill="#FFC107"/><circle cx="12" cy="12" r="2" fill="#FFF"/></svg>`,
  
  synology: `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="3" fill="#546E7A"/><circle cx="12" cy="9" r="3.5" fill="#ECEFF1"/><path d="M7 18c0-2.8 2.2-5 5-5s5 2.2 5 5" fill="#ECEFF1"/></svg>`,
  
  activebackup: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" fill="#0288D1"/><path d="M7 13.5a3 3 0 0 1 5.8-1 2.5 2.5 0 0 1 4.7 1.5 2.5 2.5 0 0 1-2.5 2.5H8a2.5 2.5 0 0 1-1-3z" fill="#FFF"/><path d="M9 13l2 2 4-4" stroke="#4CAF50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  
  sonarr: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#00A4DC"/><circle cx="12" cy="12" r="7" stroke="#FFF" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="#FFF"/><line x1="12" y1="2" x2="12" y2="7" stroke="#FFF" stroke-width="2"/><line x1="12" y1="17" x2="12" y2="22" stroke="#FFF" stroke-width="2"/><line x1="2" y1="12" x2="7" y2="12" stroke="#FFF" stroke-width="2"/><line x1="17" y1="12" x2="22" y2="12" stroke="#FFF" stroke-width="2"/></svg>`,
  
  radarr: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#FFC107"/><circle cx="12" cy="12" r="7" stroke="#111" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="#111"/><line x1="12" y1="2" x2="12" y2="7" stroke="#111" stroke-width="2"/><line x1="12" y1="17" x2="12" y2="22" stroke="#111" stroke-width="2"/><line x1="2" y1="12" x2="7" y2="12" stroke="#111" stroke-width="2"/><line x1="17" y1="12" x2="22" y2="12" stroke="#111" stroke-width="2"/></svg>`,
  
  lidarr: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#26A69A"/><circle cx="12" cy="12" r="7" stroke="#FFF" stroke-width="1.8"/><circle cx="12" cy="12" r="2.5" fill="#FFF"/><path d="M12 5a7 7 0 0 1 7 7" stroke="#1DE9B6" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  
  netdata: `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" fill="#212121"/><rect x="6" y="14" width="2.5" height="5" rx="0.5" fill="#00AB44"/><rect x="10" y="11" width="2.5" height="8" rx="0.5" fill="#00AB44"/><rect x="14" y="8" width="2.5" height="11" rx="0.5" fill="#00AB44"/><path d="M5 13l4-3 4 2 5-6" stroke="#00AB44" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // --- Core Infrastructure & Hypervisors ---
  proxmox: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#E57000"/><rect x="5" y="5" width="6" height="6" rx="1" fill="#FFF"/><rect x="13" y="5" width="6" height="6" rx="1" fill="#FFF"/><rect x="13" y="13" width="6" height="6" rx="1" fill="#FFF"/><rect x="5" y="13" width="6" height="6" rx="1" fill="#FFF"/><line x1="11" y1="8" x2="13" y2="8" stroke="#FFF" stroke-width="1.5"/><line x1="8" y1="11" x2="8" y2="13" stroke="#FFF" stroke-width="1.5"/><line x1="16" y1="11" x2="16" y2="13" stroke="#FFF" stroke-width="1.5"/><line x1="11" y1="16" x2="13" y2="16" stroke="#FFF" stroke-width="1.5"/></svg>`,
  
  truenas: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#0095D5"/><circle cx="12" cy="12" r="3" fill="#FFF"/><circle cx="6.5" cy="6.5" r="2" fill="#FFF"/><circle cx="17.5" cy="6.5" r="2" fill="#FFF"/><circle cx="6.5" cy="17.5" r="2" fill="#FFF"/><circle cx="17.5" cy="17.5" r="2" fill="#FFF"/><line x1="8" y1="8" x2="10" y2="10" stroke="#FFF" stroke-width="1.5"/><line x1="16" y1="8" x2="14" y2="10" stroke="#FFF" stroke-width="1.5"/><line x1="8" y1="16" x2="10" y2="14" stroke="#FFF" stroke-width="1.5"/><line x1="16" y1="16" x2="14" y2="14" stroke="#FFF" stroke-width="1.5"/></svg>`,

  docker: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#2496ED"/><path d="M20 12.5c0 3.5-3 6.5-8 6.5S4 16 4 12.5c0-2.5 1.5-3.5 3-3.5.5 0 1 .1 1.5.3A6 6 0 0 1 17 8c1 0 2.5.5 3 2" stroke="#FFF" stroke-width="1.5"/><rect x="6.5" y="11" width="1.8" height="1.8" fill="#FFF"/><rect x="9.5" y="11" width="1.8" height="1.8" fill="#FFF"/><rect x="12.5" y="11" width="1.8" height="1.8" fill="#FFF"/><rect x="9.5" y="8.5" width="1.8" height="1.8" fill="#FFF"/><rect x="12.5" y="8.5" width="1.8" height="1.8" fill="#FFF"/></svg>`,

  homeassistant: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#03A9F4"/><path d="M5 11l7-6 7 6v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8z" fill="#FFF"/><circle cx="12" cy="12" r="2" fill="#03A9F4"/><line x1="12" y1="14" x2="12" y2="19" stroke="#03A9F4" stroke-width="2"/></svg>`,

  grafana: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#F46800"/><circle cx="12" cy="12" r="6" stroke="#FFF" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="#FFF"/><path d="M12 4v4M12 16v4" stroke="#FFF" stroke-width="2"/></svg>`,

  nextcloud: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#0082C9"/><circle cx="12" cy="12" r="4.5" stroke="#FFF" stroke-width="2"/><circle cx="5.5" cy="12" r="2.5" fill="#FFF"/><circle cx="18.5" cy="12" r="2.5" fill="#FFF"/></svg>`,

  wireguard: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#88171A"/><path d="M12 4L4 8v5c0 5 4 8 8 9s8-4 8-9V8l-8-4z" fill="#FFF"/><path d="M12 8c-2 2-2 5 0 7 2-2 2-5 0-7z" fill="#88171A"/></svg>`,

  vaultwarden: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#175DDC"/><rect x="6" y="10" width="12" height="9" rx="1.5" fill="#FFF"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="#FFF" stroke-width="2"/><circle cx="12" cy="14" r="1.5" fill="#175DDC"/></svg>`,

  qbittorrent: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#2F679B"/><path d="M10 15V9a2 2 0 0 1 4 0v6" stroke="#FFF" stroke-width="2.2" stroke-linecap="round"/><path d="M9 12h5" stroke="#FFF" stroke-width="2.2" stroke-linecap="round"/></svg>`,

  jellyfin: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#AA5CC3"/><polygon points="12 4 20 18 4 18" fill="#FFF"/><polygon points="12 9 16 16 8 16" fill="#AA5CC3"/></svg>`,

  pfsense: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#212121"/><path d="M6 7h12v3H6zM6 14h12v3H6z" fill="#D32F2F"/><text x="12" y="13" fill="#FFF" font-family="sans-serif" font-weight="bold" font-size="6" text-anchor="middle">pfSense</text></svg>`,

  adguard: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#68BC71"/><path d="M12 5l7 3v4c0 4.5-3 7.5-7 8.5-4-1-7-4-7-8.5V8l7-3z" fill="#FFF"/><path d="M10 12l2 2 4-4" stroke="#68BC71" stroke-width="2" stroke-linecap="round"/></svg>`,

  uptimekuma: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#5CDD8B"/><circle cx="12" cy="12" r="6" stroke="#111" stroke-width="2"/><polyline points="12 8 12 12 15 14" stroke="#111" stroke-width="2" stroke-linecap="round"/></svg>`,

  transmission: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#B71C1C"/><circle cx="12" cy="12" r="7" stroke="#FFF" stroke-width="2"/><line x1="12" y1="8" x2="12" y2="16" stroke="#FFF" stroke-width="2"/><polyline points="9 13 12 16 15 13" stroke="#FFF" stroke-width="2"/></svg>`,

  gitea: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#609926"/><circle cx="12" cy="12" r="6" stroke="#FFF" stroke-width="2"/><circle cx="10" cy="11" r="1.5" fill="#FFF"/><circle cx="14" cy="11" r="1.5" fill="#FFF"/><path d="M10 15c1 1 3 1 4 0" stroke="#FFF" stroke-width="1.5"/></svg>`,

  prowlarr: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#E65100"/><circle cx="12" cy="12" r="7" stroke="#FFF" stroke-width="2"/><circle cx="10" cy="10" r="2" fill="#FFF"/><circle cx="14" cy="10" r="2" fill="#FFF"/><path d="M9 15c1.5 1.5 4.5 1.5 6 0" stroke="#FFF" stroke-width="2" stroke-linecap="round"/></svg>`,

  emby: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#52B54B"/><polygon points="9 7 17 12 9 17" fill="#FFF"/></svg>`,

  bazarr: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#212121"/><circle cx="12" cy="12" r="7" stroke="#FFF" stroke-width="2"/><line x1="8" y1="13" x2="16" y2="13" stroke="#FFF" stroke-width="2.5" stroke-linecap="round"/></svg>`,

  tandoor: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#D97706"/><path d="M12 4c-3 3-5 5-5 8a5 5 0 0 0 10 0c0-3-2-5-5-8z" fill="#FFF"/><circle cx="12" cy="13" r="2" fill="#D97706"/></svg>`,

  nginxproxymanager: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#1E293B"/><polygon points="12 4 19 8 19 16 12 20 5 16 5 8" stroke="#F97316" stroke-width="2"/><path d="M12 7l4 7h-8z" fill="#38BDF8"/></svg>`,

  dokuwiki: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#4B5563"/><path d="M6 18l3-1 8-8-2-2-8 8-1 3z" fill="#10B981"/><path d="M14 6l2 2" stroke="#FFF" stroke-width="1.5"/></svg>`,

  netbox: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#0284C7"/><path d="M7 7h10v10H7z" stroke="#FFF" stroke-width="2"/><line x1="4" y1="12" x2="20" y2="12" stroke="#FFF" stroke-width="1.5"/><line x1="12" y1="4" x2="12" y2="20" stroke="#FFF" stroke-width="1.5"/></svg>`,

  homebox: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#475569"/><path d="M12 4l7 4v8l-7 4-7-4V8l7-4z" stroke="#FFF" stroke-width="2"/><path d="M12 12l7-4M12 12v8M12 12L5 8" stroke="#FFF" stroke-width="1.5"/></svg>`,

  snippetbox: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#18181B"/><path d="M9 8c-2 0-2 2-2 4s0 4 2 4M15 8c2 0 2 2 2 4s0 4-2 4" stroke="#FFF" stroke-width="2" stroke-linecap="round"/></svg>`,

  ittools: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#0D9488"/><circle cx="12" cy="12" r="5" stroke="#FFF" stroke-width="2"/><path d="M15 9l3-3M6 18l3-3" stroke="#FFF" stroke-width="2" stroke-linecap="round"/></svg>`,

  webdevops: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#7C2D12"/><path d="M8 18c2-6 8-12 8-12s-2 8-5 11c-2 2-3 1-3 1z" fill="#F59E0B"/><path d="M11 15c2-4 5-8 5-8" stroke="#EF4444" stroke-width="1.5"/></svg>`,

  // --- Generic Technical Icons ---
  server: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"></rect><rect x="2" y="14" width="20" height="8" rx="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
  cpu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect></svg>`,
  database: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`,
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
  terminal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`,
  network: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="16" y="16" width="6" height="6" rx="1"></rect><rect x="2" y="16" width="6" height="6" rx="1"></rect><rect x="9" y="2" width="6" height="6" rx="1"></rect><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"></path><path d="M12 12V8"></path></svg>`,
  cloud: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`,
  wifi: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>`
};

module.exports = DEFAULT_ICONS;

