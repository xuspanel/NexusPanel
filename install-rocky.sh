#!/usr/bin/env bash
# ============================================================================
# NexusPanel Installer v2.0 — Rocky Linux
# Platform: Rocky Linux 8/9
# Note: Nearly identical to AlmaLinux (same RHEL base) — sources install-almalinux.sh
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! [ -f /etc/rocky-release ] && ! grep -qi "rocky" /etc/redhat-release 2>/dev/null; then
  echo "[ERROR] This script is for Rocky Linux only"
  exit 1
fi

# Source AlmaLinux installer (identical RHEL 9 base)
ALMA_INSTALLER="${SCRIPT_DIR}/install-almalinux.sh"
if [ -n "${ALMA_INSTALLER}" ] && [ -f "${ALMA_INSTALLER}" ]; then
  # Rocky-specific overrides
  OS_NAME="Rocky Linux"
  source "${ALMA_INSTALLER}" "$@"
else
  echo "[ERROR] install-almalinux.sh not found — cannot continue"
  echo "Download the full installer suite from:"
  echo "  https://github.com/xuspanel/NexusPanel"
  exit 1
fi
