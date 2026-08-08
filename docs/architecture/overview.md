# System Overview

NexusPanel is a **single-process, self-hosted VPS control center** that provides a web-based interface for managing every layer of a Linux or Windows server.

---

## High-Level Architecture

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

---

## Design Principles

### Single-Process

One Node.js process serves the API, static SPA, and WebSocket terminal. There are no external workers, message queues, or separate processes. This simplifies deployment, debugging, and resource management.

### Localhost-Only Bind

The Express server listens on `127.0.0.1:3443`. It never binds to `0.0.0.0`. External access requires a reverse proxy (nginx, Caddy, Traefik) or an SSH tunnel. This means NexusPanel never directly exposes itself to the internet.

### Audit Middleware

A global Express middleware intercepts every `POST`, `PUT`, and `DELETE` request and logs it to `data/audit.json` with the user, HTTP method, request path, and client IP — before the response is sent. Nothing happens silently.

### Rate Limiting

`express-rate-limit` applies 120 requests/minute per IP across all `/api/*` routes. The login endpoint has a separate, stricter limiter to prevent brute-force attacks.

### Security Headers

`helmet` enforces a strict Content Security Policy, HSTS, X-Frame-Options, and other security headers. The CSP permits CDN domains for frontend libraries (Chart.js, Ace Editor, xterm.js).

### Atomic Writes

JSON data files are written via a temp file + `fs.rename()` pattern. On POSIX filesystems, `rename()` is an inode-level atomic operation — the target file is either the old complete version or the new complete version, never a half-written state.

### Event Delegation

All frontend click handlers use `data-*-action` attributes instead of inline `onclick` handlers. This eliminates XSS vectors from user-controlled content and follows a consistent delegation pattern across all modules.

---

## Module Categories

### System & Monitoring

| Module | Purpose |
|--------|---------|
| Dashboard | Real-time CPU/RAM/Disk/Network metrics, service health, quick stats |
| Process Manager | Live process list, tree view, kill by PID |
| Service Manager | systemd unit control (start/stop/restart/enable/disable) |
| Log Viewer | Browse `/var/log`, tail, search, follow |
| System Updates | Check and apply OS package updates with live streaming |

### Files & Access

| Module | Purpose |
|--------|---------|
| File Manager | Full file browser, Ace editor, archive/extract, bin, git, permissions |
| Terminal | Interactive web terminal via xterm.js + node-pty + WebSocket |
| FTP Accounts | vsftpd account management, SSL, quotas, bandwidth |

### Databases & Mail

| Module | Purpose |
|--------|---------|
| PostgreSQL Manager | Database/table/view/trigger/function management, SQL editor, import/export |
| Email Manager | Account management, webmail inbox, compose/send/reply/forward |

### Containers & Web

| Module | Purpose |
|--------|---------|
| Docker | Container/image/network management, Compose projects, filesystem browser |
| Domains | nginx virtual host management, SSL, config editor |
| SSL Certificates | Let's Encrypt via certbot, issuance, renewal, dry-run |
| PHP-FPM Manager | Pool management, OPcache, modules, config editor, logs |

### Security & Automation

| Module | Purpose |
|--------|---------|
| Firewall Rules | Multi-backend (firewalld/ufw/nftables/iptables), zones, conntrack, live stats |
| Virus Scanner | ClamAV scanning, quarantine, definition updates |
| Backups | Full/selected backups, PostgreSQL dumps, schedules, progress streaming |
| Cron Jobs | Per-user crontab editor, cron.d management, preset schedules |

### Operations & Control

| Module | Purpose |
|--------|---------|
| Audit Trail | Activity logging, filters, search, export, clear |
| Notifications | In-app bell with unread badge, mark read |
| MIME Types | System type browser, custom type CRUD |
| Settings | Panel configuration, API tokens, system info, maintenance |
| Profile | Avatar, password, 2FA, sessions, activity log |

---

## Request Lifecycle

```
1. Browser sends HTTP request
       │
2. Helmet applies security headers
       │
3. Rate limiter checks request count
       │
4. Cookie parser extracts JWT from cookie
       │
5. Auth middleware verifies JWT (if /api/*)
       │
6. Route handler executes
       │
7. Service layer performs business logic
       │
8. System commands / database / file I/O
       │
9. Response sent to browser
       │
10. Audit middleware logs mutation (POST/PUT/DELETE)
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| HTTP Framework | Express 5 |
| WebSocket | ws (noServer mode) |
| Terminal | node-pty + xterm.js 5.5.0 |
| Database | PostgreSQL (pg with connection pooling) |
| Auth | JWT (jsonwebtoken) + bcrypt + TOTP (speakeasy) |
| Security | Helmet, express-rate-limit |
| Frontend | Vanilla JavaScript (no framework, no build step) |
| Code Editor | Ace Editor 1.36.2 |
| Charts | Chart.js 4.4.7 |
| Testing | Vitest 4 + Supertest |
| Container API | Dockerode |
| Email | mailparser (IMAP) |
| Archives | adm-zip, archiver |
| QR Codes | qrcode (for 2FA setup) |

---

## Project Structure

```
NexusPanel/
├── server.js                 # Express + WebSocket entry point (371 lines)
├── package.json              # Dependencies and scripts
├── VERSION                   # Current version (1.35.7)
├── CHANGELOG.md              # Full version history
├── nexuspanel.service        # systemd unit file
├── vitest.config.mjs         # Test configuration (ESM)
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
│   ├── index.html            # Single-page application (3,196 lines)
│   ├── css/
│   │   ├── style.css         # Main stylesheet (11,600+ lines)
│   │   └── docker.prompt.css # Docker prompt styles
│   ├── js/                   # 30 frontend controller modules
│   │   ├── api.js            # API client (519 lines)
│   │   ├── auth.js           # Login/2FA
│   │   ├── dashboard.js      # Dashboard (545 lines)
│   │   ├── apps.js           # One-Click App Installer
│   │   ├── deploy.js         # Git Deploy
│   │   ├── filemanager.js    # File Manager (largest module)
│   │   ├── databases.js      # PostgreSQL Manager
│   │   ├── docker.js         # Docker Manager
│   │   ├── terminal.js       # Web terminal
│   │   └── ...               # 22 more modules
│   └── libs/                 # Vendored frontend libraries
│       ├── xterm.js          # xterm.js 5.5.0
│       ├── xterm-addon-fit.js
│       ├── xterm-addon-search.js
│       ├── xterm-addon-web-links.js
│       ├── xterm-addon-webgl.js
│       └── xterm-addon-unicode11.js
├── src/
│   ├── middleware/
│   │   ├── auth.js           # JWT verification + adminOnly
│   │   └── security.js       # Helmet, CSP, rate limiters
│   ├── routes/               # 32 API route modules
│   │   ├── auth.js           # /api/auth
│   │   ├── dashboard.js      # /api/system, /api/metrics
│   │   ├── files.js          # /api/files
│   │   ├── databases.js      # /api/databases
│   │   ├── apps.js           # /api/apps
│   │   ├── deploy.js         # /api/deploy
│   │   ├── webhook.js        # /webhook/:id/:token
│   │   └── ...               # 25 more route files
│   └── services/             # 31 business-logic service modules
│       ├── system.js         # CPU/RAM/Disk/Network stats
│       ├── users.js          # User management + JSON storage
│       ├── settings.js       # Panel config + system info
│       ├── audit.js          # Audit log (10K entry cap)
│       ├── notifications.js  # Notification storage
│       ├── tokens.js         # API token management
│       ├── apps.js           # One-click install orchestrator
│       ├── mysql.js          # MariaDB provisioning
│       ├── git-deploy.js     # Git deploy orchestrator
│       └── ...               # 22 more service files
├── scripts/
│   ├── apps/                 # Installer scripts (WordPress, Laravel, Node, Next.js, Static)
│   └── deploy/               # Git Deploy shell helpers
├── tests/                    # Automated test suite (183 tests)
│   ├── helpers/
│   │   └── setup.mjs         # App factory + test utilities
│   ├── unit/                 # 11 unit test files
│   │   ├── utils/
│   │   ├── middleware/
│   │   └── services/
│   └── integration/          # 30 integration test files
└── data/                     # Runtime data (gitignored)
    ├── users.json
    ├── settings.json
    ├── audit.json
    ├── notifications.json
    ├── tokens.json
    ├── api-tokens.json
    ├── domains.json
    ├── mime-types.json
    ├── terminal-presets.json
    ├── update-history.json
    ├── metrics/
    │   └── history.jsonl
    ├── filebin/              # Trash/recycle bin
    └── avatars/              # User avatar storage
```

---

## Scaling Characteristics

NexusPanel is designed for **single-tenant, single-server** management. It is not designed for horizontal scaling or multi-tenant hosting. Key characteristics:

- **Concurrent users**: Designed for 1-5 simultaneous admin users
- **Data volume**: JSON files handle up to 10K audit entries, 500 notifications
- **File operations**: Bounded by disk I/O of the underlying filesystem
- **Database operations**: Connection pooling via `pg.Pool` with per-database caching
- **WebSocket connections**: One per browser tab (terminal), with multiple panes per connection
- **Memory**: Node.js process typically uses 50-150MB depending on active connections

---

*Part of [NexusPanel Documentation](../README.md)*
