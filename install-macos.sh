#!/usr/bin/env bash
# ============================================================================
# NexusPanel Installer v2.0 — macOS
# Platform: macOS 12+ (Monterey/Ventura/Sonoma/Sequoia)
# Package Manager: Homebrew
# Service: LaunchDaemon
# Architectures: Intel (x86_64) and Apple Silicon (arm64)
# ============================================================================
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "${SCRIPT_DIR}/install-common.sh" ]; then
  source "${SCRIPT_DIR}/install-common.sh"
else
  source <(curl -sL "https://raw.githubusercontent.com/xuspanel/NexusPanel/main/nxApp/install-common.sh")
fi

# macOS-specific paths
: "${INSTALL_DIR:=/usr/local/opt/nexuspanel}"
: "${LOG_DIR:=/usr/local/var/log/nexuspanel}"
: "${DATA_DIR:=${INSTALL_DIR}/data}"
: "${HOME_DIR:=${HOME}}"
LAUNCHD_PLIST="/Library/LaunchDaemons/com.nexuspanel.plist"

# ─── OS Detection ─────────────────────────────────────
detect_os() {
  case "$(uname -s)" in
    Darwin) ;;
    *)
      log_error "This script is for macOS only"
      exit ${EXIT_GENERAL_ERROR}
      ;;
  esac

  local ver
  ver=$(sw_vers -productVersion 2>/dev/null)
  local major
  major=$(echo "${ver}" | cut -d. -f1)
  if [ "${major}" -lt 12 ]; then
    log_warning "macOS ${ver} detected — version 12+ recommended"
  fi

  local arch
  arch=$(uname -m)
  log_info "Detected: macOS ${ver} (${arch})"
}

# ─── Pre-installation Checks ──────────────────────────
check_prerequisites_macos() {
  log_info "Running macOS pre-installation checks..."

  # Root check (LaunchDaemon needs root)
  check_root "$@"

  # Disk space
  local available
  available=$(df -m / | awk 'NR==2 {print int($4)}')
  if [ -n "${available}" ] && [ "${available}" -lt ${MIN_DISK_SPACE} ]; then
    log_error "Insufficient disk space: ${available}MB (need ${MIN_DISK_SPACE}MB)"
    exit ${EXIT_DISK_SPACE}
  fi
  log_info "Disk space: ${available}MB available"

  # Memory
  local total_mem
  total_mem=$(sysctl -n hw.memsize 2>/dev/null | awk '{print int($1/1024/1024)}')
  if [ -n "${total_mem}" ] && [ "${total_mem}" -lt ${MIN_MEMORY} ]; then
    log_warning "Memory: ${total_mem}MB (minimum recommended: ${MIN_MEMORY}MB)"
  fi

  # Internet connectivity
  if ! curl -sk --connect-timeout 5 --max-time 10 https://github.com >/dev/null 2>&1; then
    log_warning "Internet connectivity check failed"
  fi

  # Homebrew
  if ! command -v brew >/dev/null 2>&1; then
    log_info "Homebrew not found — installing..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Add Homebrew to PATH for Apple Silicon
    if [ "$(uname -m)" = "arm64" ]; then
      echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "${HOME}/.zprofile"
      eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
  fi

  log_success "Pre-installation checks passed"
}

# ─── Dependency Installation ──────────────────────────
install_deps() {
  log_info "Installing dependencies via Homebrew..."

  run_cmd brew update --quiet 2>/dev/null || true

  # Install Node.js
  if ! command -v node >/dev/null 2>&1; then
    run_cmd brew install node@20
    run_cmd brew link --overwrite node@20
  else
    local node_ver
    node_ver=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "${node_ver}" -lt 18 ]; then
      run_cmd brew upgrade node
    fi
  fi

  # Install Git
  if ! command -v git >/dev/null 2>&1; then
    run_cmd brew install git
  fi

  # Optional: Docker
  if ${INSTALL_DOCKER}; then
    if ! command -v docker >/dev/null 2>&1; then
      log_info "Install Docker Desktop manually from https://docker.com"
      log_info "  brew install --cask docker"
    fi
  fi

  log_success "Dependencies installed"
}

# ─── Application Installation ─────────────────────────
install_app() {
  log_info "Installing NexusPanel..."

  if ${DRY_RUN}; then
    log_info "[DRY-RUN] Would install to ${INSTALL_DIR}"
    return 0
  fi

  mkdir -p "${INSTALL_DIR}" "${DATA_DIR}" "${LOG_DIR}"

  # Clone or update
  if [ -d "${INSTALL_DIR}/.git" ]; then
    cd "${INSTALL_DIR}" && git pull origin main 2>/dev/null || true
  else
    git clone https://github.com/xuspanel/NexusPanel.git "${INSTALL_DIR}" 2>/dev/null || {
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

  # npm install
  cd "${INSTALL_DIR}"
  npm install --production 2>&1 | tail -3 || true

  log_success "Application installed"
}

# ─── LaunchDaemon ─────────────────────────────────────
create_launchdaemon() {
  log_info "Creating LaunchDaemon..."

  if ${DRY_RUN}; then
    log_info "[DRY-RUN] Would create ${LAUNCHD_PLIST}"
    return 0
  fi

  local node_path
  node_path=$(command -v node)

  cat > "${LAUNCHD_PLIST}" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.nexuspanel</string>

    <key>ProgramArguments</key>
    <array>
        <string>${node_path}</string>
        <string>${INSTALL_DIR}/server.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${INSTALL_DIR}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>PORT</key>
        <string>${PORT:-3443}</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/nexuspanel.log</string>

    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/nexuspanel-error.log</string>

    <key>ThrottleInterval</key>
    <integer>5</integer>

    <key>Nice</key>
    <integer>-10</integer>

    <key>WatchPaths</key>
    <array>
        <string>${INSTALL_DIR}</string>
    </array>

    <key>HardResourceLimits</key>
    <dict>
        <key>NumberOfFiles</key>
        <integer>65536</integer>
    </dict>
</dict>
</plist>
PLIST

  chmod 644 "${LAUNCHD_PLIST}"
  log_info "LaunchDaemon created at ${LAUNCHD_PLIST}"
}

# ─── Service Management ───────────────────────────────
start_service() {
  log_info "Starting NexusPanel service..."

  if ${DRY_RUN}; then
    log_info "[DRY-RUN] Would load LaunchDaemon"
    return 0
  fi

  launchctl unload "${LAUNCHD_PLIST}" 2>/dev/null || true
  launchctl load -w "${LAUNCHD_PLIST}" 2>/dev/null || {
    log_error "Failed to load LaunchDaemon — check permissions or SIP status"
    log_info "System Integrity Protection (SIP) may need to be configured"
    return ${EXIT_SERVICE_FAILURE}
  }

  log_success "Service loaded via launchctl"
}

# ─── Firewall Configuration ───────────────────────────
configure_firewall_macos() {
  log_info "Configuring macOS firewall..."

  if ${DRY_RUN}; then
    log_info "[DRY-RUN] Would configure socket filter firewall"
    return 0
  fi

  # Use /usr/libexec/ApplicationFirewall/socketfilterfw
  if [ -f /usr/libexec/ApplicationFirewall/socketfilterfw ]; then
    /usr/libexec/ApplicationFirewall/socketfilterfw --add \
      "$(command -v node)" 2>/dev/null || true
    log_info "Node.js added to firewall whitelist"
  fi
}

# ─── Keychain Integration ─────────────────────────────
store_in_keychain() {
  if ${DRY_RUN}; then
    log_info "[DRY-RUN] Would store credentials in Keychain"
    return 0
  fi

  if command -v security >/dev/null 2>&1; then
    security add-generic-password -a "nexuspanel" \
      -s "NexusPanel Admin Password" \
      -w "${ADMIN_PASS:-}" \
      -U 2>/dev/null || true
    log_info "Credentials stored in Keychain"
  fi
}

# ─── Verification ─────────────────────────────────────
verify_macos() {
  log_info "Verifying installation..."
  local checks_passed=0
  local checks_failed=0

  # LaunchDaemon loaded
  if launchctl list | grep -q "com.nexuspanel"; then
    log_success "LaunchDaemon is loaded"
    checks_passed=$((checks_passed + 1))
  else
    log_error "LaunchDaemon is NOT loaded"
    checks_failed=$((checks_failed + 1))
  fi

  # Port
  if lsof -i ":${PORT:-3443}" >/dev/null 2>&1; then
    log_success "Port ${PORT:-3443} is listening"
    checks_passed=$((checks_passed + 1))
  else
    log_error "Port ${PORT:-3443} is NOT listening"
    checks_failed=$((checks_failed + 1))
  fi

  # Health check
  if curl -sk --max-time 5 "http://127.0.0.1:${PORT:-3443}/health" >/dev/null 2>&1; then
    log_success "Health check passed"
    checks_passed=$((checks_passed + 1))
  else
    log_error "Health check failed"
    checks_failed=$((checks_failed + 1))
  fi

  if [ ${checks_failed} -eq 0 ]; then
    log_success "All checks passed!"
  else
    log_warning "${checks_passed} passed, ${checks_failed} failed"
  fi
}

# ─── Summary ──────────────────────────────────────────
summary_macos() {
  echo ""
  log_success "NexusPanel macOS installation complete!"
  echo ""
  echo -e "  ${BOLD}URL:${NC}       http://localhost:${PORT:-3443}"
  echo -e "  ${BOLD}Config:${NC}    ${INSTALL_DIR}/.env"
  echo -e "  ${BOLD}Logs:${NC}      ${LOG_DIR}"
  echo ""
  echo -e "  ${BOLD}Manage:${NC}"
  echo "    launchctl load -w ${LAUNCHD_PLIST}"
  echo "    launchctl unload ${LAUNCHD_PLIST}"
  echo "    launchctl list com.nexuspanel"
}

# ─── Main ─────────────────────────────────────────────
main() {
  show_banner
  setup_logging

  detect_os
  check_prerequisites_macos "$@"

  if ${INTERACTIVE}; then
    if [ -z "${LICENSE_KEY:-}" ]; then
      read -p "License Key [NX-XXXX-XXXX-XXXX]: " LICENSE_KEY
    fi
    if [ -z "${DOMAIN:-}" ]; then
      read -p "Domain (leave empty for localhost): " DOMAIN
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
  fi

  if [ -n "${LICENSE_KEY:-}" ]; then
    validate_license "${LICENSE_KEY}" "${DOMAIN:-}" || exit ${EXIT_LICENSE_INVALID}
  fi

  install_deps
  install_app

  JWT_SECRET=$(openssl rand -hex 32)
  generate_env_file
  store_in_keychain

  save_checkpoint "launchd"
  create_launchdaemon
  start_service

  save_checkpoint "firewall"
  configure_firewall_macos

  save_checkpoint "verify"
  sleep 2
  verify_macos || true

  clear_checkpoint
  summary_macos
}

main "$@"
