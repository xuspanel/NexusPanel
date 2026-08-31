#!/usr/bin/env bash
# NexusPanel Log Viewer — tail, filter, search across Two-Tier services and system logs
set -e

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'; BOLD='\033[1m'; DIM='\033[2m'

INSTALL_DIR="/opt/nexuspanel"
LINES=50
FOLLOW=0
SEARCH=""
NGINX_LOG="/var/log/nginx/error.log"

usage() {
  echo "Usage: sudo bash logs.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  -f, --follow          Follow logs in real-time (tail -f)"
  echo "  -n, --lines NUM       Number of lines to show (default: 50)"
  echo "  -s, --search TEXT     Filter logs containing TEXT"
  echo "  -a, --all             Show all logs (daemon + web tier + nginx + install)"
  echo "  -e, --errors          Show only errors and warnings"
  echo "  -t, --today           Show only today's logs"
  echo "  --service             Show systemd service logs (daemon + web tier, default)"
  echo "  --daemon              Show only Root Daemon logs (nexuspanel-daemon)"
  echo "  --web                 Show only Web Tier logs (nexuspanel)"
  echo "  --nginx               Show only nginx error log"
  echo "  --install             Show install log"
  echo "  -h, --help            Show this help"
  echo ""
  echo "Examples:"
  echo "  sudo bash logs.sh -f                    # Tail daemon and web logs live"
  echo "  sudo bash logs.sh --daemon              # Show Root Daemon logs"
  echo "  sudo bash logs.sh --web -n 100          # Last 100 lines of Web Tier"
  echo "  sudo bash logs.sh -n 100 -s 'error'     # Last 100 lines with 'error'"
  echo "  sudo bash logs.sh --all -e              # All logs, errors only"
  exit 0
}

SCOPE="service"
while [[ $# -gt 0 ]]; do
  case $1 in
    -f|--follow) FOLLOW=1; shift ;;
    -n|--lines) LINES="$2"; shift 2 ;;
    -s|--search) SEARCH="$2"; shift 2 ;;
    -a|--all) SCOPE="all"; shift ;;
    -e|--errors) SEARCH="${SEARCH}error|Error|ERROR|fail|Fail|FAIL|warn|Warn|WARN|critical|CRITICAL"; shift ;;
    -t|--today) SEARCH="$SEARCH$(date +%b\ %d)"; shift ;;
    --service) SCOPE="service"; shift ;;
    --daemon) SCOPE="daemon"; shift ;;
    --web) SCOPE="web"; shift ;;
    --nginx) SCOPE="nginx"; shift ;;
    --install) SCOPE="install"; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown: $1"; usage ;;
  esac
done

header() { echo -e "\n${BOLD}${CYAN}━━━ $1 ━━━${NC}"; }

view_log() {
  local title="$1"
  local cmd="$2"
  header "$title"
  if [ $FOLLOW -eq 1 ]; then
    eval "$cmd" 2>/dev/null || echo "${DIM}(no data)${NC}"
  else
    if [ -n "$SEARCH" ]; then
      eval "$cmd" 2>/dev/null | grep -iE "$SEARCH" | tail -n "$LINES" || echo "${DIM}(no matches for \"$SEARCH\")${NC}"
    else
      eval "$cmd" 2>/dev/null | tail -n "$LINES" || echo "${DIM}(no data)${NC}"
    fi
  fi
}

if [ "$EUID" -ne 0 ]; then
  echo "Note: Run as root for full log access. Showing available logs..."
  echo ""
fi

# Two-Tier Service Telemetry
if [ "$FOLLOW" -eq 1 ]; then
  if [ "$SCOPE" = "daemon" ]; then
    view_log "NexusPanel Root Daemon (nexuspanel-daemon)" "journalctl -u nexuspanel-daemon -f -n $LINES"
  elif [ "$SCOPE" = "web" ]; then
    view_log "NexusPanel Web Tier (nexuspanel)" "journalctl -u nexuspanel -f -n $LINES"
  elif [ "$SCOPE" = "service" ] || [ "$SCOPE" = "all" ]; then
    view_log "NexusPanel Two-Tier Services (nexuspanel-daemon + nexuspanel)" "journalctl -u nexuspanel-daemon -u nexuspanel -f -n $LINES"
  fi
else
  if [ "$SCOPE" = "daemon" ] || [ "$SCOPE" = "service" ] || [ "$SCOPE" = "all" ]; then
    view_log "NexusPanel Root Daemon (nexuspanel-daemon)" "journalctl -u nexuspanel-daemon --no-pager -n $LINES"
  fi
  if [ "$SCOPE" = "web" ] || [ "$SCOPE" = "service" ] || [ "$SCOPE" = "all" ]; then
    view_log "NexusPanel Web Tier (nexuspanel)" "journalctl -u nexuspanel --no-pager -n $LINES"
  fi
fi

if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "nginx" ]; then
  if [ -f "$NGINX_LOG" ]; then
    view_log "Nginx Error Log" "${FOLLOW:+tail -f} cat $NGINX_LOG"
  fi
  if [ -f /var/log/nginx/access.log ]; then
    view_log "Nginx Access Log" "${FOLLOW:+tail -f} cat /var/log/nginx/access.log"
  fi
fi

if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "install" ]; then
  if [ -f "$INSTALL_DIR/.install.log" ]; then
    view_log "Install Log" "${FOLLOW:+tail -f} cat $INSTALL_DIR/.install.log"
  fi
fi

if [ $FOLLOW -eq 1 ]; then
  echo ""
  echo -e "${YELLOW}Press Ctrl+C to stop following logs${NC}"
  wait
fi
