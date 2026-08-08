<p align="center">
  <strong>⚡ NexusPanel — VPS Control Center</strong><br>
  <em>The self-hosted command center that replaces your entire server management toolkit</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.35.6-blue?style=for-the-badge&labelColor=1a1a2e&color=0f3460" alt="Version">
  <img src="https://img.shields.io/badge/node.js-%3E%3D18-brightgreen?style=for-the-badge&labelColor=1a1a2e" alt="Node.js">
  <img src="https://img.shields.io/badge/license-BSL%201.1-purple?style=for-the-badge&labelColor=1a1a2e" alt="License">
  <img src="https://img.shields.io/badge/183_tests-passing-green?style=for-the-badge&labelColor=1a1a2e" alt="Tests">
  <img src="https://img.shields.io/badge/29_routes-blue?style=for-the-badge&labelColor=1a1a2e" alt="Routes">
  <img src="https://img.shields.io/badge/28_services-orange?style=for-the-badge&labelColor=1a1a2e" alt="Services">
  <img src="https://img.shields.io/badge/platforms-Linux%20%7C%20macOS%20%7C%20Windows-teal?style=for-the-badge&labelColor=1a1a2e" alt="Platforms">
</p>

---

NexusPanel is a **single-tenant, self-hosted VPS control center** that orchestrates every layer of server management — files, databases, mail, Docker, domains, security, backups, and more — into a single responsive web console. No licensing lock-in. No opaque abstractions. Just a clean API layer with automatic audit logging, running as a systemd service behind your own reverse proxy.

**You own the infrastructure. NexusPanel makes managing it effortless.**

---

## At a Glance

```
    ┌──────────────────────────────────────────────────────────────────┐
    │                         NexusPanel                              │
    │                                                                 │
    │   Dashboard  ─  File Manager  ─  Databases  ─  Docker          │
    │   Terminal   ─  Domains       ─  SSL Certs   ─  Backups        │
    │   Apps       ─  Git Deploy    ─  Firewall    ─  PHP-FPM        │
    │   Cron Jobs  ─  Audit Trail   ─  Mail        ─  FTP Accounts   │
    │   Virus Scan ─  MIME Types    ─  Updates     ─  Settings       │
    │   Profile    ─  Notifications                                   │
    │                                                                 │
    │   32 route modules · 31 services · 183 tests · 41 test files   │
    └──────────────────────────────────────────────────────────────────┘
```

---

## Core Features

### System & Monitoring

| Module | What It Does |
|--------|-------------|
| **Dashboard** | Real-time CPU, RAM, disk, and network metrics via live charts. Service health grid. Quick-access reboot panel. Connection status indicator. |
| **Process Manager** | Live process list (5s refresh). PID, user, CPU%, MEM%. Color-coded thresholds. Kill processes by PID. |
| **Service Manager** | Full systemd unit control — start, stop, restart, enable, disable. Detailed status output. Name filtering. |
| **Log Viewer** | Browse `/var/log`, split-pane tail (last 500 lines), full-text search, monospace viewer. |
| **System Updates** | Check and apply dnf/apt package updates with live progress streaming. Security-only filter. |

### Files & Access

| Module | What It Does |
|--------|-------------|
| **File Manager** | Browse, upload, download, create, rename, delete, move, copy. Ace-powered code editor. Archive create/extract (zip, tar, tar.gz). Visual rwx permissions editor. Batch operations. Recursive search. Drag-and-drop. Context menu. **Bin/Trash** with restore and permanent delete. **Conflict detection** for copy/move with overwrite/skip/rename strategies. |
| **Terminal** | Interactive web terminal via xterm.js + WebSocket + node-pty. Tab completion, ANSI colors, preset command launcher, auto-reconnect. |
| **FTP Accounts** | vsftpd account management. Create, enable, disable, delete accounts. Set home directories. View logs. |

### Databases & Mail

| Module | What It Does |
|--------|-------------|
| **PostgreSQL Manager** | List databases, schemas, tables, views, materialized views, functions, triggers. Inline SQL editor with EXPLAIN ANALYZE. Table data editor with search/sort/pagination. Column reordering. CSV import/export. SQL dump. FK relations. Privilege editor. Connections monitor. |
| **Email Manager** | Create/delete accounts with quotas. Webmail inbox with folder navigation. Compose, send, reply, forward. Multi-domain auto-discovery from Postfix. |

### Containers & Web

| Module | What It Does |
|--------|-------------|
| **Docker** | Container and image management. Compose-project grouping. Start/stop/restart/remove. Container logs. Pull/tag/remove images. Daemon info. |
| **Apps (One-Click Installer)** | Install WordPress, Laravel, Node.js, Next.js, or Static HTML with one click. Auto-provisions PHP-FPM pools, PM2 processes, and MariaDB. Encrypted credential storage. Live install progress with log stream. Rollback on failure. |
| **Git Deploy** | Clone, build, and deploy any Git repository (HTTPS/SSH) to a panel domain. Auto-detects Node/PHP/static. Webhook auto-deploy, SSH deploy keys, env vars, symlink rollback. |
| **Domains** | Nginx virtual host manager — create/delete server blocks, live config editor, subdomain support. |
| **SSL Certificates** | Let's Encrypt via certbot. List all certs with expiry badges, expiry charts, days-remaining color coding. Issue new certs, force-renew, dry-run testing, bulk renew. Certificate detail view with full openssl info. Auto-renewal status. |
| **PHP-FPM Manager** | Pool management across any PHP version. Live pool status, OPcache stats, PHP modules list, pool config editor, error/slow log viewer, config syntax test, graceful reload. |

### Security & Automation

| Module | What It Does |
|--------|-------------|
| **Firewall Rules** | Multi-backend detection (firewalld, ufw, nftables, iptables). Full zone management. Rule editing/insertion/deletion. Rule templates (13 common rules). Export rules. Live rule stats with auto-refresh. Conntrack connection viewer. Top talkers analysis. Firewall log viewer. |
| **Virus Scanner** | ClamAV-powered scanning of home/mail/FTP/web/custom paths. Real-time progress. Quarantine (move/restore/delete). Freshclam updates. |
| **Backups** | Single-file, directory, and full-system targets. PostgreSQL dump integration. Real-time progress with ETA. Survives browser close. Retention policies. |
| **Cron Jobs** | Crontab editor per system user. Full five-field expression editor with validation. Enable/disable toggle. Human-readable schedule descriptions. Next run time calculation. Quick presets. |

### Operations & Control

| Module | What It Does |
|--------|-------------|
| **Audit Trail** | Auto-logs all POST/PUT/DELETE with user, method, path, IP. Filter, search, paginated. Clear option. |
| **Notifications** | In-app bell with unread badge. Mark individual/all as read. Programmatic API. |
| **MIME Types** | Browse 2,148+ system types by category. Distribution chart. Search. CRUD for user-defined types. |
| **Settings** | Full panel control center. Admin profile editing. API token management. System info. Maintenance actions. |
| **Profile** | Avatar upload. Display name. Two-factor authentication (TOTP with QR code). Session management. Activity log. |

---

## Quick Start

### Prerequisites

- **Node.js** 18 or later
- **npm**
- **Root access** (for system-level operations: systemd, iptables, certbot, package manager)
- **PostgreSQL** (optional — only for the Database Manager module)

### One-Command Install

```bash
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install.sh)
```

Once complete, NexusPanel listens on `http://127.0.0.1:3443`. Configure a reverse proxy (nginx) for external access — see [Manual Reverse Proxy](#manual-reverse-proxy-nginx--ssl).

> **Note:** A license key from [https://nxp.xus.me](https://nxp.xus.me) is required for production use. Pass `--license=NX-XXXX` during installation or set `LICENSE_KEY` in your `.env` after install.

### Per-OS Installers

```bash
# Ubuntu / Debian
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-ubuntu.sh)

# AlmaLinux / RHEL
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-almalinux.sh)

# CentOS Stream, Rocky Linux, Fedora (delegates to install-almalinux.sh)
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

### Unattended Install with Domain and SSL

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

---

## Configuration

All configuration lives in a single `.env` file at the project root:

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

> The panel binds to `127.0.0.1` only. External access requires a reverse proxy (nginx, Caddy, Traefik) or an SSH tunnel.

---

## Licensing

NexusPanel is **source-available** under the **Business Source License 1.1 (BSL 1.1)**.

1. **Purchase a license** at [https://nxp.xus.me](https://nxp.xus.me)
2. **Configure** `LICENSE_KEY`, `LICENSE_DOMAIN`, and `LICENSE_SECRET` in your `.env`
3. **Validation** occurs at startup and every 60 minutes — HMAC-SHA256 signed, over HTTPS

After the Change Date (5 years from first publication), the license automatically converts to **Apache License 2.0**.

---

## Architecture

### High-Level Data Flow

```
                         Browser (SPA)
                              │
                         HTTPS (via reverse proxy)
                              │
                     ┌────────────────────┐
                     │     Express 5       │  127.0.0.1:3443
                     │     server.js       │
                     └────────────────────┘
                    /         │         \
              /api/*     /ws/terminal    /* (SPA static)
                 │            │              │
           32 route       WebSocket        public/
           modules        + node-pty       index.html
                  │            │          + js/ (30 modules)
           31 service               │
           modules                  bash shell
                 │
     ┌───────────┼───────────────┬─────────────┐
     ▼           ▼               ▼             ▼
 systemctl   docker CLI      PostgreSQL     iptables
 pkg mgr     (socket)        (pg / Pool)    certbot
 clamscan    images/containers              crontab
```

### Design Principles

- **Single-process** — One Node.js process serves the API, static SPA, and WebSocket terminal. No external workers, no message queues.
- **Localhost-only bind** — Express listens on `127.0.0.1:3443`. A reverse proxy handles TLS and access control.
- **Audit middleware** — Every `POST`, `PUT`, and `DELETE` is logged with user, method, path, and IP — before the response is sent.
- **Rate limiting** — 120 requests/minute per IP across all `/api/*` routes. Login has a separate, stricter limiter.
- **Security headers** — Helmet enforces CSP, HSTS, X-Frame-Options, and more.
- **Atomic writes** — JSON data files are written via temp file + `fs.rename()` to prevent corruption.
- **Event delegation** — All frontend click handlers use `data-*-action` attributes (no inline onclick, XSS-safe).

### Project Structure

```
NexusPanel/
├── server.js                 # Express + WebSocket entry point
├── package.json              # Dependencies and scripts
├── VERSION                   # Current version (1.35.6)
├── CHANGELOG.md              # Full version history
├── nexuspanel.service        # systemd unit file
├── vitest.config.mjs         # Test configuration
├── install.sh                # Universal installer
├── install-common.sh         # Shared installer library
├── install-{os}.sh           # OS-specific installers
├── update.sh                 # Standalone updater
├── upgrade.sh                # Config-preserving upgrade
├── uninstall.sh              # Comprehensive uninstaller
├── troubleshoot.sh           # Diagnostic wizard
├── errors.sh                 # Common error checklist
├── health.sh                 # Cron-friendly health monitor
├── logs.sh                   # Log aggregation viewer
├── public/                   # Static frontend (SPA)
│   ├── index.html
│   ├── css/style.css         # 11,600+ lines of themed CSS
│   ├── js/                   # 30 frontend controller modules
│   └── libs/                 # Vendored frontend libraries
├── scripts/
│   ├── apps/                 # One-click installer scripts (WordPress, Laravel, Node, Next.js, Static)
│   └── deploy/               # Git Deploy shared shell helpers
├── src/
│   ├── middleware/
│   │   ├── auth.js           # JWT verification middleware
│   │   └── security.js       # Helmet, CSP, rate limiters
│   ├── routes/               # 32 API route modules
│   └── services/             # 31 business-logic service modules
└── tests/                    # Automated test suite
    ├── helpers/setup.mjs     # App factory and test utilities
    ├── unit/                 # Unit tests (11 files)
    │   ├── utils/
    │   ├── middleware/
    │   └── services/
    └── integration/          # Integration tests (30 files)
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

### Module Endpoints

| Module | Path Prefix | Key Operations | Auth |
|--------|-------------|----------------|------|
| Dashboard | `/api/dashboard` | System metrics, service health, reboot | Yes |
| Metrics | `/api/metrics` | Current snapshot, historical (24h/7d/30d) | Yes |
| Files | `/api/files` | List, read, create, rename, delete, copy, move, archive, extract, upload, search, permissions, bin, conflict detection | Yes |
| Databases | `/api/databases` | List DBs, tables, schemas, extensions, table info, data CRUD, SQL query, triggers, indexes, FKs, functions, views, matviews, export/import, dump, search-all, connections, bookmarks, column ordering | Admin |
| Emails | `/api/emails` | List accounts, domains, inbox, folders, read/send/move/delete messages | Admin |
| Docker | `/api/docker` | List/start/stop/restart/remove containers and images, daemon info | Admin |
| Terminal | `/ws/terminal` | WebSocket — create panes, send input, resize, kill | Yes |
| FTP | `/api/ftp` | Create/enable/disable/delete accounts, set home dirs, view logs | Admin |
| Domains | `/api/domains` | Create/delete nginx server blocks, live config editor | Admin |
| Apps | `/api/apps` | One-click installer — catalog, system-users, targets, list, install/uninstall, log streaming | Admin |
| Git Deploy | `/api/deploy` + `/webhook` | Deploy from Git, history, status, logs, rollback, env vars, SSH deploy keys, webhook auto-deploy | Admin |
| Backups | `/api/backups` | Define targets, start/stop, status, list, download, delete | Admin |
| Virus Scanner | `/api/virusscanner` | Start scan, progress, results, update definitions | Admin |
| MIME Types | `/api/mimetypes` | Browse system types, CRUD user-defined types | Yes |
| Services | `/api/services` | List/start/stop/restart systemd units | Admin |
| Processes | `/api/processes` | Live process list, kill by PID | Admin |
| Logs | `/api/logs` | List `/var/log`, tail, search | Admin |
| Cron | `/api/cron` | List/add/edit/delete crontab entries per user | Admin |
| Firewall | `/api/firewall` | Multi-backend: firewalld zones, iptables chains/rules, rule templates, conntrack, live stats, logs | Admin |
| SSL | `/api/ssl` | List certificates, issue via certbot, force-renew, dry-run, detail view, auto-renewal status | Admin |
| PHP-FPM | `/api/phpfpm` | List pools, view status, OPcache, modules, config editor, logs, restart/reload | Admin |
| Updates | `/api/updates` | Check for available packages, apply with live streaming progress | Admin |
| Notifications | `/api/notifications` | List, mark read, create | Yes |
| Settings | `/api/settings` | Panel settings load/save, system info, maintenance actions | Admin |
| Search | `/api/search` | Global cross-module search | Yes |
| Tokens | `/api/tokens` | API token CRUD | Admin |
| Users | `/api/users` | User management | Admin |
| Audit | `/api/audit` | Query audit log, stats, clear | Admin |
| Profile | `/api/profile` | Password change, 2FA setup, avatar, sessions, activity log | Yes |
| Alerts | `/api/alerts` | Alert configuration and rules | Admin |

> **WebSocket Terminal**: Connect to `/ws/terminal` with the JWT cookie. Message types: `create`, `create-pane`, `close-pane`, `input`, `resize`, `kill`. Data is base64-encoded.

---

## Testing

### Automated Test Suite

NexusPanel ships with **183 automated tests** across **41 test files**, powered by [Vitest 4](https://vitest.dev/) and [Supertest](https://github.com/ladakh/supertest).

```bash
# Run the full suite
npm test

# Watch mode during development
npm run test:watch

# Coverage report
npm run test:coverage
```

### What's Tested

| Layer | Files | Coverage |
|-------|-------|----------|
| **Unit** | 11 test files | Validators, shell utilities, auth middleware, services (notifications, audit, tokens, settings, users, mimetypes, domains, apps, git-deploy) |
| **Integration** | 30 test files | Every route module — auth, dashboard, profile, settings, notifications, mimetypes, audit, tokens, users, files, search, domains, FTP, databases, emails, backups, Docker, services, processes, logs, cron, firewall, SSL, PHP-FPM, virus scanner, updates, alerts, metrics, apps, deploy |

### Test Architecture

- **ESM-first**: All test files use `.mjs` extension with Vitest 4's native ESM support
- **App factory pattern**: Tests create an Express app without starting a server, using `createRequire()` to load the CJS source modules
- **Real data directory**: Tests run against actual `data/` files (non-destructive assertions only)
- **Authenticated requests**: JWT tokens are generated and passed via `Cookie` header
- **Auth coverage**: Every endpoint is tested both for successful auth and for role-restriction (403 for non-admin)

### Manual Smoke Test Checklist

For UI-level verification:

- [ ] **Auth**: Login with admin credentials; complete 2FA flow; logout; verify session cookie cleared
- [ ] **Dashboard**: CPU/RAM/Disk/Network metrics render and update
- [ ] **File Manager**: Browse directories, upload, create folder, edit in Ace, download, archive/extract, test bin/restore
- [ ] **Terminal**: Open a terminal pane, type commands, resize, close
- [ ] **Databases**: List databases, open a table, search data, add a row, run a SQL query
- [ ] **Docker**: List containers, start/stop one, view logs
- [ ] **Backups**: Start a backup, monitor progress, download the archive
- [ ] **SSL**: List certificates, issue a new one via certbot
- [ ] **Firewall**: View zones, add a rule, check live stats
- [ ] **Audit Trail**: Verify recent actions appear in the audit log

---

## Production Operations

### Upgrading

```bash
# Recommended: config-preserving upgrade
sudo bash upgrade.sh

# Lightweight: pull-and-restart
sudo bash update.sh

# Manual
cd /opt/nexuspanel && git pull origin main && npm install --production && systemctl restart nexuspanel
```

### Uninstalling

```bash
sudo bash uninstall.sh
```

### Troubleshooting

```bash
sudo bash troubleshoot.sh   # Diagnostic wizard with auto-repair
sudo bash errors.sh          # Common error checklist
systemctl status nexuspanel  # Service status
journalctl -u nexuspanel -f  # Live logs
```

### Health Monitoring

Add to crontab for automated checks every 5 minutes:

```bash
*/5 * * * * /opt/nexuspanel/health.sh
```

Checks service status, port listening, memory/disk thresholds, license server reachability, nginx, and Node.js memory usage. Auto-restarts on critical failures.

---

## Manual Reverse Proxy (nginx + SSL)

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

> The WebSocket terminal requires the `Upgrade` and `Connection` headers. The `proxy_read_timeout` of 3600s prevents idle disconnects during long terminal sessions.

---

## Development

### Setup

```bash
git clone https://github.com/xuspanel/NexusPanel.git
cd NexusPanel
npm install
cp .env.example .env
nano .env
npm start
```

Frontend assets are served from `public/` with no build step. Edit `public/js/*.js` or `public/css/style.css` and refresh the browser. Cache-busting is handled via `?v=<VERSION>` query parameters.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Express 5, CommonJS, Node.js 18+ |
| Frontend | Vanilla JS (no framework, no build step) |
| Terminal | xterm.js 5.5.0 + node-pty + WebSocket |
| Database | PostgreSQL via `pg` (connection pooling) |
| Auth | JWT + bcrypt + TOTP (speakeasy) |
| Security | Helmet, express-rate-limit, event delegation |
| Testing | Vitest 4, Supertest, ESM |
| Styles | 11,600+ lines of hand-crafted CSS with dark/light themes |

### Commit Conventions

- Commits to `main` must be **GPG-signed**
- Use conventional, descriptive commit messages (e.g., `v1.35.6: Fix modal content clipping`)
- Do not commit `.env`, `node_modules/`, `data/`, or proprietary directories

---

## Acknowledgments

NexusPanel is built on the shoulders of outstanding open-source projects:

- **[Express 5](https://expressjs.com/)** — HTTP API framework
- **[node-pty](https://github.com/microsoft/node-pty)** — pseudo-terminal bindings
- **[xterm.js](https://xtermjs.org/)** — terminal frontend renderer
- **[Ace Editor](https://ace.c9.io/)** — in-browser code editor
- **[node-postgres](https://node-postgres.com/)** — PostgreSQL client with pooling
- **[speakeasy](https://github.com/speakeasyjs/speakeasy)** — TOTP two-factor authentication
- **[Helmet](https://helmetjs.github.io/)** — HTTP security headers
- **[express-rate-limit](https://express-rate-limit.mintlify.app/)** — API rate limiting
- **[ws](https://github.com/websockets/ws)** — WebSocket implementation
- **[bcryptjs](https://github.com/dcodeIO/bcryptjs)** — password hashing
- **[jsonwebtoken](https://github.com/auth0/node-jsonwebtoken)** — JWT sessions
- **[mailparser](https://nodemailer.com/extras/mailparser/)** — email message parsing
- **[adm-zip](https://github.com/cthackers/adm-zip)** — ZIP archive operations
- **[archiver](https://www.archiverjs.com/)** — streaming archive creation
- **[Dockerode](https://github.com/apocas/dockerode)** — Docker API client
- **[Chart.js](https://www.chartjs.org/)** — dashboard metric charts
- **[ClamAV](https://www.clamav.net/)** — open-source antivirus engine
- **[Certbot](https://certbot.eff.org/)** — Let's Encrypt certificate automation
- **[Vitest](https://vitest.dev/)** — blazing fast test framework
- **[Supertest](https://github.com/ladakh/supertest)** — HTTP assertion library
- **[nxLicensing](https://nxp.xus.me)** — license validation platform (HMAC-SHA256)

---

## License

**Business Source License 1.1 (BSL 1.1)**

Licensed Work: NexusPanel — VPS Control Center
Change Date: 2026-07-20 (5 years from first publication → converts to **Apache 2.0**)
Purchase: [https://nxp.xus.me](https://nxp.xus.me)

---

<p align="center">
  <sub>Built with care for operators who own their infrastructure.</sub>
</p>
