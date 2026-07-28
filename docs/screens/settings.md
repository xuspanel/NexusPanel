# Settings Screen

Panel configuration center with API tokens, system info, health checks, and maintenance actions.

---

## Layout

```
+------------------------------------------------------------------+
|  Settings                                                         |
+------------------------------------------------------------------+
|  General │ Appearance │ Security │ Notifications │ Advanced       |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ Panel Name: [NexusPanel___________________]                 │|
|  │ Server Location: [Amsterdam, NL____________]                │|
|  │ Default Page: [Dashboard ▼]                                  │|
|  │ Session Timeout: [60] minutes                               │|
|  │ Idle Timeout: [30] minutes                                  │|
|  └──────────────────────────────────────────────────────────────┘|
|                                                                  |
|  [Save Settings]                                                 |
+------------------------------------------------------------------+
```

---

## Tabs

| Tab | Content |
|-----|---------|
| General | Panel name, location, defaults |
| Appearance | Theme, accent color, font size |
| Security | 2FA enforcement, IP whitelist |
| Notifications | Desktop, email, update alerts |
| Advanced | Debug mode, log retention, updates |

---

## Features

| Feature | Description |
|---------|-------------|
| Panel Config | All settings with validation |
| System Info | Uptime, memory, disk, versions |
| Health Check | Service status, resource usage |
| API Tokens | Create/revoke API tokens |
| Maintenance | Clear cache, rotate logs, restart |

---

## Settings Fields

| Field | Type | Default |
|-------|------|---------|
| `panelName` | String | "NexusPanel" |
| `serverLocation` | String | "" |
| `defaultPage` | Enum | "dashboard" |
| `sessionTimeout` | Number (1-1440) | 60 |
| `idleTimeout` | Number (5-480) | 30 |
| `language` | Enum | "en" |
| `timezone` | String | "UTC" |
| `theme` | Enum | "dark" |
| `accentColor` | Color | "#10b981" |
| `fontSize` | Enum | "medium" |
| `updateAlerts` | Boolean | true |
| `debugMode` | Boolean | false |
| `logRetentionDays` | Number (7-365) | 30 |

---

## Modals

- API Token Creation (name, scope)
- Token Secret Display (shown once)
- Maintenance Actions Confirmation

---

## Event Delegation

Buttons use `data-settings-action` attributes.

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.settings-tab-nav` | Tab navigation |
| `.settings-card` | Settings section card |
| `.settings-field` | Individual setting field |
| `.settings-toggle` | Toggle switch |
| `.settings-system-info` | System info grid |

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/settings` | Get settings |
| `POST` | `/api/settings` | Save settings |
| `GET` | `/api/settings/system-info` | System info |
| `GET` | `/api/settings/health` | Health check |
| `GET` | `/api/settings/tokens` | List tokens |
| `POST` | `/api/settings/tokens` | Create token |
| `DELETE` | `/api/settings/tokens/:id` | Revoke token |
| `POST` | `/api/settings/maintenance/clear-cache` | Clear cache |
| `POST` | `/api/settings/maintenance/restart-service` | Restart panel |

---

*Part of [NexusPanel Documentation](../README.md)*
