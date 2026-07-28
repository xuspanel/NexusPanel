# Files API

Complete file system management including browse, edit, archive, extract, bin, git, and permissions.

All endpoints are prefixed with `/api/files`. Authentication required for all.

---

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/files/list` | Yes | List directory contents |
| `GET` | `/files/read` | Yes | Read file content |
| `POST` | `/files/create` | Yes | Create file or directory |
| `PUT` | `/files/rename` | Yes | Rename file or directory |
| `DELETE` | `/files/delete` | Yes | Delete (move to bin) |
| `POST` | `/files/copy` | Yes | Copy files |
| `POST` | `/files/move` | Yes | Move files |
| `POST` | `/files/copyto` | Yes | Copy to destination |
| `POST` | `/files/moveto` | Yes | Move to destination |
| `POST` | `/files/duplicate` | Yes | Duplicate file |
| `GET` | `/files/search` | Yes | Search files recursively |
| `POST` | `/files/archive` | Yes | Create archive (zip/tar/tar.gz) |
| `POST` | `/files/extract` | Yes | Extract archive |
| `PUT` | `/files/permissions` | Yes | Change chmod |
| `GET` | `/files/details` | Yes | File/folder details |
| `POST` | `/files/diff` | Yes | Diff two files |
| `POST` | `/files/upload` | Yes | Upload files (multipart) |
| `GET` | `/files/git/status` | Yes | Git status |
| `POST` | `/files/git/stage` | Yes | Git add |
| `POST` | `/files/git/unstage` | Yes | Git reset |
| `POST` | `/files/git/commit` | Yes | Git commit |
| `POST` | `/files/git/push` | Yes | Git push |
| `POST` | `/files/git/pull` | Yes | Git pull |
| `POST` | `/files/check-conflicts` | Yes | Conflict check (copy/move) |
| `POST` | `/files/check-extract-conflicts` | Yes | Conflict check (extract) |
| `GET` | `/files/bin` | Yes | List recycle bin |
| `POST` | `/files/bin/restore` | Yes | Restore from bin |
| `DELETE` | `/files/bin/permanent` | Yes | Permanent delete |
| `DELETE` | `/files/bin/empty` | Yes | Empty bin |

---

## Key Request/Response Formats

### GET /files/list

**Params:** `path` (query param)

**Response:**
```json
{
  "path": "/var/www",
  "items": [
    { "name": "html", "type": "directory", "size": 4096, "modified": "2026-07-28T12:00:00Z", "permissions": "drwxr-xr-x" },
    { "name": "logs", "type": "file", "size": 12345, "modified": "2026-07-28T11:00:00Z", "permissions": "-rw-r--r--" }
  ]
}
```

### POST /files/create

```json
{ "path": "/var/www/html", "name": "index.html", "type": "file" }
```

### POST /files/upload

Multipart form data: `files` field + `path` field.

### POST /files/archive

```json
{ "files": ["/var/www/file1.txt", "/var/www/file2.txt"], "format": "zip", "output": "/var/www/archive.zip" }
```

### POST /files/extract

```json
{ "archive": "/var/www/archive.zip", "destination": "/var/www/extracted", "strategy": "overwrite" }
```

**Strategy options:** `overwrite`, `skip`, `rename`

### Bin Operations

- **GET /files/bin** — Lists all batches in `data/filebin/`
- **POST /files/bin/restore** — `{ "batchId": "batch_...", "files": ["file1.txt"] }`
- **DELETE /files/bin/permanent** — `{ "batchId": "batch_...", "files": ["file1.txt"] }`
- **DELETE /files/bin/empty** — Clears all bin entries

---

## Conflict Detection

Before copy/move/extract operations, the frontend calls conflict detection:

```json
// POST /files/check-conflicts
{ "files": ["file1.txt"], "destination": "/var/www/" }

// Response
{
  "conflicts": [
    { "name": "file1.txt", "sourceSize": 1234, "destSize": 5678, "sourceModified": "...", "destModified": "..." }
  ]
}
```

---

## Event Delegation

Frontend uses `data-fm-action` attributes:

| Action | Element |
|--------|---------|
| `upload` | Upload button |
| `create-file` | New file button |
| `create-folder` | New folder button |
| `archive` | Archive button |
| `extract` | Extract button |
| `bin` | Open bin button |
| `git-status` | Git status button |

---

*Part of [NexusPanel API Reference](../README.md)*
