# Updates API

System package updates and NexusPanel self-updates with live progress streaming.

All endpoints are prefixed with `/api/updates`. Admin only.

---

## System Packages

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/updates` | Check available updates |
| `POST` | `/updates/apply` | Apply all updates |
| `POST` | `/updates/apply/:name` | Apply single package |
| `GET` | `/updates/search` | Search packages |
| `GET` | `/updates/info/:name` | Package info |
| `GET` | `/updates/security` | Security advisories |
| `GET` | `/updates/history` | Update history |

## Panel Updates

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/updates/panel-check` | Check for panel updates |
| `POST` | `/updates/panel-apply` | Apply panel update (SSE stream) |
| `GET` | `/updates/changelog` | Changelog |

---

## Request/Response

### GET /updates

```json
{
  "updates": [
    { "name": "openssl", "current": "3.0.7", "available": "3.0.12", "security": true }
  ],
  "total": 5,
  "security": 2
}
```

### POST /updates/apply/:name

Response is streamed via Server-Sent Events (SSE):

```
data: {"type":"start","package":"openssl"}
data: {"type":"output","line":"Updating openssl-3.0.12..."}
data: {"type":"output","line":"Complete!"}
data: {"type":"done","success":true}
```

### GET /updates/panel-check

```json
{
  "currentVersion": "1.33.0",
  "latestVersion": "1.34.0",
  "updateAvailable": true,
  "changelog": "..."
}
```

### POST /updates/panel-apply

Also streams via SSE. Runs `update.sh` or `upgrade.sh` on the server.

---

*Part of [NexusPanel API Reference](../README.md)*
