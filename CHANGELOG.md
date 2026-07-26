# Changelog

## [1.24.0] - 2026-07-26
### Added
- **Bin/Trash feature for File Manager**: Deleted files moved to `data/filebin/` with metadata manifest, restore, permanent delete, and empty bin operations
- **Conflict detection for copy/move**: Automatic conflict check before operations with per-file source vs destination comparison
- **Conflict resolution modal**: Combined modal with Files tab (conflict list with sizes) and Comparison tab (side-by-side source vs dest details)
- **Global conflict strategy**: Overwrite All / Skip All / Rename All selection applied to entire batch
- **Archive extract preview with conflict detection**: Extract flow checks for conflicts before extraction and presents unified modal with archive contents + conflict resolution
- **Bin sidebar section**: Collapsible Bin section in File Manager sidebar showing deleted files grouped by batch with restore and permanent delete buttons
- **Backend conflict resolution functions**: `checkConflicts`, `checkExtractConflicts`, `extractArchiveWithStrategy`, `copyEntryWithStrategy`, `moveEntryWithStrategy`
- **Backend bin operations**: `deleteToBin`, `listBin`, `restoreFromBin`, `permanentDeleteBin`, `emptyBin` — files stored with timestamped batches and metadata JSON
- **API endpoints**: `POST /files/extract-preview`, `POST /files/check-conflicts`, `POST /files/check-extract-conflicts`, `GET /files/bin`, `POST /files/bin/restore`, `DELETE /files/bin/permanent`, `DELETE /files/bin/empty`
- **Frontend API methods**: `extractPreview`, `checkConflicts`, `checkExtractConflicts`, `getBin`, `restoreBin`, `permanentDeleteBin`, `emptyBin`
- **Modified delete flow**: Delete confirmation now says "Move to Bin" with gold-colored file names
- **Modified copy/move flows**: All copy, move, clipboard paste operations now detect conflicts before executing and present strategy selection
- **Light theme support**: All new components styled for both dark and light themes
- **Responsive support**: Wide modal and tab panels adapted for mobile viewports

## [1.23.0] - 2026-07-26
### Added
- **Cron expression validation**: All 5 schedule fields validated (ranges 0-59/0-23/1-31/1-12/0-7, steps, commas, dashes)
- **Command validation**: Non-empty, max 2048 chars
- **In-memory locking per owner**: Prevents concurrent read-modify-write race conditions
- **File locking for /etc/cron.d**: Atomic writes with `.lock` files and 10s timeout
- **Secure temp files**: Random suffix via `crypto.randomBytes(8)` in `os.tmpdir()` with mode 0o600
- **@reboot/@yearly/@monthly/@weekly/@daily/@hourly shorthand support**: Full parsing and formatting
- **Enable/disable toggle**: Comment/uncomment entries without deleting (`PUT /:owner/:index/toggle`)
- **Human-readable schedule descriptions**: "Every minute", "Daily at 02:00", "Every Sunday at midnight"
- **Next run time calculation**: Computes next execution from cron fields with `formatDuration()`
- **/etc/cron.d system crontab management**: List, read, save, delete system cron files (`/cron/cron-d/*`)
- **Optimized owner detection**: Reads `/etc/passwd` once, caches user list, sorts alphabetically
- **Admin-only all routes**: GET endpoints now require admin role (crontab contents are sensitive)
- **Audit logging captures full entry**: Schedule fields and command included in audit details
- **Stats header**: Total jobs, active count, disabled count, owners count
- **Search/filter**: Filter by command text, description, or shorthand (250ms debounce)
- **Sorting**: By command, schedule, next run, enabled status
- **Pagination**: 50 entries per page with full page navigation
- **Schedule frequency color coding**: 8 color variants (every=red, minute=orange, hourly=blue, daily=green, weekly=purple, monthly=yellow, yearly=cyan, reboot=pink)
- **Detail modal**: Full entry view with all schedule fields, description, status, next run, quick actions
- **Confirm modal**: Replaces browser `confirm()` dialogs
- **Quick presets**: One-click buttons for minute/hourly/daily/weekly/monthly schedules
- **Shorthand selector**: Checkbox toggle between @reboot/@yearly/@monthly/@weekly/@daily/@hourly presets
- **Live description preview**: Updates human-readable description as schedule fields change
- **Toast notifications**: Success/error feedback on all mutations
- **Loading skeleton**: Animated shimmer rows during data fetch
- **Error state with retry**: Failed loads show error message with retry button
- **Empty state**: Dedicated empty state with icon for no-cron scenarios
### Changed
- **Full IIFE rewrite**: All functions scoped, no global namespace pollution
- **Event delegation**: All 9 inline onclick/onchange handlers replaced with `data-cron-action` attribute delegation
- **Owner dropdown shows counts**: "root (3)" format instead of just "root"
- **Schedule badge with frequency label**: Compact visual indicator alongside raw schedule text
- **Entry hover effects**: Subtle background and border color transitions
- **Disabled entries dimmed**: 55% opacity with hover restore
### Fixed
- **XSS in owner dropdown**: Owner names now HTML-escaped in `<option>` rendering
- **Race condition on concurrent saves**: In-memory lock prevents overlapping crontab writes
- **Temp file predictability**: Random suffix prevents path guessing
- **Audit log missing cron fields**: Now captures full schedule + command in audit records

## [1.22.0] - 2026-07-26
### Added
- **Subdirectory scanning**: Scans `/var/log/nginx/`, `/var/log/audit/`, `/var/log/httpd/`, `/var/log/php-fpm/`, `/var/log/nexuspanel/` in addition to flat files — exposes 335+ log files
- **Gzip decompression**: Reads `.gz` rotated logs on-the-fly via `zlib.createGunzip()` — access 257+ historical nginx logs
- **Log categorization**: Files grouped into System, Nginx, Audit, FTP, Panel, Packages, Other with collapsible category headers and file counts
- **Pinned/quick-access logs**: Important logs (messages, secure, nginx/access.log, nginx/error.log, nexuspanel.log, vsftpd.log) pinned at top of sidebar
- **File metadata**: Each file includes name, path, size, modified timestamp, category, isGzipped flag, readable flag
- **Streaming reverse-file read**: `tailReverse()` reads last N lines from end of file in 64KB chunks — never loads full file into memory. Handles 14MB+ syslog and 37K-line nginx logs
- **Streaming gzip tail**: `tailGzipped()` decompresses and collects last N lines using readline interface
- **Line count endpoint**: `GET /api/logs/linecount/:file` — efficient counting without full file load
- **SSE live tail stream**: `GET /api/logs/stream/:file` — Server-Sent Events push new lines every second, 30s auto-timeout
- **Download endpoint**: `GET /api/logs/download/:file` — streams file as attachment download
- **Multi-file search**: `POST /api/logs/search-multi` — search across multiple files, return results grouped by file
- **Admin-only on list**: All log endpoints now require admin role
- **File info bar**: Shows filename, size, line count, last modified, compressed status when viewing a log
- **Line numbers toggle**: Optional line number gutter in the viewer
- **Search highlighting**: Matched terms highlighted with `<mark>` elements, match count displayed
- **Search navigation**: Prev/Next buttons to jump between matches, current match highlighted
- **Regex search**: Toggle between plain text and regex search modes
- **Tail count selector**: Dropdown to choose 100/500/1000/5000 lines
- **Live follow mode**: SSE-powered auto-scroll with "Following..." indicator
- **Word wrap toggle**: Switch between pre-wrap and nowrap
- **Nginx table view**: Parse combined log format into sortable table (IP, Method, URL, Status, Size, Referer)
- **Log comparison modal**: Side-by-side diff of two log files with add/remove highlighting
- **Category sidebar search**: Filter sidebar files by name in real-time
- **Stats header**: Total files, total size, per-category counts
- **Toast notifications**: Success/error feedback on all actions
- **Loading skeleton**: Animated shimmer rows during data fetch
- **Error state with retry**: Visible error message with Retry button
- **Level coloring**: error/fail → red, warn/warning → yellow, notice/ok/success → green
- **Scroll position memory**: Remembers scroll position per file across switches (sessionStorage)
- **Responsive redesign**: Sidebar becomes stacked on mobile, toolbar wraps, compare modal responsive

### Fixed
- **Dead `execSync` import removed**: Was imported but never used
- **Memory exhaustion on large files**: Files >10MB now use streaming reverse read instead of `readFileSync`
- **No file size guard**: Added 10MB limit with clear error message
- **Entire file read for search**: Now uses streaming readline for large files, never loads full content into memory
- **Inline onclick handlers (4)**: All replaced with `data-action` event delegation
- **Global function pollution**: Full IIFE encapsulation, only `window.initLogs` exposed
- **`esc()` incomplete**: Added `"` and `'` to escape set
- **Silent error swallowing**: Empty `catch {}` replaced with toast notifications and error state display
- **No loading indicator**: Added loading skeleton
- **Search had no match count**: Now shows "N/M" navigation
- **No search highlighting**: Matched terms now highlighted with `<mark>` elements
- **Fixed 500-line tail hardcoded**: Now configurable via dropdown
- **List endpoint not admin-only**: All endpoints now require admin role
- **No audit logging**: Log access now logged via `routeLogger` middleware

### Changed
- **Backend rewritten**: 37→300+ lines, streaming reads, gz support, subdirectory scan, categories, 9 endpoints
- **Routes expanded**: 3→9 endpoints (list, categories, read, tail, search, search-multi, stream, download, linecount)
- **Frontend rewritten as IIFE**: 38→500+ lines, event delegation, all features encapsulated
- **HTML expanded**: 3→90+ lines with sidebar search, file info bar, toolbar controls, compare modal
- **CSS expanded**: 11→200+ rules — categories, info bar, table view, highlights, modals, loading, responsive
- **API client**: 3→9 methods (list, categories, read, tail, search, searchMulti, stream, download, linecount)

## [1.21.0] - 2026-07-24
### Added
- **Process Details endpoint**: `GET /api/processes/:pid/details` reads `/proc/<pid>/status`, fd count, full command
- **Process Signals endpoint**: `GET /api/processes/signals` returns available signal whitelist (SIGHUP through SIGTSTP)
- **Named signal endpoint**: `POST /api/processes/signal` accepts `{ pid, signal: "SIGTERM" }` with validation against whitelist
- **Rate limiting on kill**: Max 10 signal sends per minute per session (in-memory rolling window)
- **Kill result verification**: Backend checks `kill()` exit code and stderr, throws on failure
- **Stats header**: Total processes, total CPU%, total MEM%, top CPU consumer, top MEM consumer
- **Sort controls**: Click PID/User/CPU%/MEM%/RSS/Command headers to toggle asc/desc sort
- **Search/filter bar**: 300ms debounced filter by PID, username, or command string
- **Pagination**: 50 processes per page with prev/next controls and page indicator
- **CPU/MEM visual bars**: Inline bar indicators with color gradient (green/yellow/red for CPU, blue/yellow/red for MEM)
- **Kill confirmation modal**: Shows process info (PID, user, CPU, MEM, command) with signal selector (SIGTERM/SIGKILL/SIGHUP/SIGUSR1/SIGSTOP)
- **Process detail modal**: Click PID to view full details from `/proc` (PPID, state, threads, RSS, virtual size, open FDs, full command)
- **Process tree view**: Toggle button switches between flat list and `pstree` output in styled `<pre>` container
- **Smart polling**: Auto-refresh pauses when view is hidden, configurable intervals (5s/10s/30s/Off)
- **Loading skeleton**: Animated shimmer rows during initial data fetch
- **Toast notifications**: Non-blocking success/error feedback on kill actions
- **Error state with retry**: Visible error message with Retry button when API fails
- **Light theme support**: 15+ light theme CSS overrides for all new components

### Fixed
- **CRITICAL: `ps aux` whitespace parsing**: Leading whitespace in `ps aux` output caused all fields to shift by one — PID was empty, user was PID, etc. Fixed with `line.trimStart()` before splitting
- **CRITICAL: Kill signal double-dash**: Frontend sent `{ signal: '-15' }` (string with dash), backend prepended another dash producing `--15`. Frontend now sends `{ signal: 15 }` (number). Backend validates as integer 1-31
- **CRITICAL: Bulk selection caused by empty PID**: All processes had empty/null PID from parsing bug, so `state.selected.has("")` matched every row when any checkbox was clicked
- **Status 404 from malformed URL**: Empty PID produced URL `/api/processes//status` which Express normalized to `/api/services/status`, routing to wrong handler
- **Kill silently succeeds on failure**: Backend now checks `runSafeSync` exit code and stderr, returns error on failure
- **Silent error swallowing**: Frontend empty `catch {}` replaced with error state display and toast notifications
- **Global function pollution**: All functions encapsulated in IIFE, only `window.initProcesses` and `window.procCleanup` exposed
- **Inline onclick XSS risk**: All `onclick="procKill(...)"` handlers replaced with `data-action` event delegation
- **Fixed 5s polling when hidden**: Now checks `viewProcesses` visibility before polling
- **No confirmation on kill**: Replaced bare `confirm()` with styled modal showing process details and signal choice

### Changed
- **Backend rewritten**: `list()` returns structured objects with 11 fields, `kill()` returns result with signal info, new `details()`/`sendSignal()`/`tree()`/`listSignals()` functions
- **Routes expanded**: 6 endpoints (list, tree, signals, details, kill, signal) with admin-only on mutation routes
- **Frontend rewritten as IIFE**: 466 lines, all functions private, event delegation on document
- **HTML expanded**: 75 lines with search input, sort bar, view toggle (List/Tree), stats area, pagination, toast, kill modal, detail modal
- **CSS expanded**: 95+ new lines — sort bar, bars, modals, toasts, loading skeleton, tree view, detail grid, pagination, responsive mobile

## [1.20.0] - 2026-07-24
### Added
- **Admin-only API access**: All service endpoints (list, status, action) now require admin role
- **Bulk actions**: `POST /api/services/bulk/:action` for start/stop/restart on multiple services (max 20)
- **Service actions endpoint**: `GET /api/services/actions` returns valid action list
- **Stats header**: Total, running, stopped, and failed service counts
- **Sort by name/state/description**: Click column headers to toggle sort
- **Bulk selection**: Checkboxes on service rows with bulk action toolbar
- **Status modal**: Styled modal with formatted output replaces `alert()` dialog
- **Loading skeleton**: Animated shimmer rows during data fetch
- **Search debounce**: 300ms debounce on filter input
- **Button loading states**: Action buttons show loading indicator during API call
- **Optimistic UI updates**: Service state updates immediately after action (no full reload)
- **Toast notifications**: Success/error feedback on actions
- **Error state UI**: Visible error message when API fails

### Fixed
- **`action()` silently succeeds on failure**: Backend now checks `systemctl` exit code and stderr, returns error messages
- **XSS via onclick injection**: All inline `onclick` handlers replaced with `data-svc-action` event delegation
- **Non-admin users can list services**: `GET /api/services` and `GET /:name/status` now require admin role
- **`alert()` for status output**: Replaced with styled modal with formatted pre-formatted text
- **Empty `catch {}` swallows errors**: Error state now displayed to user
- **`svcState.loading`/`svcState.filter` dead code**: State properties properly used
- **Empty service name after sanitization**: Backend validates name is non-empty before calling systemctl
- **Error information leakage**: Backend sanitizes error messages before returning to client
- **Service name `.service` suffix**: Backend now handles both `nginx` and `nginx.service` formats
- **Full list reload after every action**: Optimistic update of affected service state
- **No loading indicator**: Loading skeleton shown during data fetch

### Changed
- **Frontend rewritten as IIFE**: Encapsulated in immediately-invoked function expression
- **Event delegation**: All inline handlers replaced with `data-svc-action` attributes
- **HTML expanded**: Minified single-line HTML now properly formatted with new elements
- **CSS expanded**: Hover states, loading skeleton, modal, toast, bulk bar, sort bar, pagination
- **API client**: `act` parameter now URL-encoded, new methods added (bulkAction, actions)

## [1.19.0] - 2026-07-24
### Added
- **Full audit coverage**: `routeLogger` middleware added to all 16 previously unlogged route files (auth, settings, profile, tokens, services, processes, updates, ssl, cron, firewall, docker, emails, phpfpm, databases, alerts, notifications)
- **User filter**: Filter audit entries by username via dropdown
- **Date-range filtering**: Filter by start/end date
- **Export**: Download full audit log as JSON file
- **Stats header**: Total entries, unique users, and action type counts
- **Clear confirmation modal**: Styled modal replaces `confirm()` dialog; clears are now self-logged with backup reference
- **Auto backup before clear**: `clear()` saves a timestamped backup file before wiping
- **In-memory cache**: Entries loaded into memory on startup; queries read from memory instead of disk
- **Flush buffer with graceful shutdown**: Writes batched and flushed on interval + process exit/SIGINT/SIGTERM
- **Action icons**: Color-coded create/update/delete indicators per entry
- **Details display**: Audit entry details shown inline beneath the path
- **Loading skeleton**: Animated shimmer rows during data fetch
- **Search debounce**: 300ms debounce on search input
- **New API endpoints**: `GET /api/audit/users`, `GET /api/audit/stats`, `GET /api/audit/export`
- **Route params in details**: Audit entries now capture route parameters (username, domain, etc.)
- **Safe body fields**: Audit details capture safe fields from request body (name, type, action, enabled, domain, username, email, host, port)

### Fixed
- **Double-logging**: Removed broken `server.js` auto-logging middleware that produced duplicate entries for every mutation
- **`undefined:*` action names**: The removed middleware generated corrupted actions like `"undefined:create"` from incorrect URL parsing; 100+ corrupted entries eliminated
- **ID collision risk**: IDs now use `Date.now() + crypto.randomBytes(4)` to prevent duplicate IDs within the same millisecond
- **Race condition on writes**: In-memory cache + flush buffer eliminates concurrent read-modify-write cycles
- **Synchronous I/O blocking**: Queries now read from memory instead of blocking on `readFileSync` per request
- **No limit cap on queries**: Query limit now capped at 500 maximum
- **`DELETE /clear` not logged**: Clear action now self-logged with backup file reference
- **`getActions()` loads entire file**: Now reads from in-memory cache
- **Silent data loss on parse failure**: Corrupted `audit.json` no longer silently wipes history

### Changed
- **Frontend rewritten as IIFE**: Encapsulated in immediately-invoked function expression
- **Event delegation**: All inline `onclick`/`oninput`/`onchange` replaced with `data-audit-action` attributes
- **HTML expanded**: Previously minified single-line HTML now properly formatted
- **CSS expanded**: Hover states, loading skeleton animation, modal, toast, responsive layout

## [1.18.2] - 2026-07-23
### Fixed
- **File Manager "path outside allowed directories"**: `fmState.currentPath` was never synced from the server response; when server redirects `/` to `/var/www`, creating a folder sent `parentPath='/'` which resolved to `/new_folder` outside allowed roots

## [1.18.1] - 2026-07-23
### Fixed
- **VERSION file drift**: `VERSION` file was not updated in the v1.18.0 commit, causing the update checker on remote VPS instances to report "Up to date" on stale versions
- **MIME Types "Cannot set properties of null"**: `showLoading()` destroyed DOM container elements (`mimeSystemTypes`, `mimeUserTypes`) before rendering; `loadAll()` now restores the structure after data loads

## [1.18.0] - 2026-07-23
### Added
- **adminOnly middleware**: All mutation routes (create/update/delete) now require admin role
- **Audit logging**: All create/update/delete/bulk-delete/import operations logged via `audit.log()`
- **File locking**: In-memory lock on `mime-types.json` prevents concurrent write corruption
- **Atomic writes**: `saveUserTypes()` uses temp file + `fs.rename()` for crash safety
- **Secure ID generation**: IDs now use `m_<timestamp>_<random-hex>` to prevent collisions
- **Input length validation**: mimeType max 128, description max 512, extensions max 20 items each max 32 chars
- **Extension format validation**: Each extension validated against `/^\.[a-z0-9]{1,32}$/i`
- **Route parameter validation**: `:id` validated against `/^m_\d+_[a-f0-9]+$/`
- **Extension-to-type reverse lookup**: `GET /api/mimetypes/lookup/:ext` finds all types claiming an extension
- **Bulk delete**: `POST /api/mimetypes/bulk/delete` with array of IDs (max 50)
- **Export**: `GET /api/mimetypes/export` downloads user types as JSON
- **Import**: `POST /api/mimetypes/import` imports types from JSON array (duplicate detection, max 50)
- **User types search**: Filter by mimeType, extensions, or description
- **User types sorting**: Click Type/Exts/Date headers to toggle asc/desc
- **User types pagination**: 20 per page with page controls
- **Delete confirmation modal**: Styled modal replaces `confirm()` dialog
- **Bulk selection**: Checkboxes on cards + bulk toolbar with delete/deselect
- **Loading skeleton**: Animated skeleton shown during data fetch
- **Button loading states**: All async buttons show loading text
- **Description textarea**: Changed from `<input>` to `<textarea>` for multi-line support
- **Extension overlap warning**: `POST /api/mimetypes/overlap` checks for duplicate extensions across types

### Fixed
- **XSS via inline onclick**: All onclick handlers replaced with `data-mt-action` event delegation
- **No adminOnly on routes**: Any authenticated user could create/edit/delete MIME types via API
- **Zero audit logging**: All mutation operations now recorded
- **No file locking**: Concurrent requests could corrupt mime-types.json
- **Non-atomic writes**: saveUserTypes now uses temp+rename pattern
- **ID collision risk**: `Date.now()` IDs replaced with timestamp + crypto random suffix
- **API client missing encodeURIComponent**: All ID parameters now properly URL-encoded
- **Misleading error messages**: "Session expired" replaced with specific error text
- **No input validation on extensions**: Now validates format and length
- **Global function pollution**: All functions encapsulated in IIFE

### Changed
- **Frontend JS full rewrite**: IIFE encapsulation, single event delegation listener, all functions private
- **HTML restructure**: Added delete modal, import modal, sort bar, bulk bar, pagination, loading skeleton, removed all inline onclick
- **CSS additions**: Styles for `.mime-toolbar`, `.mime-bulk-bar`, `.mime-pagination`, `.mime-loading`, `.mime-delete-modal-*`, `.mime-user-sort-bar`, `.mime-form-textarea`, `.mime-form-overlap`

## [1.17.2] - 2026-07-23
### Fixed
- **update.sh: systemd service detection**: Auto-detects service name by scanning `systemctl list-unit-files` for any `nexuspanel*` service instead of hardcoding `nexuspanel`. Falls back gracefully when no systemd service exists
- **update.sh: direct restart fallback**: When no systemd service found, starts with `nohup` + PID file (`/var/run/nexuspanel.pid`) + log file (`/var/log/nexuspanel.log`). Old process is killed gracefully before starting. Port freed with `fuser -k` + wait loop
- **update.sh: git stash on clean tree**: Only stashes when there are actual uncommitted changes (`git diff --quiet` check), preventing unnecessary stash on clean working trees
- **update.sh: port/config extracted**: Port (3443), install dir, PID file, and log file paths defined as variables at top of script
- **update.sh: output shows correct service info**: Final summary displays systemd service name or PID + log path depending on how the service was started

## [1.17.1] - 2026-07-23
### Fixed
- **CRITICAL: VERSION file never updated past 1.11.0**: Update checker read `VERSION` file instead of `package.json`, causing all installed instances to report v1.11.0 as "Up to date" even after multiple releases. Fixed with three-layer defense:
  1. **Startup sync**: `server.js` now syncs `VERSION` from `package.json` on every boot — after `git pull && systemctl restart`, VERSION is immediately correct
  2. **Runtime fallback**: `getLocalVersion()` falls back to `package.json` if `VERSION` is missing or malformed
  3. **Auto-correction**: `getLocalVersion()` writes corrected VERSION back to disk if package.json is newer

## [1.17.0] - 2026-07-23
### Added
- **Scan History Persistence**: Completed scans saved to `data/scan-history.json` (max 100 entries, oldest auto-pruned)
- **Scan History UI**: New "Scan History" section with search, pagination, and status badges
- **Scan History API**: `GET /api/virusscanner/history` with search, sort, pagination, status filter, target filter
- **SHA-256 Hash Tracking**: Quarantined files get SHA-256 hash stored in `.meta.json` metadata
- **ClamAV Defs Staleness Warning**: Badge shown when virus definitions are older than 7 days
- **Quarantine Search**: Real-time search filtering on quarantine list by filename, path, or threat
- **Quarantine Pagination**: Paginated quarantine list with page controls (20 per page)
- **Delete Confirmation Modal**: Replaced `confirm()` dialogs with styled modal for quarantine delete/restore
- **Audit Logging**: All scanner mutations (scan start/abort, quarantine create/restore/delete, defs update) logged
- **Button Loading States**: All action buttons show loading text during async operations

### Fixed
- **CRITICAL: 5 XSS vulnerabilities via inline onclick**: All `onclick` handlers replaced with `data-vs-action` event delegation
- **CRITICAL: Path traversal on custom scan path**: Custom path now validated to be within `/home`, `/var/www`, or `/etc/vsftpd`; rejects `..` sequences and symlinks outside allowed directories
- **CRITICAL: Path traversal in quarantine restore/delete**: `filePath` validated to be inside quarantine directory using `realpathSync`
- **Route parameter validation**: `scanId` validated against `/^scan_\d+_\d+$/`, `quarantineId` against `/^[a-zA-Z0-9_-]+$/`
- **Input validation on custom path**: Route handler validates path format before passing to service
- **Scan results lost on restart**: Now persisted to `scan-history.json`
- **No file locking on quarantine**: Added in-memory lock for quarantine operations
- **No atomic writes**: History file uses temp + rename pattern
- **`fsp.rmdir` deprecated**: Replaced with `fsp.rm` for Node 18+ compatibility
- **Hardcoded paths**: Allowed scan bases defined as constant

### Changed
- **Frontend JS full rewrite**: All functions encapsulated in IIFE, single event delegation listener on `document`
- **HTML structure**: Added search bars, pagination containers, history section, delete modal, removed all inline onclick
- **CSS additions**: Styles for `.scanner-history-*`, `.scanner-pagination`, `.scanner-delete-modal-*`, `.scanner-q-hash`

## [1.16.0] - 2026-07-23
### Added
- **nginx Config Backup Item**: Backs up `/etc/nginx/conf.d/*.conf` and `nginx.conf`
- **Panel Configuration Backup Item**: Backs up `data/*.json`, `.env`, and `package.json`
- **Cancel Backup**: `POST /api/backups/:taskId/cancel` endpoint to abort running backups
- **Backup Statistics**: `GET /api/backups/stats` endpoint returns total backups, size, last backup, failed count
- **SHA256 Checksums**: Each backup item file gets a SHA256 checksum stored in metadata
- **Backup Search**: Real-time search filtering on backup list (by timestamp, type, items)
- **Backup Type Filter**: Filter backups by Full/Selected type
- **Column Sorting**: Click sortable column headers (Date, Type, Size, Status) to sort ascending/descending
- **Server-Side Pagination**: Paginated backup list with page controls
- **Delete Confirmation Modal**: Replaced `confirm()` dialog with styled modal
- **Audit Logging**: All backup start/cancel/delete/schedule operations logged to audit system
- **Schedule Form Styles**: Added missing CSS for `.bk-schedule-item`, `.bk-toggle`, `.bk-form-row`, `.bk-form-actions`
- **Light Theme Overrides**: Added light theme support for schedule items and toggle switches
- **Schedule Next Run Display**: Shows next run time in schedule list

### Fixed
- **CRITICAL: `applyRetention()` treated array as object**: `Object.entries()` on JSON array returned index-keyed pairs, not backup entries — retention never worked. Now correctly filters by target and uses `splice()` on array
- **CRITICAL: Scheduler status check typo**: `status === 'completed'` never matched — backup service uses `'complete'`. Fixed to `'complete'`
- **CRITICAL: Scheduled backups crashed immediately**: `schedule.target` (string) passed to `startBackup()` which called `.filter()` on it. Now wraps in array: `[schedule.target]`
- **XSS via inline onclick**: All backup UI functions now use `data-bk-action` attribute event delegation
- **No audit logging**: All backup mutation operations now logged via `audit.log()`
- **`saveMeta()` not atomic**: Now uses temp file + `fs.renameSync()` for crash safety
- **File locking on metadata**: Added in-memory write lock for `backups.json` to prevent concurrent corruption
- **`checkDiskSpace()` after `mkdir`**: Now runs before creating backup directory
- **`parseInt` without radix**: All `parseInt` calls now include radix 10
- **Download path traversal**: `resolveDownload()` now validates timestamp with regex and checks resolved path stays within backup dir

### Changed
- **`GET /api/backups/list` response format**: Now returns `{ backups, total, page, limit, pages }` with pagination metadata
- **`startBackup()` returns synchronously**: Task runs in `setImmediate()`, returns `{ taskId, timestamp, items }` immediately
- **`ITEM_DEFS` expanded**: Now 11 items (added `nginx` and `config`)
- **Scheduler `getDue()` now also handles `'cancelled'` status** to properly mark runs
- **Schedule form uses event delegation**: No more inline `onchange`/`onclick` handlers
- **Backup list refresh button**: Uses event delegation instead of inline `onclick`

## [1.15.0] - 2026-07-23
### Added
- **Domain Search**: Real-time search filtering by domain name, type, or parent domain
- **Column Sorting**: Click sortable column headers (Type, Domain, Port, Created) to sort ascending/descending
- **Server-Side Pagination**: Paginated domain list with page controls
- **Bulk Selection**: Select multiple domains via checkboxes for bulk delete
- **Bulk Delete Toolbar**: Visual selection toolbar with count and action buttons
- **SSL Expiry Display**: Shows certificate days remaining or expiration status per domain
- **Delete Confirmation Modal**: Replaced `confirm()` dialog with styled modal (supports single and bulk)
- **Nginx Config Backup**: Timestamped `.bak` files created before every nginx config overwrite
- **Dangerous Directive Blocking**: `saveNginxPreview` blocks `proxy_pass`, `alias`, `include`, `set`, `eval`, `access_by_lua`, `content_by_lua`
- **Audit Logging**: All domain create/update/delete/SSL/nginx operations logged to audit system
- **Atomic File Writes**: `domains.json` writes use temp file + rename for crash safety
- **File Locking**: Concurrent write protection for `domains.json`
- **`bulkDelete` Endpoint**: `POST /api/domains/bulk/delete` for batch domain removal (max 50)

### Fixed
- **CRITICAL: SSL config not updated after certbot success**: `createDomain` now rewrites nginx conf with SSL listen/redirect blocks after successful certbot install
- **CRITICAL: `findAvailablePort()` always returned 80**: Now scans port range 8000-9000 excluding used ports
- **CRITICAL: `parseInt` NaN in `editDomain`**: Added `isNaN` check before port validation
- **Path traversal on `writeNginxConf`**: Domain name validated against `validators.domain` regex before file write
- **`saveNginxPreview` accepts arbitrary nginx**: Dangerous directives now blocked before write
- **SSL cert info lost on reload**: `getSSLCertInfo()` reads actual cert expiry from disk via `openssl x509`
- **`sslCert` field never stored**: Create and edit now persist the cert path in `domains.json`
- **No config backup before overwrite**: `backupNginxConf()` creates timestamped `.bak` before every write
- **XSS via inline onclick**: Replaced with `data-dm-action`/`data-dm-domain` attribute event delegation
- **Hardcoded certbot email**: Now reads from `process.env.CERTBOT_EMAIL` with fallback
- **`parseInt` without radix**: All `parseInt` calls now include radix 10
- **No field whitelist on domain edit**: `sanitizeUpdates()` restricts to `port`, `sslEnabled`, `root`, `type`

### Changed
- **`GET /api/domains` response format**: Now returns `{ domains, total, page, limit, pages }` with pagination metadata
- **Domain list response**: Each domain now includes `sslInfo` (expiry date, days left, isExpired, isExpiringSoon) when SSL is enabled
- **`nginx.conf` exclusion**: Sync now skips `.bak` files when scanning `/etc/nginx/conf.d`

## [1.14.0] - 2026-07-23
### Added
- **User Search**: Real-time search filtering by username, shell, home, or groups
- **Column Sorting**: Click any sortable column header (Username, UID, Shell, Last Login) to sort ascending/descending
- **Server-Side Pagination**: Paginated user list with page controls for large user bases
- **Bulk Operations**: Select multiple users via checkboxes for bulk delete, lock, or unlock
- **Bulk Toolbar**: Visual selection toolbar with count and action buttons
- **User Detail Endpoint**: `GET /api/users/:username` now returns full system user data + panel user (safe)
- **2FA Badge**: Shows 2FA enabled status in user table
- **Delete Confirmation Modal**: Replaced `confirm()` dialog with styled modal
- **Toast Notifications**: Non-blocking success/error messages for bulk operations
- **Audit Logging**: All user create/update/delete/bulk operations logged to audit system
- **Password Strength Validation**: Enforces uppercase + digit requirements on create and update
- **Atomic File Writes**: `users.json` writes use temp file + rename for crash safety
- **File Locking**: Concurrent write protection for `users.json`

### Fixed
- **CRITICAL: Route ordering**: `GET /meta/options` was unreachable due to `/:username` shadowing it — moved above parameterized routes
- **CRITICAL: Password hash leak**: `GET /:username` no longer exposes `passwordHash` or `twoFactorSecret`
- **Home base path traversal**: `homeBase` now restricted to `/home` and `/var/www`
- **Panel user never created**: `POST /create` now actually calls `createPanelUser()` when `createPanel` is not false
- **Panel user orphaned on delete**: `DELETE /:username` now cleans up the panel user record
- **XSS via inline onclick**: Replaced with `data-` attribute event delegation (same pattern as FTP module)
- **Group handling**: Empty groups array no longer runs `usermod -G ""` (defaults to `users` group)
- **Password minimum on update**: Admin password changes now enforce 6-char minimum + strength rules
- **Silent error swallowing**: Critical operations (sudoers, deletion, chown) now log errors instead of silently ignoring
- **Self-demotion protection**: Admin cannot change their own role via `PUT /:username`
- **`getSystemUser()` implemented**: Was a stub returning `null`, now properly queries `getent passwd`
- **`userdel -rf` changed to `-r`**: No longer force-deletes home directory if removal fails
- **chpasswd stdin sanitization**: Strips newline characters from username/password to prevent injection

### Changed
- **`GET /list` response format**: Now returns `{ users, total, page, limit, pages }` with pagination metadata
- **`DELETE /:username` response**: Now includes `username` field in response
- **`PUT /:username` response**: Now returns `{ ok, username }` instead of bare `true`
- **`POST /bulk`**: New endpoint for bulk delete/lock/unlock operations (max 50 users per request)

## [1.13.1] - 2026-07-23
### Fixed
- **WebSocket "Invalid frame header" (CRITICAL)**: Switched WebSocket servers to `noServer` mode with manual upgrade handling — auth check happens before upgrade, eliminating mixed HTTP error + WebSocket frame responses that caused Chrome 150 to fail parsing
- **WebSocket close producing HTTP 400**: Removed `setTimeout` close hack; server now sends clean HTTP 401 on auth failure instead of WebSocket close frames followed by stray HTTP responses
- **xterm.js unicode11 addon**: Added `allowProposedApi: true` to terminal options to fix unicode11 extension loading
- **FTP account list format**: Handle both array and `{accounts, total}` response formats for backward compatibility

## [1.13.0] - 2026-07-22
### Added
- **FTP Service Control**: Start/stop/restart vsftpd service from the UI
- **FTP Connection Test**: Test FTP connectivity with host/port/credentials before saving
- **FTP Activity Logs**: Full log viewer with search, parsing vsftpd.log and xferlog formats
- **FTP Bandwidth Monitoring**: Total in/out stats and recent transfer history
- **FTP Config Editor**: Direct vsftpd.conf editing with backup on save
- **FTP Passive Port Configuration**: Edit passive port range from the UI
- **FTP SSL Certificate Management**: View existing cert info, generate self-signed certificates
- **FTP Quota Management**: Set disk quotas via setquota, view detailed quota info
- **FTP User Pagination**: Paginated account list for large user bases
- **FTP User Search**: Filter accounts by username, home directory, or local root
- **FTP Bulk Operations**: Enable/disable/delete multiple users at once with checkbox selection
- **FTP Write/Download Controls**: Per-user write_enable and download_enable permissions
- **FTP Audit Logging**: All FTP operations (create/delete/enable/disable/config changes) logged to audit system
- **FTP Bulk Bar**: Visual selection toolbar with count, bulk enable/disable/delete buttons
- **FTP Service Control Buttons**: Start/Stop/Restart buttons below status cards

### Fixed
- **XSS in FTP onclick handlers (CRITICAL)**: Replaced inline onclick with event delegation using data- attributes — prevents code injection via malicious usernames
- **HTML table header/column mismatch**: Headers now match rendered columns (added Rate Limit, Clients, select-all checkbox)
- **pkill killing all user processes**: Changed from `pkill -9 -u username` (kills everything) to `pkill -9 -f vsftpd.*username` (kills only FTP sessions)
- **userdel -rf force-deletes home**: Changed from `-rf` to `-r` to allow graceful removal
- **FTP service log not read**: Now reads /var/log/vsftpd.log first (more detailed), falls back to xferlog
- **Duplicate formatSize/escHtml functions**: Removed — uses global versions from style.css
- **Unused ftpData global variable**: Replaced with proper ftpState object
- **FTP create route not RESTful**: Changed `POST /accounts/create` to `POST /accounts`

### Changed
- Backend service rewritten with file locking, audit integration, service control, connection testing, config editor, SSL management, bandwidth monitoring
- Backend routes expanded from 9 to 25+ endpoints with proper REST conventions
- Frontend API expanded from 9 to 20+ methods
- Frontend JS rewritten with event delegation pattern, search, pagination, bulk operations, loading states
- Frontend HTML updated with toolbar buttons, search bar, bulk bar, pagination, 7 new modals
- Frontend CSS expanded with 60+ new style rules for all new UI components

## [1.12.0] - 2026-07-22
### Added
- **Docker Screen implementation**: complete Docker management interface
  - **Backend service** (`src/services/docker.js`): Dockerode-based with 25+ functions — containers CRUD, images CRUD, inspect/stats/logs, pull with progress callback, prune (containers/images/volumes), createContainer (ports/volumes/env/memory/cpus), listNetworks, inspectNetwork, removeNetwork, listComposeProjects, containerArchive, readContainerFile
  - **Backend routes** (`src/routes/docker.js`): All REST endpoints including containers, images, networks, compose, create, prune, filesystem
  - **Backend WebSocket** (`src/services/docker-ws.js`): Handles exec, logs, exec-input, exec-output, exec-resize, exec-end, exec-error, pull, pull-progress, pull-complete, pull-error, logs-data, logs-end
  - **Frontend API** (`public/js/api.js`): Full `API.docker` object with containers, images, info, start/stop/restart/remove, removeImage, logs, inspect, stats, inspectImage, imageHistory, pull, prune, createContainer, networks, inspectNetwork, removeNetwork, composeProjects, composeProject, containerFs, containerFsRead
  - **Frontend UI** (`public/js/docker.js`): Complete Docker management interface with:
    - Project-based container rendering with collapsible cards
    - Color-coded status dots (running=green, paused=yellow, stopped=gray)
    - Batch selection and actions (stop/restart/remove multiple containers)
    - Search and filter containers
    - Auto-refresh with configurable interval (5s/10s/30s/60s)
    - Status bar showing counts of running/stopped containers
    - Images management with pull/remove/inspect functionality
    - Docker System Info header bar (version, containers, images, CPUs, RAM, driver, architecture)
    - Network management tab (list/inspect/delete networks)
    - Compose projects tab (view projects with Up/Down actions)
    - Container logs viewer with live streaming
    - Container stats modal (CPU, memory, network I/O, block I/O)
    - Container inspect modal
    - Container exec terminal (xterm.js with FitAddon)
    - Pull image modal with progress tracking
    - Prune system modal with granular options (containers/images/volumes)
    - Create container modal (image, name, ports, volumes, env, memory limits)
    - Filesystem browser for containers (directory listing + file reading)
  - **CSS styles** (`public/css/docker.prompt.css`): All Docker-specific styles (project cards, status bars, modals, network cards, filesystem browser, compose actions, tabs, info bar)
  - **HTML views** (`public/index.html`): Complete Docker view with tabs (Containers, Images, Networks, Compose), 10+ modals, toolbar with search, auto-refresh, create/pull/prune buttons

### Fixed
- **`deleteEntry` function missing in `filemanager.js`**: function body was accidentally removed in v1.11.0 commit, restored from v1.10.0 with user parameter for path resolution
- **Docker `Names` array handling**: Docker API returns container names as arrays (e.g., `["/name"]`), frontend code assumed strings — added `Array.isArray()` checks throughout docker.js
- **Container stats `percpu_usage` undefined**: Docker API may not provide `percpu_usage` on some systems — added fallback to 1 CPU count
- **Container stats `system_cpu_usage` undefined**: Added null guards for CPU usage calculations
- **Container stats `io_service_bytes_recursive` undefined**: Added check alongside existing `blkio_stats` guard
- **Server restart required**: NexusPanel server had cached old route definitions before Docker routes were added

### Changed
- Cache-busting bumped to `v=1.12.0` for `docker.js`, `docker.prompt.css`
- Removed `docker-exec.js` standalone script (consolidated into docker.js)
- Docker routes properly mounted at `/api/docker` with auth middleware

## [1.11.0] - 2026-07-21
### Added
- **Batch rename**: find/replace, prefix/suffix, case change, live preview with conflict detection
- **File diff view**: `POST /files/diff` route with O(m*n) LCS algorithm, frontend modal with color-coded unified diff hunks (green/red for add/remove, gray for context)
- **Directory tree sidebar**: collapsible "Directory Tree" section with lazy-loading children on expand
- **File upload progress bar**: real-time upload percentage tracking
- **File upload drag-and-drop**: drag files from desktop onto the file manager to upload
- **`escapeAttr()` for all `value=""` attributes**: 8 modal input fields now properly escaped
- **Event delegation for search results**: click via `fmEntries` listener instead of stale inline handlers
- **Event delegation for path suggestions**: click via `fmPathSuggestions` listener
- **Event delegation for git stage/unstage**: `data-git-stage`/`data-git-unstage` attributes replace inline `onclick`
- **Audit logging**: `file.diff` and `file.upload` actions now logged

### Fixed
- **Upload path traversal (CRITICAL)**: `file.originalname` now sanitized with `path.basename()` and strict character whitelist — prevents writing to arbitrary paths
- **XSS via git stage/unstage (HIGH)**: inline `onclick` handlers with `escapeHtml()` in JS-string context replaced with event delegation via `data-` attributes + `encodeURIComponent`/`decodeURIComponent`
- **Preview close button non-functional**: `querySelector('.fm-modal-close')` returned wrong element; now uses `getElementById('fmPreviewClose')`
- **Unescaped `f.status` in git HTML**: `f.status` now passed through `escapeHtml()`
- **Content-Disposition CRLF injection**: `\r` and `\n` now stripped from download filename
- **`/files/diff` no size guard**: 10MB size limit added (matching `/read` route behavior)
- **`/files/diff` missing try/catch**: outer error handler added
- **Dead `execFile` import** removed from `src/routes/files.js`
- **`fsp` referenced before `const`**: `require('fs/promises')` moved before its first use
- **`closeFmModal` overlays `baseModal` only**: removed margin-top interference from `.fm-form-row` in modal forms
- **`showFmError` → `fmShowToast` in git refresh**: undefined function reference fixed
- **Editor content not saved after save**: `fmEditorContent` updated with fresh value after each save
- **Search query not reset on navigation**: search input and `fmState.searchQuery` cleared when leaving search mode
- **`Shift+Ctrl+C/X/V` shortcuts dead**: these key combos now checked before plain `Ctrl+C/X/V`
- **Fullscreen toggle icon never changes**: exit state now shows `✕` instead of same `⛶`
- **Unused `main` variable** removed from `fmLoadDirectory()`
- **Empty `catch {}` blocks**: `console.warn` added for debugging

### Security
- **Upload path traversal** (see Fixed)
- **XSS via git stage/unstage** (see Fixed)
- **Content-Disposition CRLF injection** (see Fixed)
- **`unlink` on file in `/move` route no longer silent**: now wrapped in try/catch with error log

### Changed
- Cache-busting bumped to `v=1.11.0` for `filemanager.js`, `api.js`, `style.css`
- CSS `!important` usage verified: only 1 remaining FM-related override (justified)
- Light theme gaps filled: `.fm-editor-overlay`, `.fm-preview-overlay`, `.fm-toast` variants added
- Loading "Loading..." text replaced with animated skeleton rows
- Search results and path suggestions converted to event delegation pattern

## [1.10.0] - 2026-07-20
### Security
- **Command injection eliminated**: all `exec()`/`execSync()` calls in services (backups, cron, docker, domains, firewall, ftp, processes, services, ssl, users) replaced with `spawn`/`spawnSync` argument arrays via new `runSafe`/`runSafeSync` utilities in `src/utils/shell.js`. No user input is ever interpolated into shell strings
- **Path traversal prevented**: `safeResolve()` path jail restricts all file operations to allowed roots (`/`, `/bin`, `/boot`, `/etc`, `/home`, `/var`, etc.) and denies sensitive paths (`/etc/shadow`, `/etc/ssh/`, `/etc/pam.d/`). Zip-slip prevention via `resolveSafeChild()` for both zip and tar archives. `/` resolves to `/var/www` by default
- **XSS eliminated**: new `escapeHtml`/`escapeAttr` functions in `public/js/sanitize.js` (loaded first). All `innerHTML` injections in filemanager.js, emails.js, domains.js, ftp.js, users.js now escape user-controlled content. Backend escapes `err.message` before sending HTML responses
- **Auth hardening**: `JWT_SECRET` validated at startup (process exits if unset). Invalid tokens logged instead of silently caught. Login rate-limited (10 attempts/15 min window). Logout properly clears cookie with matching options. Cookie set with explicit `path: '/'`
- **Admin-only enforcement**: `adminOnly` middleware applied to POST/PUT/DELETE on all 13 privileged route files (backups, cron, dashboard, databases, docker, emails, firewall, logs, phpfpm, processes, services, ssl, updates). File manager routes (`/api/files/*`) also require admin. Local `adminOnly` duplicate in backups.js removed
- **CSRF protection**: origin validation on all state-changing requests (POST/PUT/DELETE/PATCH) rejects mismatched origins
- **Terminal environment sanitized`: `SAFE_ENV_KEYS` allowlist prevents leaking `JWT_SECRET`, `ADMIN_PASS`, and other sensitive env vars into pty sessions
- **CRLF injection blocked**: email `to`, `cc`, `bcc`, `subject` headers rejected if they contain `\r` or `\n`
- **Path traversal in backups/emails routes**: timestamp validated against `/^\d{13}$/`; `messageId` sanitized against `/[\\/]|\.\./`
- **CSP hardened**: removed `'unsafe-eval'` from script-src
- **2FA disable verification**: accepts either `password` (bcrypt) or `token` (TOTP verify); frontend auto-detects 6-digit input and sends as `token`

### Fixed
- **License service**: removed hardcoded HMAC secret fallback (`getSharedSecret` throws if `LICENSE_SECRET` unset); fixed cache bypass bug (returned `true` instead of `false`); simplified dead ternary; silent `catch {}` blocks now log errors
- **.env.example/config.example.json**: strengthened `JWT_SECRET`/`ADMIN_PASS` defaults; set `cors_origin` to `same-origin`
- **Hardcoded server domain removed**: `emails.js` used `const SERVER = 's2u.me'` — replaced with `window.location.hostname`

## [1.9.6] - 2026-07-19
### Fixed
- **Table data search root cause**: the previous fix never reached production because the live process is managed by `systemd`. The `nexuspanel.service` has now been restarted with the corrected code.
- **Table data search SQL**: switched the global row search to `to_jsonb(table.*)::text ILIKE $N::text`, which PostgreSQL can parameterize reliably.
- **Auto-increment on existing tables**: adding a `serial`/`bigserial` column no longer includes an empty `DEFAULT ''` clause, fixing *"multiple default values specified for column"*.
- **Search input focus loss**: database, table, function, and table-data search inputs now keep focus and cursor position while typing.

### Added
- **Column reordering in Table Config**: each column now has ↑/↓ arrows. Reordering is saved to a per-table metadata store (`nexus_panel_column_order`) and is used when displaying table data and exporting CSV/JSON/SQL.

## [1.9.5] - 2026-07-19
### Fixed
- **Auto-increment on existing tables**: adding a `serial`/`bigserial` column no longer includes an empty `DEFAULT ''` clause, fixing *"multiple default values specified for column"*
- **Search input focus loss**: database, table, function, and table-data search inputs now keep focus and cursor position while typing
- **Table data search**: fixed parameter numbering (`$1` vs `$3`) in the count query that caused *"could not determine data type of parameter $1"*

## [1.9.4] - 2026-07-19
### Added / Improved
- **Auto-increment columns**: `serial` / `bigserial` types are now labeled “(auto increment)” in the Create Table and Table Config type dropdowns
- **Auto-increment detection**: backend now flags serial columns (`is_serial`) so the Add Row form skips them automatically and the Table Config grid shows an **AI** badge

## [1.9.3] - 2026-07-19
### Fixed
- **SQL Query Terminal status message**: execution time (`<span class="db-meta">· 7ms</span>`) is now rendered as HTML instead of being displayed as literal text for non-SELECT results

## [1.9.2] - 2026-07-19
### Fixed
- **Critical navigation loop bug**: `dbNavigate()` no longer calls `dbApplyRoute()`, preventing infinite pushState/apply loops that caused rapid-fire API requests and 429 rate-limit errors
- **Nav rail links**: Home / Manage / Query / Search shortcuts now call the view functions directly
- **Connections auto-refresh timer**: cleared when the modal closes to avoid leaking background requests

## [1.9.1] - 2026-07-19
### Added
- **Database Screen navigation rail**: persistent left sidebar with Home / Manage / Query / Search shortcuts
- **Search & filter**: filter databases by name/owner, filter tables/views/materialized views by name and schema, filter functions by name/schema/arguments
- **Database card actions**: each database in Manage view now has a ⚙ Config button alongside the → Tables button
- **View / Materialized View actions**: views can be dropped; materialized views can be refreshed or dropped directly from the tables list
- **Client-side identifier validation**: database, table, column, and rename/duplicate names are validated before hitting the API

### Changed
- **Browser history integration**: internal Database Screen transitions now use `history.pushState`, so back/forward navigation works correctly
- **Centralized view router**: new `dbNavigate()`/`dbApplyRoute()`/`dbShowView()` functions replace scattered `style.display` toggles and fix view-leak bugs
- **Config view pre-fills values**: connection limit and comment are loaded from `/databases/:db/config`
- **CSV import uses dedicated endpoints**: CREATE TABLE goes through `/databases/:db/table` and data import uses the transaction-safe `/databases/:db/table/:schema/:table/import` endpoint
- **Standardized modal system**: CSV import dialog now uses the shared `dbModal` (`fm-modal`) instead of a custom overlay

### Fixed
- `detectCSVType()` referenced an undefined `allInt` variable
- `/databases/:db/matviews` and other parameterized routes were unreachable until the server was restarted
- Modal title queries in trigger/connection monitors now target the correct `.fm-modal` class

## [1.9.0] - 2026-07-19
### Added
- **URL-based routing for Database Manager**: deep-linkable URLs for `/databases/cards`, `/databases/tables/:db`, `/databases/config/:db`, `/databases/query`, `/databases/search`, `/databases/functions/:db`, and table editor paths. `popstate` restores the view on back/forward navigation
- **Schema-aware SQL autocomplete**: query terminal suggests real table/column names from the selected database, merged with SQL keywords
- **CSV/SQL file import**: import modal now includes a file picker that reads `.csv` and `.sql` files into the content textarea
- **Copy cell value**: data cells show a clipboard icon on hover; click copies the cell value to the clipboard
- **Trigger management (global)**: database config now has a "Triggers" button that opens a modal listing all triggers across the database with definition viewer and drop action
- **Materialized view management**: database tables view shows materialized views with create, refresh, and drop actions
- **EXPLAIN ANALYZE visualizer**: query terminal "Explain" button runs `EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS, FORMAT JSON)` and renders the plan as a collapsible tree with timing/cost metrics and color-coded expensive nodes (>50% red, >20% yellow)
- **Connection/Activity monitor**: database config "Connections" button opens a live `pg_stat_activity` modal showing PID, user, state, query, and duration with a kill button per connection and optional 5-second auto-refresh
- **Multi-statement query execution**: query terminal can execute semicolon-separated statements sequentially inside a transaction, returning the last result set
- **Expanded SQL dump**: database dump now includes sequences, per-table indexes, foreign key constraints, table/column comments, views, materialized views, functions, and triggers

### Changed
- Route ordering: moved top-level database routes (`/users`, `/list`, `/query-presets`, `/bookmarks`, `/create`, `/query-run`) before parameterized `/:db` routes to prevent shadowing
- CSV import is now transaction-safe: wrapped in `BEGIN`/`COMMIT` with `ROLLBACK` on any error
- Bumped cache-busting query parameter to `v=1.9.0` for all changed assets

## [1.8.0] - 2026-07-19
### Added
- **Visual FK relation designer**: "Relations" button in table config and database config opens a modal showing all foreign key relationships across the entire database with source/target table, column, on-update, and on-delete rules (Tier 3.1)
- **Full privilege editor**: "Privileges" button in database config opens a modal showing all table-level GRANTs with grantee, privilege type, and grantable status. Toolbar allows granting or revoking privileges on any table/role combination (Tier 3.2)
- **Stored procedure / function browser**: "Functions" button in the tables view and config view shows all functions and procedures in the database with schema, name, kind, arguments, result type, and language. Each entry has a 📄 button to view full definition and ✕ to drop with confirmation (Tier 3.3)
- **SQL dump (full database)**: "Dump" button in database config opens a format chooser (Full/Schema Only/Data Only). Downloads a .sql file with CREATE TABLE, COMMENT, INSERT, and index definitions (Tier 3.4)
- **Search across all tables**: New "Search All Tables" card on the main DB screen provides a search UI that scans all text/varchar/json columns for a term across every table, showing matches with highlighted terms (Tier 3.5)
- **Bookmarkable queries**: 💾 Save and 📑 Load buttons in the query terminal toolbar. Saved bookmarks include label, SQL, and database name, stored in a `nexus_query_bookmarks` table. Click a bookmark to load it into the query editor and auto-execute (Tier 3.6)
### Changed
- bumped cache-busting query parameter to v1.8.0 for all changed assets

## [1.7.0] - 2026-07-19
### Added
- **Import CSV/SQL**: "Import" button in data toolbar opens a modal to paste CSV (with header) or SQL INSERT statements. CSV is parsed and inserted row-by-row; SQL is executed statement-by-statement
- **Foreign key display**: Config mode now shows a "Foreign Keys" table listing column → referenced table/column, on-update/on-delete rules, and constraint name
- **Index management UI**: Config mode lists all indexes with their definitions and a delete button. "Add Index" button opens a modal to create an index on any column with optional uniqueness and index method (B-tree/Hash/GiST/GIN/BRIN)
- **Query result export**: CSV, JSON, and SQL download buttons in the query results header. Exports the current result set client-side as a file download
- **Batch delete**: Checkbox column in data table (only when a primary key exists). Select all/none via header checkbox; "✕ Sel" button deletes all checked rows with type-to-confirm
- **View management**: Tables view now lists views in a separate "Views" section. "Create View" button opens a modal for defining a view with schema, name, and SELECT query. Views can be opened in the table editor (data/config)

### Changed
- `public/js/databases.js`: added `dbImportCSV()`, `dbToggleSelectAll()`, `dbUpdateSelectAll()`, `dbDeleteSelected()`, `dbExportQueryResult()`, `loadTableConfigData()`, `dbShowCreateIndex()`, `doCreateIndex()`, `dbDropIndex()`, `dbShowCreateView()`, `doCreateView()`, `dbOpenView()`, `renderViewsSection()`; updated `renderTableData()` with checkbox column and Import/BatchDelete buttons; updated `renderTableConfig()` with FK and Index sections; updated `showTablesView()` to load views; updated `renderTables()` to show views section; updated `renderQueryResults()` with export buttons
- `public/js/api.js`: added `importTable()`, `foreignKeys()`, `listIndexes()`, `createIndex()`, `dropIndex()`, `deleteRows()`, `views()`, `createView()`, `dropView()`, `exportQuery()` methods
- `public/css/style.css`: added `.db-data-th-check`, `.db-data-cell-check`, `.db-config-section`, `.db-fk-table`, `.db-views-section`, `.db-query-export-actions`, `.db-btn-xs`
- `src/routes/databases.js`: added 9 new endpoints for import, foreign keys, indexes CRUD, batch delete, views CRUD, and query export
- `src/services/databases.js`: added `importTableData()`, `getForeignKeys()`, `listIndexes()`, `createIndex()`, `dropIndex()`, `deleteRows()`, `listViews()`, `createView()`, `dropView()`, `exportQueryResult()`; updated module.exports

## [1.6.7] - 2026-07-19
### Added
- **Table metadata display**: header bar in the table editor shows owner, size, estimated rows, index/trigger counts, and table comment. Loaded in background from `GET /:db/table/:schema/:table/metadata`
- **Export table data**: "Export" dropdown button in the Data toolbar with CSV, JSON, and SQL INSERT format options. Creates a direct download link via `GET /:db/table/:schema/:table/export?format=`
- **Duplicate table**: "Duplicate" button in Config mode opens a prompt for the new table name (default `schema.table_copy`), creates a copy via `CREATE TABLE ... (LIKE ... INCLUDING ALL)`
- **Rename table**: "Rename" button in Config mode prompts for a new table name and executes `ALTER TABLE ... RENAME TO`
- **Truncate table**: "Empty" button with type-to-confirm modal, truncates all rows from the table
- **VACUUM / ANALYZE**: one-click buttons in Config mode for table maintenance
- **Table comment editor**: text input in Config mode with "Set Comment" button, persists via `COMMENT ON TABLE`
- **Column comments**: comment input field in each config editor row. Comments are loaded from metadata and saved individually via `COMMENT ON COLUMN`

### Changed
- `public/js/databases.js`: `openTableEditor()` fetches table metadata in background; `renderTableEditor()` shows metadata bar; `renderTableData()` includes export dropdown; `renderTableConfig()` now has table comment input, action toolbar (duplicate/rename/empty/vacuum/analyze), and column comment inputs in grid; added `tedChangeColComment()`, `saveTableComment()`, `dbDuplicateTable()`, `dbRenameTable()`, `dbTruncateTable()`, `dbVacuum()`, `dbAnalyze()` functions
- `public/js/api.js`: added `duplicateTable()`, `renameTable()`, `truncateTable()`, `vacuumTable()`, `analyzeTable()`, `tableMetadata()`, `setTableComment()`, `setColumnComment()`, `exportTable()` methods
- `public/css/style.css`: updated `.db-editor-header` and `.db-editor-row` grid to 6-column layout with Comment column; added `.db-table-meta`, `.db-export-group`, `.db-export-dropdown`, `.db-export-option`, `.db-editor-table-actions`, `.db-editor-toolbar`, `.db-btn-warn`
- `src/routes/databases.js`: added 9 new endpoints for duplicate/rename/truncate/vacuum/analyze/metadata/comment/export
- `src/services/databases.js`: added `duplicateTable()`, `renameTable()`, `truncateTable()`, `vacuumTable()`, `analyzeTable()`, `getTableMetadata()`, `setTableComment()`, `getColumnComments()`, `setColumnComment()`, `exportTableData()`

## [1.6.6] - 2026-07-19
### Fixed
- **CSS duplicate cleanup**: removed duplicate `.db-data-table-wrap` and `.db-data-table` definitions in the early database section (lines 2395-2444) that were silently overriding the later consolidated definitions. Merged unique properties (`max-height`, `overflow-y`, `font-family`, `position:sticky`) into the canonical `.db-data-table` section
- **Unresolved `--red` variable**: replaced `var(--red)` in `.db-form-error` with hardcoded `#ef4444` — the variable was never defined anywhere in the stylesheet
- **Missing toast variant**: added `.bk-toast-warning` CSS class (amber background) — `dbToast(msg, 'warning')` was called in `tedSave()` but had no matching style

### Added
- **Graceful DB pool shutdown**: `server.js` now closes all pg connection pools on `SIGTERM`/`SIGINT` via `require('./src/services/databases').close()`

## [1.6.5] - 2026-07-19
### Added
- **Search/filter for table data**: search bar above the data table with 300ms debounce. Filters rows server-side using `ILIKE` on a concatenated text representation of each row
- **Sortable column headers**: click any column header to toggle ascending/descending sort. Sort is applied server-side with `ORDER BY`. Active sort column gets ▲/▼ indicators
- **Pagination controls**: page navigation (first/prev/next/last buttons) with page X of Y display; configurable page size (10/25/50/100 rows) via dropdown; fetches data with `LIMIT/OFFSET`
- **Inline cell editing**: click any data cell to enter edit mode with ✔/✕ save/cancel buttons. Press Enter to save, Escape to cancel. Saves via PUT `/:db/table/:schema/:table/row/:pkCol/:pkVal`
- **Add Row modal**: "+ Row" button opens a modal with inputs for each non-auto-increment column, submits via POST `/:db/table/:schema/:table/row`
- **Delete Row**: ✕ button on each row (requires primary key) with type-to-confirm modal, deletes via DELETE `/:db/table/:schema/:table/row/:pkCol/:pkVal`
- **Row CRUD endpoints**: `POST/PUT/DELETE /:db/table/:schema/:table/row[/:pkCol/:pkVal]` with `insertRow`/`updateRow`/`deleteRow` service functions using parameterized RETURNING queries

### Changed
- `src/services/databases.js`: `getTableData()` now accepts `search`, `sortBy`, `sortDir` params; added `insertRow()`, `updateRow()`, `deleteRow()`
- `src/routes/databases.js`: data endpoint passes query/sort params to service; added row CRUD endpoints
- `public/js/api.js`: `tableData()` accepts params object; added `insertRow()`/`updateRow()`/`deleteRow()` API methods
- `public/js/databases.js`: `dbState` extended with `dataPage`, `dataPageSize`, `dataSortBy`, `dataSortDir`, `dataSearch`, `pkColumns`; `openTableEditor()` stores PK columns; `loadTableData()` passes pagination/search/sort params; `renderTableData()` completely rewritten with search bar, sortable headers, pagination, inline editing; added `dbSearchInput()`, `dbSortBy()`, `dbGoPage()`, `dbStartEdit()`, `dbSaveEdit()`, `dbCancelEdit()`, `dbDeleteRow()`, `dbAddRow()`
- `public/css/style.css`: added `.db-data-th`, `.db-data-cell`, `.db-data-toolbar`, `.db-data-search`, `.db-data-pagination`, `.db-inline-edit`, `.db-inline-save`, `.db-inline-cancel` and related styles

## [1.6.4] - 2026-07-19
### Added
- **Database confirm modal**: replaced bare `prompt()` calls in `dropDatabase()` and `dropTable()` with a proper modal confirmation that requires typing the entity name to enable the Delete button. Uses Enter key support, disabled state, and inline error display
- **Primary Key toggle in table creation**: each column row now has a PK checkbox (orange highlight) that sets `primaryKey: true` in the column definition. PK columns are automatically set to `NOT NULL`
- **Default value input in table creation**: each column row now has a text input for specifying a SQL default value (e.g. `NOW()`, `true`, `0`). The service layer (`databases.js:createTable`) applies defaults using `quoteLiteral()`

### Changed
- `public/js/databases.js`: `showCreateTable()`, `ctAddCol()`, and `doCreateTable()` updated to include PK toggle and Default field; `dropDatabase()` and `dropTable()` use `showConfirmModal()` instead of `prompt()`
- `public/css/style.css`: added `.ct-col-pk`, `.ct-col-pk input`, `.ct-col-default`, and `.fm-btn-danger:disabled` styles

## [1.6.3] - 2026-07-19
### Changed
- **Database screen refactored (Phase 1)**: replaced all `psql` shell calls and `parseCSV()` in `src/routes/databases.js` with the new `pg`-based service layer (`src/services/databases.js`). All database operations now use parameterized queries, pool-per-database connection caching, and proper identifier validation. Shell-based `psql()`/`parseCSV()` utilities removed entirely

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
