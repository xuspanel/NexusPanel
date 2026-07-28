# Services API

systemd service management.

All endpoints are prefixed with `/api/services`. Admin only.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/services` | List all systemd services |
| `GET` | `/services/actions` | Available actions |
| `POST` | `/services/:name/:act` | Service action (start/stop/restart/enable/disable) |
| `POST` | `/services/bulk/:act` | Bulk service action |
| `GET` | `/services/:name/status` | Detailed service status |

---

## Response Formats

### GET /services

```json
{
  "services": [
    { "name": "nginx.service", "active": "active", "sub": "running", "description": "The nginx HTTP server" },
    { "name": "postgresql.service", "active": "active", "sub": "running", "description": "PostgreSQL database server" }
  ]
}
```

### GET /services/:name/status

```json
{
  "name": "nginx.service",
  "active": "active",
  "sub": "running",
  "pid": 1234,
  "memory": "5.2M",
  "uptime": "14d 3h",
  "description": "The nginx HTTP server"
}
```

---

*Part of [NexusPanel API Reference](../README.md)*
