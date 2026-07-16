# Changelog

## [1.2.6] - 2026-07-16
### Added
- `POST /apply/:name` route handler for single-package updates (was returning HTML 404, breaking the "Update" button on each package row)
- `GET /panel-check` route handler for checking NexusPanel version updates
- `POST /panel-apply` route handler for applying NexusPanel self-updates
- API 404 catch-all middleware returns JSON `{"error":"Endpoint not found"}` instead of HTML for any unmatched `/api/*` request

### Fixed
- System Updates screen: clicking "Update" on a single package no longer fails with "Unexpected token '<', '<!DOCTYPE'... is not valid JSON" — backend now returns a proper JSON response instead of Express's default HTML 404 page

## [1.2.5] - 2026-07-16
### Fixed
- Three orphaned `</div>` tags in `index.html` (lines 1383–1385) prematurely closed `#dashboardPage`, ejecting 10 views (Audit, Services, Processes, Logs, Cron, Firewall, SSL, PHP-FPM, Updates, Settings) outside the `.dashboard` container — causing them to render a full viewport-height below the top of the page

### Changed
- Removed stale smooth-scroll CSS reference from `<html>` element (full cleanup from v1.2.3)

## [1.2.4] - 2026-07-16
### Changed
- Reduced `.dashboard-content` padding-top from 32px to 20px to eliminate large empty gap at top of each view
- `scrollTo` deferred to `requestAnimationFrame` to run after browser layout when switching views
- Removed `scroll-behavior: smooth` from `<html>` CSS to prevent smooth-scroll interference with programmatic scroll

### Fixed
- Screen content no longer appears pushed down (excessive top padding was compounding empty space above content)
- Screen content no longer appears at bottom after switching views (scroll now reliably fires after layout reflow)

## [1.2.2] - 2026-07-16
### Changed
- URL routing switched from hash frags (`/#dashboard`) to clean paths (`/dashboard`) using `history.pushState`
- Server catch-all route serves `index.html` for all unrecognized GET paths (supports deep-linking page refresh)
- `window.scrollTo({ top: 0 })` on every view switch to prevent content rendering below viewport
- Initial view detection reads `location.pathname` first, falls back to `location.hash` for legacy bookmarks

### Fixed
- Most screen content no longer appears at bottom of viewport after switching views
- Browser URL bar now shows clean paths instead of hash frags

## [1.2.1] - 2026-07-16
### Changed
- `src/services/updates.js`: auto-detect package manager via `/etc/os-release` (apt for Debian/Ubuntu, dnf for RHEL/Fedora) instead of hardcoded dnf

### Fixed
- `src/services/updates.js`: GitHub version-check URL now uses `main` branch instead of stale `master/nxApp/` prefix
- Frontend "System Updates" card no longer references "dnf" specifically (now shows "Package check & apply" / "Package manager")
- ClamAV install command in Virus Scanner dynamically shows `apt-get` or `dnf` based on detected OS

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
