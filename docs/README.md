# NexusPanel Documentation

Welcome to the official documentation for **NexusPanel v1.35.4** — a self-hosted VPS Control Center.

---

## Architecture & Design

Deep-dives into how NexusPanel works under the hood.

| Document | Description |
|----------|-------------|
| [System Overview](architecture/overview.md) | Single-process architecture, data flow, design principles, project structure |
| [Authentication](architecture/authentication.md) | JWT sessions, 2FA/TOTP, role-based access, password hashing, API tokens |
| [Security](architecture/security.md) | CSP headers, rate limiting, XSS prevention, audit middleware, HTTPS |
| [WebSocket Terminal](architecture/websocket.md) | Terminal protocol, node-pty integration, message format, pane lifecycle |
| [Data Storage](architecture/data-storage.md) | JSON files, atomic writes, file locking strategies, data formats |
| [Deployment](architecture/deployment.md) | Installation, systemd, reverse proxy, updates, health monitoring |
| [Development](architecture/development.md) | Tech stack, project structure, testing, contribution workflow |

---

## API Reference

Complete endpoint documentation for every backend module.

| Document | Module | Endpoints |
|----------|--------|-----------|
| [Authentication](api/authentication.md) | Auth | login, 2FA, logout, me |
| [Dashboard](api/dashboard.md) | Dashboard / System | stats, service-health, quick-stats, reboot |
| [Metrics](api/metrics.md) | Metrics | current, history (24h/7d/30d) |
| [Files](api/files.md) | File Manager | list, read, create, rename, delete, copy, move, archive, extract, upload, search, bin, git |
| [Databases](api/databases.md) | PostgreSQL | 55+ endpoints — DBs, tables, SQL, views, triggers, functions, indexes, privileges |
| [Emails](api/emails.md) | Email Manager | accounts, inbox, compose, send, folders |
| [Docker](api/docker.md) | Docker | containers, images, networks, compose, filesystem |
| [Terminal](api/terminal.md) | Terminal | presets CRUD |
| [FTP](api/ftp.md) | FTP Accounts | vsftpd management, SSL, quotas, bandwidth |
| [Domains](api/domains.md) | Domain Manager | nginx vhosts, SSL, config editor |
| [Apps](api/apps.md) | One-Click App Installer | catalog, system-users, targets, list, install, uninstall, logs |
| [Git Deploy](api/deploy.md) | Git Deploy | deploy, history, status, logs, rollback, env vars, SSH keys, webhook |
| [Backups](api/backups.md) | Backup Wizard | targets, schedules, start/stop, download |
| [Virus Scanner](api/virusscanner.md) | Scanner | scan, quarantine, definitions, history |
| [MIME Types](api/mimetypes.md) | MIME Types | system types, custom CRUD, import/export |
| [Services](api/services.md) | Service Manager | systemd list/start/stop/restart |
| [Processes](api/processes.md) | Process Manager | list, tree, kill, signals |
| [Logs](api/logs.md) | Log Viewer | list, read, search, stream, download |
| [Cron](api/cron.md) | Cron Jobs | per-user crontab, cron.d, toggle, describe |
| [Firewall](api/firewall.md) | Firewall Rules | iptables, firewalld, zones, conntrack, stats |
| [SSL](api/ssl.md) | SSL Certificates | certbot issue/renew/revoke, auto-renew |
| [PHP-FPM](api/phpfpm.md) | PHP-FPM | pools, opcache, modules, config, logs |
| [Updates](api/updates.md) | System Updates | check, apply, panel updates, security |
| [Notifications](api/notifications.md) | Notifications | list, mark read, clear |
| [Settings](api/settings.md) | Settings | config, system info, health, tokens, maintenance |
| [Search](api/search.md) | Search | global cross-module search |
| [Tokens](api/tokens.md) | API Tokens | token CRUD, bearer auth |
| [Users](api/users.md) | User Management | system user CRUD, bulk operations |
| [Audit](api/audit.md) | Audit Trail | query, stats, export, clear |
| [Profile](api/profile.md) | Profile | password, 2FA, avatar, sessions, activity |
| [Alerts](api/alerts.md) | Alerts | alert configuration and rules |

---

## Screen Guides

User-facing guides for every screen in the application.

| Document | Screen | Key Features |
|----------|--------|-------------|
| [Login](screens/login.md) | Login + 2FA | Authentication flow, TOTP verification |
| [Dashboard](screens/dashboard.md) | Home | CPU/RAM/Disk/Network charts, service health, reboot |
| [File Manager](screens/file-manager.md) | Files | Browse, edit, archive, extract, bin, git, permissions |
| [Databases](screens/databases.md) | PostgreSQL | Tables, SQL editor, views, triggers, import/export |
| [Emails](screens/emails.md) | Email | Accounts, webmail, compose, folders |
| [Docker](screens/docker.md) | Docker | Containers, images, compose, filesystem browser |
| [Terminal](screens/terminal.md) | Shell | Classic single-pane + PRO multi-tab mode |
| [Users](screens/users.md) | VPS Users | System user management, bulk operations |
| [Domains](screens/domains.md) | Domains | nginx vhosts, SSL, config editor |
| [Apps](screens/apps.md) | One-Click Installer | Install WordPress/Laravel/Node/Next.js/Static, progress, logs |
| [Git Deploy](screens/git-deploy.md) | Git Deploy | Deploy from Git, webhooks, SSH keys, env vars, rollback |
| [Backups](screens/backups.md) | Backups | Targets, schedules, progress streaming |
| [Virus Scanner](screens/virus-scanner.md) | Scanner | ClamAV scans, quarantine, history |
| [MIME Types](screens/mime-types.md) | MIME | System types, custom definitions |
| [Audit Trail](screens/audit-trail.md) | Audit | Activity logs, filters, export |
| [Services](screens/services.md) | systemd | Service control, status, filtering |
| [Processes](screens/processes.md) | Processes | Live list, tree view, kill |
| [Log Viewer](screens/log-viewer.md) | Logs | Browse, search, follow, download |
| [Cron Jobs](screens/cron-jobs.md) | Cron | Crontab editor, presets, cron.d |
| [Firewall](screens/firewall.md) | Firewall | Zones, rules, conntrack, live stats |
| [SSL Certificates](screens/ssl-certificates.md) | SSL | Cert list, issue, renew, dry-run |
| [PHP-FPM](screens/phpfpm.md) | PHP-FPM | Pools, OPcache, modules, logs |
| [System Updates](screens/updates.md) | Updates | Package updates, panel updates, security |
| [Settings](screens/settings.md) | Settings | Configuration, tokens, system info, maintenance |
| [Profile](screens/profile.md) | Profile | Avatar, password, 2FA, sessions, activity |

---

## Quick Reference

### Endpoint Prefixes

All API endpoints are prefixed with `/api/` and require JWT authentication via cookie.

| Prefix | Module |
|--------|--------|
| `/api/auth/` | Authentication |
| `/api/system/` | Dashboard / System |
| `/api/metrics/` | Metrics |
| `/api/files/` | File Manager |
| `/api/databases/` | PostgreSQL |
| `/api/emails/` | Email |
| `/api/docker/` | Docker |
| `/api/terminal/` | Terminal |
| `/api/ftp/` | FTP |
| `/api/domains/` | Domains |
| `/api/apps/` | One-Click App Installer |
| `/api/deploy/` | Git Deploy |
| `/webhook/` | Git Deploy webhooks (public, token-authenticated) |
| `/api/backups/` | Backups |
| `/api/virusscanner/` | Virus Scanner |
| `/api/mimetypes/` | MIME Types |
| `/api/services/` | Services |
| `/api/processes/` | Processes |
| `/api/logs/` | Logs |
| `/api/cron/` | Cron |
| `/api/firewall/` | Firewall |
| `/api/ssl/` | SSL |
| `/api/phpfpm/` | PHP-FPM |
| `/api/updates/` | Updates |
| `/api/notifications/` | Notifications |
| `/api/settings/` | Settings |
| `/api/search` | Search |
| `/api/tokens/` | API Tokens |
| `/api/users/` | Users |
| `/api/audit/` | Audit |
| `/api/profile/` | Profile |
| `/api/alerts/` | Alerts |

### WebSocket

| Path | Purpose |
|------|---------|
| `/ws/terminal` | Interactive terminal (node-pty + xterm.js) |
| `/ws/docker` | Docker container exec |

### Data Files

| File | Purpose |
|------|---------|
| `data/users.json` | User accounts |
| `data/settings.json` | Panel configuration |
| `data/audit.json` | Audit log (max 10,000 entries) |
| `data/notifications.json` | Notifications (max 500) |
| `data/tokens.json` | Bearer auth tokens |
| `data/api-tokens.json` | Settings-managed API tokens |
| `data/domains.json` | Domain/vhost config |
| `data/apps.json` | Installed applications |
| `data/deployments.json` | Git deployment records |
| `data/deploy_keys.json` | Encrypted SSH deploy keys |
| `data/deploy_env_vars.json` | Encrypted deploy env vars |
| `data/deploy/` | Deployment logs |
| `data/mime-types.json` | Custom MIME types |
| `data/terminal-presets.json` | Terminal command presets |
| `data/update-history.json` | Update history |
| `data/metrics/history.jsonl` | Metrics time series |
| `data/filebin/` | Trash/recycle bin |
| `data/avatars/` | User avatar storage |

---

*Documentation for NexusPanel v1.35.4 — BSL 1.1 License*
