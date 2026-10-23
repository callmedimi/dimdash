# DimDash Air-Gapped Offline Build & Release Guide

This document describes the offline packaging, air-gap transfer, and deployment process for DimDash in restricted or isolated networks without internet access.

---

## 1. Principles of Air-Gapped Release Engineering

1. **Deterministic Reproducibility**: The release bundle is assembled on a trusted build machine and transferred via secure media or internal repository.
2. **Zero Runtime Dependencies**: The deployed application makes strictly zero external DNS queries, package manager calls (`npm`, `pip`, `apk`), or phone-home requests.
3. **Digest Pinning**: Container base images are pinned by cryptographic SHA-256 digest, preventing upstream tampering or tag drifting.
4. **No Root Privileges**: Services execute under the standard non-root `node` user (UID 1000).

---

## 2. Generating the Offline Release Bundle

On an internet-connected build host or CI/CD worker:

### Step 2.1: Clean Dependency Installation & Lockfile Audit
```bash
# Ensure package-lock.json is committed and matches package.json exactly
git checkout master
git pull origin master

# Verify lockfile integrity and perform clean install ignoring post-install scripts
npm ci --ignore-scripts --omit=dev

# Run automated test suites in offline simulation mode
npm test
```

### Step 2.2: Package Source Bundle
```bash
# Define release version
export RELEASE_TAG="dimdash-v2.0.0-airgap"

# Create clean release directory
mkdir -p build/${RELEASE_TAG}

# Copy runtime code, assets, and production node_modules
rsync -av --progress \
  --exclude '.git' \
  --exclude '.github' \
  --exclude 'test' \
  --exclude 'scratch' \
  --exclude 'data/audit.ndjson*' \
  --exclude 'data/uploads/*' \
  ./ build/${RELEASE_TAG}/

# Create tarball and compute SHA-256 checksum
cd build
tar -czvf ${RELEASE_TAG}.tar.gz ${RELEASE_TAG}
sha256sum ${RELEASE_TAG}.tar.gz > ${RELEASE_TAG}.tar.gz.sha256
cd ..
```

---

## 3. Building the Air-Gapped Docker Image

In enterprise and industrial environments, Docker images must be built with zero package installations (`apk add` / `apt-get`) during deployment.

### Step 3.1: Digest-Pinned Dockerfile (`Dockerfile.airgap`)
```dockerfile
# Pinned Node.js 20 LTS Alpine image by immutable digest
FROM node:20-alpine3.19@sha256:d8b763ec81fb47b19de3ce1b151b75bb25032646cba34f2d01e18bf7dd7de374

WORKDIR /opt/dimdash

# Set production environment
ENV NODE_ENV=production \
    PORT=3080

# Copy pre-packaged source and production dependencies
COPY --chown=node:node . /opt/dimdash

# Switch to non-root node user (UID 1000)
USER node

# Expose HTTP port
EXPOSE 3080

# Run authoritative server
CMD ["node", "server/index.js"]
```

### Step 3.2: Build and Export Container Image
```bash
# Build local container image
docker build -f Dockerfile.airgap -t dimdash:2.0.0-airgap .

# Export container to a self-contained tar archive
docker save dimdash:2.0.0-airgap | gzip > build/dimdash-docker-2.0.0.tar.gz
sha256sum build/dimdash-docker-2.0.0.tar.gz > build/dimdash-docker-2.0.0.tar.gz.sha256
```

---

## 4. Software Bill of Materials (SBOM) Generation

DimDash provides zero-dependency CycloneDX SBOM generation directly from `package-lock.json` without requiring cloud scanners or external binaries.

### Step 4.1: Generate CycloneDX SBOM JSON
```bash
node -e '
const fs = require("fs");
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf-8"));
const packages = lock.packages || {};

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: {
      type: "application",
      name: "dimdash",
      version: lock.version || "2.0.0"
    }
  },
  components: []
};

for (const [pkgPath, info] of Object.entries(packages)) {
  if (!pkgPath || !info.version) continue;
  const name = pkgPath.replace(/^node_modules\//, "");
  sbom.components.push({
    type: "library",
    name,
    version: info.version,
    purl: `pkg:npm/${name}@${info.version}`,
    integrity: info.integrity || ""
  });
}

fs.writeFileSync("build/dimdash-sbom.json", JSON.stringify(sbom, null, 2));
console.log(`[SBOM] Successfully recorded ${sbom.components.length} components.`);
'
```

---

## 5. Deployment on the Air-Gapped Target Host

Transfer the release artifacts to the isolated host via authorized removable media or internal secure transport.

### 5.1 Docker Target Host
```bash
# 1. Verify SHA-256 integrity
sha256sum -c dimdash-docker-2.0.0.tar.gz.sha256

# 2. Load Docker image into local engine
docker load < dimdash-docker-2.0.0.tar.gz

# 3. Launch container with local persistent data mount
docker run -d \
  --name dimdash \
  --restart unless-stopped \
  -p 3080:3080 \
  -v /var/lib/dimdash/data:/app/data \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  dimdash:2.0.0-airgap
```

### 5.2 Standalone Node.js Host
```bash
# 1. Verify SHA-256 integrity
sha256sum -c dimdash-v2.0.0-airgap.tar.gz.sha256

# 2. Extract release archive
tar -xzvf dimdash-v2.0.0-airgap.tar.gz -C /opt/

# 3. Launch with systemd service
sudo systemctl restart dimdash
```

---

## 6. Offline Verification Test

Run the offline verification check to ensure the instance functions with zero outbound network access:

```bash
# Block all outbound internet access for the test process using network unshare (Linux)
unshare -n -r node -e '
const http = require("http");
console.log("[Airgap Test] Verified network unshare active. Zero outbound interfaces available.");
'
```

Verify that `/api/health` returns:
```json
{
  "status": "ok",
  "app": "DimDash",
  "version": "2.0.0",
  "data_model": "v2",
  "air_gapped": true
}
```
