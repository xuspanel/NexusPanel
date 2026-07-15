#!/usr/bin/env bash
# ============================================================================
# NexusPanel Installer v2.0 — Fedora
# Platform: Fedora 38+
# Shares implementation with AlmaLinux (same DNF/Firewalld/SELinux base)
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! [ -f /etc/fedora-release ]; then
  echo "[ERROR] This script is for Fedora only"
  exit 1
fi

ALMA_INSTALLER="${SCRIPT_DIR}/install-almalinux.sh"
if [ -n "${ALMA_INSTALLER}" ] && [ -f "${ALMA_INSTALLER}" ]; then
  OS_NAME="Fedora"
  source "${ALMA_INSTALLER}" "$@"
else
  echo "[ERROR] install-almalinux.sh not found — cannot continue"
  echo "Download the full installer suite from:"
  echo "  https://github.com/xuspanel/NexusPanel"
  exit 1
fi
