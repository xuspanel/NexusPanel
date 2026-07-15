#!/usr/bin/env bash
# ============================================================================
# NexusPanel Installer v2.0 — Shared Library
# Platform: Cross-platform
# ============================================================================
set -euo pipefail
IFS=$'\n\t'

# ─── Version ──────────────────────────────────────────
VERSION="2.0.0"
INSTALL_DIR="/opt/nexuspanel"
LOG_DIR="/var/log/nexuspanel"
CONFIG_DIR="/etc/nexuspanel"
DATA_DIR="${INSTALL_DIR}/data"
BACKUP_DIR="${INSTALL_DIR}/backups"
MIN_DISK_SPACE=2048
MIN_MEMORY=1024
REQUIRED_PORTS=(80 443 3443)

# ─── Error Codes ──────────────────────────────────────
EXIT_SUCCESS=0
EXIT_GENERAL_ERROR=1
EXIT_ROOT_REQUIRED=2
EXIT_LICENSE_INVALID=3
EXIT_DEPENDENCY_FAILURE=4
EXIT_PORT_CONFLICT=5
EXIT_DISK_SPACE=6
EXIT_MEMORY=7
EXIT_NETWORK=8
EXIT_SSL_FAILURE=9
EXIT_DATABASE_FAILURE=10
EXIT_SERVICE_FAILURE=11
EXIT_USER_ABORT=12
EXIT_PERMISSION=13
EXIT_TIMEOUT=14
EXIT_VERSION_MISMATCH=15
EXIT_INVALID_ARGS=16

# ─── Colors ───────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; MAGENTA='\033[0;35m'; NC='\033[0m'; BOLD='\033[1m'

# ─── Flags ────────────────────────────────────────────
INTERACTIVE=true
FORCE=false
DRY_RUN=false
DEBUG=false
MINIMAL=false
INSTALL_DOCKER=false
INSTALL_PG=false
INSTALL_CLAMAV=false
INSTALL_PGADMIN=false
REMOVE_SSL=false

# ─── CLI Parsing ──────────────────────────────────────
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help|-h) show_help; exit 0 ;;
      --version|-v) echo "NexusPanel Installer v${VERSION}"; exit 0 ;;
      --dry-run) DRY_RUN=true ;;
      --force|-f) FORCE=true ;;
      --debug|-d) DEBUG=true ;;
      --minimal) MINIMAL=true; INTERACTIVE=false ;;
      --silent|-s) INTERACTIVE=false ;;
      --license=*) LICENSE_KEY="${1#*=}" ;;
      --domain=*) DOMAIN="${1#*=}" ;;
      --email=*) EMAIL="${1#*=}" ;;
      --port=*) PORT="${1#*=}" ;;
      --admin-user=*) ADMIN_USER="${1#*=}" ;;
      --admin-pass=*) ADMIN_PASS="${1#*=}" ;;
      --install-dir=*) INSTALL_DIR="${1#*=}" ;;
      --config=*) CONFIG_FILE="${1#*=}" ;;
      --with-docker) INSTALL_DOCKER=true ;;
      --with-postgres) INSTALL_PG=true ;;
      --with-clamav) INSTALL_CLAMAV=true ;;
      --with-pgadmin) INSTALL_PGADMIN=true ;;
      --remove-ssl) REMOVE_SSL=true ;;
      --yes|-y|--unattended) FORCE=true; INTERACTIVE=false ;;
      --docker) INSTALL_DOCKER=true ;;
      --postgres) INSTALL_PG=true ;;
      *) echo -e "${RED}Unknown option: $1${NC}"; show_help; exit ${EXIT_INVALID_ARGS} ;;
    esac
    shift
  done
}

show_help() {
  cat << HELP
NexusPanel Installer v${VERSION}
Usage: bash install.sh [options]

Options:
  --help, -h            Show this help
  --version, -v         Show version
  --dry-run             Simulate installation (no changes)
  --force, -f           Skip all prompts
  --debug, -d           Enable debug output
  --silent, -s          Non-interactive mode
  --minimal             Install core dependencies only
  --license=<key>       License key
  --domain=<domain>     Domain name
  --email=<email>       Email for Let's Encrypt
  --port=<port>         Panel port (default: 3443)
  --admin-user=<user>   Admin username
  --admin-pass=<pass>   Admin password
  --install-dir=<dir>   Installation directory
  --config=<file>       Config file path
  --with-docker         Install Docker
  --with-postgres       Install PostgreSQL
  --with-clamav         Install ClamAV
  --with-pgadmin        Install pgAdmin
  --yes, -y             Assume yes to all prompts
HELP
}

# ─── Root Check ───────────────────────────────────────
check_root() {
  if [ "$EUID" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
      SELF="$0"
      case "$SELF" in
        /dev/fd/*|/proc/self/fd/*)
          TMP=$(mktemp)
          if curl -sL "https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install.sh" -o "$TMP" 2>/dev/null; then
            chmod +x "$TMP"
            exec sudo bash "$TMP" "$@"
          fi
          echo -e "${RED}Cannot re-execute piped script with sudo.${NC}"
          echo -e "${YELLOW}Download and run directly:${NC}"
          echo "  curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install.sh -o install.sh"
          echo "  sudo bash install.sh"
          exit ${EXIT_ROOT_REQUIRED}
          ;;
      esac
      exec sudo bash "$(realpath "$SELF" 2>/dev/null || readlink -f "$SELF" 2>/dev/null || echo "$SELF")" "$@"
    fi
    echo -e "${RED}Root privileges are required.${NC}"
    echo -e "${YELLOW}Run with: sudo bash $0${NC}"
    exit ${EXIT_ROOT_REQUIRED}
  fi
}

# ─── Logging ──────────────────────────────────────────
LOG_FILE=""

setup_logging() {
  mkdir -p "${LOG_DIR}"
  LOG_FILE="${LOG_DIR}/install-$(date +%Y%m%d-%H%M%S).log"
  touch "${LOG_FILE}"
  echo "Installation log: ${LOG_FILE}"
}

log_info()    { echo -e "${CYAN}[INFO]${NC} $*"; echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $*" >> "${LOG_FILE}"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] $*" >> "${LOG_FILE}"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $*"; echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARNING] $*" >> "${LOG_FILE}"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*"; echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $*" >> "${LOG_FILE}"; }
log_debug()   { ${DEBUG} && echo -e "${MAGENTA}[DEBUG]${NC} $*"; echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEBUG] $*" >> "${LOG_FILE}"; }

# ─── Banner ───────────────────────────────────────────
show_banner() {
  echo -e "${CYAN}"
  echo "    ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗"
  echo "    ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝"
  echo "    ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗"
  echo "    ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║"
  echo "    ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║"
  echo "    ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝"
  echo -e "         ${BOLD}NexusPanel — VPS Control Center${NC}"
  echo -e "         ${CYAN}Installer v${VERSION}${NC}"
  echo ""
}

# ─── Pre-installation Checks ─────────────────────────
check_prerequisites() {
  log_info "Running pre-installation checks..."

  check_root "$@"

  # Disk space
  local available
  available=$(df -m "${INSTALL_DIR%/*}" 2>/dev/null | awk 'NR==2 {print int($4)}')
  if [ -z "${available}" ]; then
    available=$(df -m / 2>/dev/null | awk 'NR==2 {print int($4)}')
  fi
  if [ -n "${available}" ] && [ "${available}" -lt ${MIN_DISK_SPACE} ]; then
    log_error "Insufficient disk space: ${available}MB (need ${MIN_DISK_SPACE}MB)"
    exit ${EXIT_DISK_SPACE}
  fi
  log_info "Disk space: ${available}MB available (need ${MIN_DISK_SPACE}MB)"

  # Memory
  local total_mem
  total_mem=$(free -m 2>/dev/null | awk '/^Mem:/ {print int($2)}')
  if [ -n "${total_mem}" ] && [ "${total_mem}" -lt ${MIN_MEMORY} ]; then
    log_error "Insufficient memory: ${total_mem}MB (need ${MIN_MEMORY}MB)"
    exit ${EXIT_MEMORY}
  fi
  log_info "Memory: ${total_mem}MB (need ${MIN_MEMORY}MB)"

  # Internet connectivity
  if ! curl -sk --connect-timeout 5 --max-time 10 https://github.com >/dev/null 2>&1; then
    log_warning "Internet connectivity check failed (non-blocking)"
  else
    log_info "Internet connectivity: OK"
  fi

  # Port conflicts
  local has_ss
  has_ss=$(command -v ss >/dev/null 2>&1 && echo true || echo false)
  for p in "${REQUIRED_PORTS[@]}"; do
    if ${has_ss}; then
      if ss -tlnp | grep -q ":${p} "; then
        log_warning "Port ${p} is already in use"
      fi
    fi
  done

  # Existing installation
  if [ -f "${INSTALL_DIR}/.env" ]; then
    if ${FORCE}; then
      log_info "Existing installation detected at ${INSTALL_DIR} — proceeding (--force)"
    else
      log_info "Existing installation detected at ${INSTALL_DIR}"
      read -p "Upgrade existing installation? (Y/n): " UPGRADE
      UPGRADE=${UPGRADE:-Y}
      if [[ "${UPGRADE}" =~ ^[Yy] ]]; then
        if [ -f "${INSTALL_DIR}/../upgrade.sh" ]; then
          bash "${INSTALL_DIR}/../upgrade.sh" "$@"
          exit $?
        fi
        log_info "Proceeding with upgrade..."
      else
        log_error "Installation cancelled by user"
        exit ${EXIT_USER_ABORT}
      fi
    fi
  fi

  # DNS resolution
  if [ -n "${DOMAIN:-}" ]; then
    if ! host "${DOMAIN}" >/dev/null 2>&1; then
      log_warning "DNS resolution for ${DOMAIN} failed — SSL certbot may fail later"
    fi
  fi

  log_success "Pre-installation checks passed"
}

# ─── License Validation ───────────────────────────────
LICENSE_SERVER_URL="https://nxl.xus.me/api"
LICENSE_FALLBACK_SERVER="https://backup-license.xus.me/api"

validate_license() {
  local license_key="${1:-${LICENSE_KEY:-}}"
  local domain="${2:-${DOMAIN:-}}"
  local retry_count=0
  local max_retries=3

  if [ -z "${license_key}" ]; then
    log_error "License key is required"
    return ${EXIT_LICENSE_INVALID}
  fi

  log_info "Validating license key..."

  # Check offline license file
  if [ -f "${INSTALL_DIR}/.license" ]; then
    local cached
    cached=$(cat "${INSTALL_DIR}/.license" 2>/dev/null)
    if echo "${cached}" | grep -q '"valid":true'; then
      log_success "License validated via offline cache"
      export LICENSE_KEY="${license_key}"
      return ${EXIT_SUCCESS}
    fi
  fi

  # Online validation with retries
  while [ ${retry_count} -lt ${max_retries} ]; do
    local servers
    servers=("${LICENSE_SERVER_URL}" "${LICENSE_FALLBACK_SERVER}")
    for server in "${servers[@]}"; do
      log_debug "Attempting validation against ${server} (attempt $((retry_count + 1)))"

      local proxy_opts=""
      if [ -n "${http_proxy:-}" ]; then
        proxy_opts="-x ${http_proxy}"
      fi

      local validation_result
      validation_result=$(curl -sk --connect-timeout 15 --max-time 30 ${proxy_opts} \
        -X POST "${server}/validate" \
        -H 'Content-Type: application/json' \
        -d "{\"key\":\"${license_key}\",\"domain\":\"${domain}\",\"version\":\"${VERSION}\"}" 2>/dev/null \
        || echo '{"valid":false,"reason":"network_error"}')

      if echo "${validation_result}" | grep -q '"valid":true'; then
        echo "${validation_result}" > "${INSTALL_DIR}/.license" 2>/dev/null || true
        log_success "License key is valid!"

        local tier features expires
        tier=$(echo "${validation_result}" | grep -o '"tier":"[^"]*"' | cut -d'"' -f4)
        features=$(echo "${validation_result}" | grep -o '"features":"[^"]*"' | cut -d'"' -f4)
        expires=$(echo "${validation_result}" | grep -o '"expires":"[^"]*"' | cut -d'"' -f4)

        [ -n "${tier}" ] && log_info "Tier: ${tier}"
        [ -n "${features}" ] && log_info "Features: ${features}"
        [ -n "${expires}" ] && log_info "Expires: ${expires}"

        export LICENSE_KEY="${license_key}"
        export LICENSE_TIER="${tier}"
        export LICENSE_FEATURES="${features}"
        export LICENSE_EXPIRES="${expires}"
        return ${EXIT_SUCCESS}
      fi

      local reason
      reason=$(echo "${validation_result}" | grep -o '"reason":"[^"]*"' | cut -d'"' -f4)
      log_error "Validation failed on ${server}: ${reason:-unknown}"
    done

    retry_count=$((retry_count + 1))
    if [ ${retry_count} -lt ${max_retries} ]; then
      local wait=$((2 ** retry_count))
      log_warning "Retrying in ${wait}s... (attempt ${retry_count}/${max_retries})"
      sleep "${wait}"
    fi
  done

  log_error "License validation failed after ${max_retries} attempts"
  log_info "Visit https://nxp.xus.me to purchase a license"
  return ${EXIT_LICENSE_INVALID}
}

# ─── Installation Helpers ─────────────────────────────
check_command() {
  command -v "$1" >/dev/null 2>&1
}

run_cmd() {
  if ${DRY_RUN}; then
    echo -e "${YELLOW}[DRY-RUN]${NC} $*"
    return 0
  fi
  log_debug "Running: $*"
  "$@"
}

run_with_retry() {
  local cmd=("$@")
  local attempt=0
  local max=3
  while [ ${attempt} -lt ${max} ]; do
    if "${cmd[@]}"; then
      return 0
    fi
    attempt=$((attempt + 1))
    if [ ${attempt} -lt ${max} ]; then
      log_warning "Command failed (attempt ${attempt}/${max}). Retrying..."
      sleep 2
    fi
  done
  log_error "Command failed after ${max} attempts: ${cmd[*]}"
  return 1
}

# ─── Checkpoint System ────────────────────────────────
CHECKPOINT_FILE="${LOG_DIR}/.checkpoint"

save_checkpoint() {
  mkdir -p "${LOG_DIR}" 2>/dev/null || true
  echo "$1" > "${CHECKPOINT_FILE}"
}

load_checkpoint() {
  if [ -f "${CHECKPOINT_FILE}" ]; then
    cat "${CHECKPOINT_FILE}"
  fi
}

clear_checkpoint() {
  rm -f "${CHECKPOINT_FILE}"
}

resume_from_checkpoint() {
  local cp
  cp=$(load_checkpoint)
  if [ -n "${cp}" ]; then
    log_info "Resuming from checkpoint: ${cp}"
    return 0
  fi
  return 1
}

# ─── Progress Bar ─────────────────────────────────────
show_progress() {
  local current=$1
  local total=$2
  local label=$3
  if ${INTERACTIVE}; then
    local pct=$((current * 100 / total))
    local bar_size=40
    local filled=$((pct * bar_size / 100))
    local empty=$((bar_size - filled))
    printf "\r${CYAN}[%s/%s]${NC} " "${current}" "${total}"
    printf "${GREEN}"
    printf "%-${filled}s" | tr ' ' '█'
    printf "${NC}"
    printf "%-${empty}s" | tr ' ' '░'
    printf " %3d%% %s" "${pct}" "${label}"
  fi
}

finish_progress() {
  echo ""
}

# ─── .env Generation ──────────────────────────────────
generate_env_file() {
  local env_file="${INSTALL_DIR}/.env"

  if ${DRY_RUN}; then
    log_info "[DRY-RUN] Would create ${env_file}"
    return 0
  fi

  mkdir -p "${INSTALL_DIR}"

  local private_ip
  private_ip=$(hostname -I 2>/dev/null | awk '{print $1}')

  cat > "${env_file}" << ENVEOF
# ============================================
# NEXUSPANEL CONFIGURATION
# Generated: $(date -Iseconds)
# Version: ${VERSION}
# ============================================

# --- License ---
LICENSE_KEY=${LICENSE_KEY:-}
LICENSE_DOMAIN=${DOMAIN:-}
LICENSE_SERVER_URL=${LICENSE_SERVER_URL}
LICENSE_FALLBACK_SERVER=${LICENSE_FALLBACK_SERVER}
LICENSE_VALIDATION_INTERVAL=86400

# --- Security ---
JWT_SECRET=${JWT_SECRET:-$(openssl rand -hex 32)}
ADMIN_USER=${ADMIN_USER:-admin}
ADMIN_PASS=${ADMIN_PASS:-}
JWT_EXPIRY=7d
BCRYPT_ROUNDS=12
SESSION_TIMEOUT=3600
LOG_LEVEL=info

# --- Network ---
PORT=${PORT:-3443}
HOST=0.0.0.0
PUBLIC_URL=https://${DOMAIN:-localhost}:${PORT:-3443}
PRIVATE_IP=${private_ip}

# --- Database ---
DB_TYPE=sqlite
DB_PATH=${DATA_DIR}/nexuspanel.db

# --- Features ---
ENABLE_DOCKER=${INSTALL_DOCKER:-false}
ENABLE_PGADMIN=${INSTALL_PGADMIN:-false}
ENABLE_CLAMAV=${INSTALL_CLAMAV:-false}
ENABLE_2FA=false
ENABLE_AUDIT_LOGS=true

# --- Monitoring ---
ENABLE_METRICS=true
METRICS_PORT=9090
ENABLE_ALERTS=false
ALERT_EMAIL=${EMAIL:-}

# --- Backup ---
BACKUP_ENABLED=true
BACKUP_SCHEDULE="0 2 * * *"
BACKUP_RETENTION_DAYS=30
BACKUP_PATH=${BACKUP_DIR}

# --- Email (optional) ---
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
NOTIFICATION_EMAIL=

# --- Telemetry (opt-in) ---
TELEMETRY_ENABLED=false

# --- Auto-update ---
AUTO_UPDATE=false
UPDATE_CHECK_INTERVAL=604800

# --- System ---
SERVER_LOCATION=${SERVER_LOCATION:-}
SSH_USER=${SSH_USER:-root}
DEPLOYMENT_ENVIRONMENT=production
ENVEOF

  log_info "Configuration written to ${env_file}"
}

# ─── Service Management ───────────────────────────────
create_systemd_service() {
  local service_name="${1:-nexuspanel}"
  local exec_path="${2:-${INSTALL_DIR}/server.js}"

  if ${DRY_RUN}; then
    log_info "[DRY-RUN] Would create systemd service: ${service_name}"
    return 0
  fi

  cat > "/etc/systemd/system/${service_name}.service" << SYSTEMD
[Unit]
Description=NexusPanel - VPS Control Panel
After=network.target
Wants=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/node ${exec_path}
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SYSTEMD

  systemctl daemon-reload
  systemctl enable "${service_name}" 2>/dev/null || true
  log_info "Systemd service created: ${service_name}"
}

# ─── Firewall Helpers ─────────────────────────────────
configure_firewalld() {
  local port="${1:-3443}"
  if command -v firewall-cmd >/dev/null 2>&1; then
    run_cmd firewall-cmd --add-service=http --permanent 2>/dev/null || true
    run_cmd firewall-cmd --add-service=https --permanent 2>/dev/null || true
    run_cmd firewall-cmd --add-port="${port}/tcp" --permanent 2>/dev/null || true
    run_cmd firewall-cmd --reload 2>/dev/null || true
    log_info "Firewalld configured"
  fi
}

configure_ufw() {
  local port="${1:-3443}"
  if command -v ufw >/dev/null 2>&1; then
    run_cmd ufw allow 80/tcp 2>/dev/null || true
    run_cmd ufw allow 443/tcp 2>/dev/null || true
    run_cmd ufw allow "${port}/tcp" 2>/dev/null || true
    log_info "UFW configured"
  fi
}

# ─── Nginx Configuration ──────────────────────────────
configure_nginx() {
  local domain="${1}"
  local port="${2:-3443}"

  if [ -z "${domain}" ]; then
    log_info "No domain provided — skipping nginx configuration"
    return 0
  fi

  if ${DRY_RUN}; then
    log_info "[DRY-RUN] Would configure nginx for ${domain}"
    return 0
  fi

  if ! command -v nginx >/dev/null 2>&1; then
    log_warning "Nginx not installed — skipping"
    return 0
  fi

  # HTTP-only config for certbot
  cat > /etc/nginx/conf.d/nexuspanel.conf << NGINX
server {
    listen 80;
    server_name ${domain};
    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
    }
}
NGINX

  rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true
  nginx -t 2>/dev/null && systemctl restart nginx 2>/dev/null || nginx 2>/dev/null || true
  log_info "Nginx HTTP configured for ${domain}"

  # Obtain SSL via certbot
  if command -v certbot >/dev/null 2>&1; then
    log_info "Obtaining SSL certificate for ${domain}..."
    certbot certonly --nginx -d "${domain}" --non-interactive --agree-tos -m "${EMAIL:-admin@${domain}}" 2>&1 || \
    certbot certonly --standalone -d "${domain}" --non-interactive --agree-tos -m "${EMAIL:-admin@${domain}}" 2>&1 || \
    log_warning "SSL certificate could not be obtained automatically"

    if [ -f "/etc/letsencrypt/live/${domain}/fullchain.pem" ]; then
      cat > /etc/nginx/conf.d/nexuspanel.conf << NGINX
server {
    listen 80;
    server_name ${domain};
    return 301 https://\$server_name\$request_uri;
}
server {
    listen 443 ssl http2;
    server_name ${domain};
    ssl_certificate     /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
    }
}
NGINX
      nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
      log_success "SSL enabled — https://${domain}"
    fi
  else
    log_warning "Certbot not installed — SSL configuration skipped"
  fi
}

# ─── Post-installation Verification ───────────────────
verify_installation() {
  log_info "Verifying installation..."
  local checks_passed=0
  local checks_failed=0

  # Service
  if systemctl is-active --quiet nexuspanel 2>/dev/null; then
    log_success "Service is running"
    checks_passed=$((checks_passed + 1))
  else
    log_error "Service is NOT running"
    checks_failed=$((checks_failed + 1))
  fi

  # Port
  if ss -tlnp 2>/dev/null | grep -q ":${PORT:-3443} "; then
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

  # Database
  if [ -f "${DATA_DIR}/nexuspanel.db" ]; then
    log_success "Database file exists"
    checks_passed=$((checks_passed + 1))
  else
    log_warning "Database file not found (will be created on first run)"
    checks_passed=$((checks_passed + 1))
  fi

  # Environment file
  if [ -f "${INSTALL_DIR}/.env" ]; then
    log_success "Configuration file exists"
    checks_passed=$((checks_passed + 1))
  else
    log_error "Configuration file missing"
    checks_failed=$((checks_failed + 1))
  fi

  echo ""
  if [ ${checks_failed} -eq 0 ]; then
    log_success "All ${checks_passed} verification checks passed!"
    return ${EXIT_SUCCESS}
  else
    log_warning "${checks_passed} passed, ${checks_failed} failed"
    return ${EXIT_SERVICE_FAILURE}
  fi
}

# ─── Rollback ─────────────────────────────────────────
rollback() {
  local stage="${1:-unknown}"
  log_error "Installation failed at stage: ${stage}"
  log_info "Initiating rollback..."

  systemctl stop nexuspanel 2>/dev/null || true
  rm -f /etc/systemd/system/nexuspanel.service 2>/dev/null || true
  systemctl daemon-reload 2>/dev/null || true
  rm -f /etc/nginx/conf.d/nexuspanel.conf 2>/dev/null || true

  log_info "Rollback complete. Check ${LOG_FILE} for details."
  exit ${EXIT_GENERAL_ERROR}
}

# ─── Summary ──────────────────────────────────────────
generate_summary() {
  echo ""
  echo "============================================================"
  echo -e "${GREEN}${BOLD}  ✓ NexusPanel Installation Complete!${NC}"
  echo "============================================================"
  echo ""
  echo -e "  ${BOLD}URL:${NC}       https://${DOMAIN:-localhost}:${PORT:-3443}"
  echo -e "  ${BOLD}Username:${NC}   ${ADMIN_USER:-admin}"
  echo -e "  ${BOLD}License:${NC}    ${LICENSE_KEY:-}"
  echo ""
  echo -e "  ${BOLD}Service:${NC}    systemctl {start|stop|restart|status} nexuspanel"
  echo -e "  ${BOLD}Logs:${NC}       journalctl -u nexuspanel -f"
  echo -e "  ${BOLD}Config:${NC}     ${INSTALL_DIR}/.env"
  echo -e "  ${BOLD}Install Log:${NC} ${LOG_FILE}"
  echo ""
  echo -e "${CYAN}Thank you for installing NexusPanel!${NC}"
}

trap_handler() {
  local rc=$?
  if [ ${rc} -ne 0 ]; then
    rollback "signal_${rc}"
  fi
}
trap trap_handler EXIT

export VERSION INSTALL_DIR LOG_DIR CONFIG_DIR DATA_DIR BACKUP_DIR
export MIN_DISK_SPACE MIN_MEMORY REQUIRED_PORTS
export EXIT_SUCCESS EXIT_GENERAL_ERROR EXIT_ROOT_REQUIRED
export EXIT_LICENSE_INVALID EXIT_DEPENDENCY_FAILURE EXIT_PORT_CONFLICT
export EXIT_DISK_SPACE EXIT_MEMORY EXIT_NETWORK EXIT_SSL_FAILURE
export EXIT_DATABASE_FAILURE EXIT_SERVICE_FAILURE EXIT_USER_ABORT
export EXIT_PERMISSION EXIT_TIMEOUT EXIT_VERSION_MISMATCH EXIT_INVALID_ARGS
export RED GREEN CYAN YELLOW MAGENTA NC BOLD
export INTERACTIVE FORCE DRY_RUN DEBUG MINIMAL
