# Virus Scanner Screen

ClamAV malware scanning with quarantine management and scan history.

---

## Layout

```
+------------------------------------------------------------------+
|  Virus Scanner   Definitions: Updated 2d ago   [Update Defs]     |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ Scan Target:  [Home ✓] [Mail] [FTP] [Web] [Custom: ___]    │|
|  │                                                              │|
|  │                    [ Start Scan ]                            │|
|  └──────────────────────────────────────────────────────────────┘|
|                                                                  |
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ Active Scan: scanning /var/www/html...                       │|
|  │ Progress: [██████████░░░░░░░░░░] 42%   Files: 1234          │|
|  │ Infected: 0   Speed: 45.2 MB/s                               │|
|  │                                              [Abort Scan]    │|
|  └──────────────────────────────────────────────────────────────┘|
+------------------------------------------------------------------+
|  Scan History │ Quarantine                                       |
+------------------------------------------------------------------+
|  📋 2026-07-28  home  4567 files  0 infected  [View]            |
|  📋 2026-07-27  web   2345 files  1 infected  [Quarantine]     |
+------------------------------------------------------------------+
```

---

## Features

| Feature | Description |
|---------|-------------|
| Scan Targets | Home, Mail, FTP, Web, Custom path |
| Live Progress | Files scanned, infected count, speed |
| Abort Scan | Stop running scan |
| Quarantine | Move infected files to quarantine |
| Restore | Restore quarantined files |
| Delete | Permanently delete quarantined |
| Update Definitions | Update ClamAV virus definitions |
| Scan History | Previous scan results |

---

## Event Delegation

Buttons use `data-scan-action` attributes.

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.scan-target-selector` | Target selection buttons |
| `.scan-progress` | Progress bar |
| `.scan-results` | Results table |
| `.quarantine-list` | Quarantined files list |

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/virusscanner/status` | Definitions status |
| `POST` | `/api/virusscanner/scan` | Start scan |
| `GET` | `/api/virusscanner/scan/:id` | Progress |
| `POST` | `/api/virusscanner/scan/:id/abort` | Abort |
| `POST` | `/api/virusscanner/scan/:id/quarantine` | Quarantine |
| `GET` | `/api/virusscanner/quarantine` | List quarantine |
| `POST` | `/api/virusscanner/update-defs` | Update definitions |

---

*Part of [NexusPanel Documentation](../README.md)*
