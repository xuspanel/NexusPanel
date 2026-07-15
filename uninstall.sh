#!/usr/bin/env bash
# ============================================================================
# NexusPanel Uninstaller v2.0
# Removes all NexusPanel components safely.
# ============================================================================
set -euo pipefail
IFS=$'\n\t'

VERSION="2.0.0"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'

log_info()  { echo -e " ${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "  ${GREEN}[OK]${NC}  $*"; }
log_warn()  { echo -e " ${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "  ${RED}[ERR]${NC}  $*"; }

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

# ─── OS Detection ────────────────────────────────────
detect_os() {
  case "$(uname -s)" in
    Darwin)   echo "macos" ;;
    Linux)
      if [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "${ID,,}"
      elif [ -f /etc/redhat-release ]; then
        echo "rhel"
      elif [ -f /etc/debian_version ]; then
        echo "debian"
      else
        echo "linux"
      fi
      ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *) echo "unknown" ;;
  esac
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
  log_info "Removing NexusPanel services..."

  case "$(detect_os)" in
    macos)
      if [ -f /Library/LaunchDaemons/com.nexuspanel.plist ]; then
        launchctl unload /Library/LaunchDaemons/com.nexuspanel.plist 2>/dev/null || true
        rm -f /Library/LaunchDaemons/com.nexuspanel.plist
        log_ok "LaunchDaemon removed"
      fi
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
      # systemd
      systemctl stop nexuspanel 2>/dev/null || true
      systemctl disable nexuspanel 2>/dev/null || true
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
    case "$(detect_os)" in
      ubuntu|debian)
        apt-get remove -y nginx certbot python3-certbot-nginx fail2ban 2>/dev/null || true
        apt-get autoremove -y 2>/dev/null || true
        rm -f /etc/apt/sources.list.d/nodesource.list
        log_ok "Dependencies removed"
        ;;
      almalinux|rocky|centos|fedora|rhel)
        dnf remove -y nginx certbot python3-certbot-nginx fail2ban 2>/dev/null || true
        dnf autoremove -y 2>/dev/null || true
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
    case "$(detect_os)" in
      ubuntu|debian)
        ufw delete allow 3443/tcp 2>/dev/null || true
        ufw delete allow 80/tcp 2>/dev/null || true
        ufw delete allow 443/tcp 2>/dev/null || true
        log_ok "UFW rules removed"
        ;;
      almalinux|rocky|centos|fedora)
        firewall-cmd --permanent --remove-port=3443/tcp 2>/dev/null || true
        firewall-cmd --permanent --remove-port=80/tcp 2>/dev/null || true
        firewall-cmd --permanent --remove-port=443/tcp 2>/dev/null || true
        firewall-cmd --reload 2>/dev/null || true
        log_ok "Firewalld rules removed"
        ;;
      macos)
        /usr/libexec/ApplicationFirewall/socketfilterfw --remove \
          "$(which node 2>/dev/null || echo "")" 2>/dev/null || true
        log_ok "macOS firewall rules removed"
        ;;
    esac
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
