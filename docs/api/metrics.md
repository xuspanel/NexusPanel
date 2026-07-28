# Metrics API

Historical CPU, memory, disk, and network metrics.

---

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/metrics/current` | Yes | Current resource snapshot |
| `GET` | `/api/metrics/history` | Yes | Historical data (24h/7d/30d) |

---

## GET /api/metrics/current

Returns current resource utilization.

### Response

```json
{
  "cpu": 45.2,
  "memory": { "used": 1234567890, "total": 4294967296, "percent": 28.7 },
  "disk": { "used": 12345678901, "total": 59874012345, "percent": 20.6 },
  "network": { "rx": 1234567890, "tx": 987654321 }
}
```

---

## GET /api/metrics/history

Returns time-series data for charting.

### Query Parameters

| Param | Values | Default | Description |
|-------|--------|---------|-------------|
| `period` | `24h`, `7d`, `30d` | `24h` | Time range |

### Response

```json
{
  "period": "24h",
  "data": [
    {
      "timestamp": "2026-07-28T12:00:00.000Z",
      "cpu": 45.2,
      "memory": { "used": 1234567890, "total": 4294967296, "percent": 28.7 },
      "disk": { "used": 12345678901, "total": 59874012345, "percent": 20.6 },
      "network": { "rx": 1234567890, "tx": 987654321 }
    }
  ]
}
```

### Storage

Data is stored in `data/metrics/history.jsonl` (JSON Lines format, append-only). Entries older than `logRetentionDays` (default: 30) are pruned automatically.

---

*Part of [NexusPanel API Reference](../README.md)*
