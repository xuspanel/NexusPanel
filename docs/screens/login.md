# Login Screen

Authentication entry point with standard login and two-factor authentication flow.

---

## Overview

The login screen is the first thing users see. It's a centered card with username/password fields, optional TOTP verification, and the NexusPanel branding.

---

## Layout

```
+------------------------------------------+
|                                          |
|              ⚡ NexusPanel               |
|           VPS Control Center             |
|                                          |
|    +----------------------------------+  |
|    |  👤  Username                   |  |
|    +----------------------------------+  |
|    |  🔒  Password                   |  |
|    +----------------------------------+  |
|    |                                  |  |
|    |         [ Sign In ]              |  |
|    +----------------------------------+  |
|                                          |
+------------------------------------------+
```

---

## Two-Factor Flow

When 2FA is enabled, the login form transitions to a TOTP code input:

```
+------------------------------------------+
|              ⚡ NexusPanel               |
|                                          |
|    +----------------------------------+  |
|    |  🔑  Enter 2FA Code             |  |
|    +----------------------------------+  |
|    |                                  |  |
|    |         [ Verify ]               |  |
|    +----------------------------------+  |
|    |        Back to Login             |  |
+------------------------------------------+
```

---

## Auth Flow

1. User enters username + password
2. `POST /api/auth/login` is called
3. If 2FA is **not** enabled → session cookie set → redirect to dashboard
4. If 2FA **is** enabled → temp token returned → show TOTP input
5. User enters 6-digit TOTP code
6. `POST /api/auth/login/2fa` is called with temp token + code
7. Session cookie set → redirect to dashboard

---

## State Management

| State | Description |
|-------|-------------|
| Initial | Login form visible |
| Loading | Button shows spinner, inputs disabled |
| 2FA Required | Login form hidden, TOTP form shown |
| Error | Error message displayed in red banner |
| Success | Redirect to dashboard |

---

## Event Delegation

Login form uses direct event binding (not delegation, since it's not inside a dynamic view):

- `#loginForm` submit handler
- `#login2FAForm` submit handler (2FA step)

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.login-page` | Full-screen login container |
| `.login-container` | Centered wrapper |
| `.login-card` | White/dark card |
| `.login-logo` | Logo + title section |
| `.login-error` | Error message banner |
| `.input-group` | Label + input wrapper |
| `.input-wrapper` | Icon + input container |

---

## API Calls

| Method | Endpoint | When |
|--------|----------|------|
| `POST` | `/api/auth/login` | Login button click |
| `POST` | `/api/auth/login/2fa` | 2FA verify button click |

---

*Part of [NexusPanel Documentation](../README.md)*
