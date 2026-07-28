# Processes Screen

Live process monitoring with list view, tree view, and kill functionality.

---

## Layout

```
+------------------------------------------------------------------+
|  Process Manager   Total: 156   [Refresh 5s]   [Tree View]       |
+------------------------------------------------------------------+
|  Search: [________________]   Sort: [CPU ▼]                      |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ PID   User    CPU%   MEM%   Command                         │|
|  │ 1     root    0.0    0.1    /sbin/init                      │|
|  │ 234   root    2.3    1.2    nginx: worker                   │|
|  │ 567   postgres 5.1   3.4    postgres: writer                 │|
|  │ 890   root    0.0    0.0    /usr/sbin/sshd                  │|
|  └──────────────────────────────────────────────────────────────┘|
|                                                                  |
|  [Kill Process] (selected PID)                                   |
+------------------------------------------------------------------+
```

---

## Views

| View | Description |
|------|-------------|
| List | Flat process list sorted by CPU/MEM |
| Tree | Hierarchical parent-child view |

---

## Features

| Feature | Description |
|---------|-------------|
| Live Refresh | 5-second auto-refresh |
| Sort | By PID, user, CPU%, MEM%, command |
| Search | Filter by command or user |
| Kill | Send signal to process |
| Details | Full process info (cwd, environment) |
| Tree View | Parent-child hierarchy |

---

## Event Delegation

Buttons use `data-proc-action` attributes.

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/processes` | List processes |
| `GET` | `/api/processes/tree` | Process tree |
| `GET` | `/api/processes/:pid/details` | Process details |
| `POST` | `/api/processes/kill/:pid` | Kill process |
| `POST` | `/api/processes/signal` | Send signal |

---

*Part of [NexusPanel Documentation](../README.md)*
