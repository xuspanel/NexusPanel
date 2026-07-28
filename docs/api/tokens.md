# Tokens API

Bearer authentication token management for programmatic API access.

All endpoints are prefixed with `/api/tokens`. Admin only.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/tokens` | List all tokens |
| `POST` | `/tokens` | Create new token |
| `DELETE` | `/tokens/:id` | Revoke token |

---

## Request/Response

### POST /tokens

```json
{
  "label": "CI/CD Pipeline",
  "scope": "admin"
}
```

### Response

```json
{
  "id": "tk_1690000000000",
  "label": "CI/CD Pipeline",
  "scope": "admin",
  "token": "npt_abc123def456...",
  "createdAt": "2026-07-28T12:00:00Z"
}
```

**Important:** The raw token is only shown once at creation time. Store it securely.

### GET /tokens

```json
{
  "tokens": [
    {
      "id": "tk_1690000000000",
      "label": "CI/CD Pipeline",
      "scope": "admin",
      "prefix": "npt_abc1234...",
      "createdAt": "2026-07-28T12:00:00Z",
      "lastUsed": "2026-07-28T12:30:00Z"
    }
  ]
}
```

### Token Format

- Prefix: `npt_` + 48 hex characters
- Storage: Bcrypt hash (cost 8) in `data/tokens.json`
- Usage: `Authorization: Bearer npt_...` header

---

*Part of [NexusPanel API Reference](../README.md)*
