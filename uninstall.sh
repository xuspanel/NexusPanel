#!/usr/bin/env bash
# ============================================================================
# NexusPanel Uninstaller v2.0
# Removes all NexusPanel components safely.
# ============================================================================
set -euo pipefail
IFS=$'\n\t'

VERSION="2.0.0"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "${SCRIPT_DIR}/install-common.sh" ]; then
  source "${SCRIPT_DIR}/install-common.sh"
elif [ -f "./install-common.sh" ]; then
  source "./install-common.sh"
else
  source <(curl -sL "https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-common.sh") 2>/dev/null || {
    RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'
    BOLD='\033[1m'; NC='\033[0m'
    echo -e " ${RED}[ERR]${NC}  Cannot find install-common.sh — please download the full suite"
    exit 1
  }
fi

show_banner() {
  echo ""
  echo -e "${YELLOW}"
  echo "    ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗"
  echo "    ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝"
  echo "    ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗"
  echo "    ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║"
  echo "    ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║"
  echo "    ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚══════╝ ╚══════╝"
  echo -e "${NC}"
  echo -e "         ${BOLD}NexusPanel Uninstaller${NC} v${VERSION}"
  echo -e "         ${YELLOW}Use with caution — this will remove all components${NC}"
  echo ""
}

check_root() {
  if [ "$(id -u)" -ne 0 ]; then
    log_error "Root privileges required"
    echo "Please run: sudo $0"
    exit 2
  fi
}

# ─── Detect Install Paths ───────────────────────────
detect_paths() {
  INSTALL_DIR=""
  LOG_DIR=""
  DATA_DIR=""

  # Common installation directories
  for dir in /usr/local/opt/nexuspanel /opt/nexuspanel /usr/local/nexuspanel \
             /usr/share/nexuspanel /root/NexusPanel; do
    if [ -d "${dir}" ] && [ -f "${dir}/server.js" ]; then
      INSTALL_DIR="${dir}"
      break
    fi
  done

  # Common log directories
  for dir in /usr/local/var/log/nexuspanel /var/log/nexuspanel; do
    if [ -d "${dir}" ]; then
      LOG_DIR="${dir}"
      break
    fi
  done
  [ -z "${LOG_DIR}" ] && LOG_DIR="${INSTALL_DIR}/logs" 2>/dev/null || true

  [ -z "${LOG_DIR}" ] && LOG_DIR="/var/log/nexuspanel"
}

# ─── Service Removal ────────────────────────────────
remove_services() {
  detect_os
  log_info "Removing NexusPanel services..."

  case "${OS_FAMILY}" in
    macos)
      service_manage stop nexuspanel
      rm -f /Library/LaunchDaemons/com.nexuspanel.plist
      log_ok "LaunchDaemon removed"
      ;;
    windows)
      if command -v nssm >/dev/null 2>&1; then
        nssm stop NexusPanel 2>/dev/null || true
        nssm remove NexusPanel confirm 2>/dev/null || true
        log_ok "Windows service removed"
      fi
      if command -v sc >/dev/null 2>&1; then
        sc stop NexusPanel 2>/dev/null || true
        sc delete NexusPanel 2>/dev/null || true
      fi
      ;;
    *)
      service_manage stop nexuspanel
      service_manage disable nexuspanel
      rm -f /etc/systemd/system/nexuspanel.service
      rm -f /etc/systemd/system/nexuspanel.target
      systemctl daemon-reload 2>/dev/null || true
      log_ok "Systemd service removed"

      # docker
      if command -v docker >/dev/null 2>&1; then
        docker stop nexuspanel 2>/dev/null || true
        docker rm nexuspanel 2>/dev/null || true
        docker-compose -f /opt/nexuspanel/docker-compose.yml down 2>/dev/null || true
        docker network rm nexuspanel-net 2>/dev/null || true
      fi
      ;;
  esac
}

# ─── File Removal ───────────────────────────────────
remove_files() {
  log_info "Removing NexusPanel files..."
  local keep_config=false

  if [ -n "${INSTALL_DIR}" ] && [ -d "${INSTALL_DIR}" ]; then
    echo -n "  Remove application directory (${INSTALL_DIR})? [y/N]: "
    read -r answer
    if [[ "${answer}" =~ ^[Yy]$ ]]; then
      # Ask about keeping .env (license data)
      echo -n "  Keep configuration (.env) for future reinstallation? [Y/n]: "
      read -r keep_answer
      if [[ -z "${keep_answer}" || "${keep_answer}" =~ ^[Yy]$ ]]; then
        keep_config=true
        cp "${INSTALL_DIR}/.env" /tmp/nexuspanel-env-backup 2>/dev/null || true
      fi

      rm -rf "${INSTALL_DIR}"
      log_ok "Application directory removed"

      if ${keep_config} && [ -f /tmp/nexuspanel-env-backup ]; then
        log_info "Configuration backed up to /tmp/nexuspanel-env-backup"
      fi
    else
      log_info "Skipping application directory"
    fi
  else
    # Try to find by searching
    local found
    found=$(find / -maxdepth 3 -name server.js -path "*/nexuspanel*" 2>/dev/null || true)
    if [ -n "${found}" ]; then
      local dir
      dir=$(dirname "${found}")
      echo -n "  Remove found installation (${dir})? [y/N]: "
      read -r answer
      if [[ "${answer}" =~ ^[Yy]$ ]]; then
        rm -rf "${dir}"
        log_ok "Removed ${dir}"
      fi
    else
      log_info "No NexusPanel installation found"
    fi
  fi

  # Remove log directory
  if [ -n "${LOG_DIR}" ] && [ -d "${LOG_DIR}" ]; then
    echo -n "  Remove log directory (${LOG_DIR})? [y/N]: "
    read -r answer
    if [[ "${answer}" =~ ^[Yy]$ ]]; then
      rm -rf "${LOG_DIR}"
      log_ok "Log directory removed"
    fi
  fi

  # Remove data directory
  if [ -n "${DATA_DIR}" ] && [ -d "${DATA_DIR}" ]; then
    rm -rf "${DATA_DIR}" 2>/dev/null || true
  fi

  # Remove temp files
  rm -rf /tmp/nexuspanel-* 2>/dev/null || true

  # Windows: remove ProgramData
  if [ -d "$env:ProgramData/NexusPanel" ]; then
    log_info "Windows ProgramData directory exists — remove via PowerShell"
  fi
}

# ─── Reverse Dependencies ───────────────────────────
remove_dependencies() {
  detect_os
  log_info "Checking optional dependencies installed by NexusPanel..."

  echo ""
  echo "The following packages may have been installed by NexusPanel:"
  echo "  - nginx (if added for NexusPanel)"
  echo "  - Node.js v20.x"
  echo "  - certbot"
  echo "  - fail2ban"
  echo ""
  echo -n "Remove dependencies? This may affect other applications. [y/N]: "
  read -r answer
  if [[ "${answer}" =~ ^[Yy]$ ]]; then
    case "${OS_FAMILY}" in
      debian)
        pkg_remove nginx certbot python3-certbot-nginx fail2ban 2>/dev/null || true
        run_cmd apt-get autoremove -y 2>/dev/null || true
        rm -f /etc/apt/sources.list.d/nodesource.list
        log_ok "Dependencies removed"
        ;;
      rhel|fedora)
        pkg_remove nginx certbot python3-certbot-nginx fail2ban 2>/dev/null || true
        run_cmd dnf autoremove -y 2>/dev/null || true
        rm -f /etc/yum.repos.d/nodesource-nodejs.repo
        log_ok "Dependencies removed"
        ;;
      macos)
        brew uninstall nginx certbot fail2ban 2>/dev/null || true
        log_ok "Dependencies removed"
        ;;
      *)
        log_warn "Unsupported OS for automatic dependency removal"
        ;;
    esac
  fi
}

# ─── Firewall Cleanup ───────────────────────────────
cleanup_firewall() {
  echo ""
  echo -n "Remove NexusPanel firewall rules? [y/N]: "
  read -r answer
  if [[ "${answer}" =~ ^[Yy]$ ]]; then
    fw_remove "3443"
    fw_remove "80"
    fw_remove "443"
    log_ok "Firewall rules removed"
  fi
}

# ─── SSL Cleanup ────────────────────────────────────
cleanup_ssl() {
  echo ""
  echo -n "Remove SSL certificates issued for NexusPanel? [y/N]: "
  read -r answer
  if [[ "${answer}" =~ ^[Yy]$ ]]; then
    # Remove certbot certificates
    if command -v certbot >/dev/null 2>&1; then
      local domains
      domains=$(certbot certificates 2>/dev/null | grep "Domains:" | awk '{print $2}' || true)
      for domain in ${domains}; do
        certbot delete --cert-name "${domain}" 2>/dev/null || true
        log_ok "Certificate for ${domain} removed"
      done
    fi

    # Remove self-signed credentials
    for dir in "${INSTALL_DIR}" /etc/nginx /usr/local/etc/nginx; do
      rm -f "${dir}/nexuspanel.key" "${dir}/nexuspanel.crt" 2>/dev/null || true
    done
  fi
}

# ─── NGINX Cleanup ─────────────────────────────────
cleanup_nginx() {
  echo ""
  echo -n "Remove NexusPanel nginx configuration? [y/N]: "
  read -r answer
  if [[ "${answer}" =~ ^[Yy]$ ]]; then
    rm -f /etc/nginx/sites-enabled/nexuspanel 2>/dev/null || true
    rm -f /etc/nginx/sites-available/nexuspanel 2>/dev/null || true
    rm -f /etc/nginx/conf.d/nexuspanel.conf 2>/dev/null || true
    rm -f /usr/local/etc/nginx/servers/nexuspanel 2>/dev/null || true
    log_ok "Nginx configuration removed"
    echo "  Consider: nginx -t && systemctl reload nginx"
  fi
}

# ─── Database Cleanup ──────────────────────────────
cleanup_database() {
  echo ""
  echo -n "Remove NexusPanel database files? [y/N]: "
  read -r answer
  if [[ "${answer}" =~ ^[Yy]$ ]]; then
    rm -f "${INSTALL_DIR}/data/"*.db 2>/dev/null || true
    rm -rf "${INSTALL_DIR}/data/" 2>/dev/null || true
    log_ok "Database files removed"
  fi
}

# ─── Main ─────────────────────────────────────────────
main() {
  show_banner

  if [ "$(id -u)" -ne 0 ]; then
    log_error "Root privileges required"
    echo "Please run: sudo $0"
    exit 2
  fi

  detect_paths

  echo -e "${RED}${BOLD}WARNING:${NC} This will remove NexusPanel and all its components."
  echo ""
  echo -n "Type 'uninstall' to confirm: "
  read -r confirm
  if [ "${confirm}" != "uninstall" ]; then
    log_error "Confirmation failed — aborting"
    exit 12
  fi

  remove_services
  sleep 1
  remove_files
  cleanup_nginx
  cleanup_ssl
  cleanup_firewall
  cleanup_database
  remove_dependencies

  echo ""
  log_ok "NexusPanel has been removed from this system."
  log_info "Configuration backup: /tmp/nexuspanel-env-backup (if kept)"
  echo ""

  echo -n "Reboot now to complete cleanup? [y/N]: "
  read -r answer
  if [[ "${answer}" =~ ^[Yy]$ ]]; then
    reboot
  fi
}

main
