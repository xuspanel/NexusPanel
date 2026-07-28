# Backups Screen

Full/selected backup management with real-time progress, scheduling, and archive download.

---

## Layout

```
+------------------------------------------------------------------+
|  Backup Wizard   [Start Backup]   [Schedules]                    |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ Targets:  System ✓  Databases ✓  Web Files ✓               │|
|  │ Type:     [Full ▼]                                          │|
|  │                                                              │|
|  │ ─── Active Backup ────────────────────────────────────────  │|
|  │ Progress: [████████████░░░░░░░░] 65%   ETA: 24s            │|
|  │ Current: /var/www/html/app.js                                │|
|  │ Files: 273/420   Speed: 12.5 MB/s                           │|
|  └──────────────────────────────────────────────────────────────┘|
|                                                                  |
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ Previous Backups                                            │|
|  │ 📦 2026-07-28_02-00  full    234 MB  420 files  [↓] [🗑]  │|
|  │ 📦 2026-07-27_02-00  full    231 MB  418 files  [↓] [🗑]  │|
|  │ 📦 2026-07-26_02-00  full    228 MB  415 files  [↓] [🗑]  │|
|  └──────────────────────────────────────────────────────────────┘|
+------------------------------------------------------------------+
```

---

## Features

| Feature | Description |
|---------|-------------|
| Backup Targets | System, Databases, Web Files |
| Real-time Progress | Percentage, ETA, current file, speed |
| Survives Browser Close | Server-side execution |
| Download | ZIP download of backup archive |
| Delete | Remove old backups |
| Schedules | Automated recurring backups |
| Retention | Auto-delete backups older than N days |

---

## Backup Types

| Type | Description |
|------|-------------|
| Full | All targets (system + databases + web files) |
| Selected | Choose specific targets |

---

## Schedule Management

| Action | Description |
|--------|-------------|
| Create Schedule | Cron expression, targets, retention |
| Toggle | Enable/disable schedule |
| Delete | Remove schedule |

---

## Event Delegation

Buttons use `data-backup-action` attributes.

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.backup-targets` | Target selection checkboxes |
| `.backup-progress` | Progress bar container |
| `.backup-progress-bar` | Animated progress bar |
| `.backup-list` | Previous backups list |
| `.backup-card` | Individual backup entry |

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/backups/defs` | Target definitions |
| `POST` | `/api/backups/start` | Start backup |
| `GET` | `/api/backups/status/:task` | Progress |
| `GET` | `/api/backups/list` | List backups |
| `DELETE` | `/api/backups/:ts` | Delete backup |
| `GET` | `/api/backups/schedules` | List schedules |
| `POST` | `/api/backups/schedules` | Create schedule |

---

*Part of [NexusPanel Documentation](../README.md)*
