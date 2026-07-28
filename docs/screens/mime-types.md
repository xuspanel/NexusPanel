# MIME Types Screen

System MIME type browser with distribution chart and custom type CRUD.

---

## Layout

```
+------------------------------------------------------------------+
|  MIME Types   [Add Type]   [Import] [Export]                     |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ Distribution Chart (donut)                                   │|
|  │ application: 845 (39%)  text: 234 (11%)  image: 567 (26%)  │|
|  └──────────────────────────────────────────────────────────────┘|
|                                                                  |
|  Search: [________________]   Total: 2,148 system types          |
|                                                                  |
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ Extension  │ MIME Type               │ Category              │|
|  ├───────────┼─────────────────────────┼──────────────────────┤│
|  │ .html      │ text/html               │ text                  ││
|  │ .css       │ text/css                │ text                  ││
|  │ .js        │ application/javascript  │ application           ││
|  │ .png       │ image/png               │ image                 ││
|  └───────────┴─────────────────────────┴──────────────────────┘|
+------------------------------------------------------------------+
```

---

## Features

| Feature | Description |
|---------|-------------|
| System Types | Browse 2,148+ system-defined types |
| Distribution Chart | Category breakdown (donut chart) |
| Search | Filter by extension or MIME type |
| Custom Types | CRUD for user-defined types |
| Import/Export | Bulk import/export types |
| Overlap Check | Detect extension conflicts |
| Bulk Delete | Delete multiple custom types |

---

## Event Delegation

Buttons use `data-mime-action` attributes.

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/mimetypes/system` | System types |
| `GET` | `/api/mimetypes` | Custom types |
| `POST` | `/api/mimetypes` | Create type |
| `PUT` | `/api/mimetypes/:id` | Update type |
| `DELETE` | `/api/mimetypes/:id` | Delete type |
| `GET` | `/api/mimetypes/lookup/:ext` | Lookup extension |

---

*Part of [NexusPanel Documentation](../README.md)*
