#!/usr/bin/env bash
# WordPress installer (WP-CLI + MariaDB). Runs as the target system user.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

cleanup() {
  local exit_code=$?
  log "ERROR: WordPress installation failed (exit code $exit_code). Cleaning up..."
  cleanup_path "${INSTALL_PATH:-}"
  cleanup_mysql_db "${DB_NAME:-}" "${DB_USER:-}" "${DB_PASSWORD:-}" "${DB_PORT:-3306}"
  exit "$exit_code"
}
trap cleanup ERR

for v in INSTALL_PATH APP_URL DB_NAME DB_USER DB_PASSWORD SITE_TITLE ADMIN_USER ADMIN_PASSWORD ADMIN_EMAIL; do
  require_env "$v"
done

DB_PORT="${DB_PORT:-3306}"

WP_BIN="$(command -v wp)"
wp() {
  php -d memory_limit=512M "$WP_BIN" "$@"
}

log "Downloading WordPress core into $INSTALL_PATH ..."
wp core download --path="$INSTALL_PATH" --locale=en_US --allow-root >/dev/null 2>&1 || true

if [ ! -d "$INSTALL_PATH/wp-admin" ]; then
  log "Direct download failed, retrying..."
  wp core download --path="$INSTALL_PATH" --locale=en_US --allow-root --force
fi

log "Creating wp-config.php ..."
wp config create --path="$INSTALL_PATH" \
  --dbname="$DB_NAME" \
  --dbuser="$DB_USER" \
  --dbpass="$DB_PASSWORD" \
  --dbhost="127.0.0.1:${DB_PORT}" \
  --dbcharset="utf8mb4" \
  --allow-root

log "Installing WordPress (url=$APP_URL title=$SITE_TITLE admin=$ADMIN_USER) ..."
wp core install --path="$INSTALL_PATH" \
  --url="$APP_URL" \
  --title="$SITE_TITLE" \
  --admin_user="$ADMIN_USER" \
  --admin_password="$ADMIN_PASSWORD" \
  --admin_email="$ADMIN_EMAIL" \
  --skip-email \
  --allow-root

log "WordPress install complete."
