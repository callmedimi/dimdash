# DimDash Operator Troubleshooting Guide

This guide provides symptom $\to$ cause $\to$ resolution runbooks for common operational scenarios in air-gapped environments.

---

## 1. Diagnostics Quick-Check

Query the administrative self-diagnostics endpoint:
```bash
curl -s http://localhost:3080/api/self
```
Output:
```json
{
  "version": "1.0.0",
  "uptime": 3600.5,
  "memory": { "rss": "58.2 MB", "heapUsed": "32.1 MB" },
  "activeConnections": 4,
  "sseClients": 2,
  "boardRevision": 8,
  "disk": "normal"
}
```

---

## 2. Common Symptoms & Runbooks

### 2.1 "CSP blocks my iframe or custom widget"
- **Symptom**: Browser console shows `Refused to frame '...' because it violates the following Content Security Policy directive`.
- **Cause**: DimDash enforces a zero-trust strict Content Security Policy (`frame-src 'self'`).
- **Fix**: To allow trusted internal LAN dashboards (e.g., Grafana, Proxmox) in iframes, update `data/config.yaml`:
  ```yaml
  security:
    allowed_frame_origins:
      - "http://grafana.internal:3000"
      - "https://proxmox.internal:8006"
  ```
  Restart DimDash or reload configuration via `POST /api/config/reload`.

---

### 2.2 "Kiosk screen sleeps after several minutes"
- **Symptom**: Wall display or kiosk monitor turns black or engages screensaver.
- **Cause**: Operating system display power management (DPMS) overrides browser wake lock.
- **Fix**:
  1. Ensure the URL includes `?kiosk=1` (activates DimDash Screen Wake Lock API).
  2. On the host Linux OS, disable DPMS:
     ```bash
     xset s off
     xset -dpms
     xset s noblank
     ```

---

### 2.3 "Admin credential forgotten or lock-out"
- **Symptom**: Unable to log into Blueprint / Edit mode or perform administrative operations.
- **Cause**: Lost admin PIN / password.
- **Fix**:
  1. Set the environment variable `DIMDASH_ADMIN_PIN` in your `docker-compose.yml` or systemd environment:
     ```yaml
     environment:
       - DIMDASH_ADMIN_PIN=secret123
     ```
  2. Restart the container/service. The environment variable immediately takes precedence over stored credentials.

---

### 2.4 "Clock skew alert / telemetry timestamps out of order"
- **Symptom**: Warning banner shows `Clock skew detected`.
- **Cause**: Air-gapped host lacks NTP synchronization, and local RTC has drifted.
- **Fix**:
  DimDash's Time-Travel engine tolerances allow $\pm 24\text{ hours}$ without crashing. To correct system time in air-gapped setups:
  ```bash
  sudo date -s "2026-10-22 14:00:00"
  ```
  Or synchronize against an internal GPS/PPS NTP appliance on your isolated LAN.
