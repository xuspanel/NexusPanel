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
