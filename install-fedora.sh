#!/usr/bin/env bash
# ============================================================================
# NexusPanel Installer v2.0 — Fedora
# Platform: Fedora 38+
# Package Manager: DNF (with COPR for extras)
# ============================================================================
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "${SCRIPT_DIR}/install-common.sh" ]; then
  source "${SCRIPT_DIR}/install-common.sh"
else
  source <(curl -sL "https://raw.githubusercontent.com/xuspanel/NexusPanel/main/nxApp/install-common.sh")
fi

OS_NAME="Fedora"
VERSION_CODENAME=""

# ─── OS Detection ─────────────────────────────────────
detect_os() {
  if ! [ -f /etc/fedora-release ]; then
    log_error "This script is for Fedora only"
    exit ${EXIT_GENERAL_ERROR}
  fi

  OS_NAME=$(head -1 /etc/fedora-release)
  VERSION_ID=$(rpm -E %fedora 2>/dev/null || echo "0")

  log_info "Detected: ${OS_NAME} ${VERSION_ID}"
}

# ─── Repositories ────────────────────────────────────
setup_repos() {
  log_info "Setting up repositories..."

  # Node.js from Nodesource (Fedora version)
  if [ ! -f /etc/yum.repos.d/nodesource-nodejs.repo ]; then
    run_cmd bash <(curl -sL https://rpm.nodesource.com/setup_20.x)
  fi

  # RPM Fusion for any extras
  if ! rpm -q rpmfusion-free-release >/dev/null 2>&1; then
    run_cmd dnf install -y "https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm" 2>/dev/null || true
  fi

  log_success "Repositories configured"
}

# ─── Package Installation ──────────────────────────
install_packages() {
  log_info "Installing Fedora packages..."

  local pkgs=(
    nginx
    nodejs
    git
    policycoreutils-python-utils
    certbot
    python3-certbot-nginx
    bind-utils
    curl
    wget
    openssl
    firewalld
    fail2ban
    chrony
    logrotate
    unattended-upgrades  # dnf-automatic on Fedora
  )

  run_cmd dnf install -y "${pkgs[@]}"

  # Enable dnf-automatic for security updates
  run_cmd systemctl enable --now dnf-automatic.timer 2>/dev/null || true

  log_success "Packages installed"
}

# ─── SELinux ──────────────────────────────────────────
configure_selinux() {
  log_info "Configuring SELinux..."

  if ! command -v getenforce >/dev/null 2>&1; then
    log_info "SELinux not available — skipping"
    return 0
  fi

  if [ "$(getenforce)" = "Disabled" ]; then
    log_warning "SELinux is disabled — consider enabling"
    return 0
  fi

  # Fedora has broader SELinux policies by default
  run_cmd semanage port -a -t http_port_t -p tcp "${PORT:-3443}" 2>/dev/null || \
    run_cmd semanage port -m -t http_port_t -p tcp "${PORT:-3443}" 2>/dev/null || true
  run_cmd setsebool -P httpd_can_network_connect 1
  run_cmd setsebool -P domain_can_mmap_files 1

  log_success "SELinux configured"
}

# ─── Main ─────────────────────────────────────────────
main() {
  show_banner
  setup_logging

  detect_os
  check_prerequisites "$@"
  setup_repos
  install_packages

  if ${INTERACTIVE}; then
    get_user_input
  fi

  if [ -n "${LICENSE_KEY:-}" ]; then
    validate_license "${LICENSE_KEY}" "${DOMAIN:-}" || exit ${EXIT_LICENSE_INVALID}
  fi

  install_app
  JWT_SECRET=$(openssl rand -hex 32)
  generate_env_file

  save_checkpoint "nginx"
  configure_nginx

  save_checkpoint "ssl"
  setup_ssl

  save_checkpoint "selinux"
  configure_selinux

  save_checkpoint "firewall"
  configure_firewall

  save_checkpoint "service"
  create_systemd_service
  start_service

  save_checkpoint "verify"
  sleep 2
  verify_installation || true

  clear_checkpoint
  show_summary
}

main "$@"
