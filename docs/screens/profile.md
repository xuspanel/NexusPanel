# Profile Screen

User profile management with avatar, password, 2FA, sessions, and activity log.

---

## Layout

```
+------------------------------------------------------------------+
|  My Profile                                                       |
+------------------------------------------------------------------+
|  Profile │ Security │ Sessions │ Activity                         |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │         ┌──────────┐                                        │|
|  │         │  Avatar  │   Administrator                        │|
|  │         │   (📷)   │   admin@example.com                    │|
|  │         └──────────┘                                        │|
|  │                                                              │|
|  │ Display Name: [Administrator_______________]                │|
|  │ Email: [admin@example.com_________________]                 │|
|  │                                                              │|
|  │ [Update Profile]                                             │|
|  └──────────────────────────────────────────────────────────────┘|
+------------------------------------------------------------------+
```

---

## Tabs

| Tab | Content |
|-----|---------|
| Profile | Avatar, display name, email |
| Security | Password change, 2FA setup/disable |
| Sessions | Active session management |
| Activity | Recent activity log |

---

## Features

### Profile Tab

| Feature | Description |
|---------|-------------|
| Avatar Upload | Base64 image, max 512KB |
| Avatar Remove | Delete avatar |
| Display Name | Update display name |
| Email | Change email address |

### Security Tab

| Feature | Description |
|---------|-------------|
| Change Password | Current + new password |
| 2FA Setup | QR code + TOTP verification |
| 2FA Disable | Requires current password |

### Sessions Tab

| Feature | Description |
|---------|-------------|
| Session List | IP, user agent, login time |
| Current Session | Highlighted indicator |
| Revoke Session | Kill individual session |

### Activity Tab

| Feature | Description |
|---------|-------------|
| Activity Log | Recent actions with timestamps |
| Action Types | auth.login, file.upload, etc. |

---

## 2FA Setup Flow

```
1. Click "Enable 2FA"
2. QR code displayed
3. Scan with authenticator app
4. Enter 6-digit code to verify
5. 2FA enabled
```

---

## Event Delegation

Buttons use `data-profile-action` attributes. Events bind to `#viewProfile` (not `#profileContent`) because modals are siblings outside the content container.

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.profile-avatar` | Avatar container |
| `.profile-avatar-upload` | Upload overlay |
| `.profile-2fa` | 2FA section |
| `.profile-qr-code` | QR code image |
| `.profile-sessions` | Sessions list |
| `.profile-activity` | Activity log |

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/profile` | Get profile |
| `PUT` | `/api/profile/password` | Change password |
| `PUT` | `/api/profile/email` | Change email |
| `PUT` | `/api/profile/display-name` | Change name |
| `POST` | `/api/profile/avatar` | Upload avatar |
| `DELETE` | `/api/profile/avatar` | Remove avatar |
| `POST` | `/api/profile/2fa/setup` | Init 2FA |
| `POST` | `/api/profile/2fa/verify` | Verify 2FA |
| `POST` | `/api/profile/2fa/disable` | Disable 2FA |
| `GET` | `/api/profile/sessions` | List sessions |
| `DELETE` | `/api/profile/sessions/:id` | Revoke session |
| `GET` | `/api/profile/activity` | Activity log |

---

*Part of [NexusPanel Documentation](../README.md)*
