#!/bin/bash
# DimDash Pure-Bash Cluster Agent
# Usage: ./dimdash-agent.sh --master http://192.168.1.10:3080 --server-id srv-nas [--token my-token] [--interval 2]

MASTER_URL=""
SERVER_ID=""
TOKEN=""
INTERVAL=2

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --master) MASTER_URL="$2"; shift ;;
    --server-id) SERVER_ID="$2"; shift ;;
    --token) TOKEN="$2"; shift ;;
    --interval) INTERVAL="$2"; shift ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
  shift
done

if [ -z "$MASTER_URL" ] || [ -z "$SERVER_ID" ]; then
  echo "Usage: $0 --master <http://master-ip:3080> --server-id <node-id> [--token <token>]"
  exit 1
fi

ENDPOINT="${MASTER_URL%/}/api/servers/${SERVER_ID}/telemetry"
echo "[*] DimDash Bash Agent running for server: $SERVER_ID"
echo "[*] Endpoint: $ENDPOINT"

CORES=$(nproc 2>/dev/null || echo 1)
HOSTNAME=$(hostname 2>/dev/null || echo "Node")

while true; do
  # CPU Percentage calculation from /proc/stat
  read -r _ c_user c_nice c_sys c_idle c_iowait c_irq c_softirq _ < /proc/stat
  idle1=$((c_idle + c_iowait))
  total1=$((c_user + c_nice + c_sys + c_idle + c_iowait + c_irq + c_softirq))
  
  sleep 1
  
  read -r _ c_user c_nice c_sys c_idle c_iowait c_irq c_softirq _ < /proc/stat
  idle2=$((c_idle + c_iowait))
  total2=$((c_user + c_nice + c_sys + c_idle + c_iowait + c_irq + c_softirq))
  
  d_idle=$((idle2 - idle1))
  d_total=$((total2 - total1))
  CPU_PCT=0
  if [ "$d_total" -gt 0 ]; then
    CPU_PCT=$(( (100 * (d_total - d_idle)) / d_total ))
  fi

  # RAM
  RAM_TOTAL_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
  RAM_AVAIL_KB=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
  if [ -z "$RAM_AVAIL_KB" ]; then
    RAM_FREE=$(grep MemFree /proc/meminfo | awk '{print $2}')
    RAM_BUFF=$(grep Buffers /proc/meminfo | awk '{print $2}')
    RAM_CACHE=$(grep ^Cached /proc/meminfo | awk '{print $2}')
    RAM_AVAIL_KB=$((RAM_FREE + RAM_BUFF + RAM_CACHE))
  fi
  RAM_USED_KB=$((RAM_TOTAL_KB - RAM_AVAIL_KB))
  RAM_PCT=$(( (RAM_USED_KB * 100) / RAM_TOTAL_KB ))
  RAM_TOTAL_GB=$(awk "BEGIN {printf \"%.1f\", $RAM_TOTAL_KB/1048576}")
  RAM_USED_GB=$(awk "BEGIN {printf \"%.1f\", $RAM_USED_KB/1048576}")
  RAM_FREE_GB=$(awk "BEGIN {printf \"%.1f\", $RAM_AVAIL_KB/1048576}")

  # Disk
  DISK_LINE=$(df -k / | tail -1)
  DISK_TOTAL_KB=$(echo "$DISK_LINE" | awk '{print $2}')
  DISK_USED_KB=$(echo "$DISK_LINE" | awk '{print $3}')
  DISK_AVAIL_KB=$(echo "$DISK_LINE" | awk '{print $4}')
  DISK_PCT=$(echo "$DISK_LINE" | awk '{print $5}' | tr -d '%')
  DISK_TOTAL_GB=$(awk "BEGIN {printf \"%.1f\", $DISK_TOTAL_KB/1048576}")
  DISK_USED_GB=$(awk "BEGIN {printf \"%.1f\", $DISK_USED_KB/1048576}")
  DISK_FREE_GB=$(awk "BEGIN {printf \"%.1f\", $DISK_AVAIL_KB/1048576}")

  # Uptime
  UPTIME_SECS=$(awk '{print int($1)}' /proc/uptime)
  UP_D=$((UPTIME_SECS / 86400))
  UP_H=$(( (UPTIME_SECS % 86400) / 3600 ))
  UP_M=$(( (UPTIME_SECS % 3600) / 60 ))
  UPTIME_STR="${UP_D}d ${UP_H}h ${UP_M}m"

  # Docker stats if available
  DOCKER_TOTAL=0
  DOCKER_RUNNING=0
  DOCKER_AVAIL=false
  if command -v docker &> /dev/null; then
    DOCKER_AVAIL=true
    DOCKER_TOTAL=$(docker ps -a -q 2>/dev/null | wc -l)
    DOCKER_RUNNING=$(docker ps -q 2>/dev/null | wc -l)
  fi
  DOCKER_STOPPED=$((DOCKER_TOTAL - DOCKER_RUNNING))

  # Build JSON payload
  PAYLOAD=$(cat <<EOF
{
  "timestamp": $(date +%s%3N),
  "cpu": {
    "percent": $CPU_PCT,
    "cores": $CORES,
    "model": "Linux CPU",
    "loadAvg": [$(awk '{print $1", "$2", "$3}' /proc/loadavg)]
  },
  "ram": {
    "totalGb": $RAM_TOTAL_GB,
    "usedGb": $RAM_USED_GB,
    "freeGb": $RAM_FREE_GB,
    "percent": $RAM_PCT
  },
  "disk": {
    "totalGb": $DISK_TOTAL_GB,
    "usedGb": $DISK_USED_GB,
    "freeGb": $DISK_FREE_GB,
    "percent": $DISK_PCT,
    "mount": "/"
  },
  "docker": {
    "available": $DOCKER_AVAIL,
    "total": $DOCKER_TOTAL,
    "running": $DOCKER_RUNNING,
    "stopped": $DOCKER_STOPPED
  },
  "host": {
    "hostname": "$HOSTNAME",
    "platform": "Linux Cluster Node",
    "release": "$(uname -r 2>/dev/null || echo 'Linux')",
    "uptimeStr": "$UPTIME_STR"
  }
}
EOF
)

  curl -s -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "X-Server-Token: $TOKEN" \
    -d "$PAYLOAD" > /dev/null

  sleep "$INTERVAL"
done
