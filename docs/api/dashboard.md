# Dashboard API

System metrics, service health, and quick stats endpoints.

---

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/system/stats` | Yes | Full system statistics |
| `GET` | `/api/system/service-health` | Yes | Service health checks |
| `GET` | `/api/system/quick-stats` | Yes | Domain/user/container/disk counts |
| `POST` | `/api/system/reboot` | Admin | Reboot the server |
| `GET` | `/api/system/reboot-status` | Yes | Check reboot state |

---

## GET /api/system/stats

Returns comprehensive system resource metrics.

### Response

```json
{
  "cpu": {
    "cores": 4,
    "model": "Intel Xeon",
    "usage": 45.2,
    "loadAverage": [1.2, 0.8, 0.5]
  },
  "memory": {
    "total": 4294967296,
    "used": 1234567890,
    "free": 3060409406,
    "percent": 28.7,
    "totalFormatted": "4.00 GB",
    "usedFormatted": "1.15 GB"
  },
  "disk": {
    "total": 59874012345,
    "used": 12345678901,
    "free": 47528333444,
    "percent": 20.6,
    "totalFormatted": "55.77 GB",
    "usedFormatted": "11.50 GB"
  },
  "network": {
    "rx": 1234567890,
    "tx": 987654321,
    "rxFormatted": "1.15 GB",
    "txFormatted": "941.58 MB"
  },
  "uptime": "up 14 days, 3 hours",
  "hostname": "server01",
  "os": "AlmaLinux 9.3",
  "location": "Amsterdam, NL"
}
```

---

## GET /api/system/service-health

Checks the status of key system services.

### Response

```json
{
  "services": [
    { "name": "nginx", "active": true, "status": "active (running)" },
    { "name": "postgresql", "active": true, "status": "active (running)" },
    { "name": "vsftpd", "active": false, "status": "inactive (dead)" },
    { "name": "clamav-daemon", "active": true, "status": "active (running)" },
    { "name": "php-fpm", "active": true, "status": "active (running)" },
    { "name": "firewalld", "active": true, "status": "active (running)" }
  ]
}
```

---

## GET /api/system/quick-stats

Returns counts for dashboard quick-stat badges.

### Response

```json
{
  "domains": 32,
  "users": 15,
  "containers": 8,
  "diskPercent": 20.6
}
```

---

## POST /api/system/reboot

Reboots the server. Admin only.

### Response

```json
{
  "success": true,
  "message": "Reboot initiated"
}
```

---

## GET /api/system/reboot-status

Check if a reboot is in progress.

### Response

```json
{
  "rebooting": false
}
```

---

*Part of [NexusPanel API Reference](../README.md)*
