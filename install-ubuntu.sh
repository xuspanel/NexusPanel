#!/usr/bin/env bash
# ============================================================================
# NexusPanel Installer v2.0 — Ubuntu/Debian
# Platform: Ubuntu 20.04/22.04/24.04, Debian 11/12
# Package Manager: APT
# Firewall: UFW
# ============================================================================
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "${SCRIPT_DIR}/install-common.sh" ]; then
  source "${SCRIPT_DIR}/install-common.sh"
else
  source <(curl -sL "https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-common.sh")
fi

# ─── OS Detection ─────────────────────────────────────
detect_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    OS_VERSION=$VERSION_ID
    OS_CODENAME=$VERSION_CODENAME
  else
    log_error "Cannot detect OS"
    exit ${EXIT_GENERAL_ERROR}
  fi

  case "${OS}" in
    ubuntu|debian) ;;
    *)
      log_error "This script supports Ubuntu/Debian only (detected: ${OS})"
      log_info "Please use the appropriate installer for your OS"
      exit ${EXIT_GENERAL_ERROR}
      ;;
  esac

  log_info "Detected: ${OS} ${OS_VERSION} (${OS_CODENAME})"
}

# ─── Dependency Installation ──────────────────────────
install_system_deps() {
  log_info "Installing system dependencies..."

  run_cmd apt-get update -qq

  local base_packages=(
    curl wget git openssl
    nginx certbot python3-certbot-nginx
    ufw
    unattended-upgrades
  )

  run_cmd apt-get install -y "${base_packages[@]}" 2>/dev/null || true

  # Ensure Node.js 20+
  local node_ver
  node_ver=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1 || echo "0")
  if [ "${node_ver}" -lt 18 ]; then
    log_info "Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    run_cmd apt-get install -y nodejs
  fi

  log_success "System dependencies installed"
}

install_optional_deps() {
  if ${INSTALL_DOCKER}; then
    log_info "Installing Docker..."
    if ! command -v docker >/dev/null 2>&1; then
      curl -fsSL https://get.docker.com | bash
      run_cmd systemctl enable --now docker
    else
      log_info "Docker already installed"
    fi

    if ${INSTALL_PGADMIN}; then
      log_info "Installing pgAdmin..."
      docker rm -f pgadmin 2>/dev/null || true
      run_cmd docker run -d --name pgadmin --restart unless-stopped \
        -e PGADMIN_DEFAULT_EMAIL="${PGADMIN_EMAIL:-admin@example.com}" \
        -e PGADMIN_DEFAULT_PASSWORD="${PGADMIN_PASS:-admin}" \
        -p 127.0.0.1:5050:80 \
        dpage/pgadmin4:latest
    fi
  fi

  if ${INSTALL_PG}; then
    log_info "Installing PostgreSQL..."
    run_cmd apt-get install -y postgresql postgresql-contrib 2>/dev/null || true
    run_cmd systemctl enable --now postgresql 2>/dev/null || true
  fi

  if ${INSTALL_CLAMAV}; then
    log_info "Installing ClamAV..."
    run_cmd apt-get install -y clamav clamav-daemon 2>/dev/null || true
    run_cmd systemctl enable --now clamav-daemon 2>/dev/null || true
    freshclam 2>/dev/null || true
  fi
}

# ─── Firewall Configuration ───────────────────────────
configure_firewall() {
  log_info "Configuring UFW firewall..."

  if ${DRY_RUN}; then
    log_info "[DRY-RUN] Would configure UFW"
    return 0
  fi

  configure_ufw "${PORT:-3443}"
}

# ─── AppArmor Configuration ───────────────────────────
configure_apparmor() {
  if command -v aa-status >/dev/null 2>&1; then
    log_info "AppArmor is active — creating profile for NexusPanel"
    local profile_file="/etc/apparmor.d/usr.bin.nexuspanel"
    if [ ! -f "${profile_file}" ]; then
      cat > "${profile_file}" << PROFILE
#include <tunables/global>

/usr/bin/node (${INSTALL_DIR}/server.js) {
  #include <abstractions/base>
  #include <abstractions/nameservice>
  #include <abstractions/openssl>

  ${INSTALL_DIR}/ r,
  ${INSTALL_DIR}/** rwk,
  ${LOG_DIR}/** rw,
  ${DATA_DIR}/** rw,

  network tcp,
  network inet dgram,
  network inet6 dgram,
}
PROFILE
      apparmor_parser -r "${profile_file}" 2>/dev/null || true
    fi
  fi
}

# ─── Automatic Updates ────────────────────────────────
configure_auto_updates() {
  log_info "Configuring unattended-upgrades..."
  if ${DRY_RUN}; then
    log_info "[DRY-RUN] Would configure unattended-upgrades"
    return 0
  fi

  cat > /etc/apt/apt.conf.d/20nexuspanel-auto-upgrades << CONF
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
CONF
}

# ─── Main ─────────────────────────────────────────────
main() {
  show_banner
  setup_logging

  detect_os
  check_prerequisites "$@"

  if ! ${MINIMAL}; then
    install_system_deps
  fi

  if ${INTERACTIVE}; then
    # License prompt
    if [ -z "${LICENSE_KEY:-}" ]; then
      read -p "License Key [NX-XXXX-XXXX-XXXX]: " LICENSE_KEY
    fi
    if [ -z "${DOMAIN:-}" ]; then
      read -p "Domain (leave empty for localhost): " DOMAIN
    fi
    if [ -n "${DOMAIN}" ] && [ -z "${EMAIL:-}" ]; then
      read -p "Email for SSL notifications: " EMAIL
    fi
    if [ -z "${PORT:-}" ]; then
      read -p "Port [3443]: " PORT
    fi
    PORT=${PORT:-3443}
    if [ -z "${ADMIN_USER:-}" ]; then
      read -p "Admin username [admin]: " ADMIN_USER
    fi
    ADMIN_USER=${ADMIN_USER:-admin}
    if [ -z "${ADMIN_PASS:-}" ]; then
      read -sp "Admin password: " ADMIN_PASS
      echo ""
    fi
    read -p "Install Docker? [y/N]: " INSTALL_DOCKER_INPUT
    [[ "${INSTALL_DOCKER_INPUT}" =~ ^[Yy] ]] && INSTALL_DOCKER=true
    read -p "Install PostgreSQL? [y/N]: " INSTALL_PG_INPUT
    [[ "${INSTALL_PG_INPUT}" =~ ^[Yy] ]] && INSTALL_PG=true
    read -p "Install ClamAV? [y/N]: " INSTALL_CLAMAV_INPUT
    [[ "${INSTALL_CLAMAV_INPUT}" =~ ^[Yy] ]] && INSTALL_CLAMAV=true
  fi

  # Validate license
  if [ -n "${LICENSE_KEY:-}" ]; then
    validate_license "${LICENSE_KEY}" "${DOMAIN:-}" || exit ${EXIT_LICENSE_INVALID}
  fi

  save_checkpoint "install_deps"
  install_optional_deps

  save_checkpoint "clone_app"
  log_info "Installing NexusPanel..."
  mkdir -p "${INSTALL_DIR}"

  if [ -d "${INSTALL_DIR}/.git" ]; then
    cd "${INSTALL_DIR}" && git pull origin main 2>/dev/null || true
  else
    git clone -b main --single-branch https://github.com/xuspanel/NexusPanel.git "${INSTALL_DIR}" 2>/dev/null || {
      log_warning "Git clone failed — using local copy"
      if [ -d "${SCRIPT_DIR}/nxApp" ]; then
        cp -r "${SCRIPT_DIR}/nxApp/"* "${INSTALL_DIR}/" 2>/dev/null || true
      fi
    }
  fi

  if [ -d "${INSTALL_DIR}/nxApp" ]; then
    shopt -s dotglob
    cp -r "${INSTALL_DIR}/nxApp/"* "${INSTALL_DIR}/" 2>/dev/null || true
    rm -rf "${INSTALL_DIR}/nxApp" 2>/dev/null || true
    shopt -u dotglob
  fi

  save_checkpoint "npm_install"
  log_info "Installing Node.js dependencies..."
  cd "${INSTALL_DIR}"
  npm install --production 2>&1 | tail -3 || npm install 2>&1 | tail -3

  save_checkpoint "env_file"
  JWT_SECRET=$(openssl rand -hex 32)
  generate_env_file

  save_checkpoint "service"
  create_systemd_service "nexuspanel" "${INSTALL_DIR}/server.js"
  systemctl start nexuspanel 2>/dev/null || true

  save_checkpoint "firewall"
  configure_firewall

  save_checkpoint "nginx"
  if [ -n "${DOMAIN:-}" ]; then
    configure_nginx "${DOMAIN}" "${PORT:-3443}"
    configure_auto_updates
  fi

  save_checkpoint "apparmor"
  configure_apparmor

  save_checkpoint "verify"
  sleep 2
  verify_installation || true

  clear_checkpoint
  generate_summary
}

main "$@"
