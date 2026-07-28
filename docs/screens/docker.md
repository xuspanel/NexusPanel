# Docker Manager Screen

Container, image, and network management with Docker Compose project grouping.

---

## Layout

```
+------------------------------------------------------------------+
|  Docker Manager   [Daemon: Running]   [Pull Image] [Prune]       |
+------------------------------------------------------------------+
|  Containers │ Images │ Networks │ Compose │ Info                  |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ 🟢 nginx-proxy     nginx:latest      running   2h  12MB    │|
|  │ 🟢 app-backend     node:18           running   2h  45MB    │|
|  │ 🔴 old-legacy      ubuntu:20.04      stopped   3d   0B     │|
|  │ ─────────────────────────────────────────────────────────── │|
|  │ [Start] [Stop] [Restart] [Logs] [Inspect] [Remove]        │|
|  └──────────────────────────────────────────────────────────────┘|
+------------------------------------------------------------------+
```

---

## Tabs

| Tab | Content |
|-----|---------|
| Containers | All containers with status, image, size |
| Images | Available Docker images |
| Networks | Docker networks |
| Compose | Docker Compose projects |
| Info | Docker daemon information |

---

## Container Management

| Action | Description |
|--------|-------------|
| Start | Start stopped container |
| Stop | Stop running container |
| Restart | Restart container |
| Remove | Delete container |
| Logs | View container logs |
| Inspect | Container inspection details |
| Stats | CPU/Memory/Network usage |
| Exec | Open terminal in container |
| Browse | Browse container filesystem |

---

## Image Management

| Action | Description |
|--------|-------------|
| Pull | Pull image from registry |
| Remove | Delete image |
| Inspect | Image inspection details |
| History | Image layer history |
| Tag | Tag image |

---

## Compose Projects

| Action | Description |
|--------|-------------|
| List | Auto-detected Compose projects |
| Up | Start project |
| Down | Stop project |
| Detail | View project services |

---

## Event Delegation

All buttons use `data-docker-action` attributes.

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.docker-prompt` | Docker-specific prompt styling |
| `.docker-container-card` | Container list item |
| `.docker-image-card` | Image list item |
| `.docker-status-badge` | Running/stopped badge |
| `.docker-logs-viewer` | Log output container |

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/docker/containers` | List containers |
| `POST` | `/api/docker/containers/:id/start` | Start |
| `POST` | `/api/docker/containers/:id/stop` | Stop |
| `GET` | `/api/docker/containers/:id/logs` | Logs |
| `GET` | `/api/docker/images` | List images |
| `POST` | `/api/docker/images/pull` | Pull image |
| `GET` | `/api/docker/compose/projects/list` | Compose projects |

---

*Part of [NexusPanel Documentation](../README.md)*
