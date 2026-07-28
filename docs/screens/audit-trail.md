# Audit Trail Screen

Admin activity logging with filters, search, and export.

---

## Layout

```
+------------------------------------------------------------------+
|  Audit Trail   Total: 4,521   [Export] [Clear]                   |
+------------------------------------------------------------------+
|  Filters: User [______] Action [______] Date [____] to [____]   |
|  Search: [________________]                                      |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ Time            User    Action              IP         Method │|
|  │ Jul 28 12:00    admin   firewall.addRule    192.168.1  POST  │|
|  │ Jul 28 11:45    admin   file.upload         192.168.1  POST  │|
|  │ Jul 28 11:30    system  backup.complete     -          SYSTEM│|
|  └──────────────────────────────────────────────────────────────┘|
|                                                                  |
|  Page 1 of 91   [← Prev] [Next →]                              |
+------------------------------------------------------------------+
```

---

## Features

| Feature | Description |
|---------|-------------|
| Activity Log | All POST/PUT/DELETE operations |
| Filters | By user, action, date range |
| Search | Full-text across action/path/user |
| Pagination | 50 entries per page |
| Export | Download full log as JSON |
| Clear | Clear all entries (with backup) |
| Stats | Total entries, action breakdown |

---

## Event Delegation

Buttons use `data-audit-action` attributes.

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/audit` | List entries |
| `GET` | `/api/audit/stats` | Statistics |
| `GET` | `/api/audit/actions` | Action types |
| `GET` | `/api/audit/users` | User list |
| `GET` | `/api/audit/export` | Export log |
| `DELETE` | `/api/audit/clear` | Clear log |

---

*Part of [NexusPanel Documentation](../README.md)*
