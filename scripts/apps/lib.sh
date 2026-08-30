#!/usr/bin/env bash
# Shared helpers for NexusPanel one-click app installers.
# Sourced by each app script. Fails fast on any error.
set -euo pipefail

log() {
  echo "[$(date -u '+%Y-%m-%d %H:%M:%S')] $*"
}

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Missing required env: $name" >&2
    exit 1
  fi
}

cleanup_path() {
  local target="${1:-}"
  if [ -n "$target" ] && [ -d "$target" ]; then
    log "Cleaning up target directory: $target"
    rm -rf "${target:?}"/* 2>/dev/null || true
    rm -rf "${target:?}"/.* 2>/dev/null || true
  fi
}

cleanup_mysql_db() {
  local db="${1:-}"
  local user="${2:-}"
  local pass="${3:-}"
  local port="${4:-3306}"
  if command -v mysql >/dev/null 2>&1 && [ -n "$db" ] && [ -n "$user" ] && [ -n "$pass" ]; then
    log "Resetting database on installation failure: $db"
    mysql -u"$user" -p"$pass" -h127.0.0.1 -P"$port" -e "DROP DATABASE IF EXISTS \`$db\`; CREATE DATABASE \`$db\`;" 2>/dev/null || true
  fi
}
