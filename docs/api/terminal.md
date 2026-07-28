# Terminal API

Terminal command presets management. The actual terminal runs over WebSocket at `/ws/terminal`.

All endpoints are prefixed with `/api/terminal`. Auth required.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/terminal/presets` | List all presets |
| `POST` | `/terminal/presets` | Create preset |
| `PUT` | `/terminal/presets/:id` | Update preset |
| `DELETE` | `/terminal/presets/:id` | Delete preset |

---

## Request/Response

### POST /terminal/presets

```json
{
  "label": "Docker PS",
  "command": "docker ps --format 'table {{.ID}}\t{{.Names}}\t{{.Status}}'",
  "category": "Docker"
}
```

### Response

```json
{
  "id": "preset_1690000000000",
  "label": "Docker PS",
  "command": "docker ps ...",
  "category": "Docker"
}
```

### Categories

`System`, `Docker`, `Files`, `Network`, `Database`, `Custom`

---

## WebSocket Terminal

The terminal itself runs over WebSocket at `/ws/terminal`. See [WebSocket Terminal Protocol](../architecture/websocket.md) for the full message format documentation.

### Connection

```
ws://host/ws/terminal  (with JWT cookie)
```

### Message Types (Client to Server)

| Type | Description |
|------|-------------|
| `create` | Create new pane |
| `create-pane` | Create pane with auto-ID |
| `input` | Send user input (base64) |
| `resize` | Resize terminal |
| `close-pane` | Close pane gracefully |
| `kill` | Kill pane |

### Message Types (Server to Client)

| Type | Description |
|------|-------------|
| `ready` | Connection ready |
| `created` | Pane created |
| `pane-created` | Pane created (auto-ID) |
| `data` | Terminal output (base64) |
| `pane-closed` | Pane closed |
| `exit` | PTY process exited |

---

*Part of [NexusPanel API Reference](../README.md)*
