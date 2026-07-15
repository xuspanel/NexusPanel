# NexusPanel — VPS Control Center

A self-hosted, all-in-one VPS management panel for Linux and Windows servers. Manage files, databases, email, Docker, domains, services, security, and system updates — all from a single responsive web UI with dark/light theme support.

---

## Features

### Dashboard
Real-time system metrics (CPU, RAM, Disk, Network) with animated hero welcome. Quick-access card grid for all features. Server location display, status indicator, and live clock.

### File Manager
Full-featured file browser with browse, upload, download, create, rename, delete, move, copy, duplicate, Ace-powered code editor, archive creation/extraction (.zip, .tar, .tar.gz), visual permissions editor (rwx checkbox grid with octal/symbolic), multi-file select with batch operations, recursive global search with include/exclude patterns, right-click context menu, quick-access sidebar, hidden file toggle, drag-and-drop upload, keyboard shortcuts.

### Terminal
Interactive web terminal via xterm.js + WebSocket + node-pty. Full bash shell with tab completion, colors, ANSI support. Customizable preset command launcher with save/delete/search. Auto-reconnect on connection loss.

### Databases
PostgreSQL database manager — list databases, schemas, tables, and extensions. Inline SQL query editor with results table. Table structure viewer (columns, types, indexes).

### Emails
Email account manager with webmail client — create/delete accounts with quotas, webmail inbox with folder navigation, compose/send/reply/forward, message move/delete, unread/read tracking. Multi-domain support (auto-discovers domains from Postfix config).

### Docker
Container and image management — containers grouped by Compose project with expandable app cards, color-coded status indicators, start/stop/restart/remove, container logs, pull/tag/remove images, daemon info.

### FTP
vsftpd account management — create, enable, disable, delete FTP accounts. Set home directories and shell access. View recent FTP access logs.

### Domains
Nginx virtual host manager — create and delete nginx server blocks, live configuration editor, subdomain parent domain support, SSL certificate integration.

### Backups
Automated VPS backup wizard — single-file, directory, and full-system backup targets. PostgreSQL database dump integration. Real-time progress with percentage, file count, elapsed time, and ETA. Backup list with timestamps, sizes, and download links. Combined archive download. Survives browser close (state persistence, reconnection on page reload).

### Virus Scanner
ClamAV-powered malware scanner — scan home directory, mail, public FTP space, public web space, or custom path. Real-time progress with file count. Infected file list with threat names. Quarantine management (move, restore, delete). Live virus definition updates via freshclam.

### MIME Types
System and user-defined MIME type manager — browse 2,148 system MIME types grouped by category. Visual category distribution chart. Expandable accordion sections. Search across all system types. Create, edit, and delete user-defined MIME types.

### Theme Switcher
Dark/light mode toggle in sidebar nav. 32 CSS variable overrides for light theme. 200+ light-theme selector rules across every feature. Zero flash-of-wrong-theme (inline script sets attribute before CSS loads). Persists to localStorage. Particles canvas adapts to theme.

### Audit Trail
All POST, PUT, and DELETE API calls auto-logged with user, method, path, and IP. Filter by action type or search by text. Paginated history view. Clear logs option.

### Service Manager
systemd service control — list all system services with status, start/stop/restart, view detailed service status output. Filter by name or description.

### Process Manager
Live process monitoring (refreshes every 5 seconds). PID, user, CPU%, MEM%, and command display. Color-coded thresholds (yellow >20%, red >50%). Kill processes directly.

### Log Viewer
System log browser — file listing from `/var/log` with sizes. Split-pane layout. Tail last 500 lines. Full-text search within log files. Monospace formatted viewer.

### Cron Jobs
Crontab editor for scheduled tasks — view jobs per system user. Add, edit, and delete cron entries. Five-field expression editor (minute, hour, day, month, weekday). Modal-based create/edit form.

### Firewall Rules
iptables rule manager — view all chains and rules with line numbers. Add rules to any chain (iptables syntax). Delete rules by chain and number.

### SSL Certificates
Let's Encrypt integration — list all certificates with domain, issuer, and expiry dates. Days-until-expiry badges (green >30d, yellow 30d, red expired). Issue new certificates via certbot. Force-renew existing certificates.

### PHP-FPM Manager
PHP pool management — list all PHP-FPM pools with configuration. View pool settings (process manager, max children, user, listen address). Restart PHP-FPM service.

### System Updates
Package update manager — check for available dnf/apt updates. List packages with name, new version, and repository. Apply all updates with progress feedback.

### Notification Center
In-app notification system — bell icon with unread count badge. Dropdown panel with notification list. Mark individual or all as read. API for programmatic notification creation.

### Profile & Authentication
Admin user management. 2FA via TOTP (speakeasy + QR code). Session-based JWT authentication. Password change. Role-based access control.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, Express 5 |
| **Frontend** | Vanilla JavaScript, Ace Editor, xterm.js, Chart.js |
| **Styling** | CSS custom properties, glassmorphism, responsive grid |
| **Auth** | JWT (jsonwebtoken), bcryptjs, TOTP 2FA (speakeasy + qrcode) |
| **Terminal** | WebSocket (ws), node-pty |
| **Security** | Helmet, rate limiting (express-rate-limit), CSP headers |
| **Email** | mailparser for webmail parsing |
| **Archives** | adm-zip for ZIP, system tar/zip |
| **Virus Scan** | ClamAV (clamscan CLI) |
| **System** | systemctl, iptables, certbot, crontab, dnf/apt |

---

## Quick Install

### One-liner (auto-detects OS)

```bash
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install.sh)
```

### Ubuntu / Debian

```bash
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-ubuntu.sh)
```

### AlmaLinux / RHEL

```bash
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-almalinux.sh)
```

### CentOS Stream

```bash
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-centos.sh)
```

### Rocky Linux

```bash
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-rocky.sh)
```

### Fedora

```bash
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-fedora.sh)
```

### macOS

```bash
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-macos.sh)
```

### Windows (PowerShell 7+)

```powershell
iwr -useb https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-windows.ps1 | iex
```

### Docker

```bash
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install-docker.sh)
```

---

## Manual Installation

### Prerequisites
- **Node.js** 18+
- **npm**

### Steps

```bash
git clone -b main --single-branch https://github.com/xuspanel/NexusPanel.git
cd NexusPanel
npm install

cp .env.example .env
nano .env

npm start
```

### Environment Variables (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | Session encryption key (generate with `openssl rand -hex 32`) | *Required* |
| `ADMIN_USER` | Admin username | `admin` |
| `ADMIN_PASS` | Admin password (stored bcrypted on first run) | *Required* |
| `PORT` | Web server port | `3443` |
| `NODE_ENV` | Environment mode | `production` |
| `SERVER_LOCATION` | Display location on dashboard | *optional* |
| `SSH_USER` | Default SSH user for terminal | `root` |
| `LICENSE_KEY` | License key (if purchased) | *optional* |
| `LICENSE_SERVER_URL` | License validation endpoint | `https://nxl.xus.me/api` |

---

## Production Deployment

For external access, run behind nginx with SSL:

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

The installer scripts handle this automatically if a domain is provided during installation.

---

## Upgrading

### Using the upgrade utility

```bash
sudo bash upgrade.sh
```

This preserves your `.env` configuration and database, then pulls the latest version from GitHub and restarts the service.

### Manual upgrade

```bash
cd /opt/nexuspanel
git stash
git pull origin main
npm install --production
systemctl restart nexuspanel
```

---

## Uninstalling

```bash
sudo bash uninstall.sh
```

You will be prompted to confirm. Configuration can be optionally backed up for future reinstallation:

```bash
# Backup config first
cp /opt/nexuspanel/.env ~/nexuspanel.env.backup
# Then uninstall
sudo bash uninstall.sh
```

---

## Troubleshooting

Run the troubleshooting wizard:

```bash
sudo bash troubleshoot.sh
```

### Check service status

```bash
systemctl status nexuspanel
journalctl -u nexuspanel -f
```

### Verify health endpoint

```bash
curl http://127.0.0.1:3443/health
```

### View logs

```bash
sudo bash logs.sh
```

---

## Project Structure

```
NexusPanel/
├── install.sh                    # Universal installer (auto-detects OS)
├── install-common.sh             # Shared installer library
├── install-ubuntu.sh             # Ubuntu/Debian installer
├── install-debian.sh             # Debian installer (sources Ubuntu)
├── install-almalinux.sh          # AlmaLinux/RHEL installer
├── install-centos.sh             # CentOS Stream installer
├── install-rocky.sh              # Rocky Linux installer (sources AlmaLinux)
├── install-fedora.sh             # Fedora installer
├── install-macos.sh              # macOS installer (Homebrew + LaunchDaemon)
├── install-windows.ps1           # Windows installer (Chocolatey + NSSM)
├── install-docker.sh             # Docker containerized installer
├── uninstall.sh                  # Comprehensive uninstaller
├── upgrade.sh                    # Config-preserving upgrade utility
├── update.sh                     # Legacy update script
├── config.example.json           # Default configuration template
├── troubleshoot.sh               # Diagnostic wizard
├── errors.sh                     # Error code reference
├── health.sh                     # Health check script
├── logs.sh                       # Log viewer
├── nexuspanel.service            # systemd service unit
├── server.js                     # Express app entry point
├── package.json
├── .env.example                  # Environment template
├── data/                         # Runtime data directory
├── public/                       # Static frontend assets
│   ├── index.html                # SPA entry point
│   ├── css/style.css             # Complete application stylesheet
│   └── js/                       # Frontend controllers (30+ modules)
└── src/
    ├── middleware/
    │   ├── auth.js               # JWT authentication middleware
    │   └── security.js            # Helmet, CSP, rate limiting
    ├── routes/                    # API route handlers (30+ modules)
    └── services/                  # Business logic (25+ modules)
```

---

## API Reference

All endpoints are prefixed with `/api/`. Authentication is via session cookie (JWT). Admin-only endpoints return 403 for non-admin users.

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | No | Login, returns JWT or 2FA challenge |
| `POST` | `/api/auth/login/2fa` | No | Complete 2FA login with TOTP token |
| `POST` | `/api/auth/logout` | Yes | Clear session |
| `GET` | `/api/auth/me` | Yes | Current user info |

### Dashboard

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/system/stats` | Yes | Real-time CPU/RAM/Disk/Network stats |
| `GET` | `/api/system/reboot-status` | Yes | Check if server is rebooting |
| `POST` | `/api/system/reboot` | Admin | Reboot server |
| `GET` | `/api/metrics/current` | Yes | Latest metrics snapshot |
| `GET` | `/api/metrics/history?period=24h|7d` | Yes | Historical metrics |

### File Manager

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/files/list` | Yes | List directory contents |
| `GET` | `/api/files/read` | Yes | Read file content |
| `GET` | `/api/files/download` | Yes | Download file |
| `POST` | `/api/files/create` | Yes | Create file or folder |
| `PUT` | `/api/files/rename` | Yes | Rename file or folder |
| `DELETE` | `/api/files/delete` | Yes | Delete file or folder |
| `POST` | `/api/files/copy` | Yes | Copy files |
| `POST` | `/api/files/move` | Yes | Move files |
| `POST` | `/api/files/archive` | Yes | Create archive |
| `POST` | `/api/files/extract` | Yes | Extract archive |
| `POST` | `/api/files/upload` | Yes | Upload files (multipart) |
| `GET` | `/api/files/search` | Yes | Recursive file search |
| `PUT` | `/api/files/permissions` | Yes | Change permissions |

### Databases

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/databases/list` | Admin | List databases |
| `GET` | `/api/databases/:db/tables` | Admin | List tables |
| `GET` | `/api/databases/:db/schemas` | Admin | List schemas |
| `GET` | `/api/databases/:db/extensions` | Admin | List extensions |
| `GET` | `/api/databases/:db/table/:schema/:table/info` | Admin | Table structure |
| `GET` | `/api/databases/users` | Admin | Database users |

### Emails

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/emails/list` | Admin | List email accounts |
| `GET` | `/api/emails/domains` | Admin | List email domains |
| `POST` | `/api/emails/create` | Admin | Create email account |
| `GET` | `/api/emails/:user/inbox` | Admin | List inbox messages |
| `GET` | `/api/emails/:user/folders` | Admin | List maildir folders |
| `GET` | `/api/emails/:user/message/:file` | Admin | Read message |
| `POST` | `/api/emails/:user/send` | Admin | Send email |
| `POST` | `/api/emails/:user/move` | Admin | Move message |
| `POST` | `/api/emails/:user/delete` | Admin | Delete message |

### Docker

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/docker/containers` | Admin | List all containers |
| `GET` | `/api/docker/images` | Admin | List all images |
| `GET` | `/api/docker/info` | Admin | Docker daemon info |
| `POST` | `/api/docker/containers/:id/start` | Admin | Start container |
| `POST` | `/api/docker/containers/:id/stop` | Admin | Stop container |
| `POST` | `/api/docker/containers/:id/restart` | Admin | Restart container |
| `DELETE` | `/api/docker/containers/:id` | Admin | Remove container |
| `DELETE` | `/api/docker/images/:id` | Admin | Remove image |

### Backups

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/backups/defs` | Admin | Backup targets & options |
| `POST` | `/api/backups/start` | Admin | Start a backup |
| `GET` | `/api/backups/status/:id` | Admin | Backup progress |
| `GET` | `/api/backups/list` | Admin | Completed backups |
| `GET` | `/api/backups/:ts/download` | Admin | Download backup archive |
| `DELETE` | `/api/backups/:ts` | Admin | Delete backup |

### Virus Scanner

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/virusscanner/scan` | Admin | Start scan |
| `GET` | `/api/virusscanner/scan/:id` | Admin | Scan progress |
| `GET` | `/api/virusscanner/scan/:id/results` | Admin | Scan results |
| `POST` | `/api/virusscanner/update-defs` | Admin | Update virus definitions |

### Remaining Modules

| Module | Path Prefix | Description |
|--------|-------------|-------------|
| MIME Types | `/api/mimetypes` | System and user-defined MIME types CRUD |
| Services | `/api/services` | systemd service control |
| Processes | `/api/processes` | Process monitoring |
| Logs | `/api/logs` | Log file reading and search |
| Cron | `/api/cron` | Crontab management |
| Firewall | `/api/firewall` | iptables rule management |
| SSL | `/api/ssl` | Certificate management |
| PHP-FPM | `/api/phpfpm` | PHP pool management |
| Updates | `/api/updates` | Package updates |
| Audit | `/api/audit` | Audit trail queries |
| Notifications | `/api/notifications` | Notification storage |
| Search | `/api/search` | Global search across all modules |
| Settings | `/api/settings` | Panel settings |
| Tokens | `/api/tokens` | API token management |
| Users | `/api/users` | User management |

---

## License

MIT
