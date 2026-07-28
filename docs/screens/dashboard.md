# Dashboard Screen

Server overview with real-time metrics, service health, and quick-access actions.

---

## Layout

```
+----------------------------------------------------------+
|  Dashboard                                    [ Reboot ]  |
+----------------------------------------------------------+
|  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                 |
|  │ CPU  │  │ RAM  │  │ Disk │  │ Net  │   (stat cards)   |
|  │ 45%  │  │ 29%  │  │ 21%  │  │ ↑↓   │                 |
|  └──────┘  └──────┘  └──────┘  └──────┘                 |
+----------------------------------------------------------+
|  ┌─────────────────────────┐  ┌────────────────────────┐ |
|  │    CPU & Memory Chart    │  │   Disk Usage Chart     │ |
|  │    (24h line chart)     │  │   (doughnut chart)     │ |
|  └─────────────────────────┘  └────────────────────────┘ |
+----------------------------------------------------------+
|  ┌─────────────────────────┐  ┌────────────────────────┐ |
|  │   Network I/O Chart     │  │   Service Health       | |
|  │   (24h line chart)     │  │   nginx: ✓ active      | |
|  └─────────────────────────┘  │   postgres: ✓ active   | |
|                               │   vsftpd: ✗ inactive   | |
|                               └────────────────────────┘ |
+----------------------------------------------------------+
```

---

## Summary Bar

| Stat | Source | Update |
|------|--------|--------|
| CPU % | `/api/system/stats` | 10s polling |
| RAM % | `/api/system/stats` | 10s polling |
| Disk % | `/api/system/stats` | 10s polling |
| Network I/O | `/api/system/stats` | 10s polling |

---

## Charts

| Chart | Type | Data Source | Period |
|-------|------|-------------|--------|
| CPU & Memory | Line (dual axis) | `/api/metrics/history?period=24h` | 24h |
| Disk Usage | Doughnut | `/api/system/stats` | Current |
| Network I/O | Line (dual axis) | `/api/metrics/history?period=24h` | 24h |

Charts use `.update()` method for live updates without re-creating.

---

## Service Health Grid

Shows status of key services: nginx, php-fpm, postgresql, vsftpd, clamav-daemon, firewalld.

Each service shows a green (active) or red (inactive) badge with status text.

---

## Actions

| Button | Action | Confirmation |
|--------|--------|-------------|
| Reboot | `POST /api/system/reboot` | Yes (modal) |

---

## Modals

### Reboot Confirmation

```
+------------------------------------------+
|  ⚠️  Confirm Reboot                      |
|                                          |
|  Are you sure you want to reboot the     |
|  server? This will disconnect all users. |
|                                          |
|  [ Cancel ]              [ Reboot ]      |
+------------------------------------------+
```

---

## Event Delegation

All buttons use `data-dash-action` attributes:

| Attribute Value | Action |
|----------------|--------|
| `data-dash-action="reboot"` | Open reboot confirmation modal |
| `data-dash-action="confirm-reboot"` | Execute reboot |
| `data-dash-action="cancel-reboot"` | Close modal |

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.dash-stats-grid` | 4-column stat card grid |
| `.dash-stat-card` | Individual stat card |
| `.dash-stat-value` | Large number display |
| `.dash-stat-label` | Stat label text |
| `.dash-chart-card` | Chart container card |
| `.dash-service-grid` | Service health grid |
| `.dash-service-item` | Individual service badge |
| `.dash-reboot-btn` | Reboot button |
| `.dash-connection-status` | WebSocket status indicator |

---

## Auto-Refresh

- System stats: 10-second polling interval
- Charts: Updated via `.update()` method (no re-creation)
- Service health: Updated on each stats refresh

---

## State Management

| State | Description |
|-------|-------------|
| Loading | Spinner overlay |
| Loaded | Stats + charts visible |
| Error | Error message, retry button |
| Rebooting | "Server is rebooting..." overlay |

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/system/stats` | CPU/RAM/Disk/Network |
| `GET` | `/api/metrics/history?period=24h` | Chart data |
| `GET` | `/api/system/service-health` | Service status |
| `GET` | `/api/system/quick-stats` | Badge counts |
| `POST` | `/api/system/reboot` | Reboot server |
| `GET` | `/api/system/reboot-status` | Reboot state |

---

*Part of [NexusPanel Documentation](../README.md)*
