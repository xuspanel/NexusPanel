#!/usr/bin/env bash
# ============================================================================
# NexusPanel Universal Installer v2.0
# Detects OS and delegates to the appropriate installer script.
#
# Usage:
#   curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install.sh | bash
#   bash install.sh [--license KEY] [--domain DOMAIN] [--port PORT] [--docker] [--postgres] [--unattended] [--dry-run]
#   pwsh -c "iwr https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install.sh | iex"
# ============================================================================
set -euo pipefail
IFS=$'\n\t'

VERSION="2.0.0"

# ─── Colors ───────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'

# ─── Proxy Detection ──────────────────────────────────
# Detect if running via pipe (curl | bash)
IS_PIPED=false
SCRIPT_SOURCE=""
if [ "${0:0:1}" = "/" ]; then
  SCRIPT_SOURCE="$(dirname "$0")"
elif [ "$0" = "bash" ] || [ "$0" = "sh" ] || [[ "$0" == /dev/fd/* ]]; then
  IS_PIPED=true
  SCRIPT_SOURCE="/tmp/nexuspanel-${$}"
else
  SCRIPT_SOURCE="$(cd "$(dirname "$0")" && pwd)"
fi

# ─── Console Helpers ─────────────────────────────────
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
  echo -e "         ${BOLD}Universal Installer v${VERSION}${NC}"
  echo ""
}

# ─── OS Detection ────────────────────────────────────
detect_os() {
  local os=""
  local distro=""

  case "$(uname -s)" in
    Darwin)
      os="macos"
      distro="macos"
      ;;
    Linux)
      os="linux"
      if [ -f /etc/os-release ]; then
        . /etc/os-release
        case "${ID,,}" in
          ubuntu) distro="ubuntu" ;;
          debian) distro="debian" ;;
          almalinux) distro="almalinux" ;;
          rocky) distro="rocky" ;;
          centos) distro="centos" ;;
          fedora) distro="fedora" ;;
          rhel)  distro="almalinux" ;;
          *)     distro="${ID,,}" ;;
        esac
      elif [ -f /etc/redhat-release ]; then
        if grep -qi "almalinux" /etc/redhat-release; then
          distro="almalinux"
        elif grep -qi "rocky" /etc/redhat-release; then
          distro="rocky"
        elif grep -qi "centos" /etc/redhat-release; then
          distro="centos"
        elif grep -qi "fedora" /etc/redhat-release; then
          distro="fedora"
        else
          distro="almalinux"
        fi
      elif [ -f /etc/debian_version ]; then
        distro="ubuntu"
      fi
      ;;
    MINGW*|MSYS*|CYGWIN*)
      os="windows"
      distro="windows"
      ;;
    *)
      os="unknown"
      distro="unknown"
      ;;
  esac

  echo "${distro}"
}

# ─── Check if we are being re-executed after download ─
handle_piped_execution() {
  if ${IS_PIPED}; then
    log_info "Detected piped execution — downloading installer package..."
    rm -rf "/tmp/nexuspanel-${$}" 2>/dev/null || true
    mkdir -p "/tmp/nexuspanel-${$}"

    # Download full installer suite
    for script in install.sh install-common.sh install-ubuntu.sh install-debian.sh \
                  install-almalinux.sh install-centos.sh install-rocky.sh install-fedora.sh \
                  install-macos.sh install-windows.ps1; do
      curl -sL "https://raw.githubusercontent.com/xuspanel/NexusPanel/main/${script}" \
        -o "/tmp/nexuspanel-${$}/${script}" 2>/dev/null || true
    done
    chmod +x "/tmp/nexuspanel-${$}/"*.sh 2>/dev/null || true

    SCRIPT_SOURCE="/tmp/nexuspanel-${$}"
    log_info "Downloaded to ${SCRIPT_SOURCE}"

    # Re-exec with downloaded installer
    if [ $# -gt 0 ]; then
      exec bash "${SCRIPT_SOURCE}/install.sh" "$@"
    else
      exec bash "${SCRIPT_SOURCE}/install.sh"
    fi
    # Should not reach here
    exit 0
  fi
}

# ─── Parse Arguments ─────────────────────────────────
parse_args() {
  LICENSE_KEY=""
  DOMAIN=""
  PORT="3443"
  ADMIN_USER="admin"
  ADMIN_PASS=""
  INSTALL_DOCKER=false
  INSTALL_POSTGRES=false
  UNATTENDED=false
  DRY_RUN=false

  while [ $# -gt 0 ]; do
    case "$1" in
      --license)    LICENSE_KEY="$2"; shift 2 ;;
      --domain)     DOMAIN="$2"; shift 2 ;;
      --port)       PORT="$2"; shift 2 ;;
      --admin-user) ADMIN_USER="$2"; shift 2 ;;
      --admin-pass) ADMIN_PASS="$2"; shift 2 ;;
      --docker)     INSTALL_DOCKER=true; shift ;;
      --postgres)   INSTALL_POSTGRES=true; shift ;;
      --unattended) UNATTENDED=true; shift ;;
      --dry-run)    DRY_RUN=true; shift ;;
      -h|--help)    show_usage; exit 0 ;;
      *)            log_error "Unknown option: $1"; show_usage; exit 1 ;;
    esac
  done
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
  echo "  --docker          Install Docker alongside NexusPanel"
  echo "  --postgres        Install PostgreSQL alongside NexusPanel"
  echo "  --unattended      Non-interactive installation"
  echo "  --dry-run         Simulate installation without changes"
  echo "  -h, --help        Show this help"
  echo ""
  echo "Quick install:"
  echo "  curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install.sh | bash"
}

# ─── Main ─────────────────────────────────────────────
main() {
  show_banner

  # Are we being piped?
  handle_piped_execution "$@"

  # Parse args
  parse_args "$@"

  # Detect OS
  local distro
  distro=$(detect_os)
  log_info "Detected OS: ${distro}"
  echo ""

  # Build common args
  local common_args=""
  [ -n "${LICENSE_KEY}" ]    && common_args+=" --license ${LICENSE_KEY}"
  [ -n "${DOMAIN}" ]         && common_args+=" --domain ${DOMAIN}"
  [ -n "${PORT}" ]           && common_args+=" --port ${PORT}"
  [ -n "${ADMIN_USER}" ]     && common_args+=" --admin-user ${ADMIN_USER}"
  [ -n "${ADMIN_PASS}" ]     && common_args+=" --admin-pass ${ADMIN_PASS}"
  ${INSTALL_DOCKER}          && common_args+=" --docker"
  ${INSTALL_POSTGRES}        && common_args+=" --postgres"
  ${UNATTENDED}              && common_args+=" --unattended"
  ${DRY_RUN}                 && common_args+=" --dry-run"

  local installer=""
  case "${distro}" in
    ubuntu)
      installer="${SCRIPT_SOURCE}/install-ubuntu.sh"
      ;;
    debian)
      installer="${SCRIPT_SOURCE}/install-debian.sh"
      ;;
    almalinux)
      installer="${SCRIPT_SOURCE}/install-almalinux.sh"
      ;;
    rocky)
      installer="${SCRIPT_SOURCE}/install-rocky.sh"
      ;;
    centos)
      installer="${SCRIPT_SOURCE}/install-centos.sh"
      ;;
    fedora)
      installer="${SCRIPT_SOURCE}/install-fedora.sh"
      ;;
    macos)
      installer="${SCRIPT_SOURCE}/install-macos.sh"
      ;;
    windows)
      log_info "Detected Windows — launching PowerShell installer..."
      if command -v pwsh >/dev/null 2>&1; then
        exec pwsh -ExecutionPolicy Bypass -File "${SCRIPT_SOURCE}/install-windows.ps1" \
          -LicenseKey "${LICENSE_KEY}" -Domain "${DOMAIN}" -Port ${PORT} \
          -AdminUser "${ADMIN_USER}" -AdminPass "${ADMIN_PASS}" \
          -WithDocker:$INSTALL_DOCKER -WithPostgres:$INSTALL_POSTGRES -Silent:$UNATTENDED -DryRun:$DRY_RUN
      else
        log_error "PowerShell 7+ (pwsh) required for Windows installation"
        log_info "Install it from: https://github.com/PowerShell/PowerShell/releases"
        exit 1
      fi
      ;;
    docker)
      installer="${SCRIPT_SOURCE}/install-docker.sh"
      ;;
    *)
      log_error "Unsupported OS: ${distro}"
      log_info "Supported: Ubuntu, Debian, AlmaLinux, Rocky Linux, CentOS, Fedora, macOS, Windows, Docker"
      exit 1
      ;;
  esac

  if [ ! -f "${installer}" ]; then
    log_error "Installer not found: ${installer}"
    log_info "Do you have the full installer suite downloaded?"
    log_info "Try: curl -sL https://github.com/xuspanel/NexusPanel/archive/main.tar.gz | tar xz"
    exit 1
  fi

  log_info "Starting OS-specific installer: ${installer}"
  echo ""

  # Execute the OS-specific installer
  exec bash "${installer}" $common_args
}

main "$@"
