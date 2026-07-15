#!/usr/bin/env bash
# NexusPanel Error Checklist — common issues and their solutions
set -e

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
MAGENTA='\033[0;35m'; NC='\033[0m'; BOLD='\033[1m'; DIM='\033[2m'

INSTALL_DIR="/opt/nexuspanel"

echo -e "${CYAN}${BOLD}"
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║     NexusPanel — Error Checklist            ║"
echo "  ╚══════════════════════════════════════════════╝"
echo -e "${NC}"
echo "  Diagnosing common issues on $(hostname)..."
echo ""

# Auto-detect which errors apply
check() {
  local desc="$1"; shift
  local check_cmd="$1"; shift
  local fix="$*"

  if eval "$check_cmd" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} ${desc} ${DIM}— OK${NC}"
  else
    echo -e "  ${RED}✗${NC} ${desc}"
    if [ -n "$fix" ]; then
      echo -e "    ${YELLOW}Fix:${NC} ${fix}"
    fi
    echo ""
    ISSUES=$((ISSUES + 1))
  fi
}

ISSUES=0

echo -e "${BOLD}━━━ Connection Errors ━━━${NC}"
echo ""
check "Port is listening" \
  "ss -tlnp 2>/dev/null | grep -q ':'$(grep -oP '^PORT=\K.*' $INSTALL_DIR/.env 2>/dev/null || echo 3443)" \
  "systemctl restart nexuspanel && systemctl status nexuspanel"

check "nginx is running" \
  "systemctl is-active --quiet nginx 2>/dev/null || pgrep nginx >/dev/null" \
  "systemctl restart nginx"

check "nginx config is valid" \
  "nginx -t 2>/dev/null" \
  "Check /etc/nginx/conf.d/nexuspanel.conf — run: nano /etc/nginx/conf.d/nexuspanel.conf"

check "Firewall allows HTTP/HTTPS" \
  "firewall-cmd --list-services 2>/dev/null | grep -qE 'http|https' || ufw status 2>/dev/null | grep -q '80\|443' || true" \
  "firewall-cmd --add-service=http --add-service=https --permanent && firewall-cmd --reload"

check "Server can reach license server" \
  "curl -sk --connect-timeout 5 https://nxl.xus.me/api/validate >/dev/null 2>&1" \
  "Check internet connectivity and outbound HTTPS firewall rules"

check "Domain DNS resolves to this server" \
  "[ -z \"\$(grep -oP 'LICENSE_DOMAIN=\K.*' $INSTALL_DIR/.env 2>/dev/null)\" ] || host \$(grep -oP 'LICENSE_DOMAIN=\K.*' $INSTALL_DIR/.env 2>/dev/null) >/dev/null 2>&1" \
  "Check DNS records for your domain: host <your-domain>"

echo ""
echo -e "${BOLD}━━━ Application Errors ━━━${NC}"
echo ""

check "Node.js is installed (v18+)" \
  "node -v 2>/dev/null | grep -q 'v1[89]\|v2[0-9]'" \
  "curl -fsSL https://deb.nodesource.com/setup_20.x | bash && apt install -y nodejs (Debian) || dnf module enable nodejs:20 -y && dnf install -y nodejs (RHEL)"

check "npm dependencies installed" \
  "[ -d $INSTALL_DIR/node_modules ] && [ \$(ls -1 $INSTALL_DIR/node_modules 2>/dev/null | wc -l) -gt 5 ]" \
  "cd $INSTALL_DIR && npm install --production"

check ".env file is configured" \
  "[ -f $INSTALL_DIR/.env ] && grep -q 'LICENSE_KEY=' $INSTALL_DIR/.env && ! grep -q 'your-license-key' $INSTALL_DIR/.env" \
  "nano $INSTALL_DIR/.env — set LICENSE_KEY, JWT_SECRET, and ADMIN_PASS"

check "data/ directory is writable" \
  "[ -d $INSTALL_DIR/data ] && [ -w $INSTALL_DIR/data ]" \
  "mkdir -p $INSTALL_DIR/data && chmod 755 $INSTALL_DIR/data"

check "systemd service is enabled" \
  "[ -f /etc/systemd/system/nexuspanel.service ]" \
  "Reinstall NexusPanel or run: cp /path/to/nexuspanel.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable nexuspanel"

echo ""
echo -e "${BOLD}━━━ Performance Issues ━━━${NC}"
echo ""

MEM_PCT=$(free | awk '/^Mem:/{printf "%.0f",$3/$2*100}')
check "Memory usage is below 90%" \
  "[ $MEM_PCT -lt 90 ]" \
  "Free up memory: systemctl restart nexuspanel, check for memory leaks, upgrade RAM"

DISK_PCT=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
check "Disk usage is below 90%" \
  "[ $DISK_PCT -lt 90 ]" \
  "Clean up: journalctl --vacuum-size=200M, rm -rf /var/log/*.gz, docker system prune -a"

check "Node process is not using excessive memory" \
  "[ -z \"\$(ps aux | grep 'node.*server.js' | grep -v grep | awk '{if(\$6>1048576) print \$6}')\" ]" \
  "Restart service: systemctl restart nexuspanel"

echo ""
echo -e "${BOLD}━━━ License & Authentication ━━━${NC}"
echo ""

LICENSE_KEY=$(grep -oP 'LICENSE_KEY=\K.*' $INSTALL_DIR/.env 2>/dev/null || echo "")
if [ -n "$LICENSE_KEY" ]; then
  check "License key is valid" \
    "curl -sk https://nxl.xus.me/api/validate -H 'Content-Type: application/json' -d '{\"key\":\"$LICENSE_KEY\"}' 2>/dev/null | grep -q '\"valid\":true'" \
    "Verify your license at https://nxp.xus.me or contact support"
else
  echo -e "  ${YELLOW}⚠${NC} LICENSE_KEY not found in .env — cannot validate"
fi

check "JWT_SECRET is configured" \
  "grep -q 'JWT_SECRET=' $INSTALL_DIR/.env 2>/dev/null && ! grep -q 'change-me' $INSTALL_DIR/.env 2>/dev/null && [ \$(grep -oP 'JWT_SECRET=\K.*' $INSTALL_DIR/.env 2>/dev/null | wc -c) -gt 8 ]" \
  "Set JWT_SECRET in $INSTALL_DIR/.env: openssl rand -hex 32"

echo ""
echo -e "${BOLD}━━━ Recent Errors in Logs ━━━${NC}"
echo ""

ERRORS=$(journalctl -u nexuspanel --no-pager -n 50 2>/dev/null | grep -ci "error\|fail\|cannot\|unable\|refused\|timeout" || echo 0)
if [ "$ERRORS" -gt 0 ]; then
  echo -e "  ${RED}✗${NC} ${ERRORS} recent errors/warnings in service logs:"
  journalctl -u nexuspanel --no-pager -n 50 2>/dev/null | grep -i "error\|fail\|cannot\|unable\|refused\|timeout" | tail -5 | sed 's/^/    /'
else
  echo -e "  ${GREEN}✓${NC} No recent errors in service logs"
fi

echo ""
echo "============================================================"
if [ $ISSUES -eq 0 ]; then
  echo -e "${GREEN}${BOLD}  ✓ All checks passed — no issues detected${NC}"
else
  echo -e "${RED}${BOLD}  ✗ ${ISSUES} issue(s) found — review fixes above${NC}"
fi
echo "============================================================"
echo ""
echo -e "  ${DIM}For interactive diagnosis: sudo bash troubleshoot.sh${NC}"
echo -e "  ${DIM}For auto-repair:            sudo bash troubleshoot.sh --repair${NC}"
echo -e "  ${DIM}For live logs:              sudo bash logs.sh -f${NC}"
echo ""
