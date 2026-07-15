# ⚡ NexusPanel — VPS Control Center

A self-hosted, all-in-one VPS management panel for Linux servers. Manage files, databases, email, Docker, domains, services, security, and system updates — all from a single responsive web UI with dark/light theme support.

---

## Screenshots

*Coming soon*

---

## Features

### 🏠 Dashboard
Real-time system metrics (CPU, RAM, Disk, Network) with animated hero welcome. Quick-access card grid for all features. Server location display, status indicator, and live clock.

### 📁 File Manager
Full-featured file browser with:
- Browse, upload, download, create, rename, delete, move, copy, duplicate
- Ace-powered code editor with syntax highlighting, word wrap, and fullscreen mode
- Archive creation (.zip, .tar, .tar.gz) and extraction
- Visual permissions editor (rwx checkbox grid with octal/symbolic display)
- Multi-file select with batch operations (copy, move, archive, delete)
- Recursive global search with include/exclude pattern support
- Right-click context menu for files/folders and empty space
- Quick-access sidebar for common directories
- Hidden file toggle
- Drag-and-drop upload with progress
- Keyboard shortcuts: Ctrl+A (select all), Ctrl+D (delete), Ctrl+E (edit), Ctrl+R (rename), Ctrl+O (open), Ctrl+M (move), Ctrl+C (copy), Ctrl+T (new file), Ctrl+N (new folder)

### 💻 Terminal
Interactive web terminal via xterm.js + WebSocket + node-pty:
- Full bash shell with tab completion, colors, and ANSI support
- Customizable preset command launcher (save/delete/search presets)
- Auto-reconnect on connection loss

### 🗄️ Databases
PostgreSQL database manager:
- List databases, schemas, tables, and extensions
- Inline SQL query editor with results table
- Table structure viewer (columns, types, indexes)

### ✉️ Emails
Email account manager with webmail client:
- Create/delete email accounts with quotas
- Webmail inbox with folder navigation
- Compose, send, reply, and forward
- Message move and delete
- Unread/read tracking

### 🐳 Docker
Container and image management:
- Containers grouped by Compose project with expandable app cards
- Color-coded project cards with running/total/stopped status indicators
- Start, stop, restart, and remove containers
- Monitor container logs
- Pull, tag, and remove images
- Docker daemon info and status

### 📡 FTP
vsftpd account management:
- Create, enable, disable, and delete FTP accounts
- Set home directories and shell access
- View recent FTP access logs

### 🌐 Domains
Nginx virtual host manager:
- Create and delete nginx server blocks
- Live nginx configuration editor
- Subdomain parent domain support
- SSL certificate integration

### 💾 Backups
Automated VPS backup wizard:
- Single-file, directory, and full-system backup targets
- PostgreSQL database dump integration
- Real-time progress with percentage, file count, elapsed time, and ETA
- Backup list with timestamps, sizes, and download links
- Combined archive download
- Survives browser close (state persistence, reconnection on page reload)

### 🛡️ Virus Scanner
ClamAV-powered malware scanner:
- Scan targets: Entire Home Directory, Mail (`/home/*/Maildir`), Public FTP Space, Public Web Space, or custom path
- Real-time scan progress with file count and elapsed time
- Infected file list with threat names
- Quarantine management (move, restore, delete)
- Live virus definition updates via freshclam

### 📋 MIME Types
System and user-defined MIME type manager:
- Browse 2,148 system MIME types from `/etc/mime.types` grouped by category
- Visual category distribution chart with percentage bars
- Expandable accordion sections per category
- Search across all system types
- Create, edit, and delete user-defined MIME types
- Color-coded user-type cards

### 🌗 Theme Switcher
Dark/light mode with full app coverage:
- Toggle button in sidebar nav
- 32 CSS variable overrides for light theme
- 200+ light-theme selector rules covering every feature
- Zero flash-of-wrong-theme (inline script sets attribute before CSS loads)
- Persists to localStorage
- Particles canvas adapts to theme

### 📜 Audit Trail
Automatic activity logging:
- All POST, PUT, and DELETE API calls auto-logged with user, method, path, and IP
- Filter by action type or search by text
- Paginated history view
- Clear logs option

### ⚙️ Service Manager
systemd service control:
- List all system services with status (active/inactive/failed)
- Start, stop, and restart services
- View detailed service status output
- Filter by name or description

### 📊 Process Manager
Live process monitoring:
- Top CPU-usage process list (refreshes every 5 seconds)
- PID, user, CPU%, MEM%, and command display
- Color-coded thresholds (yellow >20%, red >50%)
- Kill processes directly

### 📝 Log Viewer
System log browser:
- File listing from `/var/log` with sizes
- Split-pane layout: file list + viewer
- Tail last 500 lines per file
- Full-text search within log files
- Monospace formatted viewer

### ⏰ Cron Jobs
Crontab editor for scheduled tasks:
- View jobs per system user
- Add, edit, and delete cron entries
- Five-field expression editor (minute, hour, day, month, weekday)
- Modal-based create/edit form

### 🛡️ Firewall Rules
iptables rule manager:
- View all chains and rules with line numbers
- Add rules to any chain (iptables syntax)
- Delete rules by chain and number
- Rule target, protocol, source, and destination display

### 🔒 SSL Certificates
Let's Encrypt integration:
- List all certificates with domain, issuer, and expiry dates
- Days-until-expiry badges (green >30d, yellow ≤30d, red expired)
- Issue new certificates via certbot
- Force-renew existing certificates

### 🐘 PHP-FPM Manager
PHP pool management:
- List all PHP-FPM pools with configuration
- View pool settings (process manager, max children, user, listen address)
- Restart PHP-FPM service

### 🔄 System Updates
Package update manager:
- Check for available dnf updates
- List packages with name, new version, and repository
- Apply all updates with progress feedback

### 🔔 Notification Center
In-app notification system:
- Bell icon in dashboard header with unread count badge
- Dropdown panel with notification list
- Mark individual or all as read
- API for programmatic notification creation

### 👤 Profile & Authentication
- Admin user management
- 2FA via TOTP (speakeasy + QR code)
- Session-based JWT authentication
- Password change
- Role-based access control

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
| **System** | systemctl, iptables, certbot, crontab, dnf |

---

## Installation

### Prerequisites
- **Node.js** 18+ 
- **Docker** (for Docker Manager)
- **PostgreSQL** (for Database Manager)
- **ClamAV** (for Virus Scanner) — `dnf install -y clamav clamav-update && freshclam`
- **certbot** (for SSL Manager)
- **vsftpd** (for FTP Manager)
- **PHP-FPM** (for PHP Manager)
- **iptables** (for Firewall Rules)
- **systemd** (for Service Manager)

### Quick Start
```bash
# Clone and install
git clone https://github.com/xuspanel/NexusPanel.git
cd NexusPanel
npm install

# Configure environment
cp .env.example .env
nano .env

# Start
npm start
# NexusPanel running on http://127.0.0.1:3443
```

### Environment Variables (`.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | Session encryption key (generate with `openssl rand -hex 32`) | *Required* |
| `ADMIN_USER` | Admin username | `admin` |
| `ADMIN_PASS` | Admin password (stored bcrypted on first run) | *Required* |
| `PORT` | Web server port | `3443` |
| `NODE_ENV` | Environment mode | `production` |
| `SERVER_LOCATION` | Display location on dashboard | `Amsterdam, Netherlands` |
| `SSH_USER` | Default SSH user for terminal | `root` |

### Production Deployment
For external access, run behind a reverse proxy (nginx recommended):
```nginx
server {
    listen 443 ssl;
    server_name panel.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3443;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
    }
}
```

---

## Project Structure

```
NexusPanel/
├── server.js                    # Express app entry point
├── package.json
├── .env                         # Environment configuration
├── data/                        # Persistent JSON data stores
│   ├── audit.json               # Audit trail entries
│   ├── backups.json             # Backup metadata
│   ├── backup_task.json         # Backup task state
│   ├── domains.json             # Domain configurations
│   ├── metrics/                 # Historical metrics data
│   ├── mime-types.json          # User-defined MIME types
│   ├── notifications.json       # Notification entries
│   ├── profile.json             # User profile data
│   ├── terminal-presets.json    # Terminal command presets
│   └── users.json               # User accounts
├── public/                      # Static frontend assets
│   ├── index.html               # SPA entry point
│   ├── css/
│   │   └── style.css            # Complete application stylesheet
│   └── js/
│       ├── api.js               # API client with method namespaces
│       ├── auth.js              # Authentication & view routing
│       ├── dashboard.js         # Dashboard stats & particles
│       ├── theme.js             # Dark/light theme toggle
│       ├── profile.js           # Profile & 2FA settings
│       ├── filemanager.js       # File Manager controller
│       ├── databases.js         # Database Manager controller
│       ├── emails.js            # Email Manager & webmail
│       ├── docker.js            # Docker Manager controller
│       ├── ftp.js               # FTP Manager controller
│       ├── domains.js           # Domain Manager controller
│       ├── backups.js           # Backup wizard controller
│       ├── virusscanner.js      # Virus Scanner controller
│       ├── mimetypes.js         # MIME Types controller
│       ├── audit.js             # Audit Trail controller
│       ├── services.js          # Service Manager controller
│       ├── processes.js         # Process Manager controller
│       ├── logs.js              # Log Viewer controller
│       ├── cron.js              # Cron Job Manager controller
│       ├── firewall.js          # Firewall Rules controller
│       ├── ssl.js               # SSL Certificate controller
│       ├── phpfpm.js            # PHP-FPM Manager controller
│       ├── updates.js           # System Update controller
│       ├── notifications.js     # Notification Center controller
│       ├── terminal.js          # Terminal controller
│       └── users.js             # User Manager controller
└── src/
    ├── middleware/
    │   ├── auth.js              # JWT authentication middleware
    │   └── security.js          # Helmet, CSP, rate limiting
    ├── routes/
    │   ├── auth.js              # POST /login, /logout, /me
    │   ├── dashboard.js         # GET /system/stats
    │   ├── profile.js           # Profile & 2FA routes
    │   ├── files.js             # File CRUD, upload, search, archive
    │   ├── databases.js         # PostgreSQL management
    │   ├── emails.js            # Email account & webmail
    │   ├── docker.js            # Docker container/image control
    │   ├── ftp.js               # FTP account management
    │   ├── domains.js           # Nginx domain config
    │   ├── backups.js           # Backup wizard API
    │   ├── virusscanner.js      # ClamAV scan & quarantine
    │   ├── mimetypes.js         # MIME types CRUD
    │   ├── audit.js             # Audit trail queries
    │   ├── services.js          # Service management
    │   ├── processes.js         # Process listing
    │   ├── logs.js              # Log file reading
    │   ├── cron.js              # Crontab management
    │   ├── firewall.js          # Firewall rule management
    │   ├── ssl.js               # Certificate management
    │   ├── phpfpm.js            # PHP-FPM management
    │   ├── updates.js           # Package updates
    │   ├── notifications.js     # Notification storage
    │   ├── terminal.js          # Terminal preset CRUD
    │   └── users.js             # User management
    └── services/
        ├── system.js            # System stats (CPU/RAM/Disk/Net)
        ├── users.js             # User storage & hashing
        ├── profile.js           # Profile & 2FA logic
        ├── filemanager.js       # File system operations
        ├── docker.js            # Docker CLI wrapper
        ├── ftp.js               # vsftpd management
        ├── domains.js           # Nginx config management
        ├── backups.js           # Backup archiving & scheduling
        ├── virusscanner.js      # ClamAV scan engine
        ├── mimetypes.js         # MIME types parser & CRUD
        ├── audit.js             # Activity logger
        ├── services.js          # systemctl wrapper
        ├── processes.js         # Process monitoring
        ├── logs.js              # Log file access
        ├── cron.js              # Crontab parser/editor
        ├── firewall.js          # iptables management
        ├── ssl.js               # certbot integration
        ├── phpfpm.js            # PHP-FPM pool parser
        ├── updates.js           # dnf package manager
        ├── notifications.js     # Notification store
        └── terminal.js          # PTY session management
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
| `GET` | `/api/metrics/history?period=24h\|7d` | Yes | Historical metrics |

### File Manager
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/files/list?path=/` | Yes | List directory contents |
| `GET` | `/api/files/read?path=` | Yes | Read file content |
| `GET` | `/api/files/download?path=` | Yes | Download file |
| `POST` | `/api/files/create` | Yes | Create file or folder |
| `PUT` | `/api/files/rename` | Yes | Rename file or folder |
| `DELETE` | `/api/files/delete` | Yes | Delete file or folder |
| `POST` | `/api/files/copy` | Yes | Copy files |
| `POST` | `/api/files/move` | Yes | Move files |
| `POST` | `/api/files/archive` | Yes | Create archive |
| `POST` | `/api/files/extract` | Yes | Extract archive |
| `POST` | `/api/files/upload` | Yes | Upload files (multipart) |
| `GET` | `/api/files/search?query=&path=` | Yes | Recursive file search |
| `PUT` | `/api/files/permissions` | Yes | Change permissions |
| `GET` | `/api/files/details?path=` | Yes | File details (stat) |

### Databases
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/databases/list` | Admin | List databases |
| `GET` | `/api/databases/:db/tables` | Admin | List tables |
| `GET` | `/api/databases/:db/schemas` | Admin | List schemas |
| `GET` | `/api/databases/:db/extensions` | Admin | List extensions |
| `GET` | `/api/databases/:db/table/:schema/:table/info` | Admin | Table structure |
| `GET` | `/api/databases/:db/table/:schema/:table/data` | Admin | Query table data |
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
| `GET` | `/api/docker/containers/:id/logs` | Admin | Container logs |

### Backups
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/backups/defs` | Admin | Backup targets & options |
| `POST` | `/api/backups/start` | Admin | Start a backup |
| `GET` | `/api/backups/status/:id` | Admin | Backup progress |
| `GET` | `/api/backups/current` | Admin | Current running task |
| `GET` | `/api/backups/list` | Admin | Completed backups |
| `GET` | `/api/backups/:ts/download` | Admin | Download backup archive |
| `DELETE` | `/api/backups/:ts` | Admin | Delete backup |

### Virus Scanner
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/virusscanner/status` | Admin | ClamAV version & defs status |
| `POST` | `/api/virusscanner/scan` | Admin | Start scan `{ target, path? }` |
| `GET` | `/api/virusscanner/scan/:id` | Admin | Scan progress |
| `GET` | `/api/virusscanner/scan/:id/results` | Admin | Scan results |
| `POST` | `/api/virusscanner/scan/:id/abort` | Admin | Abort scan |
| `POST` | `/api/virusscanner/scan/:id/quarantine` | Admin | Quarantine infected files |
| `GET` | `/api/virusscanner/quarantine` | Admin | List quarantined |
| `POST` | `/api/virusscanner/quarantine/:qid/restore` | Admin | Restore file |
| `DELETE` | `/api/virusscanner/quarantine/:qid` | Admin | Delete quarantined file |
| `POST` | `/api/virusscanner/update-defs` | Admin | Update virus definitions |

### MIME Types
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/mimetypes/system` | Yes | System MIME types grouped by category |
| `GET` | `/api/mimetypes` | Yes | User-defined MIME types |
| `POST` | `/api/mimetypes` | Yes | Create user MIME type |
| `PUT` | `/api/mimetypes/:id` | Yes | Update user MIME type |
| `DELETE` | `/api/mimetypes/:id` | Yes | Delete user MIME type |

### Service Manager
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/services` | Yes | List all systemd services |
| `POST` | `/api/services/:name/:action` | Yes | start/stop/restart service |
| `GET` | `/api/services/:name/status` | Yes | Service status detail |

### Process Manager
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/processes` | Yes | List top processes by CPU |
| `POST` | `/api/processes/kill/:pid` | Yes | Kill a process |

### Log Viewer
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/logs` | Yes | List log files |
| `GET` | `/api/logs/read/:file` | Yes | Read log file |
| `GET` | `/api/logs/search/:file?q=` | Yes | Search in log file |

### Cron Jobs
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/cron/owners` | Yes | Users with crontabs |
| `GET` | `/api/cron/:owner` | Yes | List user's cron jobs |
| `POST` | `/api/cron/:owner` | Yes | Add cron job |
| `PUT` | `/api/cron/:owner/:index` | Yes | Update cron job |
| `DELETE` | `/api/cron/:owner/:index` | Yes | Delete cron job |

### Firewall
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/firewall` | Yes | List iptables rules by chain |
| `POST` | `/api/firewall/rule` | Yes | Add rule |
| `DELETE` | `/api/firewall/rule/:chain/:num` | Yes | Delete rule |
| `POST` | `/api/firewall/save` | Yes | Persist rules |

### SSL Certificates
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/ssl` | Yes | List certificates |
| `POST` | `/api/ssl/issue` | Yes | Issue new certificate |
| `POST` | `/api/ssl/renew/:domain` | Yes | Renew certificate |

### PHP-FPM
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/phpfpm` | Yes | List PHP-FPM pools |
| `GET` | `/api/phpfpm/status` | Yes | PHP-FPM service status |
| `POST` | `/api/phpfpm/restart` | Yes | Restart PHP-FPM |

### System Updates
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/updates` | Yes | Check for updates |
| `POST` | `/api/updates/apply` | Yes | Apply all updates |

### Audit Trail
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/audit` | Admin | Query audit logs |
| `GET` | `/api/audit/actions` | Admin | List distinct action types |
| `DELETE` | `/api/audit/clear` | Admin | Clear all logs |

### Notifications
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/notifications` | Yes | List notifications |
| `POST` | `/api/notifications/read/:id` | Yes | Mark as read |
| `POST` | `/api/notifications/read-all` | Yes | Mark all read |
| `DELETE` | `/api/notifications` | Yes | Clear all |

---

## License

MIT
