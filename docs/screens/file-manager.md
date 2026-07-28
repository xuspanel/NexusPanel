# File Manager Screen

Full-featured file browser with Ace code editor, archive operations, bin/trash, git integration, and conflict detection.

---

## Layout

```
+------------------------------------------------------------------+
|  File Manager  Path: /var/www/html    [Upload] [New] [Archive]   |
+------------------------------------------------------------------+
|  Sidebar    |  File List                                         |
|  ┌────────┐ |  ┌──────────────────────────────────────────────┐ |
|  │ /      │ |  │ 📁 html/        drwxr-xr-x    4.0 KB  Jul 28 │ |
|  │ /var   │ |  │ 📁 logs/        drwxr-xr-x    4.0 KB  Jul 27 │ |
|  │ /etc   │ |  │ 📄 index.html   -rw-r--r--    1.2 KB  Jul 28 │ |
|  │ /home  │ |  │ 📄 style.css    -rw-r--r--    4.5 KB  Jul 28 │ |
|  │        │ |  │ 📄 app.js       -rw-r--r--   12.3 KB  Jul 28 │ |
|  │ [Bin]  │ |  └──────────────────────────────────────────────┘ |
|  └────────┘ |                                                    |
+------------------------------------------------------------------+
|  Search: [________________]  Sort: [Name ▼]  View: [Grid/List]   |
+------------------------------------------------------------------+
```

---

## Tabs

| Tab | Content |
|-----|---------|
| Files | Default file browser view |
| Editor | Ace code editor (opens when editing a file) |
| Bin | Recycle bin view |

---

## File List Columns

| Column | Description |
|--------|-------------|
| Icon | File type icon (folder, file, image, code, etc.) |
| Name | File/folder name |
| Permissions | rwx string |
| Size | Human-readable size |
| Modified | Last modified date |
| Actions | Context menu button |

---

## Actions

### File Operations

| Action | Description |
|--------|-------------|
| Upload | Upload files via drag-and-drop or file picker |
| Create File | New empty file |
| Create Folder | New directory |
| Rename | Rename selected item |
| Delete | Move to bin (with confirmation) |
| Copy | Copy to clipboard |
| Move | Move to clipboard |
| Duplicate | Create a copy in same directory |

### Archive Operations

| Action | Description |
|--------|-------------|
| Archive | Create .zip, .tar, or .tar.gz from selected files |
| Extract | Extract archive to current directory |

### Editor

| Action | Description |
|--------|-------------|
| Edit | Open file in Ace editor |
| Save | Save changes (Ctrl+S) |
| Diff | Compare two files side-by-side |

### Git Operations

| Action | Description |
|--------|-------------|
| Git Status | Show working tree status |
| Git Stage | Stage file for commit |
| Git Unstage | Unstage file |
| Git Commit | Commit with message |
| Git Push | Push to remote |
| Git Pull | Pull from remote |

---

## Bin/Trash

Deleted files are moved to `data/filebin/` with batch metadata.

### Bin Operations

| Action | Description |
|--------|-------------|
| Restore | Move file back to original location |
| Permanent Delete | Permanently remove from bin |
| Empty Bin | Remove all bin entries |

---

## Conflict Detection

Before copy/move/extract operations, conflicts are detected:

### Conflict Resolution Modal

```
+------------------------------------------+
|  ⚠️  File Conflict Detected              |
|                                          |
|  The following files already exist:      |
|                                          |
|  ┌──────────┬──────────┬──────────┐     |
|  │ File     │ Source   │ Dest     │     |
|  ├──────────┼──────────┼──────────┤     |
|  │ index.js │ 12.3 KB  │ 8.7 KB   │     |
|  └──────────┴──────────┴──────────┘     |
|                                          |
|  Resolution: [Overwrite All ▼]           |
|                                          |
|  [ Skip ]            [ Apply ]           |
+------------------------------------------+
```

**Strategy options:** Overwrite All, Skip All, Rename All

---

## Event Delegation

All buttons use `data-fm-action` attributes:

| Attribute Value | Action |
|----------------|--------|
| `data-fm-action="upload"` | Open upload dialog |
| `data-fm-action="create-file"` | New file modal |
| `data-fm-action="create-folder"` | New folder modal |
| `data-fm-action="archive"` | Archive selected |
| `data-fm-action="extract"` | Extract archive |
| `data-fm-action="bin"` | Open bin view |
| `data-fm-action="git-status"` | Show git status |

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.fm-toolbar` | Top action bar |
| `.fm-sidebar` | Directory tree sidebar |
| `.fm-file-list` | Main file listing |
| `.fm-file-row` | Individual file row |
| `.fm-modal` | Conflict/extract modal |
| `.fm-modal-header` | Modal header |
| `.fm-modal-body` | Modal body |
| `.fm-modal-actions` | Modal button row |
| `.fm-editor-container` | Ace editor wrapper |
| `.fm-bin-section` | Bin sidebar section |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save file in editor |
| `Ctrl+C` | Copy selected |
| `Ctrl+X` | Cut selected |
| `Ctrl+V` | Paste |
| `Delete` | Delete selected |
| `F2` | Rename selected |

---

## State Management

| State | Description |
|-------|-------------|
| Loading | Spinner while listing directory |
| Loaded | File list visible |
| Error | Error message, retry |
| Empty | "This directory is empty" message |
| Editing | Ace editor visible |
| Bin | Bin view with restored items |

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/files/list` | List directory |
| `GET` | `/api/files/read` | Read file |
| `POST` | `/api/files/create` | Create file/folder |
| `PUT` | `/api/files/rename` | Rename |
| `DELETE` | `/api/files/delete` | Delete (to bin) |
| `POST` | `/api/files/copyto` | Copy |
| `POST` | `/api/files/moveto` | Move |
| `POST` | `/api/files/upload` | Upload |
| `POST` | `/api/files/archive` | Create archive |
| `POST` | `/api/files/extract` | Extract archive |
| `GET` | `/api/files/bin` | List bin |
| `POST` | `/api/files/bin/restore` | Restore from bin |
| `DELETE` | `/api/files/bin/permanent` | Permanent delete |
| `DELETE` | `/api/files/bin/empty` | Empty bin |
| `GET` | `/api/files/git/status` | Git status |
| `POST` | `/api/files/git/commit` | Git commit |

---

*Part of [NexusPanel Documentation](../README.md)*
