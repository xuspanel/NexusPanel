# Authentication API

Login, two-factor authentication, logout, and session management endpoints.

---

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | No | Authenticate with username/password |
| `POST` | `/api/auth/login/2fa` | No | Complete 2FA login with TOTP code |
| `POST` | `/api/auth/logout` | Yes | Clear session cookie |
| `GET` | `/api/auth/me` | Yes | Get current user info |

---

## POST /api/auth/login

Authenticate a user. If 2FA is enabled, returns a temporary token instead of a session.

### Request

```json
{
  "username": "admin",
  "password": "secretpass"
}
```

### Response (no 2FA)

```json
{
  "success": true,
  "user": {
    "username": "admin",
    "role": "admin",
    "email": "admin@example.com",
    "displayName": "Administrator",
    "avatar": "data:image/png;base64,...",
    "twoFactorEnabled": false
  }
}
```

Sets cookie: `token=<jwt>; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`

### Response (2FA required)

```json
{
  "requires2FA": true,
  "tempToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Errors

| Status | Body | Cause |
|--------|------|-------|
| 400 | `{ "error": "Username and password required" }` | Missing fields |
| 401 | `{ "error": "Invalid credentials" }` | Wrong password |
| 429 | `{ "error": "Too many requests..." }` | Rate limit exceeded |

---

## POST /api/auth/login/2fa

Complete the 2FA step of login.

### Request

```json
{
  "tempToken": "eyJhbGciOiJIUzI1NiIs...",
  "token": "123456"
}
```

### Response

```json
{
  "success": true,
  "user": {
    "username": "admin",
    "role": "admin",
    "twoFactorEnabled": true
  }
}
```

### Errors

| Status | Body | Cause |
|--------|------|-------|
| 400 | `{ "error": "Temp token and token required" }` | Missing fields |
| 401 | `{ "error": "Invalid or expired temp token" }` | Bad/expired temp token |
| 401 | `{ "error": "Invalid 2FA token" }` | Wrong TOTP code |

---

## POST /api/auth/logout

Clear the session cookie.

### Response

```json
{ "success": true }
```

---

## GET /api/auth/me

Get the currently authenticated user's profile.

### Response

```json
{
  "username": "admin",
  "role": "admin",
  "email": "admin@example.com",
  "displayName": "Administrator",
  "avatar": "data:image/png;base64,...",
  "twoFactorEnabled": true,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "lastLogin": "2026-07-28T12:00:00.000Z"
}
```

### Errors

| Status | Body | Cause |
|--------|------|-------|
| 401 | `{ "error": "Authentication required" }` | No valid JWT cookie |

---

*Part of [NexusPanel API Reference](../README.md)*
