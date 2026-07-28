# Audit API

Activity logging, filtering, export, and management.

All endpoints are prefixed with `/api/audit`. Admin only.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/audit` | List audit entries |
| `GET` | `/audit/actions` | Distinct action types |
| `GET` | `/audit/users` | Distinct users |
| `GET` | `/audit/stats` | Audit statistics |
| `GET` | `/audit/export` | Export full log (JSON) |
| `DELETE` | `/audit/clear` | Clear all entries |

---

## Request/Response

### GET /audit

**Params:** `user`, `action`, `search`, `startDate`, `endDate`, `limit` (max 500), `offset`

```json
{
  "entries": [
    {
      "id": "a_1690000000000_abc12345",
      "timestamp": "2026-07-28T12:00:00Z",
      "user": "admin",
      "role": "admin",
      "ip": "192.168.1.100",
      "action": "firewall.addRule",
      "method": "POST",
      "path": "/api/firewall/rule",
      "details": { "chain": "INPUT" }
    }
  ],
  "total": 4521,
  "limit": 50,
  "offset": 0
}
```

### GET /audit/stats

```json
{
  "total": 4521,
  "oldest": "2026-01-01T00:00:00Z",
  "newest": "2026-07-28T12:00:00Z",
  "actions": { "firewall.addRule": 120, "file.create": 85, ... },
  "users": { "admin": 4000, "system": 521 }
}
```

### GET /audit/actions

```json
{
  "actions": ["firewall.addRule", "file.create", "databases.create", ...]
}
```

### Storage

- File: `data/audit.json`
- Max entries: 10,000
- Flush interval: 5 seconds
- Backup on clear: `data/audit-backup-<timestamp>.json`

---

*Part of [NexusPanel API Reference](../README.md)*
