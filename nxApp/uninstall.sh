#!/usr/bin/env bash
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'; BOLD='\033[1m'

echo -e "${RED}"
echo "    ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗"
echo "    ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝"
echo "    ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗"
echo "    ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║"
echo "    ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║"
echo "    ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝"
echo -e "         ${BOLD}NexusPanel — Uninstaller${NC}"
echo ""
echo "============================================================"
echo -e "${RED}${BOLD}  ⚠ WARNING: This will completely remove NexusPanel!${NC}"
echo -e "${RED}  All data, configurations, and files will be deleted.${NC}"
echo "============================================================"
echo ""

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root: sudo bash uninstall.sh${NC}"
  exit 1
fi

INSTALL_DIR="/opt/nexuspanel"
DOMAIN=""
PORT="3443"

# Try to read domain and port from .env if it exists
if [ -f "$INSTALL_DIR/.env" ]; then
  DOMAIN=$(grep -oP 'LICENSE_DOMAIN=\K.*' "$INSTALL_DIR/.env" 2>/dev/null || true)
  PORT=$(grep -oP '^PORT=\K.*' "$INSTALL_DIR/.env" 2>/dev/null || echo "3443")
fi

echo -e "  ${BOLD}Install directory:${NC} $INSTALL_DIR"
echo -e "  ${BOLD}Domain:${NC}           ${DOMAIN:-none}"
echo -e "  ${BOLD}Port:${NC}             $PORT"
echo ""

# ─── Confirmation ────────────────────────────────────
echo -e "${RED}This will remove:${NC}"
echo "  • NexusPanel application files"
echo "  • systemd service"
echo "  • nginx configuration"
echo "  • All NexusPanel data (backups, users, logs, settings)"
echo "  • SSL certificates (if NexusPanel-only)"
echo ""

read -p "Type 'DELETE' to confirm permanent removal: " CONFIRM

if [ "$CONFIRM" != "DELETE" ]; then
  echo -e "${YELLOW}Uninstall cancelled.${NC}"
  exit 0
fi

echo ""
echo -e "${CYAN}Uninstalling NexusPanel...${NC}"
echo ""

# ─── 1. Stop and remove systemd service ──────────────
echo -e "${CYAN}[1/6] Stopping service...${NC}"
systemctl stop nexuspanel 2>/dev/null || true
systemctl disable nexuspanel 2>/dev/null || true
rm -f /etc/systemd/system/nexuspanel.service
systemctl daemon-reload 2>/dev/null || true
echo -e "${GREEN}✓ Service removed${NC}"

# ─── 2. Kill any remaining processes ─────────────────
echo -e "${CYAN}[2/6] Stopping remaining processes...${NC}"
fuser -k ${PORT}/tcp 2>/dev/null || true
echo -e "${GREEN}✓ Processes stopped${NC}"

# ─── 3. Remove nginx config ──────────────────────────
echo -e "${CYAN}[3/6] Removing nginx configuration...${NC}"
rm -f /etc/nginx/conf.d/nexuspanel.conf 2>/dev/null
nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
echo -e "${GREEN}✓ Nginx config removed${NC}"

# ─── 4. Optionally revoke SSL cert ───────────────────
if [ -n "$DOMAIN" ] && [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  read -p "Delete SSL certificate for $DOMAIN? [y/N]: " DEL_SSL
  if [ "$DEL_SSL" = "y" ] || [ "$DEL_SSL" = "Y" ]; then
    certbot delete --cert-name "$DOMAIN" --non-interactive 2>/dev/null || {
      echo -e "${YELLOW}⚠ Could not delete SSL cert. You can remove it manually.${NC}"
    }
    echo -e "${GREEN}✓ SSL certificate deleted${NC}"
  fi
fi

# ─── 5. Remove application files ─────────────────────
echo -e "${CYAN}[5/6] Removing application files...${NC}"
if [ -d "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR"
  echo -e "${GREEN}✓ Application files removed${NC}"
else
  echo -e "${YELLOW}⚠ Install directory not found${NC}"
fi

# ─── 6. Remove firewall rules ──────────────────────
echo -e "${CYAN}[6/6] Removing firewall rules...${NC}"
if command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --remove-port=${PORT}/tcp --permanent 2>/dev/null || true
  firewall-cmd --reload 2>/dev/null || true
fi
if command -v ufw >/dev/null 2>&1; then
  ufw delete allow ${PORT}/tcp 2>/dev/null || true
fi
echo -e "${GREEN}✓ Firewall rules removed${NC}"

echo ""
echo "============================================================"
echo -e "${GREEN}${BOLD}  ✓ NexusPanel has been completely removed${NC}"
echo "============================================================"
echo ""
echo -e "  ${BOLD}Note:${NC} System packages (nginx, certbot, Docker, PostgreSQL,"
echo "         ClamAV, Node.js) were NOT removed. To remove them:"
echo ""
echo -e "  ${CYAN}dnf remove nginx certbot python3-certbot-nginx${NC}"
echo -e "  ${CYAN}dnf remove nodejs docker-ce postgresql clamav${NC}"
echo ""
echo -e "  Thank you for trying NexusPanel!"
echo ""
