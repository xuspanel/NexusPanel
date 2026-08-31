#!/usr/bin/env bash
# ============================================================================
# NexusPanel Installer v2.0 — Docker
# Platform: Any OS with Docker
# ============================================================================
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "${SCRIPT_DIR}/install-common.sh" ]; then
  source "${SCRIPT_DIR}/install-common.sh"
else
  source <(curl -sL "https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-common.sh")
fi

DOCKER_COMPOSE_VERSION="2.24.0"
NEXUSPANEL_IMAGE="ghcr.io/xuspanel/nexuspanel:latest"

# ─── Pre-flight Checks ────────────────────────────────
check_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    log_error "Docker is not installed"
    log_info "Install Docker first, then re-run this script"
    log_info "  curl -fsSL https://get.docker.com | bash"
    exit ${EXIT_DEPENDENCY_FAILURE}
  fi

  if ! docker info >/dev/null 2>&1; then
    log_error "Docker daemon is not running or current user lacks permissions"
    log_info "Ensure docker is running and your user is in the 'docker' group"
    exit ${EXIT_PERMISSION}
  fi

  log_info "Docker version: $(docker --version 2>/dev/null || echo 'unknown')"
}

check_docker_compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
  elif docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
  else
    log_info "Installing Docker Compose..."
    run_cmd curl -sL "https://github.com/docker/compose/releases/download/v${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    run_cmd chmod +x /usr/local/bin/docker-compose
    COMPOSE_CMD="docker-compose"
  fi
  log_info "Compose: ${COMPOSE_CMD}"
}

# ─── Docker Compose File ──────────────────────────────
generate_compose_file() {
  local compose_file="${INSTALL_DIR}/docker-compose.yml"

  if ${DRY_RUN}; then
    log_info "[DRY-RUN] Would create ${compose_file}"
    return 0
  fi

  mkdir -p "${INSTALL_DIR}" "${DATA_DIR}" "${LOG_DIR}" /tmp/nexus-uploads

  cat > "${compose_file}" << COMPOSE
version: "3.8"

services:
  nexuspanel:
    image: ${NEXUSPANEL_IMAGE}
    container_name: nexuspanel
    restart: unless-stopped
    ports:
      - "${PORT:-3443}:${PORT:-3443}"
    environment:
      - LICENSE_KEY=${LICENSE_KEY:-}
      - LICENSE_DOMAIN=${DOMAIN:-}
      - JWT_SECRET=${JWT_SECRET:-$(openssl rand -hex 32)}
      - PORT=${PORT:-3443}
      - NODE_ENV=production
      - ADMIN_USER=${ADMIN_USER:-admin}
      - ADMIN_PASS=${ADMIN_PASS:-}
      - DB_TYPE=sqlite
    volumes:
      - ${DATA_DIR}:/app/data
      - ${LOG_DIR}:/app/logs
      - ./config:/app/config
      - /tmp/nexus-uploads:/tmp/nexus-uploads
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${PORT:-3443}/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1.0"
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - nexuspanel-net

  # Optional: PostgreSQL sidecar
  ${INSTALL_PG:-false} && cat << PG_SERVICE
  postgres:
    image: postgres:16-alpine
    container_name: nexuspanel-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: nexuspanel
      POSTGRES_USER: nexuspanel
      POSTGRES_PASSWORD: \${DB_PASSWORD:-nexuspanel}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nexuspanel"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - nexuspanel-net
PG_SERVICE

networks:
  nexuspanel-net:
    driver: bridge

volumes:
  postgres-data:
    driver: local
COMPOSE

  log_info "Docker Compose file created at ${compose_file}"
}

# ─── Dockerfile (for self-build) ──────────────────────
generate_dockerfile() {
  local dockerfile="${INSTALL_DIR}/Dockerfile"
  local entrypoint="${INSTALL_DIR}/entrypoint.sh"

  if ${DRY_RUN}; then
    log_info "[DRY-RUN] Would create ${dockerfile} and ${entrypoint}"
    return 0
  fi

  mkdir -p "${INSTALL_DIR}"

  # 1. Entrypoint Script Generation for Two-Tier Lifecycle Management
  cat > "${entrypoint}" << 'ENTRYPOINT_SH'
#!/bin/sh
set -e

# Ensure upload directory exists and is owned by unprivileged Web Tier
mkdir -p /tmp/nexus-uploads
chown -R nexuspanel:nexuspanel /tmp/nexus-uploads 2>/dev/null || true
chmod 755 /tmp/nexus-uploads 2>/dev/null || true

# Ensure persistent application directories exist with proper ownership
mkdir -p /app/data /app/logs /app/config
chown -R nexuspanel:nexuspanel /app/data /app/logs /app/config 2>/dev/null || true

# Start the Root Daemon in background (runs as root)
echo "[ENTRYPOINT] Starting NexusPanel Root Daemon..."
node src/daemon/server.js &
DAEMON_PID=$!

# Trap shutdown signals to terminate child processes gracefully
trap 'kill -TERM $DAEMON_PID 2>/dev/null; exit 0' TERM INT

# Brief pause for socket readiness
sleep 1

# Drop privileges and launch the main Web Tier as nexuspanel user
echo "[ENTRYPOINT] Launching NexusPanel Web Tier as 'nexuspanel' user..."
if command -v runuser >/dev/null 2>&1; then
  exec runuser -u nexuspanel -- node server.js "$@"
else
  exec su -s /bin/sh nexuspanel -c "node server.js $*"
fi
ENTRYPOINT_SH

  chmod +x "${entrypoint}"

  # 2. Alpine Dockerfile with native nexuspanel user and Two-Tier entrypoint
  cat > "${dockerfile}" << DOCKERFILE
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache tini curl util-linux bash

# Create unprivileged nexuspanel system user and group natively in Alpine
RUN addgroup -S nexuspanel && adduser -S -G nexuspanel -h /app -s /bin/false nexuspanel

COPY --from=builder /app/node_modules ./node_modules
COPY . .
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
RUN chown -R nexuspanel:nexuspanel /app

EXPOSE ${PORT:-3443}

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \\
  CMD curl -f http://localhost:${PORT:-3443}/health || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/app/entrypoint.sh"]
DOCKERFILE

  log_info "Dockerfile and entrypoint.sh created at ${INSTALL_DIR}"
}

# ─── Main ─────────────────────────────────────────────
main() {
  show_banner
  parse_args "$@"
  setup_logging

  check_prerequisites "$@"
  check_docker
  check_docker_compose

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

  save_checkpoint "compose"
  generate_compose_file
  generate_dockerfile

  save_checkpoint "env"
  JWT_SECRET=$(openssl rand -hex 32)
  generate_env_file

  save_checkpoint "pull"
  log_info "Pulling Docker images..."
  run_cmd docker pull "${NEXUSPANEL_IMAGE}" 2>/dev/null || true

  save_checkpoint "start"
  log_info "Starting NexusPanel container..."
  cd "${INSTALL_DIR}"
  run_cmd ${COMPOSE_CMD} up -d 2>&1 || {
    log_warning "Docker Compose failed — trying direct docker run"
    run_cmd docker run -d --name nexuspanel --restart unless-stopped \
      -p "${PORT:-3443}:${PORT:-3443}" \
      -e LICENSE_KEY="${LICENSE_KEY:-}" \
      -e PORT="${PORT:-3443}" \
      -v "${DATA_DIR}:/app/data" \
      "${NEXUSPANEL_IMAGE}" 2>/dev/null || {
      log_error "Failed to start Docker container"
      exit ${EXIT_SERVICE_FAILURE}
    }
  }

  save_checkpoint "verify"
  sleep 3
  log_info "Verifying container..."
  if docker ps --format '{{.Names}} {{.Status}}' | grep -q 'nexuspanel'; then
    docker ps --format '{{.Names}} {{.Status}}' | grep 'nexuspanel'
    log_success "Container is running"
  else
    log_error "Container failed to start"
    docker logs nexuspanel 2>/dev/null | tail -20 || true
    exit ${EXIT_SERVICE_FAILURE}
  fi

  clear_checkpoint
  echo ""
  log_success "NexusPanel Docker installation complete!"
  log_info "Container: nexuspanel"
  log_info "Logs: docker logs -f nexuspanel"
  log_info "Config: ${INSTALL_DIR}/.env"
}

main "$@"
