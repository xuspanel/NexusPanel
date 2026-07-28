# Search API

Global cross-module search across all NexusPanel features.

---

## Endpoint

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/search` | Yes | Search across all modules |

---

## Request

**Params:** `q` (search query)

```
GET /api/search?q=nginx
```

## Response

```json
{
  "results": [
    { "module": "domains", "title": "example.com", "description": "nginx server block", "url": "domains" },
    { "module": "services", "title": "nginx.service", "description": "active (running)", "url": "services" },
    { "module": "firewall", "title": "http", "description": "firewalld service: http", "url": "firewall" }
  ],
  "total": 3
}
```

### Modules Searched

| Module | What's Searched |
|--------|----------------|
| Domains | Domain names, nginx configs |
| Services | Service names, descriptions |
| Firewall | Zone names, services, ports |
| Files | File names (in current directory) |
| Databases | Database names, table names |
| Emails | Account names, domains |
| Docker | Container names, image names |
| FTP | Account names |
| MIME Types | Extension, MIME type strings |

---

*Part of [NexusPanel API Reference](../README.md)*
