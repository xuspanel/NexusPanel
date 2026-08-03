#!/usr/bin/env bash
# Laravel installer (Composer + MariaDB). Runs as the target system user.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

for v in INSTALL_PATH APP_URL DB_NAME DB_USER DB_PASSWORD SITE_TITLE; do
  require_env "$v"
done

DB_PORT="${DB_PORT:-3306}"

export COMPOSER_MEMORY_LIMIT=-1

log "Creating Laravel project in $INSTALL_PATH ..."
composer create-project laravel/laravel "$INSTALL_PATH" --no-interaction --prefer-dist --no-progress

cd "$INSTALL_PATH"

log "Writing .env ..."
cat > .env <<EOF
APP_NAME="${SITE_TITLE:-Laravel}"
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=${APP_URL:-http://localhost}
APP_LOCALE=en
LOG_CHANNEL=stderr
LOG_LEVEL=warning
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=${DB_PORT}
DB_DATABASE=$DB_NAME
DB_USERNAME=$DB_USER
DB_PASSWORD=$DB_PASSWORD
BROADCAST_CONNECTION=log
SESSION_DRIVER=file
SESSION_LIFETIME=120
QUEUE_CONNECTION=sync
CACHE_STORE=file
FILESYSTEM_DISK=local
EOF

log "Generating application key ..."
php artisan key:generate --no-interaction

log "Caching config ..."
php artisan config:clear --no-interaction >/dev/null 2>&1 || true
php artisan config:cache --no-interaction >/dev/null 2>&1 || true

log "Laravel install complete."
