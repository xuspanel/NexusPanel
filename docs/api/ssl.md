# SSL API

Let's Encrypt certificate management via certbot.

All endpoints are prefixed with `/api/ssl`. Admin only.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/ssl` | List all certificates |
| `GET` | `/ssl/:name` | Certificate details |
| `GET` | `/ssl/:name/config` | nginx SSL config |
| `GET` | `/ssl/search` | Search certificates |
| `POST` | `/ssl/issue` | Issue new certificate |
| `POST` | `/ssl/renew/:domain` | Renew certificate |
| `POST` | `/ssl/renew-all` | Renew all certificates |
| `POST` | `/ssl/revoke/:domain` | Revoke certificate |
| `DELETE` | `/ssl/:domain` | Remove certificate files |
| `GET` | `/ssl/auto-renew` | Auto-renewal status |
| `POST` | `/ssl/dry-run` | Test renewal (dry run) |
| `GET` | `/ssl/nginx-options` | nginx SSL directives |

---

## Request/Response

### GET /ssl

```json
{
  "certificates": [
    {
      "name": "example.com",
      "domain": "example.com",
      "expiryDate": "2026-10-26T12:00:00Z",
      "daysLeft": 90,
      "status": "valid",
      "keyType": "RSA",
      "serialNumber": "abc123..."
    }
  ],
  "stats": { "total": 32, "expiringSoon": 3, "expired": 0, "ecdsa": 12, "rsa": 20 }
}
```

### POST /ssl/issue

```json
{
  "domain": "new.example.com",
  "email": "admin@example.com",
  "staging": false
}
```

### POST /ssl/renew-all

```json
{
  "summary": {
    "renewed": 28,
    "failed": 2,
    "skipped": 2
  }
}
```

### GET /ssl/auto-renew

```json
{
  "timerActive": true,
  "lastRun": "2026-07-28T03:00:00Z",
  "nextRun": "2026-07-29T03:00:00Z"
}
```

---

*Part of [NexusPanel API Reference](../README.md)*
