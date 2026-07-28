# Logs API

System and application log browsing, searching, streaming, and downloading.

All endpoints are prefixed with `/api/logs`. Admin only.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/logs` | List log files |
| `GET` | `/logs/categories` | Log categories |
| `GET` | `/logs/read/:file` | Read log content |
| `GET` | `/logs/tail/:file` | Tail log (last N lines) |
| `GET` | `/logs/search/:file` | Search in log |
| `POST` | `/logs/search-multi` | Multi-file search |
| `GET` | `/logs/stream/:file` | SSE live stream |
| `GET` | `/logs/download/:file` | Download log file |
| `GET` | `/logs/linecount/:file` | Count lines |

---

## Request/Response

### GET /logs

```json
{
  "files": [
    { "name": "nexuspanel.log", "size": 1234567, "modified": "2026-07-28T12:00:00Z", "category": "application" },
    { "name": "access.log", "size": 4567890, "modified": "2026-07-28T12:00:00Z", "category": "web" }
  ]
}
```

### GET /logs/tail/:file

**Params:** `lines` (default: 500)

Returns raw log text.

### GET /logs/search/:file

**Params:** `q` (query), `regex` (optional boolean)

```json
{
  "matches": [
    { "line": 42, "content": "2026-07-28 ERROR: Connection refused", "context": "..." }
  ],
  "total": 15
}
```

### GET /logs/stream/:file

Server-Sent Events (SSE) endpoint for live log following.

---

*Part of [NexusPanel API Reference](../README.md)*
