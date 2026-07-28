# Backups API

Backup target management, execution, scheduling, and archive download.

All endpoints are prefixed with `/api/backups`. Admin only.

---

## Targets & Stats

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/backups/defs` | Backup target definitions |
| `GET` | `/backups/stats` | Backup statistics |

## Execution

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/backups/start` | Start backup |
| `POST` | `/backups/:task/cancel` | Cancel backup |
| `GET` | `/backups/status/:task` | Backup status |
| `GET` | `/backups/current` | Running backup info |

## Archive Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/backups/list` | List backups |
| `GET` | `/backups/:ts` | Backup detail |
| `GET` | `/backups/:ts/download` | Download backup ZIP |
| `GET` | `/backups/:ts/download/:file` | Download single file |
| `DELETE` | `/backups/:ts` | Delete backup |

## Schedules

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/backups/schedules` | List schedules |
| `POST` | `/backups/schedules` | Create schedule |
| `PUT` | `/backups/schedules/:id/toggle` | Enable/disable schedule |
| `DELETE` | `/backups/schedules/:id` | Delete schedule |

---

## Request/Response

### POST /backups/start

```json
{
  "type": "full",
  "targets": ["system", "databases", "webfiles"]
}
```

### Response

```json
{
  "success": true,
  "taskId": "task_1690000000000",
  "message": "Backup started"
}
```

### GET /backups/status/:task

```json
{
  "taskId": "task_1690000000000",
  "status": "running",
  "progress": 65,
  "currentFile": "/var/www/html/app.js",
  "filesProcessed": 273,
  "totalFiles": 420,
  "elapsed": 45,
  "eta": 24
}
```

### Schedule

```json
{
  "name": "Daily System Backup",
  "type": "full",
  "schedule": "0 2 * * *",
  "retention": 7,
  "targets": ["system", "databases"]
}
```

---

*Part of [NexusPanel API Reference](../README.md)*
