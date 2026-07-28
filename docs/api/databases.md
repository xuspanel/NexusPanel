# Databases API

PostgreSQL database management with 55+ endpoints covering databases, tables, views, triggers, functions, indexes, privileges, SQL execution, and import/export.

All endpoints are prefixed with `/api/databases`. Admin only.

---

## Database Operations

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/databases/list` | List all databases |
| `POST` | `/databases/create` | Create database |
| `DELETE` | `/databases/:db` | Drop database |
| `PUT` | `/databases/:db/config` | Update DB config |
| `GET` | `/databases/users` | List DB users |
| `POST` | `/databases/users` | Create DB user |

## Schema & Extensions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/:db/schemas` | List schemas |
| `GET` | `/:db/extensions` | List extensions |

## Table Operations

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/:db/tables` | List tables |
| `GET` | `/:db/table/:sch/:tbl/info` | Column info |
| `GET` | `/:db/table/:sch/:tbl/data` | Browse rows |
| `POST` | `/:db/table/:sch/:tbl/row` | Insert row |
| `PUT` | `/:db/table/:sch/:tbl/row/:pk/:val` | Update row |
| `DELETE` | `/:db/table/:sch/:tbl/row/:pk/:val` | Delete row |
| `POST` | `/:db/table/:sch/:tbl/rows/delete` | Bulk delete |
| `POST` | `/:db/table` | Create table |
| `PUT` | `/:db/table/:sch/:tbl` | Update columns |
| `DELETE` | `/:db/table/:sch/:tbl` | Drop table |
| `POST` | `/:db/table/:sch/:tbl/duplicate` | Clone table |
| `PUT` | `/:db/table/:sch/:tbl/rename` | Rename table |
| `DELETE` | `/:db/table/:sch/:tbl/truncate` | Truncate table |
| `POST` | `/:db/table/:sch/:tbl/vacuum` | Vacuum table |
| `POST` | `/:db/table/:sch/:tbl/analyze` | Analyze table |
| `GET` | `/:db/table/:sch/:tbl/metadata` | Table metadata |
| `PUT` | `/:db/table/:sch/:tbl/comment` | Set table comment |
| `PUT` | `/:db/table/:sch/:tbl/column/:col/comment` | Set column comment |
| `GET` | `/:db/table/:sch/:tbl/column-order` | Get column order |
| `PUT` | `/:db/table/:sch/:tbl/column-order` | Set column order |

## Import/Export

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/:db/table/:sch/:tbl/export` | Export table (CSV/JSON/SQL) |
| `POST` | `/:db/table/:sch/:tbl/import` | Import table data |

## SQL Execution

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/:db/query` | Execute SQL |
| `GET` | `/query-presets` | SQL query presets |
| `POST` | `/query-run` | Execute SQL (alt) |

## Foreign Keys & Indexes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/:db/table/:sch/:tbl/foreign-keys` | Table FKs |
| `GET` | `/:db/foreign-keys` | All FKs |
| `GET` | `/:db/table/:sch/:tbl/indexes` | Table indexes |
| `POST` | `/:db/table/:sch/:tbl/index` | Create index |
| `DELETE` | `/:db/index/:sch/:idx` | Drop index |

## Views & Materialized Views

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/:db/views` | List views |
| `POST` | `/:db/view` | Create view |
| `DELETE` | `/:db/view/:sch/:name` | Drop view |
| `GET` | `/:db/matviews` | List materialized views |
| `POST` | `/:db/matview` | Create mat. view |
| `DELETE` | `/:db/matview/:sch/:name` | Drop mat. view |
| `POST` | `/:db/matview/:sch/:name/refresh` | Refresh mat. view |

## Functions & Triggers

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/:db/functions` | List functions |
| `GET` | `/:db/functions/:sch/:name/definition` | Function source |
| `DELETE` | `/:db/functions/:sch/:name` | Drop function |
| `GET` | `/:db/table/:sch/:tbl/triggers` | Table triggers |
| `GET` | `/:db/triggers` | All triggers |
| `GET` | `/:db/triggers/:sch/:name` | Trigger source |
| `POST` | `/:db/trigger` | Create trigger |
| `DELETE` | `/:db/trigger/:name` | Drop trigger (table) |
| `DELETE` | `/:db/triggers/:sch/:name` | Drop trigger (global) |

## Privileges & Connections

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/:db/privileges` | List privileges |
| `POST` | `/:db/privileges/grant` | Grant privilege |
| `POST` | `/:db/privileges/revoke` | Revoke privilege |
| `GET` | `/:db/connections` | Active connections |
| `DELETE` | `/:db/connections/:pid` | Kill connection |

## Bookmarks & Search

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/bookmarks` | Query bookmarks |
| `POST` | `/bookmarks` | Create bookmark |
| `DELETE` | `/bookmarks/:id` | Delete bookmark |
| `POST` | `/:db/search-all` | Cross-table search |
| `GET` | `/:db/dump` | Database dump |

---

*Part of [NexusPanel API Reference](../README.md)*
