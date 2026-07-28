# WebSocket Terminal Protocol

NexusPanel's web terminal uses WebSocket connections to bridge the browser with server-side PTY (pseudo-terminal) sessions powered by node-pty.

---

## Architecture

```
Browser (xterm.js)                Server (node-pty)
      │                                │
      │  ──── WebSocket ──────►        │
      │       (base64 encoded)         │
      │                                │
      │                           ┌────┴────┐
      │                           │  node-pty │
      │                           │  session  │
      │                           └────┬────┘
      │                                │
      │  ◄──── WebSocket ──────        │
      │       (base64 encoded)         │
      │                           ┌────┴────┐
      │                           │   bash   │
      │                           │  shell   │
      │                           └─────────┘
```

---

## Connection Setup

### WebSocket Server

NexusPanel uses `ws` in **noServer** mode:

```javascript
const wss = new WebSocketServer({ noServer: true });
```

The HTTP server listens for `upgrade` events and manually routes:

| Path | Handler |
|------|---------|
| `/ws/terminal` | Terminal WebSocket |
| `/ws/docker` | Docker exec WebSocket |
| Anything else | Socket destroyed |

### Authentication

Authentication happens **during the HTTP upgrade handshake**, before the WebSocket connection is established:

1. Parse raw `Cookie` header from the upgrade request
2. Extract `token` cookie
3. If missing → write `HTTP/1.1 401 Unauthorized` and destroy socket
4. Verify via `jwt.verify(token, JWT_SECRET)`
5. If invalid → write `HTTP/1.1 401 Unauthorized` and destroy socket
6. If valid → populate `req.user` and call `wss.handleUpgrade()`

### Connection Lifecycle

```
1. Browser opens WebSocket to /ws/terminal
       │
2. Server authenticates via JWT cookie
       │
3. Server sends: { type: "ready" }
       │
4. Browser sends: { type: "create" }
       │
5. Server spawns PTY session via node-pty
       │
6. Server sends: { type: "created", paneId: "p1" }
       │
7. Bidirectional data flow begins
       │
8. Browser sends: { type: "close-pane", paneId: "p1" }
       │
9. Server kills PTY with SIGHUP
       │
10. Server sends: { type: "pane-closed", paneId: "p1" }
```

---

## Message Format

All messages are JSON strings. Data fields (user input, terminal output) are **base64-encoded** to safely transport binary/ANSI data.

### Client → Server Messages

#### `create`

Create a new terminal pane.

```json
{
  "type": "create",
  "cols": 120,
  "rows": 40,
  "paneId": "custom-id"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | Must be `"create"` |
| `cols` | No | Terminal columns (default: 80) |
| `rows` | No | Terminal rows (default: 24) |
| `paneId` | No | Custom pane ID (auto-generated if omitted) |

**Response:** `{ type: "created", paneId: "p1" }`

#### `create-pane`

Create a new terminal pane with auto-generated ID.

```json
{
  "type": "create-pane",
  "cols": 120,
  "rows": 40
}
```

**Response:** `{ type: "pane-created", paneId: "p2" }`

#### `input`

Send user input to the terminal.

```json
{
  "type": "input",
  "paneId": "p1",
  "data": "bHMgLWxhCg=="
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | Must be `"input"` |
| `paneId` | Yes | Target pane ID |
| `data` | Yes | Base64-encoded user input |

**No response** (output comes back as `data` messages).

#### `resize`

Resize the terminal.

```json
{
  "type": "resize",
  "paneId": "p1",
  "cols": 160,
  "rows": 50
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | Must be `"resize"` |
| `paneId` | Yes | Target pane ID |
| `cols` | Yes | New column count |
| `rows` | Yes | New row count |

**No response.**

#### `close-pane`

Close a terminal pane (graceful).

```json
{
  "type": "close-pane",
  "paneId": "p1"
}
```

Sends `SIGHUP` to the PTY process and removes it from the panes map.

**Response:** `{ type: "pane-closed", paneId: "p1" }`

#### `kill`

Kill a terminal pane (force).

```json
{
  "type": "kill",
  "paneId": "p1"
}
```

Sends `SIGHUP` to the PTY process but does **not** remove from the panes map (removal happens on the PTY `exit` event).

**No immediate response** (exit message comes later).

---

### Server → Client Messages

#### `ready`

Sent immediately on connection establishment.

```json
{ "type": "ready" }
```

#### `created`

Acknowledges a `create` message.

```json
{ "type": "created", "paneId": "p1" }
```

#### `pane-created`

Acknowledges a `create-pane` message.

```json
{ "type": "pane-created", "paneId": "p2" }
```

#### `pane-closed`

Acknowledges a `close-pane` message.

```json
{ "type": "pane-closed", "paneId": "p1" }
```

#### `data`

Terminal output from the PTY.

```json
{
  "type": "data",
  "paneId": "p1",
  "data": "bHMgLWxhCgp0b3RhbCA4CmRyaXctZXcK..."
}
```

| Field | Description |
|-------|-------------|
| `type` | Always `"data"` |
| `paneId` | Source pane ID |
| `data` | Base64-encoded terminal output (may contain ANSI escape codes) |

#### `exit`

Sent when the PTY process exits (e.g., user types `exit`).

```json
{ "type": "exit", "paneId": "p1" }
```

The pane is also removed from the server's panes map.

---

## node-pty Integration

### Session Creation

```javascript
const pty = require('node-pty');

const session = pty.spawn(shell, [], {
  name: 'xterm-256color',
  cols: cols || 80,
  rows: rows || 24,
  cwd: process.env.HOME || '/root',
  env: sanitizeEnv(env),
});
```

### Shell Selection

1. `$SHELL` environment variable (if set)
2. `powershell.exe` (on Windows)
3. `bash` (fallback)

### Environment Sanitization

Only safe environment variables are passed to the PTY:

| Variable | Description |
|----------|-------------|
| `HOME` | Home directory |
| `USER` | Current username |
| `LOGNAME` | Login name |
| `SHELL` | Shell path |
| `TERM` | Always `xterm-256color` |
| `PATH` | Always included |
| `LANG` | Locale |
| `LC_ALL` | Locale override |
| `EDITOR` | Default editor |
| `PAGER` | Default pager |
| `DISPLAY` | X display |
| `XAUTHORITY` | X authority file |
| `HOSTNAME` | System hostname |
| `HOST` | System hostname |
| `TZ` | Timezone |
| `PWD` | Current directory |
| `OLDPWD` | Previous directory |

### PTY Events

| Event | Description |
|-------|-------------|
| `onData(callback)` | Terminal output received |
| `onExit(callback)` | PTY process exited |

### PTY Methods

| Method | Description |
|--------|-------------|
| `write(data)` | Send input to the PTY |
| `resize(cols, rows)` | Resize the terminal |
| `kill(signal)` | Send signal to the PTY process |

---

## Multi-Pane Support

Each WebSocket connection maintains a `Map` of active panes:

```javascript
const panes = new Map();
// Key: pane ID (e.g., "p1", "p2")
// Value: { pty: PTYProcess, id: string }
```

### Pane ID Generation

- Auto-generated IDs: `p1`, `p2`, `p3`, ... (incrementing counter per connection)
- Custom IDs: Provided by the client via the `create` message

### Connection Close

When a WebSocket connection closes, **all** panes for that connection are killed:

```javascript
wss.on('connection', (ws) => {
  const panes = new Map();

  ws.on('close', () => {
    for (const [id, pane] of panes) {
      pane.pty.kill('SIGHUP');
    }
    panes.clear();
  });
});
```

This prevents orphaned PTY processes if the browser disconnects.

---

## Terminal Presets

NexusPanel stores reusable command presets in `data/terminal-presets.json`.

### Preset Format

```json
{
  "id": "preset_<timestamp>",
  "label": "Docker PS",
  "command": "docker ps --format 'table {{.ID}}\t{{.Names}}\t{{.Status}}'",
  "category": "Docker"
}
```

### Categories

| Category | Example Commands |
|----------|-----------------|
| System | `htop`, `df -h`, `free -m`, `uname -a` |
| Docker | `docker ps`, `docker images`, `docker logs` |
| Files | `ls -la`, `find . -name "*.log"`, `du -sh *` |
| Network | `ss -tlnp`, `curl ifconfig.me`, `dig example.com` |
| Database | `psql -U postgres`, `pg_dump` |
| Custom | User-defined commands |

### API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/terminal/presets` | List all presets |
| `POST` | `/api/terminal/presets` | Create preset |
| `PUT` | `/api/terminal/presets/:id` | Update preset |
| `DELETE` | `/api/terminal/presets/:id` | Delete preset |

---

## Frontend Integration

### xterm.js Configuration

The terminal frontend uses xterm.js 5.5.0 with the following addons:

| Addon | Purpose |
|-------|---------|
| `FitAddon` | Auto-resize terminal to fit container |
| `SearchAddon` | Search within terminal output |
| `WebLinksAddon` | Clickable URLs in terminal output |
| `WebGLAddon` | GPU-accelerated rendering |
| `Unicode11Addon` | Full Unicode support |

### WebSocket URL

```javascript
const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${location.host}/ws/terminal`;
```

### Data Flow

```
User types in xterm.js
       │
1. xterm.js onData fires
       │
2. Encode to base64: btoa(data)
       │
3. Send via WebSocket: { type: "input", paneId, data }
       │
4. Server decodes: Buffer.from(data, 'base64').toString()
       │
5. Write to PTY: pty.write(decoded)
       │
6. PTY outputs to shell
       │
7. Shell output via pty.onData
       │
8. Server encodes to base64
       │
9. Send via WebSocket: { type: "data", paneId, data }
       │
10. Client decodes and writes to xterm.js
```

---

## Error Handling

### Connection Errors

| Error | Handling |
|-------|----------|
| WebSocket fails to connect | Show error message, offer retry |
| Authentication fails (401) | Redirect to login page |
| PTY spawn fails | Send error notification, close pane |
| PTY exits unexpectedly | Send `exit` message, update UI |
| Browser disconnects | All panes killed server-side |

### Idle Disconnect

The nginx `proxy_read_timeout` should be set to 3600s (1 hour) to prevent idle terminal disconnects. The terminal frontend sends keepalive resize events to maintain the connection.

---

*Part of [NexusPanel Documentation](../README.md)*
