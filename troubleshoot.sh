#!/usr/bin/env bash
# NexusPanel Troubleshooting Script
# Diagnoses issues, reports status, and optionally auto-repairs common problems.

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; BLUE='\033[0;34m'; MAGENTA='\033[0;35m'
NC='\033[0m'; BOLD='\033[1m'; DIM='\033[2m'

INSTALL_DIR="/opt/nexuspanel"
ISSUES_FOUND=0
WARNINGS=0
REPAIR=0

if [ "$1" = "--repair" ] || [ "$1" = "-r" ]; then
  REPAIR=1
fi
if [ "$1" = "--yes" ] || [ "$1" = "-y" ]; then
  REPAIR=1
  AUTO_YES=1
fi

banner() {
  echo -e "${CYAN}"
  echo "    ███╗   ██╗███████╗██╗  ██╗"
  echo "    ████╗  ██║██╔════╝╚██╗██╔╝"
  echo "    ██╔██╗ ██║█████╗   ╚███╔╝ "
  echo "    ██║╚██╗██║██╔══╝   ██╔██╗ "
  echo "    ██║ ╚████║███████╗██╔╝ ██╗"
  echo "    ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝"
  echo -e "       ${BOLD}Troubleshooting Tool${NC}"
  echo "============================================================"
  echo ""
}

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
fail() { echo -e "  ${RED}✗${NC} $1"; ISSUES_FOUND=$((ISSUES_FOUND + 1)); }
info() { echo -e "  ${BLUE}ℹ${NC} $1"; }
cmd()  { echo -e "    ${DIM}\$ $1${NC}"; }

ask_repair() {
  local msg="$1"
  local cmd="$2"
  if [ $REPAIR -eq 1 ]; then
    if [ "$AUTO_YES" != "1" ]; then
      echo -ne "  ${MAGENTA}→ ${msg} [y/N]: ${NC}"
      read -r ans
      if [ "$ans" != "y" ] && [ "$ans" != "Y" ]; then
        warn "Skipped: $msg"
        return 1
      fi
    fi
    echo -e "  ${MAGENTA}→ Executing: $cmd${NC}"
    eval "$cmd" 2>&1 || { fail "Repair failed: $cmd"; return 1; }
    ok "Repair applied"
    return 0
  fi
  info "To fix: $cmd"
  return 1
}

banner

if [ "$EUID" -ne 0 ]; then
  fail "Run as root for full diagnostics: sudo bash troubleshoot.sh"
  echo ""
  echo "Continuing with limited checks..."
  echo ""
fi

# ─── 1. SYSTEM INFO ────────────────────────────────────
echo -e "${BOLD}━━━ System Information ━━━${NC}"
if [ -f /etc/os-release ]; then
  . /etc/os-release
  ok "OS: $NAME $VERSION ($ID)"
else
  warn "OS: Unknown (no /etc/os-release)"
fi
ok "Kernel: $(uname -r)"
ok "Architecture: $(uname -m)"
MEM_TOTAL=$(free -m | awk '/^Mem:/{print $2}')
MEM_USED=$(free -m | awk '/^Mem:/{print $3}')
MEM_PCT=$((MEM_USED * 100 / MEM_TOTAL))
if [ "$MEM_PCT" -gt 90 ]; then fail "Memory: ${MEM_USED}M / ${MEM_TOTAL}M (${MEM_PCT}% — CRITICAL)"
elif [ "$MEM_PCT" -gt 75 ]; then warn "Memory: ${MEM_USED}M / ${MEM_TOTAL}M (${MEM_PCT}% — high)"
else ok "Memory: ${MEM_USED}M / ${MEM_TOTAL}M (${MEM_PCT}%)"
fi
DISK_PCT=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
DISK_AVAIL=$(df -h / | tail -1 | awk '{print $4}')
if [ "$DISK_PCT" -gt 90 ]; then fail "Disk: ${DISK_PCT}% used (${DISK_AVAIL} free — CRITICAL)"
elif [ "$DISK_PCT" -gt 80 ]; then warn "Disk: ${DISK_PCT}% used (${DISK_AVAIL} free — low)"
else ok "Disk: ${DISK_PCT}% used (${DISK_AVAIL} free)"
fi
LOAD=$(uptime | awk -F'load average:' '{print $2}' | cut -d',' -f1 | tr -d ' ')
LOAD_PCT=$(awk "BEGIN {printf \"%.0f\", $LOAD * 100 / $(nproc)}")
if [ "$(echo "$LOAD > $(nproc)" | bc -l 2>/dev/null || echo 0)" = "1" ]; then
  warn "CPU Load: $LOAD ($LOAD_PCT% — high for $(nproc) cores)"
else ok "CPU Load: $LOAD ($LOAD_PCT%)"
fi
echo ""

# ─── 2. DEPENDENCIES ───────────────────────────────────
echo -e "${BOLD}━━━ Dependencies ━━━${NC}"
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v)
  ok "Node.js: $NODE_VER"
else fail "Node.js: NOT INSTALLED"; fi
if command -v npm >/dev/null 2>&1; then ok "npm: $(npm -v)"
else fail "npm: NOT INSTALLED"; fi
if command -v git >/dev/null 2>&1; then ok "git: $(git --version | awk '{print $3}')"
else warn "git: NOT INSTALLED"; fi
if command -v nginx >/dev/null 2>&1; then
  NGINX_VER=$(nginx -v 2>&1 | awk '{print $3}' | cut -d'/' -f2)
  ok "nginx: $NGINX_VER"
else warn "nginx: NOT INSTALLED"; fi
if command -v certbot >/dev/null 2>&1; then ok "certbot: $(certbot --version 2>&1 | head -1 | awk '{print $2}')"
else warn "certbot: NOT INSTALLED"; fi
if command -v docker >/dev/null 2>&1; then ok "Docker: $(docker --version | awk '{print $3}' | tr -d ',')"
else info "Docker: not installed (optional)"; fi
if command -v psql >/dev/null 2>&1; then ok "PostgreSQL: $(psql --version | awk '{print $3}')"
else info "PostgreSQL: not installed (optional)"; fi
if command -v clamscan >/dev/null 2>&1; then ok "ClamAV: $(clamscan --version | awk '{print $2}')"
else info "ClamAV: not installed (optional)"; fi
echo ""

# ─── 3. SERVICE STATUS ─────────────────────────────────
echo -e "${BOLD}━━━ Service Status ━━━${NC}"
if systemctl is-active --quiet nexuspanel 2>/dev/null; then
  ok "nexuspanel: RUNNING"
  UPTIME=$(systemctl show nexuspanel --property=ActiveEnterTimestamp 2>/dev/null | cut -d'=' -f2)
  info "  Started: $UPTIME"
else
  if [ -f /etc/systemd/system/nexuspanel.service ]; then
    fail "nexuspanel: STOPPED"
    info "  systemctl start nexuspanel"
    if systemctl is-enabled --quiet nexuspanel 2>/dev/null; then info "  Service is enabled (auto-start on boot)"; fi
    echo ""
    echo -e "  ${DIM}Recent service logs:${NC}"
    journalctl -u nexuspanel -n 5 --no-pager 2>/dev/null | sed 's/^/    /' || true
    echo ""
  else
    fail "nexuspanel: NOT INSTALLED (no systemd service)"
  fi
fi
if systemctl is-active --quiet nginx 2>/dev/null; then ok "nginx: RUNNING"
elif pgrep nginx >/dev/null 2>&1; then warn "nginx: running but not via systemd"
else warn "nginx: STOPPED"; fi
if command -v docker >/dev/null 2>&1; then
  systemctl is-active --quiet docker 2>/dev/null && ok "docker: RUNNING" || warn "docker: STOPPED"
fi
echo ""

# ─── 4. APPLICATION INTEGRITY ──────────────────────────
echo -e "${BOLD}━━━ Application Check ━━━${NC}"
if [ -d "$INSTALL_DIR" ]; then
  ok "Install directory: $INSTALL_DIR exists"
else
  fail "Install directory: $INSTALL_DIR NOT FOUND"
  echo ""
  echo -e "${RED}NexusPanel is not installed. Run:${NC}"
  echo -e "  ${CYAN}bash <(curl -s https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install.sh)${NC}"
  echo ""
  exit 1
fi

if [ -f "$INSTALL_DIR/.env" ]; then
  ok ".env file: exists"
  if grep -q "LICENSE_KEY=your-license-key-here" "$INSTALL_DIR/.env" 2>/dev/null; then
    fail ".env file: LICENSE_KEY not configured (still default)"
  elif ! grep -q "LICENSE_KEY=" "$INSTALL_DIR/.env" 2>/dev/null; then
    fail ".env file: missing LICENSE_KEY"
  else
    KEY=$(grep -oP 'LICENSE_KEY=\K.*' "$INSTALL_DIR/.env" 2>/dev/null || echo "")
    ok ".env file: LICENSE_KEY set (${KEY:0:8}...)"
  fi
  if ! grep -q "JWT_SECRET=" "$INSTALL_DIR/.env" 2>/dev/null; then
    warn ".env: missing JWT_SECRET"
  else
    JWT_LEN=$(grep -oP 'JWT_SECRET=\K.*' "$INSTALL_DIR/.env" 2>/dev/null | wc -c)
    if [ "$JWT_LEN" -lt 16 ]; then warn ".env: JWT_SECRET is too short (min 16 chars)"
    else ok ".env: JWT_SECRET configured"; fi
  fi
  DOMAIN=$(grep -oP 'LICENSE_DOMAIN=\K.*' "$INSTALL_DIR/.env" 2>/dev/null || echo "")
  if [ -n "$DOMAIN" ]; then ok ".env: LICENSE_DOMAIN=$DOMAIN"; fi
  PORT=$(grep -oP '^PORT=\K.*' "$INSTALL_DIR/.env" 2>/dev/null || echo "3443")
  ok ".env: PORT=$PORT"
else
  fail ".env file: MISSING at $INSTALL_DIR/.env"
  ask_repair "Create .env from template?" "cp $INSTALL_DIR/.env.example $INSTALL_DIR/.env && nano $INSTALL_DIR/.env" || true
fi

if [ -d "$INSTALL_DIR/node_modules" ]; then
  MOD_COUNT=$(ls -1 "$INSTALL_DIR/node_modules" 2>/dev/null | wc -l)
  if [ "$MOD_COUNT" -gt 5 ]; then ok "node_modules: $MOD_COUNT packages installed"
  else fail "node_modules: only $MOD_COUNT packages — run npm install"; fi
else
  fail "node_modules: NOT INSTALLED"
  ask_repair "Run npm install?" "cd $INSTALL_DIR && npm install --production" || true
fi

if [ -d "$INSTALL_DIR/data" ]; then
  ok "data/ directory: exists"
  DATA_SIZE=$(du -sh "$INSTALL_DIR/data" 2>/dev/null | cut -f1)
  info "  Size: $DATA_SIZE"
else
  warn "data/ directory: missing"
  ask_repair "Create data directory?" "mkdir -p $INSTALL_DIR/data && chmod 755 $INSTALL_DIR/data" || true
fi
echo ""

# ─── 5. NETWORK & PORTS ────────────────────────────────
echo -e "${BOLD}━━━ Network & Ports ━━━${NC}"
PORT=$(grep -oP '^PORT=\K.*' "$INSTALL_DIR/.env" 2>/dev/null || echo "3443")
if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
  PID=$(ss -tlnp 2>/dev/null | grep ":$PORT " | awk '{print $NF}' | grep -oP 'pid=\K[0-9]+' || echo "?")
  ok "Port $PORT: LISTENING (PID: $PID)"
else
  fail "Port $PORT: NOT LISTENING"
fi
if ss -tlnp 2>/dev/null | grep -q ':80 '; then ok "Port 80: nginx listening"
else info "Port 80: not in use (optional)"; fi
if ss -tlnp 2>/dev/null | grep -q ':443 '; then ok "Port 443: nginx HTTPS"
else info "Port 443: not in use (optional)"; fi

# Firewall
if command -v firewall-cmd >/dev/null 2>&1; then
  if firewall-cmd --list-ports 2>/dev/null | grep -q "$PORT"; then ok "Firewall: port $PORT open"
  else warn "Firewall: port $PORT NOT open"
    cmd "firewall-cmd --add-port=${PORT}/tcp --permanent && firewall-cmd --reload"; fi
  if firewall-cmd --list-services 2>/dev/null | grep -q http; then ok "Firewall: HTTP allowed"
  else warn "Firewall: HTTP NOT allowed"; fi
  if firewall-cmd --list-services 2>/dev/null | grep -q https; then ok "Firewall: HTTPS allowed"
  else warn "Firewall: HTTPS NOT allowed"; fi
elif command -v ufw >/dev/null 2>&1; then
  if ufw status 2>/dev/null | grep -q "$PORT"; then ok "UFW: port $PORT allowed"
  else warn "UFW: port $PORT NOT allowed"; fi
else
  info "Firewall: No firewalld or ufw detected"
fi

# License server connectivity
echo ""
echo -e "  ${DIM}License server connectivity:${NC}"
if curl -sk --connect-timeout 5 https://nxl.xus.me/api/validate >/dev/null 2>&1; then
  ok "nxl.xus.me: REACHABLE"
else
  fail "nxl.xus.me: UNREACHABLE"
  info "  Check DNS, firewall outbound HTTPS, or internet connection"
fi
if [ -n "$DOMAIN" ]; then
  if host "$DOMAIN" >/dev/null 2>&1; then
    IP=$(host "$DOMAIN" 2>/dev/null | grep 'has address' | awk '{print $NF}')
    ok "DNS: $DOMAIN → $IP"
    SERVER_IP=$(curl -4 -s ifconfig.me 2>/dev/null || echo "")
    if [ -n "$SERVER_IP" ] && [ "$IP" = "$SERVER_IP" ]; then ok "DNS: $DOMAIN points to this server"
    elif [ -n "$SERVER_IP" ]; then warn "DNS: $DOMAIN ($IP) ≠ server IP ($SERVER_IP)"; fi
  else
    fail "DNS: $DOMAIN not resolving"
  fi
fi
echo ""

# ─── 6. NGINX CONFIG ───────────────────────────────────
echo -e "${BOLD}━━━ Nginx Configuration ━━━${NC}"
if [ -f /etc/nginx/conf.d/nexuspanel.conf ]; then
  ok "nginx config: /etc/nginx/conf.d/nexuspanel.conf exists"
  if nginx -t 2>/dev/null; then ok "nginx syntax: VALID"
  else fail "nginx syntax: INVALID — check config"; fi
else
  warn "nginx config: not found (accessing via direct port only)"
fi

NGINX_ERRS=$(grep -c "nexuspanel\|nexus" /var/log/nginx/error.log 2>/dev/null || echo 0)
if [ "$NGINX_ERRS" -gt 10 ]; then
  warn "nginx errors: $NGINX_ERRS recent errors in log"
  echo -e "  ${DIM}Last 3 nginx errors:${NC}"
  grep "nexuspanel\|nexus" /var/log/nginx/error.log 2>/dev/null | tail -3 | sed 's/^/    /' || true
fi
echo ""

# ─── 7. LOG ANALYSIS ───────────────────────────────────
echo -e "${BOLD}━━━ Recent Logs ━━━${NC}"
if journalctl -u nexuspanel --no-pager -n 10 2>/dev/null | grep -qi "error\|fail\|crash\|cannot\|unable"; then
  warn "nexuspanel: recent errors in journal"
  echo -e "  ${DIM}Last 5 lines:${NC}"
  journalctl -u nexuspanel --no-pager -n 5 2>/dev/null | sed 's/^/    /'
else
  ok "nexuspanel: no recent errors in journal"
fi
echo ""

# ─── 8. QUICK REPAIR ───────────────────────────────────
if [ $REPAIR -eq 1 ]; then
  echo -e "${BOLD}━━━ Auto Repair ━━━${NC}"
  echo ""

  if ! systemctl is-active --quiet nexuspanel 2>/dev/null; then
    echo -e "${MAGENTA}→ Restarting nexuspanel...${NC}"
    systemctl daemon-reload 2>/dev/null || true
    systemctl restart nexuspanel 2>/dev/null && ok "nexuspanel restarted" || fail "Failed to restart nexuspanel"
    echo ""
  fi

  if ! ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
    echo -e "${MAGENTA}→ Port $PORT not listening. Checking logs...${NC}"
    journalctl -u nexuspanel -n 20 --no-pager 2>/dev/null | tail -10
  fi

  if [ ! -d "$INSTALL_DIR/node_modules" ] || [ "$(ls -1 "$INSTALL_DIR/node_modules" 2>/dev/null | wc -l)" -lt 5 ]; then
    echo -e "${MAGENTA}→ Installing npm dependencies...${NC}"
    cd "$INSTALL_DIR" && npm install --production 2>&1 | tail -3
    systemctl restart nexuspanel 2>/dev/null || true
    echo ""
  fi

  if command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --add-service=http --permanent 2>/dev/null || true
    firewall-cmd --add-service=https --permanent 2>/dev/null || true
    firewall-cmd --add-port=${PORT}/tcp --permanent 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
    ok "Firewall rules updated"
    echo ""
  fi
fi

# ─── SUMMARY ───────────────────────────────────────────
echo "============================================================"
if [ $ISSUES_FOUND -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo -e "${GREEN}${BOLD}  ✓ All checks passed — NexusPanel is healthy${NC}"
elif [ $ISSUES_FOUND -eq 0 ]; then
  echo -e "${YELLOW}${BOLD}  ⚠ $WARNINGS warning(s) — minor issues detected${NC}"
else
  echo -e "${RED}${BOLD}  ✗ $ISSUES_FOUND issue(s), $WARNINGS warning(s) — action required${NC}"
fi
echo "============================================================"
echo ""
if [ $REPAIR -eq 0 ]; then
  echo -e "  ${DIM}Run with:${NC}"
  echo -e "  ${CYAN}  sudo bash troubleshoot.sh --repair${NC}  ${DIM}to auto-fix issues${NC}"
  echo -e "  ${CYAN}  sudo bash troubleshoot.sh --yes${NC}     ${DIM}to auto-fix without prompts${NC}"
else
  echo -e "  ${DIM}Run without flags for diagnostics only.${NC}"
fi
echo ""
