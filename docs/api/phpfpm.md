# PHP-FPM API

PHP-FPM pool management, OPcache, modules, configuration, and logs.

All endpoints are prefixed with `/api/phpfpm`. Admin only.

---

## Pools & Status

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/phpfpm` | List pools |
| `GET` | `/phpfpm/status` | FPM status |
| `GET` | `/phpfpm/version` | PHP version |
| `GET` | `/phpfpm/global` | Global config |
| `GET` | `/phpfpm/pool-status` | Pool status page |
| `GET` | `/phpfpm/opcache` | OPcache stats |
| `GET` | `/phpfpm/modules` | PHP modules |
| `GET` | `/phpfpm/ini` | php.ini settings |
| `GET` | `/phpfpm/config-test` | Test config syntax |

## Pool Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/phpfpm/:name` | Pool config |
| `PUT` | `/phpfpm/:name` | Edit pool directive |
| `GET` | `/phpfpm/:name/logs` | Pool access logs |
| `GET` | `/phpfpm/:name/slow-log` | Slow request logs |

## Service Control

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/phpfpm/restart` | Restart FPM |
| `POST` | `/phpfpm/reload` | Reload FPM |

---

## Response Formats

### GET /phpfpm

```json
{
  "pools": [
    { "name": "www", "pm": "dynamic", "maxChildren": 50, "startServers": 5, "status": "active" }
  ],
  "phpVersion": "8.3.6",
  "totalPools": 1,
  "totalMaxWorkers": 50
}
```

### GET /phpfpm/opcache

```json
{
  "enabled": true,
  "memoryUsage": { "used": 12345678, "free": 51234567, "percent": 19.4 },
  "hitRate": 98.7,
  "cachedScripts": 1234,
  "restarts": 0
}
```

### GET /phpfpm/modules

```json
{
  "modules": ["bcmath", "calendar", "ctype", "curl", "dba", ...],
  "total": 46
}
```

---

*Part of [NexusPanel API Reference](../README.md)*
