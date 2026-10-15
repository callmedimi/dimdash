#!/bin/sh
set -e

# If running as root, fix volume permissions and drop privileges to node user
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data/uploads 2>/dev/null || true
  chown -R node:node /app/data 2>/dev/null || true
  chmod -R 775 /app/data 2>/dev/null || true
  exec su-exec node "$@"
fi

exec "$@"
