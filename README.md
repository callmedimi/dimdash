# 🚀 DimDash

> **Ultra-fast, air-gapped homelab dashboard, application launcher, and live telemetry monitor with glassmorphism design and bidirectional YAML configuration.**

[![Docker Image CI](https://github.com/callmedimi/dimdash/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/callmedimi/dimdash/actions/workflows/docker-publish.yml)
[![Docker Image Size](https://img.shields.io/badge/docker%20image-55MB%20(compressed)-blue)](https://github.com/callmedimi/dimdash/pkgs/container/dimdash)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## ✨ Features

1. **100% Air-Gapped & Offline Ready:**
   - Zero external CDN dependencies, remote fonts, or third-party web tracking.
   - Built-in offline homelab icon pack, local fonts, and self-hosted SVG libraries.
2. **Bidirectional YAML Configuration:**
   - All tiles, categories, layout preferences, and gauge arrangements are stored in human-readable YAML (`data/config.yaml`).
   - Edits made via the Web Admin UI instantly update the file; direct edits with `vim` or `nano` automatically refresh clients via Server-Sent Events (SSE).
3. **Real-Time Telemetry & Cluster Monitoring:**
   - Live system metrics (CPU core utilization, Memory/RAM, Storage/Disk, Network I/O, Docker containers, Host uptime).
   - High-performance, zero-dependency HTML5 Canvas 2D telemetry charts with configurable historical ranges (`15m`, `30m`, `1h`, `6h`, `24h`, `7d`, `30d`, `Custom`).
   - Cluster support: Monitor multiple distributed nodes with lightweight bash/python reporting agents.
4. **Modern Glassmorphic UI:**
   - Sleek dark theme with real-time blur, transparency, customizable accent colors, and background logo overlay support.
   - Separate dedicated pages: **Apps & Tiles** view and **System Telemetry & Monitoring** view.
   - Drag-and-drop layout customization, live search with instant filtering (`/` hotkey), and responsive mobile/desktop layouts.
5. **Ultra-Lightweight & Minimal Resource Footprint:**
   - Compressed Docker image is under **55 MB** (multi-stage Alpine Linux build).
   - Low memory runtime consumption (~45 MB RAM) and near-zero CPU idle overhead (< 0.5%).

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- npm

### Installation & Run

```bash
# Clone the repository
git clone https://github.com/callmedimi/dimdash.git
cd dimdash

# Install dependencies (only Express and YAML parser)
npm install

# Start development server
PORT=3080 npm start
```

Open your browser and navigate to:
```
http://localhost:3080
```

---

## 🐳 Docker Deployment

### 1. Using Pre-Built GHCR Image (Recommended for Servers)

Run DimDash on any third-party server with persistent storage:

```bash
docker run -d \
  --name dimdash \
  --restart unless-stopped \
  -p 3080:3080 \
  -v $(pwd)/data:/app/data \
  --memory=128m \
  --cpus=0.5 \
  ghcr.io/callmedimi/dimdash:latest
```

### 2. Using Docker Compose

Clone or download `docker-compose.yml` and launch:

```bash
docker compose up -d
```

#### Production `docker-compose.yml` snippet:

```yaml
services:
  dimdash:
    image: ghcr.io/callmedimi/dimdash:latest
    container_name: dimdash
    restart: unless-stopped
    ports:
      - "3080:3080"
    volumes:
      # Persistent storage for YAML configuration and uploads
      - ./data:/app/data
      # Optional: Read-only host docker socket for container telemetry gauge
      # - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      - NODE_ENV=production
      - PORT=3080
      - TZ=Asia/Tehran
    deploy:
      resources:
        limits:
          cpus: '0.50'
          memory: 128M
        reservations:
          memory: 48M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

---

## 📁 Project Architecture

```
/opt/dimdash/
├── data/
│   ├── config.yaml              # Primary YAML configuration file
│   ├── heimdall_apps.json       # Built-in homelab catalog & icon mapping
│   └── uploads/                 # User-uploaded logos, icons and wallpapers
├── server/
│   ├── index.js                 # Express server & Server-Sent Events (SSE) broadcaster
│   ├── configManager.js         # YAML parser, validator & hot-reload file watcher
│   ├── clusterManager.js        # Multi-node cluster telemetry coordinator
│   ├── systemStats.js           # Host hardware and container telemetry collector
│   ├── metricsHistory.js        # High-performance in-memory & persisted time-series ring buffer
│   ├── prober.js                # TCP port ping and HTTP endpoint health monitor
│   └── defaultIcons.js          # Offline SVG icons repository
├── public/
│   ├── index.html               # Main dashboard UI
│   ├── admin/                   # Admin Studio & Theme Customizer
│   ├── css/
│   │   └── style.css            # Responsive glassmorphism design system
│   ├── js/
│   │   ├── app.js               # Reactive state manager, modal handlers & UI controller
│   │   ├── serverCharts.js      # Zero-dependency Retina Canvas 2D charts engine
│   │   └── icons.js             # Client-side icon renderer
│   ├── scripts/
│   │   ├── dimdash-agent.sh     # Lightweight bash telemetry agent for remote nodes
│   │   └── dimdash-agent.py     # Python telemetry agent for remote nodes
│   ├── icons/                   # Offline homelab application icons
│   └── wallpapers/              # High-definition curated wallpapers
├── .github/workflows/
│   └── docker-publish.yml       # Automated multi-arch GHCR image build pipeline
├── Dockerfile                   # Multi-stage minimal Alpine build (< 55MB compressed)
├── docker-compose.yml           # Production Docker Compose definition
├── docker-compose.server.yml    # Standalone Compose file for remote servers
└── README.md                    # Documentation
```

---

## 🔍 API & Health Checks

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/health` | `GET` | Health check probe (returns HTTP 200 `healthy`) |
| `/api/config` | `GET` | Get sanitized runtime configuration |
| `/api/config` | `POST` | Update YAML configuration (triggers live SSE broadcast) |
| `/api/system-telemetry` | `GET` | Get active server telemetry, CPU, RAM, disk & docker stats |
| `/api/system-history` | `GET` | Get historical metrics for Canvas charts |
| `/api/events` | `GET` | Server-Sent Events (SSE) live stream for instant UI updates |
| `/api/agent/report` | `POST` | Remote cluster node telemetry submission endpoint |

---

## 📄 License

This project is open-source and released under the [MIT License](LICENSE).
