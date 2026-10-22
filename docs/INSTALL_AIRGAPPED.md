# DimDash Air-Gapped Installation & Deployment Guide

This guide details the procedure for installing, operating, and maintaining DimDash in high-security, internet-isolated (air-gapped) environments.

---

## 1. Prerequisites

- Any modern Linux distribution (Ubuntu 20.04+, Debian 11+, RHEL/Rocky 8+, Alpine 3.18+)
- Docker 20.10+ & Docker Compose v2, **OR** Node.js 18.0.0+ on bare metal.
- Network: Local Area Network (LAN) only; zero internet access required.
- Hardware: Minimum 1 vCPU, 512MB RAM, 100MB free storage.

---

## 2. Option A: Air-Gapped Docker Installation (Recommended)

### Step 1: Transfer Release Artifacts to Air-Gapped Host
On a connected workstation, save the Docker image:
```bash
docker save dimdash:latest | gzip > dimdash-release.tar.gz
```
Transfer `dimdash-release.tar.gz`, `docker-compose.yml`, and `data/` to the air-gapped machine via approved media (e.g., encrypted USB drive or internal SCP jump host).

### Step 2: Load the Docker Image
On the air-gapped host:
```bash
docker load < dimdash-release.tar.gz
```

### Step 3: Run with Docker Compose
Ensure the `data/` volume permissions are properly set:
```bash
mkdir -p data/uploads
chmod -R 775 data
```

Start DimDash with Docker Compose:
```bash
docker compose up -d
```

DimDash starts immediately on port `3080` (or configured `PORT`).

---

## 3. Option B: Bare-Metal Installation (Systemd)

### Step 1: Extract Release Tarball
```bash
tar -xzf dimdash-app.tar.gz -C /opt/dimdash
cd /opt/dimdash
```

### Step 2: Configure Systemd Service
Create `/etc/systemd/system/dimdash.service`:
```ini
[Unit]
Description=DimDash Air-Gapped Homelab Dashboard
After=network.target

[Service]
Type=simple
User=dimdash
Group=dimdash
WorkingDirectory=/opt/dimdash
ExecStart=/usr/bin/node /opt/dimdash/server/index.js
Restart=always
RestartSec=5
Environment=PORT=3080
Environment=NODE_ENV=production
Environment=DATA_DIR=/opt/dimdash/data

# Security Hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/dimdash/data
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dimdash
```

---

## 4. Verification & Health Check

DimDash includes a native zero-dependency HTTP health check endpoint:
```bash
curl -f http://localhost:3080/api/health
```
Response:
```json
{"status":"ok","uptime":12.4,"rev":1}
```

Verify the release bundle integrity using the built-in verifier:
```bash
node tools/verify-bundle.js
```
Expected output:
```
[verify-bundle] Auditing runtime dependencies: [ 'express', 'yaml' ]
[verify-bundle] ✅ Dependency budget check passed: strict minimal runtime footprint.
[verify-bundle] ✅ All critical files present.
[verify-bundle] ✅ Generated SHA256SUMS for release artifacts.
[verify-bundle] ✅ SBOM.cdx.json generated successfully.
[verify-bundle] 🎯 Air-gapped release verification complete. 100% verified.
```
