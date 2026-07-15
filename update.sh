#!/usr/bin/env bash
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'; BOLD='\033[1m'

echo -e "${CYAN}"
echo "    ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗"
echo "    ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝"
echo "    ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗"
echo "    ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║"
echo "    ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║"
echo "    ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝"
echo -e "         ${BOLD}NexusPanel — Updater${NC}"
echo ""
echo "============================================================"

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root: sudo bash update.sh${NC}"
  exit 1
fi

INSTALL_DIR="/opt/nexuspanel"

if [ ! -d "$INSTALL_DIR" ]; then
  echo -e "${RED}NexusPanel is not installed at $INSTALL_DIR${NC}"
  exit 1
fi

echo -e "${BOLD}Updating NexusPanel...${NC}"
echo ""

echo -e "${CYAN}[1/4] Pulling latest code...${NC}"
cd "$INSTALL_DIR"
CURRENT=$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')
git stash 2>/dev/null || true
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

echo ""
echo -e "${CYAN}[2/4] Installing dependencies...${NC}"
npm install --production 2>&1 | tail -3
echo -e "${GREEN}✓ Dependencies installed${NC}"

echo ""
echo -e "${CYAN}[3/4] Restarting service...${NC}"
systemctl restart nexuspanel 2>/dev/null || {
  echo -e "${YELLOW}⚠ systemd service not found. Trying direct restart...${NC}"
  fuser -k 3443/tcp 2>/dev/null || true
  node server.js &
}
sleep 2

if systemctl is-active --quiet nexuspanel 2>/dev/null || ss -tlnp 2>/dev/null | grep -q ':3443'; then
  echo -e "${GREEN}✓ Service is running${NC}"
else
  echo -e "${RED}✗ Service failed to start. Check logs:${NC}"
  echo -e "  journalctl -u nexuspanel -n 20"
  exit 1
fi

echo ""
echo -e "${CYAN}[4/4] Cleaning up...${NC}"
npm cache clean --force 2>/dev/null || true
echo -e "${GREEN}✓ Cleanup complete${NC}"

echo ""
echo "============================================================"
echo -e "${GREEN}${BOLD}  ✓ NexusPanel updated successfully!${NC}"
echo "============================================================"
echo ""
echo -e "  ${BOLD}Version:${NC}  ${NEW}"
echo -e "  ${BOLD}Service:${NC} systemctl status nexuspanel"
echo -e "  ${BOLD}Logs:${NC}    journalctl -u nexuspanel -f"
echo ""
