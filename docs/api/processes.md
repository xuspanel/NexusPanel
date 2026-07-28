# Processes API

Live process monitoring, tree view, and signal delivery.

All endpoints are prefixed with `/api/processes`. Admin only.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/processes` | List processes |
| `GET` | `/processes/tree` | Process tree |
| `GET` | `/processes/signals` | Available signals |
| `GET` | `/processes/:pid/details` | Process detail |
| `POST` | `/processes/kill/:pid` | Kill process |
| `POST` | `/processes/signal` | Send signal |

---

## Response Formats

### GET /processes

```json
{
  "processes": [
    {
      "pid": 1,
      "user": "root",
      "cpu": 0.0,
      "mem": 0.1,
      "vsz": 123456,
      "rss": 4567,
      "command": "/sbin/init"
    }
  ]
}
```

### POST /processes/kill/:pid

```json
{ "signal": "SIGTERM" }
```

---

*Part of [NexusPanel API Reference](../README.md)*
