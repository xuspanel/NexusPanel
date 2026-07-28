# Domains API

nginx virtual host management, SSL certificate issuance, and configuration editing.

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

```json
{
  "domain": "app.example.com",
  "port": 3000,
  "enableSSL": true
}
```

### Response

```json
{
  "success": true,
  "domain": "app.example.com",
  "nginxConfig": "server { ... }"
}
```

### PUT /domains/:name/nginx

```json
{
  "content": "server { listen 80; server_name app.example.com; ... }"
}
```

---

*Part of [NexusPanel API Reference](../README.md)*
