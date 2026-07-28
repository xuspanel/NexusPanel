# MIME Types API

System and custom MIME type management with lookup, import/export, and overlap detection.

All endpoints are prefixed with `/api/mimetypes`. Auth required (GET), Admin (POST/PUT/DELETE).

---

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/mimetypes/system` | Yes | System MIME types (2,148+) |
| `GET` | `/mimetypes` | Yes | User-defined types |
| `GET` | `/mimetypes/:id` | Yes | Get single type |
| `POST` | `/mimetypes` | Admin | Create type |
| `PUT` | `/mimetypes/:id` | Admin | Update type |
| `DELETE` | `/mimetypes/:id` | Admin | Delete type |
| `GET` | `/mimetypes/lookup/:ext` | Yes | Look up extension |
| `POST` | `/mimetypes/bulk/delete` | Admin | Bulk delete |
| `GET` | `/mimetypes/export` | Yes | Export all types |
| `POST` | `/mimetypes/import` | Admin | Import types |
| `POST` | `/mimetypes/overlap` | Yes | Check extension overlaps |

---

## Request/Response

### GET /mimetypes/system

```json
{
  "categories": { "application": 845, "text": 234, "image": 567, ... },
  "breakdown": { ".html": "text/html", ".css": "text/css", ... },
  "total": 2148,
  "colors": { "application": "#ef4444", "text": "#3b82f6", ... }
}
```

### POST /mimetypes

```json
{
  "extension": ".myapp",
  "mimeType": "application/x-myapp",
  "description": "My Custom Application"
}
```

---

*Part of [NexusPanel API Reference](../README.md)*
