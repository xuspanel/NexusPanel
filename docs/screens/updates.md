# System Updates Screen

OS package management and NexusPanel self-updates with live progress streaming.

---

## Layout

```
+------------------------------------------------------------------+
|  System Updates   Available: 5   Security: 2   [Check Updates]   |
+------------------------------------------------------------------+
|  System Packages │ Panel Update │ Security │ History              |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ ☐  openssl       3.0.7  →  3.0.12   ⚠️ Security            │|
|  │ ☐  nginx         1.24.0 →  1.24.1                          │|
|  │ ☐  postgresql-16 16.1   →  16.2                           │|
|  │ ☐  curl          7.76.1 →  8.5.0                           │|
|  │ ☐  vim-enhanced  8.2    →  9.0                             │|
|  └──────────────────────────────────────────────────────────────┘|
|                                                                  |
|  Selected: 2   [Apply Selected]   [Apply All]                    |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ Updating openssl...                                          │|
|  │ [████████████████░░░░░░░░░░] 65%                            │|
|  │ Output:                                                      │|
|  │ > Running transaction check                                  │|
|  > Transaction check succeeded.                                │|
|  └──────────────────────────────────────────────────────────────┘|
+------------------------------------------------------------------+
```

---

## Tabs

| Tab | Content |
|-----|---------|
| System Packages | Available OS updates |
| Panel Update | NexusPanel self-update |
| Security | Security-only advisories |
| History | Previous update history |

---

## Features

| Feature | Description |
|---------|-------------|
| Check Updates | Query dnf/apt for available updates |
| Security Filter | Show only security-relevant updates |
| Individual Apply | Update single package |
| Bulk Apply | Update all selected packages |
| Live Progress | SSE streaming of update output |
| Panel Self-Update | Check and apply NexusPanel updates |
| Update History | Previous updates log |
| Package Info | Detailed package information |

---

## Event Delegation

Buttons use `data-update-action` attributes.

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.update-summary-bar` | Stats badges |
| `.update-package-list` | Package list |
| `.update-progress` | Progress bar |
| `.update-output` | Command output stream |
| `.update-history` | History list |

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/updates` | Check updates |
| `POST` | `/api/updates/apply/:name` | Apply single |
| `POST` | `/api/updates/apply` | Apply all |
| `GET` | `/api/updates/panel-check` | Panel update check |
| `POST` | `/api/updates/panel-apply` | Apply panel update |
| `GET` | `/api/updates/security` | Security advisories |
| `GET` | `/api/updates/history` | Update history |

---

*Part of [NexusPanel Documentation](../README.md)*
