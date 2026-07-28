# Settings API

Panel configuration, system information, health checks, API tokens, and maintenance actions.

All endpoints are prefixed with `/api/settings`. Admin only.

---

## Configuration

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/settings` | Get panel settings |
| `POST` | `/settings` | Save settings |

## System Information

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/settings/system-info` | System info |
| `GET` | `/settings/health` | Health check |

## API Tokens

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/settings/tokens` | List API tokens |
| `POST` | `/settings/tokens` | Create API token |
| `DELETE` | `/settings/tokens/:id` | Revoke token |

## Maintenance

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/settings/maintenance/clear-cache` | Clear cache |
| `POST` | `/settings/maintenance/rotate-logs` | Rotate logs |
| `POST` | `/settings/maintenance/restart-service` | Restart panel |

---

## Request/Response

### GET /settings

```json
{
  "panelName": "NexusPanel",
  "serverLocation": "Amsterdam, NL",
  "defaultPage": "dashboard",
  "sessionTimeout": 60,
  "idleTimeout": 30,
  "theme": "dark",
  "accentColor": "#10b981",
  "updateAlerts": true,
  "debugMode": false,
  "logRetentionDays": 30,
  "autoUpdate": false,
  "updateChannel": "stable"
}
```

### POST /settings

```json
{
  "panelName": "My Server",
  "serverLocation": "New York, US",
  "theme": "light"
}
```

### GET /settings/system-info

```json
{
  "uptime": "up 14 days, 3 hours",
  "memory": { "total": "4.00 GB", "used": "1.15 GB", "percent": 28.7 },
  "disk": { "total": "55.77 GB", "used": "11.50 GB", "percent": 20.6 },
  "nodeVersion": "v20.15.0",
  "phpVersion": "8.3.6",
  "nginxVersion": "1.24.0",
  "osName": "AlmaLinux 9.3",
  "cpuCores": 4,
  "loadAverage": "1.20 0.80 0.50",
  "hostname": "server01"
}
```

### GET /settings/health

```json
{
  "services": {
    "nginx": "active",
    "php-fpm": "active",
    "postgresql": "active",
    "vsftpd": "inactive",
    "clamav-daemon": "active",
    "firewalld": "active"
  },
  "disk": 20.6,
  "memory": 28.7
}
```

### POST /settings/tokens

```json
{
  "name": "External Integration",
  "scope": "read"
}
```

### Response

```json
{
  "id": "tok_1690000000000_abcdef1234567890",
  "name": "External Integration",
  "secret": "nxs_64hexchars...",
  "createdAt": "2026-07-28T12:00:00Z"
}
```

**Note:** The secret is only shown once at creation time.

---

*Part of [NexusPanel API Reference](../README.md)*
