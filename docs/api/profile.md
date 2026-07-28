# Profile API

User profile management including password, email, display name, avatar, 2FA, sessions, and activity.

All endpoints are prefixed with `/api/profile`. Auth required.

---

## Profile Info

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/profile` | Get profile |
| `PUT` | `/profile/password` | Change password |
| `PUT` | `/profile/email` | Change email |
| `PUT` | `/profile/display-name` | Change display name |

## Avatar

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/profile/avatar` | Upload avatar (base64, max 512KB) |
| `DELETE` | `/profile/avatar` | Remove avatar |

## Two-Factor Authentication

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/profile/2fa/setup` | Initiate 2FA setup (returns QR) |
| `POST` | `/profile/2fa/verify` | Verify 2FA code |
| `POST` | `/profile/2fa/disable` | Disable 2FA |

## Sessions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/profile/sessions` | List active sessions |
| `DELETE` | `/profile/sessions/:id` | Revoke session |

## Activity

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/profile/activity` | Recent activity log |

---

## Request/Response

### POST /profile/2fa/setup

```json
// Response
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCode": "data:image/png;base64,..."
}
```

### POST /profile/2fa/verify

```json
{ "token": "123456" }
// Response
{ "success": true, "message": "2FA enabled" }
```

### PUT /profile/password

```json
{
  "currentPassword": "oldpass",
  "newPassword": "newpass"
}
```

### GET /profile/sessions

```json
{
  "sessions": [
    {
      "id": "sess_1690000000000_abc",
      "ip": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "loginAt": "2026-07-28T12:00:00Z",
      "lastActivity": "2026-07-28T12:30:00Z",
      "current": true
    }
  ]
}
```

### GET /profile/activity

```json
{
  "activity": [
    { "action": "auth.login", "timestamp": "2026-07-28T12:00:00Z", "ip": "192.168.1.100" },
    { "action": "file.upload", "timestamp": "2026-07-28T11:45:00Z", "ip": "192.168.1.100" }
  ]
}
```

---

## Event Delegation

Frontend uses `data-profile-action` attributes and binds to `#viewProfile` (not `#profileContent`) because modals are siblings outside the content container.

---

*Part of [NexusPanel API Reference](../README.md)*
