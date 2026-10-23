#!/bin/sh
set -e

# Auto-seed defaults and fix permissions on mounted volume
if [ -d "/app/data" ]; then
  mkdir -p /app/data/uploads 2>/dev/null || true

  # Auto-seed default config.yaml if volume is empty
  if [ ! -f "/app/data/config.yaml" ] && [ -f "/app/defaults/config.yaml" ]; then
    cp /app/defaults/config.yaml /app/data/config.yaml 2>/dev/null || true
  fi

  # Auto-seed heimdall_apps.json catalog if not present in mounted volume
  if [ ! -f "/app/data/heimdall_apps.json" ] && [ -f "/app/defaults/heimdall_apps.json" ]; then
    cp /app/defaults/heimdall_apps.json /app/data/heimdall_apps.json 2>/dev/null || true
  fi

  # Auto-fix permissions so node user (UID 1000) can read and write
  if [ "$(id -u)" = "0" ]; then
    chown -R node:node /app/data 2>/dev/null || true
    chmod -R 775 /app/data 2>/dev/null || true
  fi
fi

# If docker socket is mounted, ensure node user has access to read container telemetry
if [ -S "/var/run/docker.sock" ]; then
  DOCKER_GID=$(stat -c '%g' /var/run/docker.sock 2>/dev/null || stat -f '%g' /var/run/docker.sock 2>/dev/null || true)
  if [ -n "$DOCKER_GID" ] && [ "$DOCKER_GID" != "0" ]; then
    getent group "$DOCKER_GID" >/dev/null 2>&1 || addgroup -g "$DOCKER_GID" docker_host 2>/dev/null || true
    DOCKER_GRP_NAME=$(getent group "$DOCKER_GID" | cut -d: -f1)
    if [ -n "$DOCKER_GRP_NAME" ]; then
      adduser node "$DOCKER_GRP_NAME" 2>/dev/null || addgroup node "$DOCKER_GRP_NAME" 2>/dev/null || true
    fi
  else
    # Socket owned by root group
    adduser node root 2>/dev/null || true
  fi
  # Ensure socket permissions permit read access inside container namespace
  chmod 666 /var/run/docker.sock 2>/dev/null || true
fi

# If running as root, drop privileges to node user
if [ "$(id -u)" = "0" ]; then
  exec su-exec node "$@"
fi

exec "$@"
