# Changelog

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
