#!/usr/bin/env bash
# ============================================================================
# NexusPanel Universal Installer v2.0
# Two-Tier Security Architecture & Full Deployment Pipeline
#
# Usage:
#   curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install.sh | bash
#   bash install.sh [--license KEY] [--domain DOMAIN] [--email EMAIL] [--port PORT]
#                   [--admin-user USER] [--admin-pass PASS] [--install-dir DIR]
#                   [--docker] [--postgres] [--unattended] [--dry-run]
# ============================================================================
set -euo pipefail
IFS=$'\n\t'

VERSION="2.0.0"
DEFAULT_INSTALL_DIR="/opt/nexuspanel"
REPO_URL="https://github.com/xuspanel/NexusPanel.git"
TEMP_CLONE_DIR="/tmp/nexuspanel-repo"

# ─── Colors & Output Helpers ──────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'

log_info()  { echo -e " ${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "  ${GREEN}[OK]${NC}  $*"; }
log_warn()  { echo -e " ${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "  ${RED}[ERR]${NC}  $*"; }

# ─── Banner ───────────────────────────────────────────
show_banner() {
  echo ""
  echo -e "${CYAN}"
  echo "    ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗"
  echo "    ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝"
  echo "    ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗"
  echo "    ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║"
  echo "    ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║"
  echo "    ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚══════╝ ╚══════╝"
  echo -e "${NC}"
  echo -e "         ${BOLD}NexusPanel${NC} — VPS Control Center"
  echo -e "         ${BOLD}Two-Tier Architecture Installer v${VERSION}${NC}"
  echo ""
}

# ─── Usage ────────────────────────────────────────────
show_usage() {
  echo "Usage: bash install.sh [options]"
  echo ""
  echo "Options:"
  echo "  --license KEY       License key (NX-XXXX-XXXX-XXXX)"
  echo "  --domain DOMAIN     Domain name for the panel"
  echo "  --email EMAIL       Email for SSL notifications"
  echo "  --port PORT         Panel port (default: 3443)"
  echo "  --admin-user USER   Admin username (default: admin)"
  echo "  --admin-pass PASS   Admin password"
  echo "  --install-dir DIR   Installation directory (default: /opt/nexuspanel)"
  echo "  --docker            Install Docker alongside NexusPanel"
  echo "  --postgres          Install PostgreSQL alongside NexusPanel"
  echo "  --unattended, -y    Non-interactive installation"
  echo "  --dry-run           Simulate installation without changes"
  echo "  -h, --help          Show this help"
  echo ""
  echo "Quick install:"
  echo "  curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install.sh | bash"
}

# ─── Configuration Variables & CLI Parsing ────────────
LICENSE_KEY=""
DOMAIN=""
EMAIL=""
PORT="3443"
ADMIN_USER="admin"
ADMIN_PASS=""
INSTALL_DIR=""
INSTALL_DOCKER=false
INSTALL_POSTGRES=false
UNATTENDED=false
DRY_RUN=false

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --license)        LICENSE_KEY="$2"; shift 2 ;;
      --license=*)      LICENSE_KEY="${1#*=}"; shift ;;
      --domain)         DOMAIN="$2"; shift 2 ;;
      --domain=*)       DOMAIN="${1#*=}"; shift ;;
      --email)          EMAIL="$2"; shift 2 ;;
      --email=*)        EMAIL="${1#*=}"; shift ;;
      --port)           PORT="$2"; shift 2 ;;
      --port=*)         PORT="${1#*=}"; shift ;;
      --admin-user)     ADMIN_USER="$2"; shift 2 ;;
      --admin-user=*)   ADMIN_USER="${1#*=}"; shift ;;
      --admin-pass)     ADMIN_PASS="$2"; shift 2 ;;
      --admin-pass=*)   ADMIN_PASS="${1#*=}"; shift ;;
      --install-dir)    INSTALL_DIR="$2"; shift 2 ;;
      --install-dir=*)  INSTALL_DIR="${1#*=}"; shift ;;
      --docker|--with-docker)     INSTALL_DOCKER=true; shift ;;
      --postgres|--with-postgres) INSTALL_POSTGRES=true; shift ;;
      --unattended|--yes|-y|-s|--silent) UNATTENDED=true; shift ;;
      --dry-run)        DRY_RUN=true; shift ;;
      -h|--help)        show_usage; exit 0 ;;
      *)                log_error "Unknown option: $1"; show_usage; exit 1 ;;
    esac
  done
}

# ─── Interactive Prompts ──────────────────────────────
prompt_interactive() {
  if ${UNATTENDED} || ${DRY_RUN}; then
    return 0
  fi

  echo -e "${BOLD}Interactive Configuration Setup:${NC}"
  echo "Press Enter to keep default values where shown in brackets."
  echo ""

  if [ -z "${LICENSE_KEY}" ]; then
    read -r -p "License Key [NX-XXXX-XXXX-XXXX] (leave empty to skip): " input_lic || true
    LICENSE_KEY="${input_lic:-${LICENSE_KEY}}"
  fi

  if [ -z "${DOMAIN}" ]; then
    read -r -p "Domain name (leave empty for localhost / IP access): " input_dom || true
    DOMAIN="${input_dom:-${DOMAIN}}"
  fi

  if [ -z "${EMAIL}" ]; then
    read -r -p "Admin / SSL notification email: " input_email || true
    EMAIL="${input_email:-${EMAIL}}"
  fi

  read -r -p "Panel port [${PORT}]: " input_port || true
  PORT="${input_port:-${PORT}}"

  read -r -p "Admin username [${ADMIN_USER}]: " input_user || true
  ADMIN_USER="${input_user:-${ADMIN_USER}}"

  if [ -z "${ADMIN_PASS}" ]; then
    read -r -s -p "Admin password: " input_pass || true
    echo ""
    ADMIN_PASS="${input_pass:-${ADMIN_PASS}}"
  fi

  read -r -p "Install Docker alongside NexusPanel? [y/N]: " input_docker || true
  [[ "${input_docker}" =~ ^[Yy] ]] && INSTALL_DOCKER=true

  read -r -p "Install PostgreSQL alongside NexusPanel? [y/N]: " input_pg || true
  [[ "${input_pg}" =~ ^[Yy] ]] && INSTALL_POSTGRES=true

  echo ""
}

# ─── OS Detection ────────────────────────────────────
detect_os() {
  OS_FAMILY="unknown"
  OS_ID="unknown"
  OS_VERSION="unknown"

  if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_ID="${ID,,}"
    OS_VERSION="${VERSION_ID:-unknown}"
    case "${OS_ID}" in
      ubuntu|debian|linuxmint|pop)
        OS_FAMILY="debian"
        ;;
      almalinux|rocky|centos|rhel|fedora|ol)
        OS_FAMILY="rhel"
        ;;
      *)
        if [ -n "${ID_LIKE:-}" ]; then
          case "${ID_LIKE,,}" in
            *debian*|*ubuntu*) OS_FAMILY="debian" ;;
            *rhel*|*fedora*|*centos*) OS_FAMILY="rhel" ;;
          esac
        fi
        ;;
    esac
  elif [ -f /etc/redhat-release ]; then
    OS_FAMILY="rhel"
    OS_ID="rhel"
  elif [ -f /etc/debian_version ]; then
    OS_FAMILY="debian"
    OS_ID="debian"
  fi

  # Fallback based on available package manager
  if [ "${OS_FAMILY}" = "unknown" ]; then
    if command -v apt-get >/dev/null 2>&1; then
      OS_FAMILY="debian"
      OS_ID="debian"
    elif command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
      OS_FAMILY="rhel"
      OS_ID="rhel"
    fi
  fi
}

# ─── Main Installation Flow ──────────────────────────
main() {
  show_banner
  parse_args "$@"

  # 1. Root Privilege Guard
  if [ "$(id -u)" -ne 0 ]; then
    log_error "Root privileges are required to run this installer. Please run as root or with sudo."
    exit 1
  fi

  # 2. Interactive Prompts
  prompt_interactive

  # 3. Determine Target Installation Directory
  if [ -z "${INSTALL_DIR}" ]; then
    if [ -f "${PWD}/server.js" ] && [ -d "${PWD}/src" ]; then
      INSTALL_DIR="${PWD}"
    elif [ -d "${DEFAULT_INSTALL_DIR}" ] && [ -f "${DEFAULT_INSTALL_DIR}/server.js" ]; then
      INSTALL_DIR="${DEFAULT_INSTALL_DIR}"
    elif [ -d "/root/NexusPanel" ] && [ -f "/root/NexusPanel/server.js" ]; then
      INSTALL_DIR="/root/NexusPanel"
    else
      INSTALL_DIR="${DEFAULT_INSTALL_DIR}"
    fi
  fi

  log_info "Target installation directory: ${INSTALL_DIR}"

  detect_os
  log_info "Detected operating system: ${OS_ID} (${OS_FAMILY})"

  if ${DRY_RUN}; then
    log_info "[DRY-RUN] Simulating installation without executing changes..."
    exit 0
  fi

  # 4. System Dependencies & Certbot Cryptography Safeguards
  log_info "Step 1/7: Installing core system dependencies..."
  if [ "${OS_FAMILY}" = "debian" ]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y \
      curl wget git openssl build-essential \
      nginx certbot python3-certbot-nginx \
      python3-cryptography python3-openssl \
      ufw 2>/dev/null || true
  elif [ "${OS_FAMILY}" = "rhel" ]; then
    if command -v dnf >/dev/null 2>&1; then
      dnf install -y epel-release 2>/dev/null || true
      dnf install -y \
        curl wget git openssl gcc gcc-c++ make \
        nginx certbot python3-certbot-nginx \
        python3-cryptography python3-pyOpenSSL 2>/dev/null || \
      dnf install -y \
        curl wget git openssl gcc gcc-c++ make \
        nginx certbot python3-certbot-nginx \
        python3-cryptography pyOpenSSL 2>/dev/null || true
    elif command -v yum >/dev/null 2>&1; then
      yum install -y epel-release 2>/dev/null || true
      yum install -y \
        curl wget git openssl gcc gcc-c++ make \
        nginx certbot python3-certbot-nginx \
        python3-cryptography pyOpenSSL 2>/dev/null || true
    fi
  else
    log_warn "Unrecognized OS family. Attempting generic package installation..."
  fi

  # Crucial Fix: Remove conflicting local pip packages in /root/.local/lib/python* to prevent Certbot X509Req errors
  log_info "Applying Certbot cryptography conflict safeguards..."
  rm -rf /root/.local/lib/python*/site-packages/cryptography* 2>/dev/null || true
  rm -rf /root/.local/lib/python*/site-packages/OpenSSL* 2>/dev/null || true
  rm -rf /root/.local/lib/python*/site-packages/pyOpenSSL* 2>/dev/null || true
  rm -rf /root/.local/lib/python*/site-packages/certbot* 2>/dev/null || true
  log_ok "System dependencies and Certbot modules configured"

  # Ensure Node.js 20+
  local node_ver
  node_ver=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1 || echo "0")
  if [ "${node_ver}" -lt 18 ]; then
    log_info "Installing modern Node.js runtime (v20.x)..."
    if [ "${OS_FAMILY}" = "debian" ]; then
      apt-get remove -y libnode-dev nodejs npm 2>/dev/null || true
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      apt-get install -y nodejs
    elif [ "${OS_FAMILY}" = "rhel" ]; then
      curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
      if command -v dnf >/dev/null 2>&1; then
        dnf install -y nodejs
      else
        yum install -y nodejs
      fi
    fi
  fi

  # Optional Services (Docker / PostgreSQL)
  if ${INSTALL_DOCKER}; then
    log_info "Installing Docker..."
    if ! command -v docker >/dev/null 2>&1; then
      curl -fsSL https://get.docker.com | bash 2>/dev/null || true
      systemctl enable --now docker 2>/dev/null || true
      log_ok "Docker installed and started"
    else
      log_ok "Docker is already installed"
    fi
  fi

  if ${INSTALL_POSTGRES}; then
    log_info "Installing PostgreSQL..."
    if [ "${OS_FAMILY}" = "debian" ]; then
      apt-get install -y postgresql postgresql-contrib 2>/dev/null || true
    elif [ "${OS_FAMILY}" = "rhel" ]; then
      if command -v dnf >/dev/null 2>&1; then
        dnf install -y postgresql-server postgresql-contrib 2>/dev/null || true
      else
        yum install -y postgresql-server postgresql-contrib 2>/dev/null || true
      fi
    fi
    systemctl enable --now postgresql 2>/dev/null || true
    log_ok "PostgreSQL installed and started"
  fi

  # 5. Unprivileged System User Creation
  log_info "Step 2/7: Creating unprivileged nexuspanel system user and group..."
  if ! getent group nexuspanel >/dev/null 2>&1; then
    groupadd -r nexuspanel 2>/dev/null || groupadd nexuspanel 2>/dev/null || true
  fi

  if ! id -u nexuspanel >/dev/null 2>&1; then
    useradd -r -g nexuspanel -s /bin/false -d "${INSTALL_DIR}" -M nexuspanel 2>/dev/null || \
    useradd -r -s /bin/false nexuspanel 2>/dev/null || true
  fi
  log_ok "Unprivileged user 'nexuspanel:nexuspanel' verified"

  # 6. Application Cloning into Temporary Directory & Sync
  log_info "Step 3/7: Fetching NexusPanel application code..."
  mkdir -p "${INSTALL_DIR}"
  rm -rf "${TEMP_CLONE_DIR}" 2>/dev/null || true

  local clone_done=false
  if git clone -b main --single-branch "${REPO_URL}" "${TEMP_CLONE_DIR}" 2>/dev/null; then
    log_ok "Cloned repository into temporary directory (${TEMP_CLONE_DIR})"
    cp -r "${TEMP_CLONE_DIR}/." "${INSTALL_DIR}/" 2>/dev/null || true
    rm -rf "${TEMP_CLONE_DIR}" 2>/dev/null || true
    clone_done=true
  elif [ -d "${INSTALL_DIR}/.git" ]; then
    log_info "Existing repository detected at ${INSTALL_DIR}, pulling latest changes..."
    (cd "${INSTALL_DIR}" && git pull origin main 2>/dev/null) || true
    clone_done=true
  fi

  # Fallback to local source if remote clone was not performed
  if ! ${clone_done}; then
    log_warn "Remote git clone unavailable — syncing from local directory..."
    if [ -d "${PWD}/src" ] && [ -f "${PWD}/server.js" ] && [ "${PWD}" != "${INSTALL_DIR}" ]; then
      cp -r "${PWD}/." "${INSTALL_DIR}/" 2>/dev/null || true
    elif [ -d "/root/NexusPanel/src" ] && [ "${INSTALL_DIR}" != "/root/NexusPanel" ]; then
      cp -r /root/NexusPanel/. "${INSTALL_DIR}/" 2>/dev/null || true
    fi
    rm -rf "${TEMP_CLONE_DIR}" 2>/dev/null || true
  fi

  if [ -d "${INSTALL_DIR}/nxApp" ]; then
    cp -r "${INSTALL_DIR}/nxApp/"* "${INSTALL_DIR}/" 2>/dev/null || true
    rm -rf "${INSTALL_DIR}/nxApp" 2>/dev/null || true
  fi
  # 7. Directory Structure & Permissions Lockdown
  log_info "Step 4/7: Applying Two-Tier directory structure and permissions..."
  
  # A. /tmp/nexus-uploads owned by nexuspanel:nexuspanel (0755)
  mkdir -p /tmp/nexus-uploads
  chown -R nexuspanel:nexuspanel /tmp/nexus-uploads 2>/dev/null || true
  chmod 755 /tmp/nexus-uploads 2>/dev/null || true

  # B. /var/www owned by www-data:www-data (0755)
  mkdir -p /var/www
  if getent passwd www-data >/dev/null 2>&1; then
    chown -R www-data:www-data /var/www 2>/dev/null || true
  elif getent passwd nginx >/dev/null 2>&1; then
    chown -R nginx:nginx /var/www 2>/dev/null || true
  else
    chown -R root:root /var/www 2>/dev/null || true
  fi
  chmod 755 /var/www 2>/dev/null || true

  # C. Web Tier Source Code & Data directory ownership
  mkdir -p "${INSTALL_DIR}/data" /var/log/nexuspanel /etc/nexuspanel
  chown -R nexuspanel:nexuspanel "${INSTALL_DIR}" 2>/dev/null || true
  chown -R nexuspanel:nexuspanel /var/log/nexuspanel /etc/nexuspanel 2>/dev/null || true

  find "${INSTALL_DIR}" -type d -exec chmod 755 {} + 2>/dev/null || true
  find "${INSTALL_DIR}" -type f -exec chmod 644 {} + 2>/dev/null || true
  chmod 750 "${INSTALL_DIR}/data" /var/log/nexuspanel /etc/nexuspanel 2>/dev/null || true

  # Ensure executable binaries/scripts retain exec bit
  chmod 755 "${INSTALL_DIR}/server.js" "${INSTALL_DIR}/update.sh" "${INSTALL_DIR}/upgrade.sh" 2>/dev/null || true
  if [ -d "${INSTALL_DIR}/scripts" ]; then
    find "${INSTALL_DIR}/scripts" -type f -name "*.sh" -exec chmod 755 {} + 2>/dev/null || true
  fi

  # D. Sudoers Exemption for Terminal Sessions
  if [ -d /etc/sudoers.d ]; then
    cat > /etc/sudoers.d/nexuspanel << 'SUDOERS'
# NexusPanel Web Tier Terminal Escalation Exemption
nexuspanel ALL=(root) NOPASSWD: /usr/bin/sudo -i -u root, /usr/bin/sudo -i, /bin/su - root
SUDOERS
    chmod 0440 /etc/sudoers.d/nexuspanel 2>/dev/null || true
  fi
  log_ok "Directory structure and permissions applied"

  # 8. NPM Dependencies Installation (as unprivileged nexuspanel user for native C++ compilation)
  log_info "Step 5/7: Installing Node.js production dependencies in ${INSTALL_DIR} as 'nexuspanel' user..."
  sudo -u nexuspanel bash -c "cd ${INSTALL_DIR} && npm install --production" 2>&1 | tail -5 || \
  sudo -u nexuspanel bash -c "cd ${INSTALL_DIR} && npm install" 2>&1 | tail -5

  if [ -d "${INSTALL_DIR}/node_modules/.bin" ]; then
    chmod -R 755 "${INSTALL_DIR}/node_modules/.bin" 2>/dev/null || true
  fi
  chown -R nexuspanel:nexuspanel "${INSTALL_DIR}" 2>/dev/null || true
  log_ok "NPM dependencies installed successfully"

  # 9. Environment Initialization (.env)
  log_info "Step 6/7: Configuring environment (.env)..."
  local env_file="${INSTALL_DIR}/.env"
  if [ ! -f "${env_file}" ]; then
    local jwt_secret
    jwt_secret=$(openssl rand -hex 32)
    cat > "${env_file}" << ENV_FILE
# NexusPanel Environment Configuration
LICENSE_KEY=${LICENSE_KEY:-}
DOMAIN=${DOMAIN:-}
EMAIL=${EMAIL:-}
PORT=${PORT:-3443}
ADMIN_USER=${ADMIN_USER:-admin}
ADMIN_PASS=${ADMIN_PASS:-}
JWT_SECRET=${jwt_secret}
NODE_ENV=production
ENV_FILE
    chown nexuspanel:nexuspanel "${env_file}"
    chmod 600 "${env_file}"
    log_ok "Generated fresh .env configuration"
  else
    if ! grep -q "JWT_SECRET=" "${env_file}"; then
      echo "JWT_SECRET=$(openssl rand -hex 32)" >> "${env_file}"
    fi
    [ -n "${LICENSE_KEY}" ] && (grep -q "^LICENSE_KEY=" "${env_file}" && sed -i "s/^LICENSE_KEY=.*/LICENSE_KEY=${LICENSE_KEY}/" "${env_file}" || echo "LICENSE_KEY=${LICENSE_KEY}" >> "${env_file}")
    [ -n "${DOMAIN}" ] && (grep -q "^DOMAIN=" "${env_file}" && sed -i "s/^DOMAIN=.*/DOMAIN=${DOMAIN}/" "${env_file}" || echo "DOMAIN=${DOMAIN}" >> "${env_file}")
    [ -n "${EMAIL}" ] && (grep -q "^EMAIL=" "${env_file}" && sed -i "s/^EMAIL=.*/EMAIL=${EMAIL}/" "${env_file}" || echo "EMAIL=${EMAIL}" >> "${env_file}")
    [ -n "${ADMIN_USER}" ] && (grep -q "^ADMIN_USER=" "${env_file}" && sed -i "s/^ADMIN_USER=.*/ADMIN_USER=${ADMIN_USER}/" "${env_file}" || echo "ADMIN_USER=${ADMIN_USER}" >> "${env_file}")
    [ -n "${ADMIN_PASS}" ] && (grep -q "^ADMIN_PASS=" "${env_file}" && sed -i "s/^ADMIN_PASS=.*/ADMIN_PASS=${ADMIN_PASS}/" "${env_file}" || echo "ADMIN_PASS=${ADMIN_PASS}" >> "${env_file}")
    chown nexuspanel:nexuspanel "${env_file}"
    chmod 600 "${env_file}"
    log_ok "Existing .env preserved and updated"
  fi

  # 10. Two-Tier Systemd Services Creation & Service Activation
  log_info "Step 7/7: Generating Two-Tier systemd services and starting..."

  # A. Root Daemon Service (Runs as root)
  cat > "/etc/systemd/system/nexuspanel-daemon.service" << SYSTEMD_DAEMON
[Unit]
Description=NexusPanel Root Daemon
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/node ${INSTALL_DIR}/src/daemon/server.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SYSTEMD_DAEMON

  # B. Web Tier Service (Runs as unprivileged nexuspanel user)
  cat > "/etc/systemd/system/nexuspanel.service" << SYSTEMD_WEB
[Unit]
Description=NexusPanel - VPS Control Panel
After=network.target nexuspanel-daemon.service
Wants=nexuspanel-daemon.service

[Service]
Type=simple
User=nexuspanel
Group=nexuspanel
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/node ${INSTALL_DIR}/server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SYSTEMD_WEB

  log_ok "Systemd unit files written"

  systemctl daemon-reload 2>/dev/null || true
  systemctl enable nexuspanel-daemon 2>/dev/null || true
  systemctl enable nexuspanel 2>/dev/null || true
  systemctl enable nginx 2>/dev/null || true

  systemctl restart nexuspanel-daemon 2>/dev/null || systemctl start nexuspanel-daemon 2>/dev/null || true
  systemctl restart nexuspanel 2>/dev/null || systemctl start nexuspanel 2>/dev/null || true
  systemctl restart nginx 2>/dev/null || systemctl start nginx 2>/dev/null || true

  echo ""
  log_ok "============================================================"
  log_ok " NexusPanel Two-Tier Installation Completed Successfully! "
  log_ok "============================================================"
  echo ""
  echo -e " ${BOLD}Web Panel:${NC}      http://<SERVER_IP>:${PORT:-3443}"
  echo -e " ${BOLD}Root Daemon:${NC}    Active (nexuspanel-daemon.service)"
  echo -e " ${BOLD}Web Tier:${NC}       Active as 'nexuspanel' user (nexuspanel.service)"
  echo -e " ${BOLD}Reverse Proxy:${NC}  Active (nginx.service)"
  echo ""
}

main "$@"
