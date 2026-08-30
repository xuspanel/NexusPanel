#!/usr/bin/env bash
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'; BOLD='\033[1m'

PORT=3443
INSTALL_DIR="/opt/nexuspanel"
PIDFILE="/var/run/nexuspanel.pid"
LOGFILE="/var/log/nexuspanel.log"

echo -e "${CYAN}"
echo "    ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗"
echo "    ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝"
echo "    ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗"
echo "    ██║╚██╗██║██╔══╝   ╚███╔╝ ██║   ██║╚════██║"
echo "    ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║"
echo "    ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝"
echo -e "         ${BOLD}NexusPanel — Updater${NC}"
echo ""
echo "============================================================"

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root: sudo bash update.sh${NC}"
  exit 1
fi

if [ ! -d "$INSTALL_DIR" ]; then
  echo -e "${RED}NexusPanel is not installed at $INSTALL_DIR${NC}"
  exit 1
fi

echo -e "${BOLD}Updating NexusPanel...${NC}"
echo ""

# ─── [1/4] Pull latest code ───
echo -e "${CYAN}[1/4] Pulling latest code...${NC}"
cd "$INSTALL_DIR"
CURRENT=$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')

if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  git stash 2>/dev/null || true
fi

git pull origin main 2>&1 || {
  echo -e "${YELLOW}⚠ Git pull failed. Trying force reset...${NC}"
  git fetch origin main 2>/dev/null
  git reset --hard origin/main 2>/dev/null || {
    echo -e "${RED}✗ Update failed. Could not fetch from GitHub.${NC}"
    exit 1
  }
}
NEW=$(git rev-parse --short HEAD 2>/dev/null || echo 'updated')
echo -e "${GREEN}✓ Code updated: ${CURRENT} → ${NEW}${NC}"

# ─── [2/4] Install dependencies ───
echo ""
echo -e "${CYAN}[2/4] Installing dependencies...${NC}"
npm install --production 2>&1 | tail -3
echo -e "${GREEN}✓ Dependencies installed${NC}"

# ─── [3/4] Restart service ───
echo ""
echo -e "${CYAN}[3/4] Restarting service...${NC}"

# Reload systemd unit configurations
systemctl daemon-reload 2>/dev/null || true

# Restart Root Daemon if service exists
if systemctl list-unit-files --type=service --no-legend 2>/dev/null | grep -q 'nexuspanel-daemon'; then
  systemctl restart nexuspanel-daemon 2>/dev/null || systemctl start nexuspanel-daemon 2>/dev/null || true
  if systemctl is-active --quiet nexuspanel-daemon 2>/dev/null; then
    echo -e "${GREEN}✓ Root Daemon is running (systemd: nexuspanel-daemon)${NC}"
  fi
fi

# Auto-detect main systemd service name
SVC=""
if systemctl is-enabled --quiet nexuspanel 2>/dev/null; then
  SVC="nexuspanel"
else
  SVC=$(systemctl list-unit-files --type=service --no-legend 2>/dev/null | grep -oE 'nexuspanel[a-z_-]*' | grep -v 'daemon' | head -1)
fi

if [ -n "$SVC" ]; then
  echo -e "  Detected service: ${BOLD}${SVC}${NC}"
  systemctl restart "$SVC" 2>/dev/null || {
    echo -e "${YELLOW}⚠ systemctl restart failed. Trying stop + start...${NC}"
    systemctl stop "$SVC" 2>/dev/null || true
    sleep 2
    systemctl start "$SVC" 2>/dev/null || true
  }
  sleep 2
  if systemctl is-active --quiet "$SVC" 2>/dev/null; then
    echo -e "${GREEN}✓ Service is running (systemd: ${SVC})${NC}"
  else
    echo -e "${RED}✗ Service failed to start via systemd.${NC}"
    echo -e "  Check logs: journalctl -u ${SVC} -n 20"
    exit 1
  fi
else
  echo -e "${YELLOW}⚠ No systemd service found. Starting directly...${NC}"

  # Kill existing process on port
  fuser -k "${PORT}/tcp" 2>/dev/null || true
  # Kill old PID-tracked process
  if [ -f "$PIDFILE" ]; then
    OLD_PID=$(cat "$PIDFILE" 2>/dev/null)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
      kill "$OLD_PID" 2>/dev/null || true
      sleep 2
    fi
    rm -f "$PIDFILE"
  fi

  # Wait for port to free up
  for i in $(seq 1 10); do
    if ! ss -tlnp 2>/dev/null | grep -q ":${PORT}"; then break; fi
    sleep 1
  done

  # Start with nohup + PID file + log file
  cd "$INSTALL_DIR"
  nohup /usr/bin/node server.js >> "$LOGFILE" 2>&1 &
  echo $! > "$PIDFILE"
  sleep 3

  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo -e "${GREEN}✓ Service is running (PID: $(cat "$PIDFILE"), log: ${LOGFILE})${NC}"
  elif ss -tlnp 2>/dev/null | grep -q ":${PORT}"; then
    echo -e "${GREEN}✓ Service is running on port ${PORT}${NC}"
  else
    echo -e "${RED}✗ Service failed to start. Check log:${NC}"
    echo -e "  tail -50 ${LOGFILE}"
    exit 1
  fi
fi

# ─── [4/4] Clean up ───
echo ""
echo -e "${CYAN}[4/4] Cleaning up...${NC}"
npm cache clean --force 2>/dev/null || true
echo -e "${GREEN}✓ Cleanup complete${NC}"

echo ""
echo "============================================================"
echo -e "${GREEN}${BOLD}  ✓ NexusPanel updated successfully!${NC}"
echo "============================================================"
echo ""
if [ -n "$SVC" ]; then
  echo -e "  ${BOLD}Version:${NC}  ${NEW}"
  echo -e "  ${BOLD}Service:${NC}  systemctl status ${SVC}"
  echo -e "  ${BOLD}Logs:${NC}     journalctl -u ${SVC} -f"
else
  echo -e "  ${BOLD}Version:${NC}  ${NEW}"
  echo -e "  ${BOLD}PID:${NC}      $(cat "$PIDFILE" 2>/dev/null || echo 'unknown')"
  echo -e "  ${BOLD}Log:${NC}      tail -f ${LOGFILE}"
fi
echo ""
