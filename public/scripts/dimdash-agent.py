#!/usr/bin/env python3
"""
DimDash Remote Node Agent
Lightweight, Zero-Dependency Telemetry Producer for DimDash Dashboard.
Compatible with Python 3.6+, Linux (Debian, Ubuntu, RHEL, CentOS, Alpine, Arch, OpenWrt, etc.)
"""

import os
import sys
import time
import json
import socket
import argparse
import urllib.request
import urllib.error

def get_cpu_info():
    try:
        with open('/proc/stat', 'r') as f:
            line = f.readline()
        fields = [float(x) for x in line.strip().split()[1:]]
        idle = fields[3] + (fields[4] if len(fields) > 4 else 0)
        total = sum(fields)
        return idle, total
    except Exception:
        return 0, 0

def get_cpu_model():
    try:
        with open('/proc/cpuinfo', 'r') as f:
            for line in f:
                if 'model name' in line:
                    return line.split(':')[1].strip()
    except Exception:
        pass
    return 'Generic CPU'

def get_ram_info():
    try:
        mem = {}
        with open('/proc/meminfo', 'r') as f:
            for line in f:
                parts = line.split(':')
                if len(parts) == 2:
                    key = parts[0].strip()
                    val = parts[1].strip().split()[0]
                    mem[key] = float(val)
        total_kb = mem.get('MemTotal', 1)
        avail_kb = mem.get('MemAvailable', mem.get('MemFree', 0) + mem.get('Buffers', 0) + mem.get('Cached', 0))
        used_kb = max(0, total_kb - avail_kb)
        pct = round((used_kb / total_kb) * 100)
        return {
            'totalGb': round(total_kb / 1048576, 1),
            'usedGb': round(used_kb / 1048576, 1),
            'freeGb': round(avail_kb / 1048576, 1),
            'percent': pct
        }
    except Exception:
        return {'totalGb': 0, 'usedGb': 0, 'freeGb': 0, 'percent': 0}

def get_disk_info(path='/'):
    try:
        st = os.statvfs(path)
        total_b = st.f_blocks * st.f_frsize
        free_b = st.f_bavail * st.f_frsize
        used_b = total_b - free_b
        pct = round((used_b / total_b) * 100) if total_b > 0 else 0
        return {
            'totalGb': round(total_b / (1024**3), 1),
            'usedGb': round(used_b / (1024**3), 1),
            'freeGb': round(free_b / (1024**3), 1),
            'percent': pct,
            'mount': path
        }
    except Exception:
        return {'totalGb': 0, 'usedGb': 0, 'freeGb': 0, 'percent': 0, 'mount': path}

def get_net_bytes():
    rx = 0
    tx = 0
    try:
        with open('/proc/net/dev', 'r') as f:
            lines = f.readlines()[2:]
            for line in lines:
                parts = line.split(':')
                if len(parts) == 2:
                    iface = parts[0].strip()
                    if iface == 'lo':
                        continue
                    stats = parts[1].strip().split()
                    rx += int(stats[0])
                    tx += int(stats[8])
    except Exception:
        pass
    return rx, tx

def get_docker_stats():
    try:
        out = os.popen('docker ps -a --format "{{.Status}}" 2>/dev/null').read().strip()
        if not out:
            return {'available': False, 'total': 0, 'running': 0, 'stopped': 0}
        lines = out.split('\n')
        total = len(lines)
        running = sum(1 for line in lines if line.startswith('Up'))
        return {'available': True, 'total': total, 'running': running, 'stopped': total - running}
    except Exception:
        return {'available': False, 'total': 0, 'running': 0, 'stopped': 0}

def get_uptime_str():
    try:
        with open('/proc/uptime', 'r') as f:
            secs = int(float(f.readline().split()[0]))
        d = secs // 86400
        h = (secs % 86400) // 3600
        m = (secs % 3600) // 60
        if d > 0:
            return f"{d}d {h}h {m}m"
        return f"{h}h {m}m"
    except Exception:
        return 'Active'

def main():
    parser = argparse.ArgumentParser(description='DimDash Multi-Cluster Telemetry Agent')
    parser.add_argument('--master', required=True, help='DimDash Master URL (e.g. http://192.168.1.10:3080)')
    parser.add_argument('--server-id', required=True, help='Unique Server ID registered in DimDash (e.g. srv-nas)')
    parser.add_argument('--token', default='', help='Security Token (if configured)')
    parser.add_argument('--interval', type=int, default=2, help='Push interval in seconds (default: 2)')
    args = parser.parse_args()

    master_url = args.master.rstrip('/')
    endpoint = f"{master_url}/api/servers/{args.server_id}/telemetry"
    print(f"[*] DimDash Agent started for server: '{args.server_id}'")
    print(f"[*] Target Endpoint: {endpoint}")
    print(f"[*] Push interval: {args.interval}s")

    cores = os.cpu_count() or 1
    cpu_model = get_cpu_model()
    hostname = socket.gethostname()

    prev_idle, prev_total = get_cpu_info()
    prev_rx, prev_tx = get_net_bytes()
    prev_time = time.time()

    time.sleep(1)

    while True:
        try:
            curr_idle, curr_total = get_cpu_info()
            d_idle = curr_idle - prev_idle
            d_total = curr_total - prev_total
            cpu_pct = 0
            if d_total > 0:
                cpu_pct = max(0, min(100, round((1.0 - (d_idle / d_total)) * 100)))
            prev_idle, prev_total = curr_idle, curr_total

            now_time = time.time()
            dt = max(now_time - prev_time, 0.1)
            curr_rx, curr_tx = get_net_bytes()
            rx_rate_kb = round(max(0, (curr_rx - prev_rx) / 1024) / dt)
            tx_rate_kb = round(max(0, (curr_tx - prev_tx) / 1024) / dt)
            prev_rx, prev_tx = curr_rx, curr_tx
            prev_time = now_time

            load_avg = [0.0, 0.0, 0.0]
            try:
                load_avg = [round(x, 2) for x in os.getloadavg()]
            except Exception:
                pass

            payload = {
                'timestamp': int(now_time * 1000),
                'cpu': {
                    'percent': cpu_pct,
                    'cores': cores,
                    'model': cpu_model,
                    'loadAvg': load_avg
                },
                'ram': get_ram_info(),
                'disk': get_disk_info('/'),
                'net': {
                    'rxRateKb': rx_rate_kb,
                    'txRateKb': tx_rate_kb,
                    'rxTotalMb': round(curr_rx / (1024*1024), 1),
                    'txTotalMb': round(curr_tx / (1024*1024), 1)
                },
                'docker': get_docker_stats(),
                'host': {
                    'hostname': hostname,
                    'platform': 'Linux Node',
                    'release': os.uname().release if hasattr(os, 'uname') else 'Linux',
                    'uptimeStr': get_uptime_str()
                }
            }

            req = urllib.request.Request(
                endpoint,
                data=json.dumps(payload).encode('utf-8'),
                headers={
                    'Content-Type': 'application/json',
                    'User-Agent': 'DimDash-Python-Agent/1.0',
                    'X-Server-Token': args.token
                },
                method='POST'
            )

            with urllib.request.urlopen(req, timeout=4) as response:
                pass

        except urllib.error.HTTPError as e:
            print(f"[!] HTTP Error {e.code}: {e.reason}", file=sys.stderr)
        except Exception as e:
            print(f"[!] Push error: {e}", file=sys.stderr)

        time.sleep(args.interval)

if __name__ == '__main__':
    main()
