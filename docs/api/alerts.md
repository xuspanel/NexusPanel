# Alerts API

Alert rule configuration and management.

All endpoints are prefixed with `/api/alerts`. Admin only.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/alerts/config` | Get alert configuration |
| `POST` | `/alerts/config` | Save alert configuration |
| `GET` | `/alerts/rules` | List alert rules |
| `POST` | `/alerts/rules` | Create alert rule |
| `PUT` | `/alerts/rules/:id` | Update alert rule |
| `DELETE` | `/alerts/rules/:id` | Delete alert rule |

---

## Request/Response

### GET /alerts/config

```json
{
  "enabled": true,
  "emailNotifications": true,
  "notificationEmail": "admin@example.com",
  "checkInterval": 300
}
```

### Alert Rule

```json
{
  "id": "alert_1690000000000",
  "name": "High CPU Usage",
  "metric": "cpu",
  "condition": "greater_than",
  "threshold": 90,
  "duration": 300,
  "enabled": true,
  "actions": ["notification", "email"]
}
```

---

*Part of [NexusPanel API Reference](../README.md)*
