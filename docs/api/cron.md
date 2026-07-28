# Cron API

Per-user crontab management, /etc/cron.d files, and entry scheduling.

All endpoints are prefixed with `/api/cron`. Admin only.

---

## Owner & Crontab

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/cron/owners` | List cron owners |
| `GET` | `/cron/:owner` | List user's cron jobs |
| `POST` | `/cron/:owner` | Add cron job |
| `PUT` | `/cron/:owner/:idx` | Edit cron job |
| `DELETE` | `/cron/:owner/:idx` | Delete cron job |
| `PUT` | `/cron/:owner/:idx/toggle` | Enable/disable job |
| `GET` | `/cron/describe` | Human-readable description |

## /etc/cron.d

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/cron/cron-d` | List cron.d files |
| `GET` | `/cron/cron-d/:file` | Read cron.d file |
| `PUT` | `/cron/cron-d/:file` | Save cron.d file |
| `DELETE` | `/cron/cron-d/:file` | Delete cron.d file |

---

## Request/Response

### POST /cron/:owner

```json
{
  "schedule": "0 2 * * *",
  "command": "/opt/scripts/backup.sh",
  "shorthand": null
}
```

**Shorthand options:** `@reboot`, `@yearly`, `@monthly`, `@weekly`, `@daily`, `@hourly`

### GET /cron/:owner

```json
{
  "owner": "root",
  "entries": [
    {
      "index": 0,
      "schedule": "0 2 * * *",
      "command": "/opt/scripts/backup.sh",
      "enabled": true,
      "description": "Daily at 02:00",
      "nextRun": "2026-07-29T02:00:00Z",
      "shorthand": null
    }
  ],
  "stats": { "total": 5, "active": 4, "disabled": 1 }
}
```

### PUT /cron/:owner/:idx/toggle

Toggles enabled/disabled by commenting/uncommenting the entry.

---

*Part of [NexusPanel API Reference](../README.md)*
