#!/usr/bin/env bash
# NexusPanel Health Check — monitors and alerts on service health
# Designed to run via cron: */5 * * * * /opt/nexuspanel/health.sh

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
MAGENTA='\033[0;35m'; NC='\033[0m'; BOLD='\033[1m'

INSTALL_DIR="/opt/nexuspanel"
HEALTH_LOG="/var/log/nexuspanel-health.log"
ALERT_EMAIL=""
CRITICAL=0
WARNINGS=0

# Load email from .env if available
if [ -f "$INSTALL_DIR/.env" ]; then
  ALERT_EMAIL=$(grep -oP 'ADMIN_EMAIL=\K.*' "$INSTALL_DIR/.env" 2>/dev/null || echo "")
  PORT=$(grep -oP '^PORT=\K.*' "$INSTALL_DIR/.env" 2>/dev/null || echo "3443")
fi

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

log() {
  local level="$1"; shift
  echo "[$TIMESTAMP] [$level] $*" | tee -a "$HEALTH_LOG"
}

alert() {
  local msg="$1"
  log "CRITICAL" "$msg"
  CRITICAL=$((CRITICAL + 1))
  if [ -n "$ALERT_EMAIL" ] && command -v mail >/dev/null 2>&1; then
    echo "$msg" | mail -s "[NexusPanel ALERT] $(hostname)" "$ALERT_EMAIL" 2>/dev/null || true
  fi
}

compare_version() {
  # Returns true if $1 >= $2 (version comparison)
  printf '%s\n' "$2" "$1" | sort -V | head -1 | grep -q "^$2$" 2>/dev/null
}

# ─── Health Checks ──────────────────────────────────────

# 1. Service running
if systemctl is-active --quiet nexuspanel 2>/dev/null; then
  log "OK" "nexuspanel service is running"
else
  alert "nexuspanel service is STOPPED"
  if [ -f /etc/systemd/system/nexuspanel.service ]; then
    log "INFO" "Attempting restart..."
    systemctl restart nexuspanel 2>/dev/null && log "OK" "Auto-restart succeeded" || log "ERROR" "Auto-restart failed"
  fi
fi

# 2. Port listening
if ! ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
  alert "Port $PORT is NOT listening — panel unreachable"
fi

# 3. Memory threshold
MEM_PCT=$(free | awk '/^Mem:/{printf "%.0f",$3/$2*100}')
if [ "$MEM_PCT" -gt 95 ]; then
  alert "Memory critical: ${MEM_PCT}% — restarting service"
  systemctl restart nexuspanel 2>/dev/null || true
elif [ "$MEM_PCT" -gt 85 ]; then
  log "WARN" "Memory high: ${MEM_PCT}%"
  WARNINGS=$((WARNINGS + 1))
else
  log "OK" "Memory: ${MEM_PCT}%"
fi

# 4. Disk threshold
DISK_PCT=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$DISK_PCT" -gt 95 ]; then
  alert "Disk critical: ${DISK_PCT}% — cleanup required"
elif [ "$DISK_PCT" -gt 85 ]; then
  log "WARN" "Disk high: ${DISK_PCT}%"
  WARNINGS=$((WARNINGS + 1))
fi

# 5. License server reachable
if ! curl -sk --connect-timeout 10 https://nxl.xus.me/api/validate -o /dev/null 2>/dev/null; then
  log "WARN" "License server unreachable — 24h grace period active"
  WARNINGS=$((WARNINGS + 1))
fi

# 6. nginx running
if command -v nginx >/dev/null 2>&1; then
  if ! pgrep nginx >/dev/null 2>&1; then
    log "WARN" "nginx is not running"
    systemctl restart nginx 2>/dev/null || true
    WARNINGS=$((WARNINGS + 1))
  fi
fi

# 7. Process memory check (auto-restart if node leaks >1GB)
NODE_MEM=$(ps aux 2>/dev/null | grep 'node.*server.js' | grep -v grep | awk '{print $6}' | head -1)
if [ -n "$NODE_MEM" ] && [ "$NODE_MEM" -gt 1048576 ]; then
  log "WARN" "Node.js process using ${NODE_MEM}KB — possible memory leak"
  WARNINGS=$((WARNINGS + 1))
fi

# 8. Log file size management
HEALTH_SIZE=$(stat -c%s "$HEALTH_LOG" 2>/dev/null || echo 0)
if [ "$HEALTH_SIZE" -gt 1048576 ]; then
  tail -n 500 "$HEALTH_LOG" > "${HEALTH_LOG}.tmp" && mv "${HEALTH_LOG}.tmp" "$HEALTH_LOG"
  log "INFO" "Health log rotated (>1MB)"
fi

# 9. Log rotation for journal
JOURNAL_SIZE=$(journalctl --disk-usage 2>/dev/null | awk '{print $NF}' | tr -d 'M' || echo 0)
if [ "${JOURNAL_SIZE:-0}" -gt 500 ]; then
  log "INFO" "Journal size ${JOURNAL_SIZE}M — vacuuming to 200M"
  journalctl --vacuum-size=200M 2>/dev/null || true
fi

# ─── Summary ───────────────────────────────────────────
if [ $CRITICAL -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  log "OK" "All systems healthy"
elif [ $CRITICAL -eq 0 ]; then
  log "WARN" "$WARNINGS warning(s) — review above"
else
  log "CRITICAL" "$CRITICAL critical, $WARNINGS warnings — immediate action required"
fi

exit $CRITICAL
