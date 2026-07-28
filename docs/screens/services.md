# Services Screen

systemd service control with start/stop/restart and detailed status.

---

## Layout

```
+------------------------------------------------------------------+
|  Service Manager   [Search: ____________]   [Bulk: Start/Stop]   |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ ☐  nginx.service          active   running   The nginx...   │|
|  │ ☐  postgresql.service     active   running   PostgreSQL...  │|
|  │ ☐  vsftpd.service         inactive dead      FTP server...  │|
|  │ ☐  php-fpm.service        active   running   PHP FastCGI... │|
|  └──────────────────────────────────────────────────────────────┘|
|                                                                  |
|  Selected: 2  [Start] [Stop] [Restart]                          |
+------------------------------------------------------------------+
```

---

## Features

| Feature | Description |
|---------|-------------|
| Service List | All systemd services |
| Search/Filter | Real-time filter by name |
| Start/Stop/Restart | Individual service control |
| Bulk Actions | Start/Stop/Restart multiple |
| Detailed Status | PID, memory, uptime, processes |
| Enable/Disable | Boot-time auto-start |

---

## Event Delegation

Buttons use `data-svc-action` attributes.

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/services` | List services |
| `POST` | `/api/services/:name/:act` | Service action |
| `POST` | `/api/services/bulk/:act` | Bulk action |
| `GET` | `/api/services/:name/status` | Detailed status |

---

*Part of [NexusPanel Documentation](../README.md)*
