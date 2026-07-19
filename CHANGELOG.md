# Changelog

## [1.6.2] - 2026-07-19
### Fixed
- **PRO Terminal search conflict**: global search shortcut (`/` and `Ctrl+K`) no longer interferes with the terminal search. Added `term-search-active` body class when the terminal search bar is open, and global search now ignores shortcuts when the terminal is focused (`#termProPanes`) or terminal search is active
- **PRO Terminal search keyboard handling**: terminal search input now stops event propagation, supports `Enter` and `Shift+Arrow` keys for next/previous match, closes on `Escape`, and restores focus to the active terminal after closing
- **PRO Terminal theme picker UX**: redesigned the theme selector as a clean, minimal dropdown menu with a small arrow, larger touch targets, active checkmark, and a "Choose theme" header. Dropdown is appended to `#termProContent` instead of the toolbar (which had overflow/scrolling issues) and is positioned relative to the theme button. Closes on outside click or Escape, and highlights the active theme button

## [1.6.1] - 2026-07-17
### Fixed
- **PRO Terminal not connecting**: HTML was missing `id="termProPanes"` and `id="termProTabs"` on the PRO terminal's panes and tabs containers. The JavaScript code uses `document.getElementById()` to look up these elements, so without the IDs the terminal never initialized panes, WebSocket sessions were never created, and the loading spinner hung indefinitely
- **Search bar disappearing**: `initSearchBar()` appended the search bar to `#termProContainer` which was then destroyed when `createInitialTab()` cleared `#termProPanes` innerHTML. Changed parent to `#termProPanes` and replaced `innerHTML = ''` with selective `.term-pro-tab-panes` removal to preserve non-tab children

## [1.6.0] - 2026-07-17
### Added
- **PRO Terminal Advanced (Phase 4)**:
  - **Split panes**: split any tab horizontally or vertically; each pane runs its own independent `node-pty` session
  - **Active pane focus**: click a pane to focus it; active pane gets highlighted border
  - **Close active pane** button and automatic pane cleanup
  - **Command auto-complete**: non-intrusive overlay suggesting presets, command history, and common shell commands as you type; press `Tab` or click to accept
  - **Mobile PRO layout overhaul**: toolbar collapses into a hamburger menu, tab bar becomes a fixed bottom sheet, status bar floats above it for thumb-friendly control
  - Tab indicator now shows pane count when a tab has multiple panes

### Changed
- Backend WebSocket terminal handler refactored from tab-centric to **pane-centric** model: every pane is an independent pty session
- `public/js/terminal.js` fully rewritten around tab → pane hierarchy
- Updated cache-busting to `v=1.6.0`

## [1.5.0] - 2026-07-17
### Added
- **PRO Terminal Productivity (Phase 3)**:
  - Categorized command presets: System, Docker, Files, Network, Database, Custom
  - Preset edit support: click the pencil icon to modify label, command, and category
  - PRO preset panel now groups presets by category with collapsible sections and search filtering
  - Command palette groups presets under category headers with indented items
  - PRO session restore: open tab names are saved to `localStorage` and restored on next visit (shell state is not persisted for security)
  - Terminal buffer download: save active terminal output as a `.log` file
- Backend preset service now supports a `category` field and auto-migrates existing presets to "Custom"
- API support for preset category in `addPreset` and `updatePreset`

### Changed
- `public/js/terminal.js` updated with categorized presets, edit flow, session restore, and buffer download
- `public/index.html` updated with category selects and download toolbar button
- Cache-busting bumped to `v=1.5.0` for changed assets

## [1.4.0] - 2026-07-17
### Added
- **PRO Terminal Core (Phase 2)**:
  - Vendored xterm.js and all addons locally in `public/libs/` for ultimate performance and offline use
  - True multi-session support: each PRO tab runs a separate `node-pty` session on the backend
  - Tab bar with add, close, switch, and double-click rename
  - Per-tab xterm instances preserving independent scrollback and state
  - Command Palette (`Ctrl+Shift+P`) for presets, tabs, and actions
  - In-terminal search (`Ctrl+F`) using xterm-addon-search
  - Theme switcher with 6 themes: Catppuccin, Dracula, Solarized Dark/Light, One Dark, Nord
  - xterm-addon-fit for proper auto-resize, xterm-addon-web-links for clickable URLs, xterm-addon-unicode11 for wide-char support, and xterm-addon-webgl for GPU rendering (with graceful fallback)
- Extended WebSocket protocol: `create-tab`, `switch-tab`, `close-tab`, `rename-tab` with tab-scoped input/resize

### Changed
- Backend WebSocket terminal handler now manages multiple pty sessions per connection in a `tabs` Map
- `terminal.js` completely rewritten to support Classic and PRO modes with shared connection layer
- Cache-busting updated to `v=1.4.0`

## [1.3.0] - 2026-07-17
### Added
- **Terminal Version Selector**: users can now choose between **Classic Terminal** and **PRO Terminal**
- First-time Terminal chooser modal with **PRO Terminal** pre-selected as the recommended experience
- Persistent terminal version preference stored in `localStorage` (`nexus-terminal-version`)
- Settings page option to set the default Terminal version and reset the saved choice
- **PRO Terminal** foundation: modern glassmorphism shell with tab bar, toolbar, and status bar placeholders
- PRO Terminal toolbar buttons: Presets, Clear, Reconnect, font-size controls (A-/A+), and placeholders for Command Palette, Search, and Theme switcher
- PRO Terminal status bar showing connection state and terminal dimensions

### Changed
- Refactored `public/js/terminal.js` into Classic/PRO-aware architecture while preserving all existing Classic functionality
- `index.html` Terminal view now includes version toggle, chooser modal, and PRO terminal container
- Updated cache-busting params to `v=1.3.0` for `style.css`, `terminal.js`, and `settings.js`

## [1.2.9] - 2026-07-16
### Changed
- Terminal screen fully redesigned for mobile and tablet responsiveness
- Tablet (≤1024px): adjusted terminal wrapper height and narrowed preset panel to 260px
- Mobile (≤768px): command preset panel now opens as a fixed bottom sheet with rounded top corners and slide-up animation; uses `100dvh` for accurate viewport height; nano-bar touch targets enlarged to 34px minimum
- Small mobile (≤480px): xterm font size increased to 15px, preset command/delete buttons raised to 36px minimum touch targets, tighter borders and padding throughout

## [1.2.8] - 2026-07-16
### Fixed
- Global search `/` keyboard shortcut no longer steals focus from File Manager path input and other form fields — now checks `activeElement.tagName` before focusing the search bar
- Keyboard arrow navigation and active highlighting in search results now work correctly (fixed `searchSelIdx` → `gsSelIdx` variable name typo)

### Changed
- Global search results are now grouped by module with visual section headers (Users, Services, Docker, Domains, etc.) for easier scanning
- Added animated spinner and "Searching…" indicator between debounce and API response
- Enhanced empty state with icon and "Try a different search term" hint
- Removed file/folder results from global search (file search is only available inside the File Manager's own search)
- Removed redundant `.gsr-module` badge from individual result items (group headers provide module context)

## [1.2.7] - 2026-07-16
### Fixed
- NexusPanel update check no longer gets stuck on "Checking for panel updates..." — `GET /panel-check` route handler was missing `async`/`await`, causing `checkPanelVersion`'s Promise to serialize as `{}`, leaving `panelState.changelog` as an empty array; `renderPanelUpdate()` only set `el.innerHTML` inside `if (changelog.length)`, so the loading state was never replaced

### Changed
- `renderPanelUpdate()` now always renders the version card, with changelog as an optional section below it

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
