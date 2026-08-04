# Data Storage

NexusPanel stores all persistent data as JSON files in the `data/` directory. There is no database requirement for the panel itself (PostgreSQL is optional, used only for the Database Manager module).

---

## Data File Inventory

| File | Format | Max Size | Locking | Atomic Write |
|------|--------|----------|---------|--------------|
| `data/users.json` | Object (keyed by username) | Unlimited | In-memory boolean (5s timeout) | Yes |
| `data/settings.json` | Object | Unlimited | None | Yes |
| `data/audit.json` | Array | 10,000 entries | None | No (buffered flush) |
| `data/notifications.json` | Array | 500 entries | None | No |
| `data/tokens.json` | Array | Unlimited | None | No |
| `data/api-tokens.json` | Array | Unlimited | None | Yes |
| `data/domains.json` | Object (keyed by domain) | Unlimited | In-memory boolean (5s timeout) | Yes |
| `data/apps.json` | Array | Unlimited | In-memory boolean (5s timeout) | Yes |
| `data/deployments.json` | Array | Unlimited | In-memory boolean (5s timeout) | Yes |
| `data/deploy_keys.json` | Array | Unlimited | In-memory boolean (5s timeout) | Yes |
| `data/deploy_env_vars.json` | Object | Unlimited | In-memory boolean (5s timeout) | Yes |
| `data/mime-types.json` | Object | Unlimited | None | Yes |
| `data/terminal-presets.json` | Array | Unlimited | None | No |
| `data/update-history.json` | Array | Unlimited | None | Yes |
| `data/panel-version-cache.json` | Object | Unlimited | None | Yes |
| `data/metrics/history.jsonl` | JSON Lines | Unlimited | None | Append-only |
| `data/filebin/` | Directory tree | Disk space | Per-file | N/A |
| `data/avatars/` | Image files | Unlimited | None | N/A |

---

## Atomic Write Pattern

Most services use the atomic write pattern to prevent file corruption:

```javascript
function saveData(data) {
  const tmpFile = DATA_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DATA_FILE);
}
```

On POSIX filesystems, `rename()` is an inode-level atomic operation. The target file is either the old complete version or the new complete version — never a half-written state.

### Variations

Some services append a PID or timestamp to the temp filename to avoid collisions:

```javascript
// Updates module
const tmpFile = HISTORY_PATH + '.tmp.' + process.pid;

// MIME types module
const tmpFile = DATA_FILE + '.tmp.' + Date.now();
```

---

## File Locking Strategies

### Strategy 1: In-Memory Boolean Lock

Used by: `users.js`, `domains.js`, `backups.js`, `virusscanner.js`

```javascript
let writeLock = false;
const LOCK_TIMEOUT = 5000;

function acquireLock() {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const wait = () => {
      if (!writeLock) { writeLock = true; return resolve(); }
      if (Date.now() - start > LOCK_TIMEOUT) return reject(new Error('Write lock timeout'));
      setTimeout(wait, 10);
    };
    wait();
  });
}

function releaseLock() { writeLock = false; }
```

- **Scope**: Process-level (single Node.js process)
- **Polling**: Every 10ms
- **Timeout**: 5 seconds
- **Safety net**: Some services add automatic lock release via `setTimeout`

### Strategy 2: Lock File on Disk

Used by: `cron.js`

```javascript
function acquireFileLock(filePath) {
  const lockFile = filePath + '.lock';
  if (fs.existsSync(lockFile)) {
    const content = fs.readFileSync(lockFile, 'utf8');
    const lockTime = parseInt(content);
    if (Date.now() - lockTime < CRON_LOCK_TIMEOUT) {
      throw new Error('File is locked, please retry');
    }
  }
  fs.writeFileSync(lockFile, String(Date.now()), { mode: 0o600 });
}

function releaseFileLock(filePath) {
  const lockFile = filePath + '.lock';
  try { fs.unlinkSync(lockFile); } catch {}
}
```

- **Scope**: Cross-process (any process can check the lock file)
- **Stale detection**: Locks older than timeout are overridden
- **Permissions**: `0o600` (owner-only read/write)

### Strategy 3: No Locking

Used by: `audit.js`, `notifications.js`, `settings.js`, `tokens.js`

These services perform read-modify-write cycles without any locking. They rely on the atomic write pattern to prevent partial writes, but concurrent modifications could cause data loss (last-writer-wins).

---

## Data File Formats

### users.json

```json
{
  "admin": {
    "username": "admin",
    "password": "$2a$10$...",
    "role": "admin",
    "email": "admin@example.com",
    "displayName": "Administrator",
    "avatar": "data:image/png;base64,...",
    "twoFactorSecret": "JBSWY3DPEHPK3PXP",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "lastLogin": "2026-07-28T12:00:00.000Z",
    "loginCount": 42
  }
}
```

### audit.json

```json
[
  {
    "id": "a_1690000000000_abc12345",
    "timestamp": "2026-07-28T12:00:00.000Z",
    "user": "admin",
    "role": "admin",
    "ip": "192.168.1.100",
    "action": "file.create",
    "method": "POST",
    "path": "/api/files/create",
    "details": { "path": "/var/www/html/index.html", "type": "file" }
  }
]
```

**Max entries**: 10,000 (oldest trimmed)
**Flush interval**: 5 seconds (buffered)
**Shutdown hooks**: `process.exit`, `SIGINT`, `SIGTERM`

### notifications.json

```json
[
  {
    "id": "n_1690000000000",
    "type": "info",
    "title": "Backup Complete",
    "message": "System backup completed successfully",
    "timestamp": "2026-07-28T12:00:00.000Z",
    "read": false
  }
]
```

**Max entries**: 500 (oldest trimmed from front)

### tokens.json (Bearer Auth)

```json
[
  {
    "id": "tk_1690000000000",
    "userId": "admin",
    "label": "CI/CD Pipeline",
    "scope": "admin",
    "hash": "$2a$8$...",
    "prefix": "npt_abc1234",
    "createdAt": "2026-07-28T12:00:00.000Z",
    "lastUsed": "2026-07-28T12:30:00.000Z"
  }
]
```

**Token format**: `npt_` + 48 hex chars (`crypto.randomBytes(24).toString('hex')`)
**Storage**: Bcrypt hash (cost 8)

### api-tokens.json (Settings Tokens)

```json
[
  {
    "id": "tok_1690000000000_abcdef1234567890",
    "name": "External Integration",
    "scope": "read",
    "secret": "nxs_64hexchars...",
    "createdAt": "2026-07-28T12:00:00.000Z",
    "revoked": false
  }
]
```

**Token format**: `nxs_` + 64 hex chars
**Storage**: Plaintext (local access only)

### settings.json

```json
{
  "panelName": "NexusPanel",
  "serverLocation": "Amsterdam, NL",
  "defaultPage": "dashboard",
  "sessionTimeout": 60,
  "idleTimeout": 30,
  "language": "en",
  "timezone": "UTC",
  "enable2FA": false,
  "loginNotifications": true,
  "ipWhitelist": [],
  "theme": "dark",
  "sidebarPosition": "left",
  "fontSize": "medium",
  "accentColor": "#10b981",
  "desktopNotifications": false,
  "updateAlerts": true,
  "emailNotifications": false,
  "notifyOn": {
    "updates": true,
    "security": true,
    "errors": true
  },
  "debugMode": false,
  "logRetentionDays": 30,
  "autoUpdate": false,
  "updateChannel": "stable",
  "lastUpdateCheck": null,
  "lastUpdateResult": null
}
```

On `load()`, the file is merged with defaults via spread: `{ ...DEFAULTS, ...data }`.

### domains.json

```json
{
  "example.com": {
    "domain": "example.com",
    "port": 3000,
    "ssl": true,
    "nginxConfig": "server { ... }",
    "createdAt": "2026-07-28T12:00:00.000Z"
  }
}
```

### metrics/history.jsonl

Each line is a JSON object representing a metrics snapshot:

```json
{"timestamp":"2026-07-28T12:00:00.000Z","cpu":45.2,"memory":{"used":1234567890,"total":4294967296,"percent":28.7},"disk":{"used":12345678901,"total":59874012345,"percent":20.6},"network":{"rx":123456789,"tx":987654321}}
```

---

## Data Directory Structure

```
data/
├── users.json                 # User accounts
├── settings.json              # Panel configuration
├── audit.json                 # Audit log
├── audit-backup-*.json        # Audit log backups (on clear)
├── notifications.json         # Notifications
├── tokens.json                # Bearer auth tokens
├── api-tokens.json            # Settings-managed API tokens
├── domains.json               # Domain/vhost config
├── apps.json                  # Installed applications
├── deployments.json           # Git deployment records
├── deploy_keys.json           # Encrypted SSH deploy keys
├── deploy_env_vars.json       # Encrypted deploy env vars
├── deploy/                    # Deployment logs (one .log per deploy)
├── mime-types.json            # Custom MIME types
├── terminal-presets.json      # Terminal command presets
├── update-history.json        # Update history
├── panel-version-cache.json   # Panel version check cache
├── metrics/
│   └── history.jsonl          # Metrics time series
├── filebin/                   # Trash/recycle bin
│   └── batch_<timestamp>/
│       ├── manifest.json      # Batch metadata
│       └── <files>            # Deleted files
└── avatars/                   # User avatar storage
    └── <username>.<ext>       # Avatar images
```

---

## Metrics Time Series

The metrics module appends snapshots to `data/metrics/history.jsonl` (JSON Lines format).

### Retention

- **Default**: 30 days
- **Configurable**: Via Settings → `logRetentionDays`
- **Cleanup**: Old entries are pruned on each metrics write

### Data Points

| Metric | Source | Resolution |
|--------|--------|------------|
| CPU usage | `/proc/stat` or `top` | Per sample |
| Memory usage | `free -b` | Per sample |
| Disk usage | `df -B1 /` | Per sample |
| Network I/O | `/proc/net/dev` | Per sample (delta) |

### Querying

```
GET /api/metrics/history?period=24h    # Last 24 hours
GET /api/metrics/history?period=7d     # Last 7 days
GET /api/metrics/history?period=30d    # Last 30 days
```

---

## File Bin (Trash)

Deleted files are moved to `data/filebin/` instead of being permanently deleted.

### Batch Structure

```
data/filebin/
└── batch_1690000000000/
    ├── manifest.json
    ├── file1.txt
    └── directory/
        └── file2.txt
```

### Manifest Format

```json
{
  "timestamp": "2026-07-28T12:00:00.000Z",
  "files": [
    {
      "originalPath": "/var/www/html/index.html",
      "binPath": "batch_1690000000000/index.html",
      "size": 1234,
      "isDirectory": false
    }
  ]
}
```

### Operations

| Operation | Description |
|-----------|-------------|
| Restore | Move files back to original paths |
| Permanent delete | Remove files from bin |
| Empty bin | Remove all batches |

---

## Backup Data

Backups are stored outside the `data/` directory (configurable path). Each backup includes:

### Backup Metadata

```json
{
  "timestamp": "2026-07-28_12-00-00",
  "type": "full",
  "status": "completed",
  "size": 123456789,
  "files": 42,
  "duration": 120,
  "targets": ["system", "databases", "webfiles"]
}
```

### Schedule Format

```json
{
  "id": "sched_<timestamp>",
  "name": "Daily System Backup",
  "type": "full",
  "schedule": "0 2 * * *",
  "retention": 7,
  "enabled": true,
  "targets": ["system", "databases"]
}
```

---

*Part of [NexusPanel Documentation](../README.md)*
