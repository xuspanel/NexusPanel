# PHP-FPM Screen

PHP-FPM pool management with OPcache, modules, config editor, and logs.

---

## Layout

```
+------------------------------------------------------------------+
|  PHP-FPM Manager   PHP 8.3.6   Pools: 2   Total Workers: 100    |
+------------------------------------------------------------------+
|  Pools │ Status │ OPcache │ Modules │ Logs                        |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ Pool: www                                                    │|
|  │ PM: dynamic   Max: 50   Start: 5   Spare: 5/35             │|
|  │ Status: active   Requests: 12345   Traffic: 45.6 MB         │|
|  │                                                              │|
|  │ [Config] [Logs] [Slow Log] [Edit]                           │|
|  └──────────────────────────────────────────────────────────────┘|
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ Pool: api                                                    │|
|  │ PM: static   Max: 50   Active: 42   Idle: 8                │|
|  │ Status: active   Requests: 89012   Traffic: 234.5 MB        │|
|  │                                                              │|
|  │ [Config] [Logs] [Slow Log] [Edit]                           │|
|  └──────────────────────────────────────────────────────────────┘|
+------------------------------------------------------------------+
```

---

## Tabs

| Tab | Content |
|-----|---------|
| Pools | Pool list with cards |
| Status | PHP-FPM service status |
| OPcache | OPcache statistics and bars |
| Modules | Installed PHP modules grid |
| Logs | Pool access logs and slow logs |

---

## Features

| Feature | Description |
|---------|-------------|
| Pool List | Auto-detects any PHP version |
| Pool Status | Live status via pm.status_path |
| OPcache Stats | Memory usage, hit rate, cached scripts |
| Module List | All 46+ installed modules |
| Config Editor | Edit pool directives |
| Config Test | `php-fpm -t` syntax check |
| Restart | Restart PHP-FPM service |
| Reload | Graceful reload |
| Error Logs | Last 100 lines from error log |
| Slow Logs | Last 20 slow request entries |

---

## Event Delegation

Buttons use `data-fpm-action` attributes.

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.fpm-pool-card` | Pool container |
| `.fpm-pool-status` | PM mode badge |
| `.fpm-opcache-bar` | OPcache memory bar |
| `.fpm-hit-rate-bar` | Hit rate progress bar |
| `.fpm-modules-grid` | Module grid layout |

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/phpfpm` | List pools |
| `GET` | `/api/phpfpm/status` | FPM status |
| `GET` | `/api/phpfpm/opcache` | OPcache stats |
| `GET` | `/api/phpfpm/modules` | PHP modules |
| `GET` | `/api/phpfpm/:name` | Pool config |
| `PUT` | `/api/phpfpm/:name` | Edit pool |
| `POST` | `/api/phpfpm/restart` | Restart |
| `POST` | `/api/phpfpm/reload` | Reload |

---

*Part of [NexusPanel Documentation](../README.md)*
