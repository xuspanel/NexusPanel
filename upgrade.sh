#!/usr/bin/env bash
# ============================================================================
# NexusPanel Upgrade Utility v2.0
# Upgrades NexusPanel to the latest version while preserving all configuration.
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
  echo -e "${CYAN}"
  echo "    ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗"
  echo "    ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝"
  echo "    ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗"
  echo "    ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║"
  echo "    ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║"
  echo "    ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚══════╝ ╚══════╝"
  echo -e "${NC}"
  echo -e "         ${BOLD}NexusPanel Upgrade Utility${NC} v${VERSION}"
  echo ""
}

# ─── Backup Configuration ──────────────────────────
backup_config() {
  local backup_dir="/tmp/nexuspanel-upgrade-$(date +%s)"

  log_info "Creating backup of configuration and database..."
  mkdir -p "${backup_dir}"

  if [ -f "${INSTALL_DIR}/.env" ]; then
    cp "${INSTALL_DIR}/.env" "${backup_dir}/.env"
    log_ok "Configuration backed up"
  fi

  if [ -d "${INSTALL_DIR}/data" ]; then
    cp -r "${INSTALL_DIR}/data" "${backup_dir}/data"
    log_ok "Database backed up"
  fi

  cp -r "${INSTALL_DIR}/node_modules" "${backup_dir}/node_modules" 2>/dev/null || true

  echo "${backup_dir}"
}

# ─── Detect Installation ───────────────────────────
detect_installation() {
  local dirs=(
    /usr/local/opt/nexuspanel
    /opt/nexuspanel
    /usr/local/nexuspanel
    /usr/share/nexuspanel
  )

  for dir in "${dirs[@]}"; do
    if [ -f "${dir}/server.js" ]; then
      INSTALL_DIR="${dir}"
      log_info "Found installation at: ${INSTALL_DIR}"
      return 0
    fi
  done

  return 1
}

# ─── Version Comparison ────────────────────────────
compare_versions() {
  local current="$1"
  local latest="$2"
  [ "$(printf '%s\n' "${current}" "${latest}" | sort -V | tail -1)" = "${latest}" ]
}

fetch_versions() {
  log_info "Fetching latest version info..."

  if command -v git >/dev/null 2>&1 && [ -d "${INSTALL_DIR}/.git" ]; then
    CURRENT_VERSION=$(cd "${INSTALL_DIR}" && git describe --tags --abbrev=0 2>/dev/null || echo "0.0.0")
    LATEST_VERSION=$(git ls-remote --tags "https://github.com/xuspanel/NexusPanel.git" 2>/dev/null \
      | awk -F/ '{print $3}' | sort -V | tail -1 || echo "0.0.0")
  else
    CURRENT_VERSION=$(grep -oP '"version": "\K[^"]+' "${INSTALL_DIR}/package.json" 2>/dev/null || echo "0.0.0")
    LATEST_VERSION=$(curl -sL "https://raw.githubusercontent.com/xuspanel/NexusPanel/main/package.json" \
      | grep -oP '"version": "\K[^"]+' 2>/dev/null || echo "0.0.0")
  fi

  log_info "Current version: ${CURRENT_VERSION}"
  log_info "Latest version:  ${LATEST_VERSION}"

  if [ "${CURRENT_VERSION}" = "${LATEST_VERSION}" ]; then
    log_ok "Already at latest version!"
    exit 0
  fi

  if ! compare_versions "${CURRENT_VERSION}" "${LATEST_VERSION}"; then
    log_info "Upgrade available: ${CURRENT_VERSION} → ${LATEST_VERSION}"
  fi
}

# ─── Update via Git ────────────────────────────────
update_via_git() {
  log_info "Updating via git pull..."

  cd "${INSTALL_DIR}"

  # Stash local changes (should be none, but safe)
  git stash 2>/dev/null || true

  # Pull latest
  git pull origin main 2>&1 | tail -5 || {
    log_warning "Git pull failed — trying fetch + reset"
    git fetch origin 2>/dev/null || true
    git reset --hard origin/main 2>/dev/null || true
  }

  log_ok "Source code updated"
}

# ─── Update via Download ────────────────────────────
update_via_download() {
  log_info "Downloading latest version..."

  local tmp_dir
  tmp_dir=$(mktemp -d)
  cd "${tmp_dir}"
  curl -sL "https://github.com/xuspanel/NexusPanel/archive/main.tar.gz" | tar xz 2>/dev/null || {
    log_error "Download failed"
    rm -rf "${tmp_dir}"
    exit 1
  }

  local archive_dir
  archive_dir=$(find "${tmp_dir}" -maxdepth 1 -type d | tail -1)

  if [ -d "${archive_dir}/nxApp" ]; then
    # Preserve .env and data
    local env_backup
    env_backup=$(mktemp)
    [ -f "${INSTALL_DIR}/.env" ] && cp "${INSTALL_DIR}/.env" "${env_backup}"
    [ -d "${INSTALL_DIR}/data" ] && cp -r "${INSTALL_DIR}/data" "${tmp_dir}/data-backup"

    # Replace installation
    rm -rf "${INSTALL_DIR}"
    mkdir -p "${INSTALL_DIR}"
    cp -r "${archive_dir}/nxApp/"* "${INSTALL_DIR}/"

    # Restore preservation
    [ -f "${env_backup}" ] && cp "${env_backup}" "${INSTALL_DIR}/.env"
    [ -d "${tmp_dir}/data-backup" ] && cp -r "${tmp_dir}/data-backup" "${INSTALL_DIR}/data"
    rm -f "${env_backup}"
  fi

  rm -rf "${tmp_dir}"
  log_ok "Source code updated"
}

# ─── npm Update ─────────────────────────────────────
update_npm() {
  log_info "Updating npm packages..."

  cd "${INSTALL_DIR}"
  npm prune --production 2>/dev/null || true
  npm install --production 2>&1 | tail -3 || true

  log_ok "npm packages updated"
}

# ─── Migration Scripts ─────────────────────────────
run_migrations() {
  if [ -f "${INSTALL_DIR}/migrate.js" ]; then
    log_info "Running database migrations..."
    cd "${INSTALL_DIR}" && node migrate.js 2>&1 | tail -5 || true
    log_ok "Migrations complete"
  fi
}

# ─── Service Restart ────────────────────────────────
restart_service() {
  log_info "Restarting NexusPanel services..."

  case "$(uname -s)" in
    Darwin)
      service_manage restart nexuspanel
      ;;
    Linux)
      systemctl daemon-reload 2>/dev/null || true
      if systemctl list-unit-files --type=service --no-legend 2>/dev/null | grep -q 'nexuspanel-daemon'; then
        systemctl restart nexuspanel-daemon 2>/dev/null || systemctl start nexuspanel-daemon 2>/dev/null || true
      fi
      service_manage restart nexuspanel
      service_manage restart nginx 2>/dev/null || true
      ;;
  esac

  log_ok "Services restarted"
}

# ─── Verification ───────────────────────────────────
verify_upgrade() {
  log_info "Verifying upgrade..."

  sleep 2

  local port
  port=$(grep -oP '^PORT=\K\d+' "${INSTALL_DIR}/.env" 2>/dev/null || echo "3443")

  if curl -sk --max-time 5 "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
    log_ok "Health check passed"
  else
    log_warning "Health check failed — service may still be starting"
  fi

  # Verify config was preserved
  if [ -f "${INSTALL_DIR}/.env" ]; then
    log_ok "Configuration preserved"
  else
    log_error "Configuration lost during upgrade!"
    exit 13
  fi
}

# ─── Cleanup ────────────────────────────────────────
cleanup_backups() {
  # Keep only the 3 most recent backups
  ls -t /tmp/nexuspanel-upgrade-* 2>/dev/null | tail -n +4 | xargs rm -rf 2>/dev/null || true
}

# ─── Main ─────────────────────────────────────────────
main() {
  show_banner

  if [ "$(id -u)" -ne 0 ]; then
    log_info "Restarting with root privileges..."
    exec sudo "$0" "$@"
  fi

  if ! detect_installation; then
    log_error "No NexusPanel installation found"
    exit 10
  fi

  fetch_versions

  log_info "Starting upgrade..."
  echo ""

  BACKUP_DIR=$(backup_config)

  if [ -d "${INSTALL_DIR}/.git" ]; then
    update_via_git
  else
    update_via_download
  fi

  update_npm
  run_migrations

  # Two-Tier Migration: Enforce user/group creation, file permissions & systemd services
  if command -v setup_two_tier_environment >/dev/null 2>&1; then
    setup_two_tier_environment
    create_systemd_service "nexuspanel" "${INSTALL_DIR}/server.js"
  fi

  restart_service
  verify_upgrade
  cleanup_backups

  echo ""
  log_ok "Upgrade complete!"
  log_info "Backup saved to: ${BACKUP_DIR}"
  log_info "To rollback: cp ${BACKUP_DIR}/.env ${INSTALL_DIR}/.env"
  echo ""
}

main "$@"
