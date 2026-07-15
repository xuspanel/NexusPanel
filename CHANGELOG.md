# Changelog

## [1.2.0] - 2026-07-15
### Added
- OS abstraction layer: `detect_os()`, `pkg_*()`, `service_manage()`, `fw_*()`, `detect_mac()` in `install-common.sh`
- Package-manager fallback for unrecognized distros (apt-get/dnf/yum/apk/pacman/zypper)
- `install-centos.sh` and `install-fedora.sh` now source `install-almalinux.sh` (fixes broken undefined functions)

### Changed
- `install-ubuntu.sh` and `install-almalinux.sh` refactored to use shared OS abstractions instead of direct apt-get/dnf/ufw/firewall-cmd calls
- `uninstall.sh` and `upgrade.sh` now source `install-common.sh` for shared detection and service management
- `install.sh` uses array-based args with `--key=value` format for reliable inner-installer delegation

### Fixed
- `install-centos.sh` and `install-fedora.sh` called 5 undefined functions (`get_user_input`, `install_app`, `setup_ssl`, `start_service`, `show_summary`)
- Args passed from `install.sh` to OS-specific installers were concatenated into a single string due to missing `--key=value` format

## [1.1.0] - 2026-07-15
### Added
- Loading skeleton animations for dashboard stats, progress bars, and charts
- Chart empty state with "No data yet" message instead of hiding
- Chart error state with "Retry" button on metrics fetch failure
- Keyboard shortcut `/` and `Ctrl+K` to focus global search
- History API for browser back/forward navigation support
- `aria-current`, `aria-hidden`, `aria-live` attributes for accessibility
- `aria-label` and keyboard support (`Enter`/`Space`) on navigation cards
- CSP hardening with additional directives (`baseUri`, `objectSrc`, `frameSrc`, `mediaSrc`, `manifestSrc`)
- Referrer policy: `strict-origin-when-cross-origin`
- Static file caching with `maxAge: 365d` + `etag` (cache-busting via `?v=` query string)
- Light theme CSS overrides for dashboard cards, charts, hero section, progress bars
- `visibilitychange` listener pauses particles and API polling when tab is hidden
- `stopDashboardPolling()`/`resumeDashboardPolling()` for stopping polls on non-dashboard views
- Search loading hint "Type at least 2 characters to search..."
- Theme transitions for smoother light/dark switch

### Changed
- Polling interval reduced from 5s to 10s for dashboard stats
- `initDashboard()` now runs once on login instead of 3x (deduplicated calls in auth.js)
- CPU dashboard card now shows "Load: X / Y cores" alongside percentage
- Disk formatting unified to use `usedFormatted`/`totalFormatted` (same as RAM)
- OS name now shows full version string instead of truncated first word
- xterm CSS moved from body to `<head>` to prevent flash of unstyled terminal
- Chart.js animations enabled (`easeOutQuart`, 400ms)
- Search results and index cleared on navigation to prevent stale state

### Fixed
- Search keyboard navigation (`searchSelIdx` → `gsSelIdx` typo) — arrow keys now work
- Orphaned CSS block (12 lines with no selector) removed from `style.css`
- Notification panel now has `max-height` + `overflow-y: auto` to prevent overflow

### Security
- Added `baseUri`, `object-src 'none'`, `frame-src 'none'`, `media-src 'self'`, `manifest-src 'self'` to CSP
- Added `referrerPolicy: strict-origin-when-cross-origin`

## [1.0.0] - 2026-07-08
### Added
- Initial release
- VPS control panel with file manager, databases, email, docker, FTP, terminal
- Domain management with nginx + SSL
- Backup scheduler with retention policies
- Virus scanner with ClamAV integration
- MIME types manager
- Audit trail for admin actions
- Service manager for systemd
- Process manager with live monitoring
- Log viewer
- Cron job editor
- Firewall rules manager
- SSL certificate management with Let's Encrypt
- PHP-FPM pool manager
- System updates via DNF
- License enforcement via nxLicensing
- Multi-domain email with Postfix + Dovecot
- Resource usage history charts
- Monitoring & alerting
- API token system
- Settings and update notification system
