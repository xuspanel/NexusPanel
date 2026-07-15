#!/usr/bin/env bash
# ============================================================================
# NexusPanel Installer v2.0 — Debian
# Identical to Ubuntu installer (same APT-based package structure)
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEBIAN_FRONTEND=noninteractive
export DEBIAN_FRONTEND

# Source Ubuntu installer (Debian-compatible)
if [ -f "${SCRIPT_DIR}/install-ubuntu.sh" ]; then
  UBUNTU_INSTALLER="${SCRIPT_DIR}/install-ubuntu.sh"
elif [ -f "${SCRIPT_DIR}/nxApp/install-ubuntu.sh" ]; then
  UBUNTU_INSTALLER="${SCRIPT_DIR}/nxApp/install-ubuntu.sh"
else
  UBUNTU_INSTALLER=""
fi

if [ -n "${UBUNTU_INSTALLER}" ]; then
  # Debian-specific overrides
  OS_NAME="Debian"
  PKG_MANAGER="apt-get"
  PKG_UPDATE="${PKG_MANAGER} update"
  PKG_INSTALL="${PKG_MANAGER} install -y"

  # Debian uses Apache2 instead of Nginx by default in some configs
  # but we prefer Nginx — same as Ubuntu
  source "${UBUNTU_INSTALLER}" "$@"
else
  echo "[ERROR] install-ubuntu.sh not found — cannot continue"
  echo "Download the full installer suite from:"
  echo "  https://github.com/xuspanel/NexusPanel"
  exit 1
fi
