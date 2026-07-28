# Security Model

NexusPanel implements defense-in-depth security across multiple layers: HTTP headers, rate limiting, input validation, audit logging, and secure coding practices.

---

## HTTP Security Headers

NexusPanel uses [Helmet](https://helmetjs.github.io/) to set security-related HTTP headers on every response.

### Content Security Policy (CSP)

```
default-src 'self'
script-src 'self' 'unsafe-inline' cdn.jsdelivr.net cdnjs.cloudflare.com
style-src 'self' 'unsafe-inline' cdn.jsdelivr.net cdnjs.cloudflare.com
img-src 'self' data: blob:
font-src 'self' cdnjs.cloudflare.com
connect-src 'self'
frame-ancestors 'none'
base-uri 'self'
form-action 'self'
```

**Allowed CDN domains:**
- `cdn.jsdelivr.net` — Chart.js
- `cdnjs.cloudflare.com` — Ace Editor

### Other Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Force HTTPS for 1 year |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME type sniffing |
| `X-XSS-Protection` | `0` | Disable legacy XSS filter (CSP is preferred) |
| `Referrer-Policy` | `no-referrer` | Don't send referrer to external sites |
| `Permissions-Policy` | Camera, microphone, geolocation disabled | Restrict browser features |

---

## Rate Limiting

NexusPanel uses [express-rate-limit](https://express-rate-limit.mintlify.app/) with two separate limiters.

### API Rate Limiter

```
Window:   60,000ms (1 minute)
Max:      120 requests per window per IP
Key:      IP address (req.ip)
Headers:  X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
```

Applied to: All `/api/*` routes.

### Login Rate Limiter

```
Window:   900,000ms (15 minutes)
Max:      10 requests per window per IP
Key:      IP address (req.ip)
```

Applied to: `POST /api/auth/login` and `POST /api/auth/login/2fa`.

### Rate Limit Response

```json
{
  "error": "Too many requests, please try again later."
}
```

HTTP Status: `429 Too Many Requests`

---

## XSS Prevention

### Event Delegation Pattern

NexusPanel **never** uses inline `onclick` handlers or `innerHTML` with user-controlled content. All click handlers use the event delegation pattern with `data-*-action` attributes.

**Correct (used in NexusPanel):**
```html
<button data-fw-action="add-rule">Add Rule</button>

<script>
  document.querySelector('#viewFirewall').addEventListener('click', (e) => {
    const action = e.target.closest('[data-fw-action]')?.dataset.fwAction;
    if (action === 'add-rule') { /* ... */ }
  });
</script>
```

**Never used:**
```html
<!-- XSS VULNERABILITY — never used in NexusPanel -->
<button onclick="addRule()">Add Rule</button>
```

### Module-Specific Prefixes

Each module uses its own `data-*-action` prefix to avoid conflicts:

| Module | Prefix | Example |
|--------|--------|---------|
| Dashboard | `data-dash-action` | `data-dash-action="reboot"` |
| File Manager | `data-fm-action` | `data-fm-action="upload"` |
| Docker | `data-docker-action` | `data-docker-action="start"` |
| Firewall | `data-fw-action` | `data-fw-action="add-rule"` |
| Cron | `data-cron-action` | `data-cron-action="add"` |
| SSL | `data-ssl-action` | `data-ssl-action="issue"` |
| PHP-FPM | `data-fpm-action` | `data-fpm-action="restart"` |
| Settings | `data-settings-action` | `data-settings-action="save"` |

### Sanitization

The `public/js/sanitize.js` module provides input sanitization utilities used across the frontend.

---

## Audit Logging

Every mutating request (`POST`, `PUT`, `DELETE`) is automatically logged by the audit middleware before the response is sent.

### Log Entry Format

```json
{
  "id": "a_1690000000000_abc12345",
  "timestamp": "2026-07-28T12:00:00.000Z",
  "user": "admin",
  "role": "admin",
  "ip": "192.168.1.100",
  "action": "firewall.addRule",
  "method": "POST",
  "path": "/api/firewall/rule",
  "details": {
    "chain": "INPUT",
    "rule": "-p tcp --dport 8080 -j ACCEPT"
  }
}
```

### Audit Entry Fields

| Field | Description |
|-------|-------------|
| `id` | Unique identifier: `a_<timestamp>_<8-hex-chars>` |
| `timestamp` | ISO-8601 timestamp |
| `user` | Username or `system` |
| `role` | User role or `system` |
| `ip` | Client IP address |
| `action` | Module.action format (e.g., `file.create`, `firewall.addRule`) |
| `method` | HTTP method or `SYSTEM` |
| `path` | Request URL path |
| `details` | Action-specific context object or `null` |

### Storage

- **File**: `data/audit.json`
- **Format**: JSON array
- **Max entries**: 10,000 (oldest trimmed when exceeded)
- **Flush interval**: 5 seconds (buffered writes)
- **Shutdown hooks**: Flush on `process.exit`, `SIGINT`, `SIGTERM`
- **Clear backup**: When cleared, existing log is backed up to `data/audit-backup-<timestamp>.json`

### Querying

```
GET /api/audit?user=admin&action=firewall.*&startDate=2026-07-01&endDate=2026-07-31&limit=100&offset=0
```

Supports filtering by: `user`, `action`, `search` (full-text across action/path/user/details), `startDate`, `endDate`, with pagination.

---

## HTTPS & TLS Termination

NexusPanel itself does **not** handle TLS. It binds to `127.0.0.1:3443` (HTTP only). TLS is terminated by a reverse proxy.

### Recommended nginx Configuration

```nginx
server {
    listen 443 ssl;
    server_name panel.example.com;

    ssl_certificate     /etc/letsencrypt/live/panel.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/panel.example.com/privkey.pem;

    # Modern TLS only
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:...;
    ssl_prefer_server_ciphers on;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

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

### Trusted Proxies

If NexusPanel is behind a reverse proxy, set `trust proxy` in Express to correctly read client IPs:

```javascript
app.set('trust proxy', true);
```

This ensures `req.ip` reflects the real client IP from `X-Forwarded-For` rather than the proxy's IP.

---

## Input Validation

### Backend Validation

- **Route parameters**: Express 5 validates route params automatically
- **Request body**: Services validate required fields before processing
- **File paths**: File Manager restricts access to allowed directories
- **SQL queries**: Database module uses parameterized queries to prevent injection
- **Cron expressions**: 5-field validation with range checks (0-59, 0-23, 1-31, 1-12, 0-7)
- **Domain names**: Regex validation (`/^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/`)
- **Email addresses**: Standard email format validation
- **IP addresses/CIDR**: Regex validation for firewall rules and settings

### Frontend Validation

- Form fields validate before submission
- Search inputs use 250ms debounce to prevent excessive API calls
- File upload size limits enforced by multer

---

## Data File Security

### File Permissions

- `.env` file: `chmod 600` (owner-only read/write)
- `data/` directory: Created with restricted permissions
- Lock files: Created with `0o600` (owner-only)

### Secret Storage

| Secret | Storage Location | Protection |
|--------|-----------------|------------|
| JWT_SECRET | `.env` file | Not committed to git |
| ADMIN_PASS | `.env` file | Bcrypt-hashed on first run |
| LICENSE_SECRET | `.env` file | Not committed to git |
| DB_PASSWORD | `.env` file | Not committed to git |
| 2FA secrets | `data/users.json` | Stored per-user |
| API token secrets | `data/tokens.json` | Bcrypt-hashed |
| Panel API secrets | `data/api-tokens.json` | Plaintext (local access only) |

### Gitignore

The following are excluded from version control:

```
.env
data/
node_modules/
*.log
```

---

## WebSocket Security

### Authentication

WebSocket connections are authenticated **during the HTTP upgrade handshake**, before the WebSocket connection is established:

1. Parse the `Cookie` header from the upgrade request
2. Extract the `token` cookie
3. Verify via `jwt.verify(token, JWT_SECRET)`
4. If invalid → destroy the socket with HTTP 401
5. If valid → proceed with `wss.handleUpgrade()`

### Connection Isolation

Each WebSocket connection maintains its own `panes` Map. When a connection closes, **all** panes for that connection are killed with `SIGHUP`. This prevents orphaned PTY processes.

---

## Process Security

### Environment Sanitization

Terminal PTY sessions use a whitelist of safe environment variables:

```
HOME, USER, LOGNAME, SHELL, TERM, PATH, LANG, LC_ALL,
EDITOR, PAGER, DISPLAY, XAUTHORITY, HOSTNAME, HOST, TZ,
PWD, OLDPWD
```

`TERM` is always set to `xterm-256color`. `PATH` is always included.

### Synchronous Command Execution

System commands are executed via `runSafeSync()` which:

1. Uses `execSync()` with a configurable timeout (default: 30 seconds)
2. Wraps execution in try/catch to prevent unhandled exceptions
3. Returns structured `{ stdout, stderr, success, error }` objects
4. Prevents server hangs from slow or hung system commands

---

## Security Checklist

For production deployments:

- [ ] `JWT_SECRET` is a strong random string (32+ hex chars)
- [ ] `ADMIN_PASS` is strong (12+ characters, mixed case, numbers, symbols)
- [ ] `.env` file has `chmod 600` permissions
- [ ] HTTPS is configured via reverse proxy
- [ ] Server is not directly exposed to the internet (localhost-only bind)
- [ ] Firewall restricts access to SSH and HTTPS ports only
- [ ] Regular system updates are applied
- [ ] ClamAV definitions are kept up to date
- [ ] SSL certificates auto-renew via certbot
- [ ] Audit log is reviewed periodically
- [ ] Backup retention policies are configured
- [ ] 2FA is enabled for all admin accounts

---

*Part of [NexusPanel Documentation](../README.md)*
