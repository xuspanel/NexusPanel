# Authentication & Authorization

NexusPanel uses a multi-layered authentication system combining JWT sessions, bcrypt password hashing, TOTP two-factor authentication, and role-based access control.

---

## Authentication Flow

### Standard Login

```
1. POST /api/auth/login
   Body: { username, password }
       │
2. Look up user in data/users.json
       │
3. Compare password via bcrypt.compare()
       │
4. If 2FA is enabled:
   → Return { requires2FA: true, tempToken: "..." }
   → Client shows TOTP input
   → POST /api/auth/login/2fa
     Body: { tempToken, token }
       │
5. If 2FA is NOT enabled:
   → Generate JWT with user payload
   → Set cookie: token=<jwt>; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
   → Return { success: true, user: { username, role, ... } }
       │
6. Audit log entry created
```

### Two-Factor Authentication (TOTP)

#### Setup Flow

```
1. POST /api/profile/2fa/setup
   → Generate TOTP secret via speakeasy.generateSecret()
   → Generate QR code via qrcode.toDataURL()
   → Store secret temporarily (returned to client)
   → Return { secret, qrCode }
       │
2. User scans QR code with authenticator app
       │
3. POST /api/profile/2fa/verify
   Body: { token }
   → Verify via speakeasy.totp.verify()
   → If valid: store secret in user profile (encrypted)
   → Return { success: true }
```

#### Login with 2FA

```
1. POST /api/auth/login
   → Validates credentials
   → If user has 2FA enabled:
     → Generate short-lived tempToken (JWT, 5-minute expiry)
     → Return { requires2FA: true, tempToken }
       │
2. POST /api/auth/login/2fa
   Body: { tempToken, token }
   → Verify tempToken JWT
   → Verify TOTP code against stored secret
   → If valid: issue full session JWT
   → Set cookie
   → Return { success: true, user }
```

#### Disable 2FA

```
POST /api/profile/2fa/disable
Body: { password }
→ Verify current password
→ Remove TOTP secret from user profile
→ Return { success: true }
```

---

## JWT Token Structure

### Payload

```json
{
  "username": "admin",
  "role": "admin",
  "iat": 1690000000,
  "exp": 1690604800
}
```

| Field | Description |
|-------|-------------|
| `username` | The authenticated user's username |
| `role` | User role — `admin` or `user` |
| `iat` | Issued-at timestamp |
| `exp` | Expiration timestamp (7 days from issuance) |

### Cookie Configuration

```
Name:     token
Value:    <JWT string>
HttpOnly: true          // Not accessible via JavaScript
Secure:   true          // Only sent over HTTPS (in production)
SameSite: Lax           // CSRF protection
Max-Age:  604800        // 7 days in seconds
Path:     /
```

### Token Verification

Every request to `/api/*` passes through the `authMiddleware` which:

1. Reads the `token` cookie from the request
2. If missing → returns `401 { error: "Authentication required" }`
3. Verifies via `jwt.verify(token, process.env.JWT_SECRET)`
4. If invalid/expired → returns `401 { error: "Invalid or expired token" }`
5. If valid → attaches decoded payload to `req.user`
6. Next middleware or route handler proceeds

---

## Role-Based Access Control

### Roles

| Role | Description |
|------|-------------|
| `admin` | Full access to all endpoints, system operations, user management |
| `user` | Limited access — can use File Manager, Terminal, view Dashboard |

### Middleware

#### `authMiddleware` (all authenticated users)

```javascript
// Applied to all /api/* routes
// Verifies JWT and attaches req.user
```

#### `adminOnly` (admin-only endpoints)

```javascript
// Applied to sensitive routes (POST/PUT/DELETE on most modules)
// Checks req.user.role === 'admin'
// Returns 403 if not admin
```

### Endpoint Auth Patterns

| Pattern | Examples |
|---------|---------|
| No auth required | `POST /api/auth/login`, `POST /api/auth/login/2fa` |
| Any authenticated user | `GET /api/system/stats`, `GET /api/files/list`, `POST /api/files/upload` |
| Admin only | `POST /api/users/create`, `DELETE /api/databases/:db`, `POST /api/firewall/rule` |
| Auth + ownership | `PUT /api/profile/password` (own password only), `GET /api/cron/:owner` (any user's crontab) |

---

## Password Hashing

NexusPanel uses **bcryptjs** with a cost factor of **10**.

### Hashing

```javascript
const bcrypt = require('bcryptjs');
const hash = await bcrypt.hash(password, 10);
```

### Verification

```javascript
const match = await bcrypt.compare(inputPassword, storedHash);
```

### Storage Format

Passwords are stored as bcrypt hashes in `data/users.json`:

```json
{
  "admin": {
    "username": "admin",
    "password": "$2a$10$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "role": "admin",
    "email": "admin@example.com",
    "displayName": "Administrator",
    "avatar": "data:image/png;base64,...",
    "twoFactorSecret": "JBSWY3DPEHPK3PXP",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "lastLogin": "2026-07-28T12:00:00.000Z"
  }
}
```

---

## API Token Authentication

In addition to cookie-based JWT sessions, NexusPanel supports **API tokens** for programmatic access.

### Token Format

```
Bearer nxs_<64-hex-chars>
```

### Token Types

| File | Prefix | Storage | Purpose |
|------|--------|---------|---------|
| `data/tokens.json` | `npt_` | Bearer auth (bcrypt hashed) | External API access |
| `data/api-tokens.json` | `nxs_` | Plaintext | Settings-managed tokens |

### Validation

1. Extract token from `Authorization: Bearer <token>` header
2. Look up token prefix in the tokens file
3. Verify full token against bcrypt hash
4. If valid → attach user role from token record
5. Update `lastUsed` timestamp

---

## Session Management

### Active Sessions

The profile module tracks active sessions:

```json
{
  "sessionId": "sess_<timestamp>_<random>",
  "username": "admin",
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "loginAt": "2026-07-28T12:00:00.000Z",
  "lastActivity": "2026-07-28T12:30:00.000Z"
}
```

### Session Revocation

- Individual session: `DELETE /api/profile/sessions/:id`
- All sessions: Change password (invalidates all existing tokens)

### Idle Timeout

Configurable via Settings → `idleTimeout` (default: 30 minutes). The frontend checks session validity periodically and prompts re-authentication if idle timeout is exceeded.

---

## Security Considerations

### Password Policy

- Minimum 8 characters
- Bcrypt cost factor 10
- Stored with salt automatically (bcrypt includes salt in hash)

### Brute Force Protection

- Login endpoint has a separate, stricter rate limiter
- Failed login attempts are logged to audit trail
- Account lockout after configurable failed attempts

### Token Security

- JWT secret must be set via `JWT_SECRET` environment variable
- Tokens are HTTP-only cookies (not accessible via JavaScript)
- Secure flag enabled in production (HTTPS only)
- SameSite=Lax prevents CSRF on mutation requests

### 2FA Recovery

If a user loses access to their TOTP device, an admin can:

1. Edit `data/users.json` directly
2. Remove the `twoFactorSecret` field
3. Restart the panel

This is a manual recovery process by design — there is no automated 2FA recovery.

---

*Part of [NexusPanel Documentation](../README.md)*
