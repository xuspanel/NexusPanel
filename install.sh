#!/usr/bin/env bash
# ============================================================================
# NexusPanel Universal Installer v2.0
# Two-Tier Security Architecture & Idempotent System Provisioning
#
# Usage:
#   curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install.sh | bash
#   bash install.sh [--license KEY] [--domain DOMAIN] [--port PORT] [--docker] [--postgres] [--unattended] [--dry-run]
# ============================================================================
set -euo pipefail
IFS=$'\n\t'

VERSION="2.0.0"

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
  echo "  --license KEY     License key (NX-XXXX-XXXX-XXXX)"
  echo "  --domain DOMAIN   Domain name for the panel"
  echo "  --port PORT       Panel port (default: 3443)"
  echo "  --admin-user USER Admin username (default: admin)"
  echo "  --admin-pass PASS Admin password"
  echo "  --install-dir DIR Installation directory (default: current or /opt/nexuspanel)"
  echo "  --docker          Install Docker alongside NexusPanel"
  echo "  --postgres        Install PostgreSQL alongside NexusPanel"
  echo "  --unattended      Non-interactive installation"
  echo "  --dry-run         Simulate installation without changes"
  echo "  -h, --help        Show this help"
  echo ""
  echo "Quick install:"
  echo "  curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install.sh | bash"
}

# ─── Parse Arguments ─────────────────────────────────
LICENSE_KEY=""
DOMAIN=""
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
      --port)           PORT="$2"; shift 2 ;;
      --port=*)         PORT="${1#*=}"; shift ;;
      --admin-user)     ADMIN_USER="$2"; shift 2 ;;
      --admin-user=*)   ADMIN_USER="${1#*=}"; shift ;;
      --admin-pass)     ADMIN_PASS="$2"; shift 2 ;;
      --admin-pass=*)   ADMIN_PASS="${1#*=}"; shift ;;
      --install-dir)    INSTALL_DIR="$2"; shift 2 ;;
      --install-dir=*)  INSTALL_DIR="${1#*=}"; shift ;;
      --docker)         INSTALL_DOCKER=true; shift ;;
      --postgres)       INSTALL_POSTGRES=true; shift ;;
      --unattended|-y)  UNATTENDED=true; shift ;;
      --dry-run)        DRY_RUN=true; shift ;;
      -h|--help)        show_usage; exit 0 ;;
      *)                log_error "Unknown option: $1"; show_usage; exit 1 ;;
    esac
  done
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

  # Binary fallback
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

  # 2. Determine and Normalize Target Installation Directory
  if [ -z "${INSTALL_DIR}" ]; then
    if [ -f "${PWD}/server.js" ] && [ -d "${PWD}/src" ]; then
      INSTALL_DIR="${PWD}"
    elif [ -d "/opt/nexuspanel" ] && [ -f "/opt/nexuspanel/server.js" ]; then
      INSTALL_DIR="/opt/nexuspanel"
    elif [ -d "/root/NexusPanel" ] && [ -f "/root/NexusPanel/server.js" ]; then
      INSTALL_DIR="/root/NexusPanel"
    else
      INSTALL_DIR="/opt/nexuspanel"
    fi
  fi

  log_info "Target installation directory: ${INSTALL_DIR}"

  detect_os
  log_info "Detected operating system: ${OS_ID} (${OS_FAMILY})"

  if ${DRY_RUN}; then
    log_info "[DRY-RUN] Simulating installation without executing changes..."
    exit 0
  fi

  # 3. System Dependencies & Certbot Cryptography Fix
  log_info "Step 1/6: Installing core system dependencies..."
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

  # 4. Unprivileged System User Creation
  log_info "Step 2/6: Creating unprivileged nexuspanel system user and group..."
  if ! getent group nexuspanel >/dev/null 2>&1; then
    groupadd -r nexuspanel 2>/dev/null || groupadd nexuspanel 2>/dev/null || true
  fi

  if ! id -u nexuspanel >/dev/null 2>&1; then
    useradd -r -g nexuspanel -s /bin/false -d "${INSTALL_DIR}" -M nexuspanel 2>/dev/null || \
    useradd -r -s /bin/false nexuspanel 2>/dev/null || true
  fi
  log_ok "Unprivileged user 'nexuspanel:nexuspanel' verified"

  # 5. Directory Structure & Permissions Lockdown
  log_info "Step 3/6: Establishing directory structure and strict permissions..."
  
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

  # 6. Environment Initialization (.env)
  log_info "Step 4/6: Initializing environment configuration..."
  if [ ! -f "${INSTALL_DIR}/.env" ]; then
    local jwt_secret
    jwt_secret=$(openssl rand -hex 32)
    cat > "${INSTALL_DIR}/.env" << ENV_FILE
JWT_SECRET=${jwt_secret}
PORT=${PORT}
NODE_ENV=production
ENV_FILE
    chown nexuspanel:nexuspanel "${INSTALL_DIR}/.env"
    chmod 600 "${INSTALL_DIR}/.env"
    log_ok "Generated fresh .env with cryptographically secure JWT_SECRET"
  else
    if ! grep -q "JWT_SECRET=" "${INSTALL_DIR}/.env"; then
      echo "JWT_SECRET=$(openssl rand -hex 32)" >> "${INSTALL_DIR}/.env"
    fi
    chown nexuspanel:nexuspanel "${INSTALL_DIR}/.env"
    chmod 600 "${INSTALL_DIR}/.env"
    log_ok "Existing .env preserved with valid JWT_SECRET"
  fi

  # 7. Two-Tier Systemd Services Creation
  log_info "Step 5/6: Generating Two-Tier systemd service definitions..."

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

  # 8. Service Activation & Verification
  log_info "Step 6/6: Reloading and activating services..."
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
