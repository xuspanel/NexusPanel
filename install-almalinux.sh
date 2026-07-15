#!/usr/bin/env bash
# ============================================================================
# NexusPanel Installer v2.0 — AlmaLinux / RHEL
# Platform: AlmaLinux 8/9, Rocky Linux 8/9, RHEL 8/9, CentOS Stream
# Package Manager: DNF
# Firewall: Firewalld
# SELinux: Targeted (with policy module)
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
  else
    log_error "Cannot detect OS"
    exit ${EXIT_GENERAL_ERROR}
  fi

  case "${OS}" in
    almalinux|rocky|rhel|centos|fedora) ;;
    *)
      log_error "This script supports RHEL-family only (detected: ${OS})"
      log_info "Please use the appropriate installer for your OS"
      exit ${EXIT_GENERAL_ERROR}
      ;;
  esac

  log_info "Detected: ${OS} ${OS_VERSION}"
}

# ─── Repository Configuration ─────────────────────────
configure_repos() {
  log_info "Configuring repositories..."

  case "${OS}" in
    almalinux|rocky)
      run_cmd dnf install -y epel-release 2>/dev/null || true
      run_cmd dnf config-manager --set-enabled crb 2>/dev/null || \
      run_cmd dnf config-manager --set-enabled powertools 2>/dev/null || true
      ;;
    rhel)
      run_cmd dnf install -y https://dl.fedoraproject.org/pub/epel/epel-release-latest-${OS_VERSION}.noarch.rpm 2>/dev/null || true
      run_cmd dnf config-manager --set-enabled codeready-builder-for-rhel-${OS_VERSION}-rhui-rpms 2>/dev/null || true
      ;;
    centos)
      run_cmd dnf install -y epel-release 2>/dev/null || true
      run_cmd dnf config-manager --set-enabled powertools 2>/dev/null || true
      ;;
    fedora)
      # Fedora includes EPEL-like packages by default
      ;;
  esac
}

# ─── SELinux Configuration ────────────────────────────
configure_selinux() {
  if ! command -v getenforce >/dev/null 2>&1; then
    log_info "SELinux not installed — skipping"
    return 0
  fi

  local mode
  mode=$(getenforce 2>/dev/null)
  log_info "SELinux mode: ${mode}"

  if ${DRY_RUN}; then
    log_info "[DRY-RUN] Would create SELinux policy module"
    return 0
  fi

  # Create SELinux policy module for NexusPanel
  local policy_file="/tmp/nexuspanel.te"
  cat > "${policy_file}" << SELINUX_POLICY
module nexuspanel 1.0;

require {
    type http_port_t;
    type unreserved_port_t;
    type tmp_t;
    type var_log_t;
    type etc_t;
    type node_t;
    class tcp_socket { name_bind name_connect };
    class file { read write create unlink };
    class dir { read write add_name remove_name search };
}

# Allow Node.js to bind to our ports
allow node_t http_port_t:tcp_socket name_bind;
allow node_t unreserved_port_t:tcp_socket name_bind;

# Allow writing logs
allow node_t var_log_t:dir { write search add_name };
allow node_t var_log_t:file { create write };

# Allow writing config
allow node_t etc_t:file { write create };

# Allow temporary files
allow node_t tmp_t:file { read write create };
SELINUX_POLICY

  # Compile and load the policy
  if command -v checkmodule >/dev/null 2>&1 && command -v semodule >/dev/null 2>&1; then
    checkmodule -M -m /tmp/nexuspanel.te -o /tmp/nexuspanel.mod 2>/dev/null || true
    semodule_package -m /tmp/nexuspanel.mod -o /tmp/nexuspanel.pp 2>/dev/null || true
    semodule -i /tmp/nexuspanel.pp 2>/dev/null || true
    log_info "SELinux policy module loaded"
    rm -f /tmp/nexuspanel.{te,mod,pp} 2>/dev/null || true
  else
    log_warning "SELinux policy tools not available — set SELinux to permissive if issues occur"
    log_info "  setenforce 0"
    log_info "  sed -i 's/SELINUX=enforcing/SELINUX=permissive/' /etc/selinux/config"
  fi
}

# ─── Dependency Installation ──────────────────────────
install_system_deps() {
  log_info "Installing system dependencies..."

  configure_repos

  local base_packages=(
    curl wget git openssl
    nodejs
    nginx certbot python3-certbot-nginx
    firewalld
    rsyslog
    dnf-automatic
  )

  # Install Node.js via DNF module
  run_cmd dnf module enable -y nodejs:20 2>/dev/null || true
  run_cmd dnf install -y "${base_packages[@]}" 2>/dev/null || true

  # Verify Node.js version
  local node_ver
  node_ver=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1 || echo "0")
  if [ "${node_ver}" -lt 18 ]; then
    log_info "Installing Node.js 20.x via nodesource..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    run_cmd dnf install -y nodejs
  fi

  log_success "System dependencies installed"
}

install_optional_deps() {
  if ${INSTALL_DOCKER}; then
    log_info "Installing Docker..."
    if ! command -v docker >/dev/null 2>&1; then
      run_cmd dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 2>/dev/null || true
      run_cmd dnf install -y docker-ce docker-ce-cli containerd.io 2>/dev/null || true
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
    run_cmd dnf install -y postgresql-server postgresql-contrib 2>/dev/null || true
    postgresql-setup --initdb 2>/dev/null || true
    run_cmd systemctl enable --now postgresql 2>/dev/null || true
  fi

  if ${INSTALL_CLAMAV}; then
    log_info "Installing ClamAV..."
    run_cmd dnf install -y clamav clamav-update 2>/dev/null || true
    freshclam 2>/dev/null || true
    run_cmd systemctl enable --now clamd 2>/dev/null || true
  fi
}

# ─── Firewall Configuration ───────────────────────────
configure_firewall() {
  log_info "Configuring Firewalld..."

  if ${DRY_RUN}; then
    log_info "[DRY-RUN] Would configure Firewalld"
    return 0
  fi

  configure_firewalld "${PORT:-3443}"
}

# ─── Automatic Updates ────────────────────────────────
configure_auto_updates() {
  log_info "Configuring dnf-automatic..."
  if ${DRY_RUN}; then
    log_info "[DRY-RUN] Would configure dnf-automatic"
    return 0
  fi

  if [ -f /etc/dnf/automatic.conf ]; then
    sed -i 's/^apply_updates.*/apply_updates = yes/' /etc/dnf/automatic.conf
    run_cmd systemctl enable --now dnf-automatic.timer 2>/dev/null || true
    log_info "dnf-automatic configured for security updates"
  fi
}

# ─── Rsyslog Configuration ────────────────────────────
configure_logging() {
  if [ -d /etc/rsyslog.d ]; then
    cat > /etc/rsyslog.d/nexuspanel.conf << RSYSLOG
if \$programname == 'nexuspanel' then {
    action(type="omfile" file="${LOG_DIR}/nexuspanel.log")
    stop
}
RSYSLOG
    run_cmd systemctl restart rsyslog 2>/dev/null || true
  fi
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

  save_checkpoint "selinux"
  configure_selinux

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

  save_checkpoint "logging"
  configure_logging

  save_checkpoint "verify"
  sleep 2
  verify_installation || true

  clear_checkpoint
  generate_summary
}

main "$@"
