# NexusPanel

A self-hosted, all-in-one VPS control center that orchestrates every layer of server management — files, databases, mail, Docker, domains, security, and backups — into a single responsive web console, decoupling routine server operations from the command line.

<!-- TODO: [Action Required] No CI/CD pipeline exists. Add GitHub Actions workflows for build, lint, and test, then replace the placeholder badges below with live URLs. -->
<!-- Recommended badges: -->
<!-- [![Build Status](https://img.shields.io/github/actions/workflow/status/xuspanel/NexusPanel/ci.yml?branch=main&style=flat-square)](https://github.com/xuspanel/NexusPanel/actions) -->
<!-- [![Coverage](https://img.shields.io/codecov/c/github/xuspanel/NexusPanel?style=flat-square)](https://codecov.io/gh/xuspanel/NexusPanel) -->

![License: BSL 1.1](https://img.shields.io/badge/license-BSL%201.1-blue?style=flat-square)
![Node.js >=18](https://img.shields.io/badge/node.js-%3E%3D18-green?style=flat-square)
![PostgreSQL](https://img.shields.io/badge/database-PostgreSQL-blue?style=flat-square)
![Platforms](https://img.shields.io/badge/platforms-Linux%20%7C%20macOS%20%7C%20Windows-orange?style=flat-square)
![Version](https://img.shields.io/badge/version-1.9.6-informational?style=flat-square)

---

## Table of Contents

- [The Problem NexusPanel Solves](#the-problem-nexuspanel-solves)
- [Core Features](#core-features)
- [Quick Start](#quick-start)
- [Detailed Usage](#detailed-usage)
- [Configuration](#configuration)
- [Licensing](#licensing)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Development & Contribution](#development--contribution)
- [Testing](#testing)
- [Production Operations](#production-operations)
- [License](#license)
- [Acknowledgments](#acknowledgments)
- [Appendix: Script Reference](#appendix-script-reference)

---

## The Problem NexusPanel Solves

Managing a VPS traditionally means choosing between two unsatisfying paths:

1. **Commercial control panels** (cPanel, Plesk, DirectAdmin) impose per-tenant licensing fees, opaque abstractions, and heavy resource overhead. They are built for hosting resellers, not operators who own their infrastructure.
2. **Raw SSH and shell scripts** are free and flexible but error-prone, undocumented, and inaccessible to team members who are not terminal-fluent. Every routine task — adding a database user, renewing an SSL certificate, restoring a backup — becomes a multi-step manual procedure with no audit trail.

NexusPanel fills the gap between these extremes. It delivers a single-tenant, self-hosted web console that streamlines the full operational surface of a Linux or Windows server without licensing lock-in. Every action flows through a typed API layer with automatic audit logging, so nothing happens silently. The panel runs as a systemd service on `127.0.0.1:3443` behind your own reverse proxy, meaning you retain full control of TLS termination, access policies, and network exposure.

---

## Core Features

| Category | Module | Highlights |
|----------|--------|------------|
| **System** | Dashboard | Real-time CPU / RAM / Disk / Network metrics, server location, live clock, quick-access grid |
| **System** | Process Manager | Live process list (5s refresh), PID/user/CPU%/MEM%, color-coded thresholds, kill processes |
| **System** | Service Manager | systemd unit control — start, stop, restart, detailed status output, name filtering |
| **System** | Log Viewer | Browse `/var/log`, split-pane tail (last 500 lines), full-text search, monospace viewer |
| **System** | System Updates | Check and apply dnf/apt package updates with progress feedback |
| **Files** | File Manager | Browse, upload, download, create, rename, delete, move, copy; Ace-powered editor; archive create/extract (.zip, .tar, .tar.gz); visual rwx permissions editor; batch operations; recursive search; drag-and-drop; context menu |
| **Files** | Terminal | Interactive web terminal via xterm.js + WebSocket + node-pty; tab completion, ANSI colors; preset command launcher; auto-reconnect |
| **Databases** | PostgreSQL Manager | List databases, schemas, tables, views, materialized views, functions, triggers; inline SQL editor with EXPLAIN ANALYZE; table data editor with search/sort/pagination; column reordering; CSV import/export; SQL dump; FK relations; privilege editor; connections monitor |
| **Mail** | Email Manager | Create/delete accounts with quotas; webmail inbox with folder navigation; compose/send/reply/forward; multi-domain auto-discovery from Postfix |
| **Containers** | Docker | Container and image management; Compose-project grouping; start/stop/restart/remove; logs; pull/tag/remove images; daemon info |
| **Web** | Domains | Nginx virtual host manager — create/delete server blocks, live config editor, subdomain parent support |
| **Web** | SSL Certificates | Let's Encrypt via certbot — list certs with expiry badges, issue new, force-renew |
| **Web** | PHP-FPM | Pool management — list pools, view settings, restart service |
| **Security** | Firewall | iptables rule manager — view all chains, add rules by syntax, delete by chain and line number |
| **Security** | Virus Scanner | ClamAV-powered scanning of home/mail/FTP/web/custom paths; real-time progress; quarantine (move/restore/delete); freshclam updates |
| **Security** | Profile & Auth | Admin user management; 2FA via TOTP (speakeasy + QR); JWT sessions; password change; role-based access |
| **Automation** | Backups | Single-file, directory, and full-system targets; PostgreSQL dump integration; real-time progress with ETA; survives browser close; retention policies; scheduled backups |
| **Automation** | Cron Jobs | Crontab editor per system user — add, edit, delete entries; five-field expression editor |
| **Operations** | Audit Trail | Auto-logs all POST/PUT/DELETE with user, method, path, IP; filter and search; paginated; clear option |
| **Operations** | Notifications | In-app bell with unread badge; mark individual/all as read; programmatic API |
| **Operations** | MIME Types | Browse 2,148 system types by category; distribution chart; search; CRUD for user-defined types |
| **UI** | Theme | Dark/light toggle; 32 CSS variable overrides; zero flash-of-wrong-theme; persists to localStorage |

---

## Quick Start

### Prerequisites

- **Node.js** 18 or later
- **npm**
- **PostgreSQL** (required for the Database Manager module)
- **Root access** (for system-level operations: systemd, iptables, certbot, package manager)

### One-Command Install

The universal installer auto-detects your OS, installs dependencies, configures a systemd service, and starts the panel:

```bash
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install.sh)
```

Once complete, NexusPanel listens on `http://127.0.0.1:3443`. Configure a reverse proxy (nginx) for external access — see [Detailed Usage](#detailed-usage).

> **Note:** A license key from [https://nxp.xus.me](https://nxp.xus.me) is required for production use. Pass `--license=NX-XXXX` during installation or set `LICENSE_KEY` in your `.env` after install.

### Per-OS Direct Installers

```bash
# Ubuntu / Debian
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-ubuntu.sh)

# AlmaLinux / RHEL
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-almalinux.sh)

# CentOS Stream, Rocky Linux, Fedora (thin wrappers that delegate to install-almalinux.sh)
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-centos.sh)
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-rocky.sh)
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-fedora.sh)

# macOS (Homebrew + LaunchDaemon)
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-macos.sh)

# Windows (PowerShell 7+)
pwsh -c "iwr -useb https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-windows.ps1 | iex"

# Docker (any OS with Docker installed)
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-docker.sh)
```

### Manual Install

```bash
git clone -b main --single-branch https://github.com/xuspanel/NexusPanel.git
cd NexusPanel
npm install
cp .env.example .env
# Edit .env — set JWT_SECRET and ADMIN_PASS at minimum
nano .env
npm start
```

---

## Detailed Usage

### Scenario 1: First Login and 2FA Setup

After installation, the panel runs on `127.0.0.1:3443`. If you installed with a domain and nginx, navigate to `https://panel.yourdomain.com`.

1. Log in with the `ADMIN_USER` / `ADMIN_PASS` from your `.env`.
2. Navigate to **Profile** and enable **Two-Factor Authentication** — scan the QR code with an authenticator app (Google Authenticator, Authy, 1Password).
3. Subsequent logins require the TOTP code after the password step.
4. Explore the dashboard for real-time metrics, then use the sidebar to access File Manager, Databases, Docker, and other modules.

### Scenario 2: Unattended Install with Domain and SSL

For production deployments, pass CLI flags to skip interactive prompts. The installer provisions nginx, requests a Let's Encrypt certificate, and restarts the service:

```bash
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install.sh) \
  --license=NX-XXXX \
  --domain=panel.example.com \
  --port=3443 \
  --admin-user=admin \
  --admin-pass=YourStrongPass \
  --postgres \
  --unattended
```

Available flags: `--license`, `--domain`, `--port`, `--admin-user`, `--admin-pass`, `--docker`, `--postgres`, `--unattended`, `--dry-run`.

### Manual Reverse Proxy (nginx + SSL)

If you did not use `--domain` during install, configure nginx manually:

```nginx
server {
    listen 443 ssl;
    server_name panel.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/panel.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/panel.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3443;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }
}
```

The WebSocket terminal requires the `Upgrade` and `Connection` headers shown above. The `proxy_read_timeout` of 3600s prevents idle disconnects during long terminal sessions.

---

## Configuration

NexusPanel reads all configuration from a single `.env` file at the project root (loaded via `dotenv`). Copy `.env.example` as your starting point:

```bash
cp .env.example .env
nano .env
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | Session encryption key. Generate with `openssl rand -hex 32`. | *Required* |
| `ADMIN_USER` | Admin username for initial login. | `admin` |
| `ADMIN_PASS` | Admin password. Bcrypt-hashed on first run. | *Required* |
| `PORT` | Web server listen port. | `3443` |
| `NODE_ENV` | Node environment mode. | `production` |
| `SERVER_LOCATION` | Display string shown on the dashboard (e.g., "Amsterdam, NL"). | `Unknown` |
| `SSH_USER` | Default SSH user for the web terminal's pty session. | `root` |
| `LICENSE_KEY` | License key (purchased at https://nxp.xus.me). | *Required for production* |
| `LICENSE_DOMAIN` | Domain bound to the license. | *Required for production* |
| `LICENSE_SERVER_URL` | License validation endpoint. | `https://nxl.xus.me/api` |
| `LICENSE_SECRET` | HMAC shared secret between the panel and the license server. | *Required for production* |
| `DB_HOST` | PostgreSQL host for the Database Manager. | `127.0.0.1` |
| `DB_PORT` | PostgreSQL port. | `5432` |
| `DB_USER` | PostgreSQL user for database operations. | `postgres` |
| `DB_PASSWORD` | PostgreSQL password. | *Required for DB module* |
| `PGADMIN_EMAIL` | pgAdmin login email (if pgAdmin is deployed alongside). | *optional* |
| `PGADMIN_PASSWORD` | pgAdmin login password. | *optional* |

> **Note:** The panel binds to `127.0.0.1` only. External access requires a reverse proxy (nginx, Caddy, Traefik) or an SSH tunnel.

<!-- TODO: [Action Required] `config.example.json` exists in the repo root but is NOT loaded anywhere in the codebase. The application uses `.env` exclusively. Additionally, `config.example.json` references SQLite as the database type, but the actual Database Manager module is PostgreSQL-only via the `pg` library. Either implement `config.json` support or remove the file to avoid confusion. -->

---

## Licensing

NexusPanel is **paid / source-available software**. The source code is publicly visible on GitHub, but a valid license key is required to run the application in production.

### How It Works

1. **Purchase a license** at [https://nxp.xus.me](https://nxp.xus.me). You will receive a `LICENSE_KEY` bound to your domain.
2. **Configure** `LICENSE_KEY`, `LICENSE_DOMAIN`, and `LICENSE_SECRET` in your `.env` — see [Configuration](#configuration).
3. **Validation** occurs at startup and every 60 minutes thereafter. The panel sends an HMAC-SHA256-signed request to the license server; if validation fails, the panel enters a grace period before shutting down API routes.

### Validation Flow

```
Panel (startup / 60-min timer)
  │
  ├── Builds payload: { domain, timestamp }
  ├── Signs with LICENSE_SECRET (HMAC-SHA256)
  └── POST /api/validate → nxLicensing server (port 3444)
       │
       ├── Verifies HMAC signature
       ├── Looks up LICENSE_KEY in database
       ├── Checks domain match and expiry
       └── Returns signed response
            │
            ├── Valid → Panel continues normally
            └── Invalid → Grace period begins, then API locked
```

### License Server

The `nxLicensing` platform is a standalone Express server (port 3444) bundled with NexusPanel. It manages license keys, validates HMAC-SHA256 signatures, and includes an optional admin dashboard for key management.

### License Model

- **License**: BSL 1.1 (Business Source License)
- **Change date**: 5 years from release — after which the license automatically converts to **Apache 2.0**
- **Purchase**: [https://nxp.xus.me](https://nxp.xus.me)

---

## Architecture

### High-Level Data Flow

```
                        Browser (SPA)
                             |
                        HTTPS (via nginx reverse proxy)
                             |
                    +------------------+
                    |   Express 5      |  127.0.0.1:3443
                    |   server.js      |
                    +------------------+
                    /        |         \
              /api/*    /ws/terminal    /* (SPA static)
                |            |              |
         29 route      WebSocket        public/
         modules       + node-pty       index.html
                |            |          + js/ (28 modules)
         28 service              |
         modules                 bash shell
                |
    ┌───────────┼───────────────┬─────────────┐
    v           v               v             v
systemctl   docker CLI      PostgreSQL     iptables
pkg mgr     (socket)        (pg / Pool)    certbot
clamscan    images/containers              crontab
```

### Key Design Principles

- **Single-process**: One Node.js process serves the API, static SPA, and WebSocket terminal. No external workers or message queues.
- **Localhost-only bind**: The Express server listens on `127.0.0.1:3443`. A reverse proxy handles TLS and access control.
- **Pool-per-database**: The PostgreSQL service maintains a connection pool cache keyed by database name, enabling efficient cross-database queries.
- **Audit middleware**: A global Express middleware intercepts all `POST`, `PUT`, and `DELETE` requests and logs them with user, method, path, and IP — before the response is sent.
- **Rate limiting**: `express-rate-limit` applies 120 requests/minute per IP across all `/api/*` routes. The login endpoint has a separate, stricter limiter.
- **Security headers**: `helmet` enforces CSP, HSTS, X-Frame-Options, and other headers. CSP permits `cdn.jsdelivr.net` and `cdnjs.cloudflare.com` for frontend libraries.

### Project Structure

```
NexusPanel/
├── server.js                     # Express + WebSocket entry point
├── package.json
├── .env.example                  # Environment variable template
├── VERSION                       # Current release version (1.9.6)
├── CHANGELOG.md
├── nexuspanel.service            # systemd unit file
├── install.sh                    # Universal installer (OS auto-detect)
├── install-common.sh             # Shared installer library (pkg_*, fw_*, service_*)
├── install-ubuntu.sh             # Debian-family installer
├── install-almalinux.sh          # RHEL-family installer
├── install-centos.sh             # Thin wrapper -> install-almalinux.sh
├── install-rocky.sh              # Thin wrapper -> install-almalinux.sh
├── install-fedora.sh             # Thin wrapper -> install-almalinux.sh
├── install-debian.sh             # Thin wrapper -> install-ubuntu.sh
├── install-macos.sh              # macOS (Homebrew + LaunchDaemon)
├── install-windows.ps1           # Windows (Chocolatey + NSSM)
├── install-docker.sh             # OS-agnostic Docker installer
├── upgrade.sh                    # Config-preserving upgrade utility
├── update.sh                     # Standalone updater (alternative to upgrade.sh)
├── uninstall.sh                  # Comprehensive uninstaller
├── troubleshoot.sh               # Diagnostic wizard
├── errors.sh                     # Common error checklist
├── health.sh                     # Cron-friendly health monitor
├── logs.sh                       # Log aggregation viewer
├── config.example.json           # <!-- TODO: unused — see Configuration note -->
├── public/                       # Static frontend (SPA)
│   ├── index.html
│   ├── css/style.css
│   ├── js/                       # 28 frontend controller modules
│   └── libs/                     # Vendored frontend libraries
└── src/
    ├── middleware/
    │   ├── auth.js               # JWT verification middleware
    │   └── security.js           # Helmet, CSP, rate limiters
    ├── routes/                   # 29 API route modules
    └── services/                 # 28 business-logic service modules
```

---

## API Reference

All endpoints are prefixed with `/api/`. Authentication is via JWT session cookie. Admin-only endpoints return `403` for non-admin users. All mutating requests (`POST`, `PUT`, `DELETE`) are auto-logged to the audit trail.

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | No | Login — returns JWT or 2FA challenge |
| `POST` | `/api/auth/login/2fa` | No | Complete 2FA login with TOTP token |
| `POST` | `/api/auth/logout` | Yes | Clear session |
| `GET` | `/api/auth/me` | Yes | Current user info |

### Module Endpoints (Grouped)

| Module | Path Prefix | Key Operations | Auth |
|--------|-------------|----------------|------|
| Dashboard / System | `/api/system` | CPU/RAM/Disk/Network stats, reboot | Yes |
| Metrics | `/api/metrics` | Current snapshot, historical (24h/7d) | Yes |
| Files | `/api/files` | List, read, create, rename, delete, copy, move, archive, extract, upload, search, permissions | Yes |
| Databases | `/api/databases` | List DBs, tables, schemas, extensions, table info, data CRUD, SQL query, triggers, indexes, FKs, functions, views, matviews, export/import, dump, search-all, connections, bookmarks, column ordering | Admin |
| Emails | `/api/emails` | List accounts, domains, inbox, folders, read/send/move/delete messages | Admin |
| Docker | `/api/docker` | List/start/stop/restart/remove containers and images, daemon info | Admin |
| Terminal | `/api/terminal` | WebSocket at `/ws/terminal` — create panes, send input, resize, kill | Yes |
| FTP | `/api/ftp` | Create/enable/disable/delete accounts, set home dirs, view logs | Admin |
| Domains | `/api/domains` | Create/delete nginx server blocks, live config editor | Admin |
| Backups | `/api/backups` | Define targets, start/stop, status, list, download, delete | Admin |
| Virus Scanner | `/api/virusscanner` | Start scan, progress, results, update definitions | Admin |
| MIME Types | `/api/mimetypes` | Browse system types, CRUD user-defined types | Yes |
| Services | `/api/services` | List/start/stop/restart systemd units | Admin |
| Processes | `/api/processes` | Live process list, kill by PID | Admin |
| Logs | `/api/logs` | List `/var/log`, tail, search | Admin |
| Cron | `/api/cron` | List/add/edit/delete crontab entries per user | Admin |
| Firewall | `/api/firewall` | List chains/rules, add, delete | Admin |
| SSL | `/api/ssl` | List certificates, issue via certbot, force-renew | Admin |
| PHP-FPM | `/api/phpfpm` | List pools, view config, restart service | Admin |
| Updates | `/api/updates` | Check for available packages, apply all | Admin |
| Notifications | `/api/notifications` | List, mark read, create | Yes |
| Settings | `/api/settings` | Panel settings load/save | Admin |
| Search | `/api/search` | Global cross-module search | Yes |
| Tokens | `/api/tokens` | API token CRUD | Admin |
| Users | `/api/users` | User management | Admin |
| Audit | `/api/audit` | Query audit log, clear | Admin |
| Profile | `/api/profile` | Password change, 2FA setup | Yes |
| Alerts | `/api/alerts` | Alert configuration | Admin |

> **WebSocket Terminal**: Connect to `/ws/terminal` with the JWT cookie. Message types: `create`, `create-pane`, `close-pane`, `input`, `resize`, `kill`. Data is base64-encoded.

<!-- TODO: [Action Required] The `/health` endpoint is referenced by installers, `health.sh`, `upgrade.sh`, and Docker health checks, but no route handler defines it in `server.js`. Requests to `/health` fall through to the SPA catch-all (`app.get('/{*path}', ...)`) and return `index.html` with HTTP 200. This means health checks only verify that the process is listening, not that it is healthy. Implement a dedicated `GET /health` route that returns a JSON status object and checks dependencies (e.g., DB connectivity). -->

---

## Development & Contribution

### Development Setup

```bash
git clone https://github.com/xuspanel/NexusPanel.git
cd NexusPanel
npm install
cp .env.example .env
# Set JWT_SECRET, ADMIN_USER, ADMIN_PASS, and DB_* variables
nano .env
npm start
```

The server starts on `http://127.0.0.1:3443`. Frontend assets are served from `public/` with no build step — edits to `public/js/*.js` and `public/css/style.css` take effect on browser refresh. Cache-busting is handled via `?v=<VERSION>` query parameters on asset URLs in `index.html`.

### Code Style

The codebase uses vanilla JavaScript (no TypeScript, no transpilation) for the frontend and CommonJS modules for the backend. There is no linter configuration currently.

<!-- TODO: [Action Required] No ESLint configuration exists. Add an `.eslintrc.json` and an `npm run lint` script to enforce consistent style. Recommended starter: `npx eslint --init` with Airbnb base or StandardJS preset. -->

### Commit Conventions

- Commits to the `main` branch must be **GPG-signed** (enforced by repository ruleset).
- Use conventional, descriptive commit messages (e.g., `v1.9.6: Fix table data search and add column reordering`).
- Do not commit `.env`, `node_modules/`, `data/`, or any files matching the patterns in `.gitignore`.
- The proprietary directories `TheNexusPanel/`, `nxLicensing/`, `development/`, and `sandbox/` must never appear in the public repo.

### Contribution Workflow

1. Fork the repository and create a feature branch from `main`.
2. Make your changes following the existing module structure (route in `src/routes/`, logic in `src/services/`, frontend in `public/js/`).
3. Test your changes manually — see [Testing](#testing).
4. Ensure your commit is GPG-signed.
5. Open a pull request against `main` with a clear description of the change and motivation.

---

## Testing

### Current State

NexusPanel does not have an automated test suite. The `npm test` script is a placeholder that exits with an error:

```json
"test": "echo \"Error: no test specified\" && exit 1"
```

<!-- TODO: [Action Required] No test framework is configured. Set up Jest with supertest for API integration tests and jsdom for frontend unit tests. Suggested commands once configured: -->
<!-- `npm test` — Run the full test suite -->
<!-- `npm run test:watch` — Watch mode -->
<!-- `npm run test:coverage` -- Coverage report -->

### Manual Smoke Test Checklist

Until automated tests are added, verify changes manually:

- [ ] **Auth**: Login with admin credentials; complete 2FA flow; logout; verify session cookie cleared.
- [ ] **Dashboard**: CPU/RAM/Disk/Network metrics render and update.
- [ ] **File Manager**: Browse directories, upload a file, create a folder, edit a file in Ace, download, archive/extract.
- [ ] **Terminal**: Open a terminal pane, type commands, resize, close.
- [ ] **Databases**: List databases, open a table, search data, add a row, edit a cell, run a SQL query, add a serial column, reorder columns.
- [ ] **Docker**: List containers, start/stop one, view logs.
- [ ] **Backups**: Start a backup, monitor progress, download the archive.
- [ ] **SSL**: List certificates, issue a new one via certbot.
- [ ] **Audit Trail**: Verify recent actions appear in the audit log.

---

## Production Operations

### Upgrading

Two upgrade paths exist:

**`upgrade.sh`** — the recommended, config-preserving upgrade utility. It stashes local changes, pulls the latest `main`, reinstalls production dependencies, and restarts the systemd service:

```bash
sudo bash upgrade.sh
```

**`update.sh`** — a standalone updater that performs a similar pull-and-restart cycle. Use this if you need a lighter-weight update without the full upgrade utility's pre/post hooks:

```bash
sudo bash update.sh
```

**Manual upgrade** (for development or custom deployments):

```bash
cd /opt/nexuspanel
git stash
git pull origin main
npm install --production
systemctl restart nexuspanel
```

### Uninstalling

```bash
sudo bash uninstall.sh
```

You will be prompted to confirm. To preserve your configuration for a future reinstall:

```bash
cp /opt/nexuspanel/.env ~/nexuspanel.env.backup
sudo bash uninstall.sh
```

### Troubleshooting

Run the diagnostic wizard:

```bash
sudo bash troubleshoot.sh
```

Check the error checklist for known issues:

```bash
sudo bash errors.sh
```

Check service status and logs:

```bash
systemctl status nexuspanel
journalctl -u nexuspanel -f
sudo bash logs.sh
```

### Health Monitoring

A cron-friendly health monitor is included. Add it to crontab for automated checks every 5 minutes:

```bash
*/5 * * * * /opt/nexuspanel/health.sh
```

The script checks service status, port listening, memory/disk thresholds, license server reachability, nginx, and Node.js memory usage. It auto-restarts the service on critical failures and logs to `/var/log/nexuspanel-health.log`.

<!-- TODO: [Action Required] As noted in the API Reference, `/health` is not a real endpoint. The `health.sh` script does not call `/health` (it uses `systemctl` and `ss`), but the Docker health check and installers do. Implement a proper health endpoint. -->

---

## License

**Business Source License 1.1 (BSL 1.1)**

Licensor: NexusPanel
Licensed Work: NexusPanel — VPS Control Center
Additional Use Grant: You may use the Licensed Work in production, provided that you have purchased a valid license key from the Licensor at https://nxp.xus.me.

Change Date: 2026-07-20 (5 years from the date of first publication)

Change License: Apache License, Version 2.0

The text of the BSL 1.1 license is available at https://mariadb.com/bsl11/.

<!-- TODO: [Action Required] No `LICENSE` file exists in the repository root. Create one with the full BSL 1.1 license text. Additionally, `package.json` declares `"license": "ISC"` — update it to `"license": "BSL-1.1"` for consistency. -->

<!-- TODO: [Action Required] `package.json` declares `"version": "1.1.0"` but the `VERSION` file and `CHANGELOG.md` are at `1.9.6`. Sync `package.json` to the current release version. -->

---

## Acknowledgments

NexusPanel is built on the shoulders of outstanding open-source projects:

- **[Express 5](https://expressjs.com/)** — HTTP API framework
- **[node-pty](https://github.com/microsoft/node-pty)** — pseudo-terminal bindings powering the web terminal
- **[xterm.js](https://xtermjs.org/)** — terminal frontend renderer
- **[Ace Editor](https://ace.c9.io/)** — in-browser code editor for the File Manager
- **[node-postgres (pg)](https://node-postgres.com/)** — PostgreSQL client with connection pooling
- **[speakeasy](https://github.com/speakeasyjs/speakeasy)** — TOTP-based two-factor authentication
- **[Helmet](https://helmetjs.github.io/)** — HTTP security headers
- **[express-rate-limit](https://express-rate-limit.mintlify.app/)** — API rate limiting
- **[ws](https://github.com/websockets/ws)** — WebSocket implementation
- **[bcryptjs](https://github.com/dcodeIO/bcryptjs)** — password hashing
- **[jsonwebtoken](https://github.com/auth0/node-jsonwebtoken)** — JWT session tokens
- **[mailparser](https://nodemailer.com/extras/mailparser/)** — email message parsing for webmail
- **[adm-zip](https://github.com/cthackers/adm-zip)** — ZIP archive operations
- **[archiver](https://www.archiverjs.com/)** — streaming archive creation for backups
- **[Chart.js](https://www.chartjs.org/)** — dashboard metric charts
- **[nxLicensing](https://nxp.xus.me)** — proprietary license validation platform (HMAC-SHA256)
- **[ClamAV](https://www.clamav.net/)** — open-source antivirus engine
- **[Certbot](https://certbot.eff.org/)** — Let's Encrypt certificate automation
- **[pgAdmin](https://www.pgadmin.org/)** — optional external PostgreSQL management tool (linked at `/pgadmin`)

---

## Appendix: Script Reference

| Script | Purpose | Root Required |
|--------|---------|:-------------:|
| `install.sh` | Universal installer — auto-detects OS, delegates to OS-specific installer, accepts CLI flags | Yes |
| `install-common.sh` | Shared library sourced by all installers — provides `pkg_*`, `fw_*`, `service_manage`, `detect_os`, `detect_mac`, `.env` generation | (sourced) |
| `install-ubuntu.sh` | Debian-family installer (apt-get + ufw + AppArmor) | Yes |
| `install-debian.sh` | Thin wrapper — sources `install-ubuntu.sh` | Yes |
| `install-almalinux.sh` | RHEL-family installer (dnf + firewalld + SELinux) | Yes |
| `install-centos.sh` | Thin wrapper — sources `install-almalinux.sh` | Yes |
| `install-rocky.sh` | Thin wrapper — sources `install-almalinux.sh` | Yes |
| `install-fedora.sh` | Thin wrapper — sources `install-almalinux.sh` | Yes |
| `install-macos.sh` | macOS installer (Homebrew + LaunchDaemon) | Yes |
| `install-windows.ps1` | Windows installer (Chocolatey + NSSM) | Yes |
| `install-docker.sh` | OS-agnostic Docker container installer | Yes |
| `upgrade.sh` | Config-preserving upgrade — stashes, pulls, reinstalls, restarts service | Yes |
| `update.sh` | Standalone updater — lighter-weight pull-and-restart cycle | Yes |
| `uninstall.sh` | Comprehensive uninstaller — removes service, files, and firewall rules | Yes |
| `troubleshoot.sh` | Diagnostic wizard — checks service, ports, config, and offers auto-repair | Yes |
| `errors.sh` | Common error checklist — diagnoses known issues with solutions | Yes |
| `health.sh` | Cron-friendly health monitor — checks service, memory, disk, nginx, license server | Optional |
| `logs.sh` | Log aggregation viewer — tails and searches across all NexusPanel logs | Optional |
| `nexuspanel.service` | systemd unit file — runs `node server.js` with auto-restart | (deployed by installer) |

### Installer Architecture

The installer suite uses a layered design:

```
install.sh  (universal entry point)
  ├── Auto-detects OS via /etc/os-release or package-manager fallback
  ├── Delegates to OS-specific installer (install-ubuntu.sh, install-almalinux.sh, etc.)
  └── Passes CLI flags in --key=value format

install-common.sh  (shared library — sourced by all installers)
  ├── OS detection:        detect_os()  ->  OS_FAMILY, OS_ID, OS_VERSION
  ├── Package management:  pkg_update, pkg_install, pkg_remove, pkg_add_repo
  ├── Init system:         detect_init, service_manage
  ├── Firewall:            detect_firewall, fw_allow, fw_remove
  ├── MAC (SELinux/AA):    detect_mac
  └── Utilities:           run_cmd, run_with_retry, checkpoint, .env generation

OS-specific installer    (e.g. install-ubuntu.sh, install-almalinux.sh)
  └── Validates OS family, calls shared pkg_* / fw_* / service_manage functions

Thin wrappers             (install-centos.sh, install-fedora.sh, install-rocky.sh)
  └── ~25 lines each — check OS, source install-almalinux.sh
```

#### OS Family Mapping

| `/etc/os-release` ID | `OS_FAMILY` | Delegated Installer |
|---|---|---|
| `ubuntu`, `debian` | `debian` | `install-ubuntu.sh` |
| `almalinux`, `rocky`, `centos`, `rhel` | `rhel` | `install-almalinux.sh` |
| `fedora` | `fedora` | `install-almalinux.sh` |
| Any macOS | `macos` | `install-macos.sh` |
| Any Windows | `windows` | `install-windows.ps1` |

#### Package Manager Fallback

When `/etc/os-release` is missing or the distro ID is unrecognized, `detect_os()` falls back to detecting the package manager:

| Detected Command | `OS_FAMILY` | `OS_ID` |
|---|---|---|
| `apt-get` | `debian` | `ubuntu` |
| `dnf` | `rhel` | `almalinux` |
| `yum` | `rhel` | `centos` |
| `apk` | `alpine` | `alpine` |
| `pacman` | `arch` | `arch` |
| `zypper` | `suse` | `suse` |

#### Abstraction Functions

All OS-specific scripts use shared functions instead of calling package managers or firewalls directly:

| Function | Purpose | debian | rhel/fedora | alpine | arch |
|---|---|---|---|---|---|
| `pkg_update` | Refresh package lists | `apt-get update` | `dnf check-update` | `apk update` | `pacman -Sy` |
| `pkg_install` | Install packages | `apt-get install -y` | `dnf install -y` | `apk add` | `pacman -S` |
| `pkg_remove` | Remove packages | `apt-get remove -y` | `dnf remove -y` | `apk del` | `pacman -R` |
| `service_manage` | Start/stop/enable | `systemctl` / `service` | `systemctl` | `rc-service` | `systemctl` |
| `fw_allow` | Open firewall port | `ufw allow` | `firewall-cmd` | — | — |
| `fw_remove` | Close firewall port | `ufw delete allow` | `firewall-cmd --remove` | — | — |
| `detect_mac` | Detect SELinux/AppArmor | AppArmor | SELinux | — | — |
