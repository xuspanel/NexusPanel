# Cron Jobs Screen

Per-user crontab editor with expression validation, presets, and cron.d management.

---

## Layout

```
+------------------------------------------------------------------+
|  Cron Jobs   Owner: [root ▼]   [Add Job]   [cron.d Files]       |
+------------------------------------------------------------------+
|  Stats: Total: 5  Active: 4  Disabled: 1  Owners: 12            |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ ☐  Schedule     Command              Next Run     Actions   │|
|  │ ☐  0 2 * * *    /opt/backup.sh       Jul 29 02:00  [⋯]     │|
|  │ ☐  @daily       /opt/cleanup.sh      Jul 29 00:00  [⋯]     │|
|  │ ☐  */5 * * * *  /opt/monitor.sh      Jul 28 12:05  [⋯]     │|
|  │ ☐  0 0 * * 0    /opt/report.sh       Jul 31 00:00  [⋯]     │|
|  │ ☐  #disabled    /opt/old-task.sh     -            [⋯]     │|
|  └──────────────────────────────────────────────────────────────┘|
+------------------------------------------------------------------+
```

---

## Features

| Feature | Description |
|---------|-------------|
| Per-User Crontab | Select owner from dropdown |
| Cron.d Files | Manage /etc/cron.d system files |
| Expression Validation | 5-field cron validation |
| Human Description | "Daily at 02:00", "Every 5 minutes" |
| Next Run Time | Computed from current time |
| Enable/Disable | Toggle by commenting/uncommenting |
| Quick Presets | One-click minute/hourly/daily/weekly/monthly |
| Frequency Colors | Color-coded schedule badges |

---

## Schedule Frequency Colors

| Frequency | Color |
|-----------|-------|
| Every minute | Red |
| Every N minutes | Orange |
| Hourly | Blue |
| Daily | Green |
| Weekly | Purple |
| Monthly | Yellow |
| Yearly | Cyan |
| @reboot | Pink |

---

## Modals

- Add/Edit Job (schedule, command, shorthand dropdown)
- Cron.d Editor (file content editor)
- Delete Confirmation

---

## Event Delegation

Buttons use `data-cron-action` attributes.

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/cron/owners` | List owners |
| `GET` | `/api/cron/:owner` | List jobs |
| `POST` | `/api/cron/:owner` | Add job |
| `PUT` | `/api/cron/:owner/:idx` | Edit job |
| `DELETE` | `/api/cron/:owner/:idx` | Delete job |
| `PUT` | `/api/cron/:owner/:idx/toggle` | Toggle job |
| `GET` | `/api/cron/describe` | Describe schedule |

---

*Part of [NexusPanel Documentation](../README.md)*
