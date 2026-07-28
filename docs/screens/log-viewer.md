# Log Viewer Screen

System and application log browsing with search, follow, and download.

---

## Layout

```
+------------------------------------------------------------------+
|  Log Viewer                                                      |
+------------------------------------------------------------------+
|  ┌────────────┐  ┌────────────────────────────────────────────┐ |
|  │ Log Files  │  │  nexuspanel.log (1.2 MB)                   │ |
|  ├────────────┤  │  ┌──────────────────────────────────────┐  │ |
|  │ nexuspanel │  │  │ 2026-07-28 12:00 INFO  Server started │  │ |
|  │ access     │  │  │ 2026-07-28 12:01 INFO  GET /api/...  │  │ |
|  │ nginx      │  │  │ 2026-07-28 12:02 ERROR Connection... │  │ |
|  │ postgres   │  │  │ 2026-07-28 12:03 INFO  Request done  │  │ |
|  │            │  │  └──────────────────────────────────────┘  │ |
|  │ Search:    │  │                                            │ |
|  │ [________] │  │  [Follow] [Download] [Clear]              │ |
|  └────────────┘  └────────────────────────────────────────────┘ |
+------------------------------------------------------------------+
```

---

## Features

| Feature | Description |
|---------|-------------|
| Log File List | All /var/log files with size/date |
| Categories | Application, web, database, system |
| Log Viewer | Monospace viewer with line numbers |
| Search | Full-text search with regex support |
| Follow | Live-tail via SSE streaming |
| Download | Download log file |
| Line Count | Total lines in file |

---

## Event Delegation

Buttons use `data-log-action` attributes.

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.log-sidebar` | File list sidebar |
| `.log-viewer` | Log content viewer |
| `.log-search` | Search bar |
| `.log-follow` | Follow mode indicator |

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/logs` | List log files |
| `GET` | `/api/logs/tail/:file` | Tail log |
| `GET` | `/api/logs/search/:file` | Search log |
| `GET` | `/api/logs/stream/:file` | SSE stream |
| `GET` | `/api/logs/download/:file` | Download |
| `GET` | `/api/logs/linecount/:file` | Line count |

---

*Part of [NexusPanel Documentation](../README.md)*
