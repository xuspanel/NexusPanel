# Domains API

nginx virtual host management, SSL certificate issuance, conflict-free port assignment, and configuration editing.

All endpoints are prefixed with `/api/domains`. Admin only.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/domains` | List all domains |
| `GET` | `/domains/:name` | Get domain detail |
| `POST` | `/domains/create` | Create domain |
| `PUT` | `/domains/:name` | Update domain |
| `DELETE` | `/domains/:name` | Delete domain |
| `GET` | `/domains/:name/nginx` | Get nginx config |
| `PUT` | `/domains/:name/nginx` | Save nginx config |
| `POST` | `/domains/:name/ssl` | Issue SSL for domain |
| `GET` | `/domains/parents` | List parent domains |
| `GET` | `/domains/ports/available` | Get next available port |
| `POST` | `/domains/bulk/delete` | Bulk delete domains |

---

## Request/Response

### POST /domains/create

Creates a domain or subdomain. Creates the document root (default `/var/www/[domain]`), a styled `index.html` landing page if none exists, writes `[domain].conf` to `/etc/nginx/conf.d/`, and issues a Let's Encrypt certificate when SSL is enabled.

```json
{
  "domain": "app.example.com",
  "type": "subdomain",
  "parentDomain": "example.com",
  "port": 0,
  "root": "",
  "ssl": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `domain` | string | Full domain or subdomain name |
| `type` | `domain` \| `subdomain` | Domain type |
| `parentDomain` | string | Required for subdomains — the associated parent domain (must exist) |
| `port` | number | Optional. If empty/0, a free port is auto-assigned (no conflicts). Verified free when provided. |
| `root` | string | Optional document root. Defaults to `/var/www/[domain]`. |
| `ssl` | boolean | Auto-issue a Let's Encrypt certificate (default `true`). |

### Response

```json
{
  "success": true,
  "domain": {
    "domain": "app.example.com",
    "type": "subdomain",
    "parentDomain": "example.com",
    "port": 443,
    "root": "/var/www/app.example.com",
    "sslEnabled": true,
    "sslError": ""
  }
}
```

### PUT /domains/:name

```json
{
  "port": 8443,
  "root": "/var/www/app.example.com",
  "sslEnabled": true
}
```

Changing the port to one already in use by another domain, vhost, or service returns a `400` error without touching any config.

### PUT /domains/:name/nginx

```json
{
  "content": "server { listen 80; server_name app.example.com; ... }"
}
```

---

*Part of [NexusPanel API Reference](../README.md)*
