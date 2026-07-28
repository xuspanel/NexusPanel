# Notifications API

In-app notification management with unread badge.

All endpoints are prefixed with `/api/notifications`. Auth required.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/notifications` | List notifications |
| `POST` | `/notifications/read/:id` | Mark as read |
| `POST` | `/notifications/read-all` | Mark all as read |
| `DELETE` | `/notifications` | Clear all |

---

## Request/Response

### GET /notifications

**Params:** `unread` (optional boolean filter)

```json
{
  "notifications": [
    {
      "id": "n_1690000000000",
      "type": "info",
      "title": "Backup Complete",
      "message": "System backup completed successfully",
      "timestamp": "2026-07-28T12:00:00Z",
      "read": false
    }
  ],
  "unreadCount": 3,
  "total": 25
}
```

### Notification Types

| Type | Description |
|------|-------------|
| `info` | General information |
| `error` | Error occurred |
| `warning` | Warning message |
| `success` | Operation succeeded |

### Storage

- File: `data/notifications.json`
- Max entries: 500 (oldest trimmed from front)
- Newest-first ordering

---

*Part of [NexusPanel API Reference](../README.md)*
