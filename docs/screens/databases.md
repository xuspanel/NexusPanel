# Database Manager Screen

PostgreSQL database management with table browsing, SQL editor, views, triggers, functions, and import/export.

---

## Layout

```
+------------------------------------------------------------------+
|  Database Manager   [PostgreSQL v16.2]   [Query] [Bookmarks]     |
+------------------------------------------------------------------+
|  ┌──────┐  ┌──────────────────────────────────────────────────┐ |
|  │ DBs  │  │  Tables │ Views │ Triggers │ Functions │ Indexes │ |
|  ├──────┤  ├──────────────────────────────────────────────────┤ |
|  │ app  │  │                                                  │ |
|  │ auth │  │  Table: public.users                             |
|  │ logs │  │  ┌────┬────────┬────────┬────────┬──────┐       │ |
|  │      │  │  │ ID │ Name   │ Email  │ Role   │ Date │       │ |
|  └──────┘  │  ├────┼────────┼────────┼────────┼──────┤       │ |
|            │  │ 1  │ admin  │ a@...  │ admin  │ Jul  │       │ |
|            │  │ 2  │ john   │ j@...  │ user   │ Jul  │       │ |
|            │  └────┴────────┴────────┴────────┴──────┘       │ |
|            └──────────────────────────────────────────────────┘ |
+------------------------------------------------------------------+
|  SQL Editor: [________________________________] [Execute]        |
+------------------------------------------------------------------+
```

---

## Tabs

| Tab | Content |
|-----|---------|
| Tables | Table browser with data grid |
| Views | SQL views |
| Triggers | Database triggers |
| Functions | Stored functions |
| Indexes | Database indexes |
| Extensions | PostgreSQL extensions |
| Connections | Active database connections |
| Privileges | User privilege management |
| Bookmarks | Saved SQL queries |
| Search | Cross-table search |

---

## Table Data Grid

| Column | Description |
|--------|-------------|
| Select | Checkbox for bulk operations |
| Columns | Dynamic based on table schema |
| Actions | Edit, Delete buttons per row |

### Grid Features

- **Sort**: Click column headers to sort
- **Search**: Filter rows by any column
- **Pagination**: Navigate large datasets
- **Column Reordering**: Drag columns to reorder
- **Inline Editing**: Click cell to edit
- **Bulk Delete**: Select multiple rows for deletion

---

## SQL Editor

Full SQL editor with syntax highlighting (via Ace editor):

```sql
SELECT u.name, COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at > '2026-01-01'
GROUP BY u.name
ORDER BY order_count DESC;
```

### Features

- Syntax highlighting for PostgreSQL
- EXPLAIN ANALYZE integration
- Query presets (pre-defined queries)
- Export results to CSV/JSON/SQL
- Query history bookmarks

---

## Actions

### Table Operations

| Action | Description |
|--------|-------------|
| Create Table | Define new table with columns |
| Drop Table | Delete table (with confirmation) |
| Truncate Table | Remove all rows |
| Rename Table | Rename table |
| Duplicate Table | Clone table structure and data |
| Vacuum Table | Reclaim storage |
| Analyze Table | Update statistics |

### Row Operations

| Action | Description |
|--------|-------------|
| Insert Row | Add new row with form |
| Edit Row | Modify existing row |
| Delete Row | Delete single row |
| Bulk Delete | Delete multiple selected rows |

### Import/Export

| Action | Format | Description |
|--------|--------|-------------|
| Export | CSV | Comma-separated values |
| Export | JSON | JSON array |
| Export | SQL | SQL INSERT statements |
| Import | CSV | Import CSV data |
| Import | JSON | Import JSON data |

---

## Modals

- Create Table (column definitions)
- Edit Row (field editor)
- Import Data (file upload + format selection)
- SQL Query Results (tabular display)
- Drop Table Confirmation
- Privilege Editor

---

## Event Delegation

All buttons use `data-db-action` attributes (within the database view).

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.db-header` | Module header with title |
| `.db-sidebar` | Database/table tree sidebar |
| `.db-content` | Main content area |
| `.db-table-grid` | Data grid container |
| `.db-sql-editor` | SQL editor wrapper |
| `.db-toolbar` | Action toolbar |
| `.db-search-input` | Search/filter input |
| `.db-tab-nav` | Tab navigation |
| `.db-tab-content` | Tab content panel |

---

## API Calls

This module uses 55+ API endpoints. See [Databases API](../api/databases.md) for the complete reference.

Key endpoints:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/databases/list` | List databases |
| `GET` | `/api/databases/:db/tables` | List tables |
| `GET` | `/api/databases/:db/table/:sch/:tbl/data` | Browse rows |
| `POST` | `/api/databases/:db/query` | Execute SQL |
| `POST` | `/api/databases/:db/table/:sch/:tbl/row` | Insert row |
| `PUT` | `/api/databases/:db/table/:sch/:tbl/row/:pk/:val` | Update row |

---

*Part of [NexusPanel Documentation](../README.md)*
