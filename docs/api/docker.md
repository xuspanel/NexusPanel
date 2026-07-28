# Docker API

Container, image, network, and Compose project management.

All endpoints are prefixed with `/api/docker`. Admin only.

---

## Containers

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/containers` | List containers |
| `POST` | `/containers/:id/start` | Start container |
| `POST` | `/containers/:id/stop` | Stop container |
| `POST` | `/containers/:id/restart` | Restart container |
| `DELETE` | `/containers/:id` | Remove container |
| `GET` | `/containers/:id/logs` | Container logs |
| `GET` | `/containers/:id/inspect` | Inspect container |
| `GET` | `/containers/:id/stats` | Container stats |
| `POST` | `/containers/create` | Create container |
| `GET` | `/containers/:id/fs` | Browse container filesystem |
| `GET` | `/containers/:id/fs/read` | Read container file |

## Images

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/images` | List images |
| `DELETE` | `/images/:id` | Remove image |
| `GET` | `/images/:id/inspect` | Inspect image |
| `GET` | `/images/:id/history` | Image layer history |
| `POST` | `/images/pull` | Pull image |

## Networks

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/networks` | List networks |
| `GET` | `/networks/:id` | Inspect network |
| `DELETE` | `/networks/:id` | Remove network |

## Compose Projects

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/compose/projects/list` | List Compose projects |
| `GET` | `/compose/:name` | Project detail |
| `POST` | `/compose/:name/up` | docker-compose up |
| `POST` | `/compose/:name/down` | docker-compose down |

## General

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/info` | Docker daemon info |
| `POST` | `/prune` | Prune unused resources |

---

## WebSocket

Docker also provides a WebSocket endpoint at `/ws/docker` for container exec sessions.

---

*Part of [NexusPanel API Reference](../README.md)*
