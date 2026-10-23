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

# If docker socket is mounted, configure permissions or preserve root privileges
REMAIN_ROOT=0
if [ "$(id -u)" = "0" ]; then
  if [ "$DIMDASH_RUN_AS_ROOT" = "true" ] || [ "$PUID" = "0" ] || [ "$RUN_AS_ROOT" = "true" ]; then
    REMAIN_ROOT=1
  elif [ -S "/var/run/docker.sock" ]; then
    # Try making socket readable inside namespace if writable
    chmod 666 /var/run/docker.sock 2>/dev/null || true

    # Test if node user can connect to / read socket
    if ! su-exec node test -r "/var/run/docker.sock" 2>/dev/null || ! su-exec node test -w "/var/run/docker.sock" 2>/dev/null; then
      REMAIN_ROOT=1
    fi
  fi
fi

# Drop privileges to node user if root access to docker.sock or host volumes is not required
if [ "$(id -u)" = "0" ] && [ "$REMAIN_ROOT" != "1" ]; then
  exec su-exec node "$@"
fi

exec "$@"

