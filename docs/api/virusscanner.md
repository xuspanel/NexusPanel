# Virus Scanner API

ClamAV-powered malware scanning, quarantine management, and definition updates.

All endpoints are prefixed with `/api/virusscanner`. Admin only.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/virusscanner/status` | ClamAV definitions status |
| `POST` | `/virusscanner/scan` | Start scan |
| `GET` | `/virusscanner/scan/:id` | Scan progress |
| `GET` | `/virusscanner/scan/:id/results` | Scan results |
| `POST` | `/virusscanner/scan/:id/abort` | Abort scan |
| `POST` | `/virusscanner/scan/:id/quarantine` | Quarantine findings |
| `GET` | `/virusscanner/quarantine` | List quarantined files |
| `POST` | `/virusscanner/quarantine/:id/restore` | Restore file |
| `DELETE` | `/virusscanner/quarantine/:id` | Delete quarantined |
| `POST` | `/virusscanner/update-defs` | Update virus definitions |
| `GET` | `/virusscanner/history` | Scan history |

---

## Request/Response

### POST /virusscanner/scan

```json
{
  "target": "custom",
  "path": "/var/www/html"
}
```

**Target options:** `home`, `mail`, `ftp`, `web`, `custom`

### GET /virusscanner/scan/:id

```json
{
  "scanId": "scan_1690000000000",
  "status": "running",
  "progress": 42,
  "filesScanned": 1234,
  "infected": 0,
  "currentFile": "/var/www/html/vendor/lib.php",
  "startedAt": "2026-07-28T12:00:00Z"
}
```

### GET /virusscanner/scan/:id/results

```json
{
  "scanId": "scan_1690000000000",
  "status": "completed",
  "filesScanned": 4567,
  "infected": 2,
  "findings": [
    { "file": "/tmp/malware.exe", "virus": "Win.Malware.Generic", "action": "quarantined" }
  ]
}
```

---

*Part of [NexusPanel API Reference](../README.md)*
