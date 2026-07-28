# Users API

System user management with bulk operations.

All endpoints are prefixed with `/api/users`. Admin only.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/users/list` | List system users |
| `GET` | `/users/meta/options` | Shells and groups metadata |
| `GET` | `/users/:user` | Get user detail |
| `POST` | `/users/create` | Create user |
| `PUT` | `/users/:user` | Update user |
| `DELETE` | `/users/:user` | Delete user |
| `POST` | `/users/bulk` | Bulk operations |

---

## Request/Response

### GET /users/list

```json
{
  "users": [
    {
      "username": "www-data",
      "uid": 33,
      "gid": 33,
      "shell": "/usr/sbin/nologin",
      "home": "/var/www",
      "groups": ["www-data"]
    }
  ],
  "total": 25
}
```

### POST /users/create

```json
{
  "username": "deploy",
  "password": "securepass",
  "shell": "/bin/bash",
  "home": "/home/deploy",
  "groups": ["wheel"]
}
```

### POST /users/bulk

```json
{
  "action": "lock",
  "usernames": ["user1", "user2"]
}
```

**Actions:** `lock`, `unlock`, `delete`

### GET /users/meta/options

```json
{
  "shells": ["/bin/bash", "/bin/sh", "/usr/sbin/nologin", ...],
  "groups": ["root", "wheel", "www-data", ...]
}
```

---

*Part of [NexusPanel API Reference](../README.md)*
