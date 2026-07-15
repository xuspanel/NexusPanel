#!/usr/bin/env bash
# ============================================================================
# NexusPanel Installer v2.0 — CentOS Stream
# Platform: CentOS Stream 8/9
# Note: CentOS Linux 7/8 are EOL — use CentOS Stream, AlmaLinux, or Rocky
# Shares implementation with AlmaLinux (same RHEL base)
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! [ -f /etc/centos-release ] && ! grep -qi "centos" /etc/redhat-release 2>/dev/null; then
  echo "[ERROR] This script is for CentOS only"
  exit 1
fi

ALMA_INSTALLER="${SCRIPT_DIR}/install-almalinux.sh"
if [ -n "${ALMA_INSTALLER}" ] && [ -f "${ALMA_INSTALLER}" ]; then
  OS_NAME="CentOS Stream"
  source "${ALMA_INSTALLER}" "$@"
else
  echo "[ERROR] install-almalinux.sh not found — cannot continue"
  echo "Download the full installer suite from:"
  echo "  https://github.com/xuspanel/NexusPanel"
  exit 1
fi
