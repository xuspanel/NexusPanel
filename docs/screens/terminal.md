# Terminal Screen

Interactive web terminal with Classic single-pane and PRO multi-tab modes.

---

## Layout

```
+------------------------------------------------------------------+
|  Terminal   [Classic] [PRO]   [ Presets ▼ ]   [ + New Pane ]     |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ root@server01:~# ls -la                                      │|
|  │ total 48                                                     │|
|  │ drwxr-x---  5 root root  4096 Jul 28 12:00 .                │|
|  │ -rw-r--r--  1 root root   220 Jul 15 04:54 .bashrc          │|
|  │                                                              │|
|  │ root@server01:~# _                                          │|
|  └──────────────────────────────────────────────────────────────┘|
+------------------------------------------------------------------+
```

---

## Modes

| Mode | Description |
|------|-------------|
| Classic | Single terminal pane, full width |
| PRO | Multiple terminal panes in tabs |

---

## Terminal Features

| Feature | Description |
|---------|-------------|
| ANSI Colors | Full color support via xterm.js |
| Tab Completion | Shell tab completion |
| Resize | Auto-resize to fit container |
| Copy/Paste | Browser-native copy/paste |
| Search | Search terminal output |
| Clickable URLs | Links are clickable (web-links addon) |
| Unicode | Full Unicode support (unicode11 addon) |
| WebGL | GPU-accelerated rendering |

---

## Command Presets

Quick-access dropdown with saved commands:

| Category | Example |
|----------|---------|
| System | `htop`, `df -h`, `free -m` |
| Docker | `docker ps`, `docker images` |
| Files | `ls -la`, `find . -name "*.log"` |
| Network | `ss -tlnp`, `curl ifconfig.me` |
| Database | `psql -U postgres` |
| Custom | User-defined commands |

### Preset Management

| Action | Description |
|--------|-------------|
| Add | Create new preset (label, command, category) |
| Edit | Modify existing preset |
| Delete | Remove preset |

---

## WebSocket Protocol

Terminal communicates via WebSocket at `/ws/terminal`. See [WebSocket Terminal Protocol](../architecture/websocket.md) for full message format.

---

## Event Delegation

All buttons use `data-terminal-action` attributes.

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.terminal-container` | xterm.js container |
| `.terminal-toolbar` | Top action bar |
| `.terminal-pane` | Individual terminal pane |
| `.terminal-preset-dropdown` | Preset command dropdown |
| `.terminal-tab-bar` | PRO mode tab bar |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+C` | Copy selection |
| `Ctrl+Shift+V` | Paste |
| `Ctrl+Shift+F` | Search in terminal |
| `Ctrl+Shift+T` | New pane (PRO mode) |
| `Ctrl+Shift+W` | Close pane (PRO mode) |

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/terminal/presets` | List presets |
| `POST` | `/api/terminal/presets` | Create preset |
| `PUT` | `/api/terminal/presets/:id` | Update preset |
| `DELETE` | `/api/terminal/presets/:id` | Delete preset |

WebSocket: `/ws/terminal` (for actual terminal I/O)

---

*Part of [NexusPanel Documentation](../README.md)*
