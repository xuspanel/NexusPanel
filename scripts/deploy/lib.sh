#!/usr/bin/env bash
set -euo pipefail

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

require_env() {
  if [ -z "${!1:-}" ]; then
    log "ERROR: Required environment variable $1 is not set"
    exit 1
  fi
}
