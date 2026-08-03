# Apps API

One-click application installation (WordPress, Laravel, Node.js/Express, Next.js static export, Static HTML) onto panel-managed domains, with background installs, streaming logs, and encrypted credential storage.

All endpoints are prefixed with `/api/apps` and require authentication. Install endpoints return `202` immediately and run in the background.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/apps/catalog` | List the installable app catalog |
| `GET` | `/apps/system-users` | List real OS users (uid ≥ 1000, login shell) available as install owners |
| `GET` | `/apps/targets` | List domains available for install (no active install) |
| `GET` | `/apps/list` | List installed applications (safe view) |
| `GET` | `/apps/:id` | Get one application; includes credentials for admins / owning user |
| `GET` | `/apps/:id/log?lines=N` | Last N log lines (default 50, max 1000) |
| `POST` | `/apps/install` | Start an install (202; 429 when per-user concurrency exceeded) |
| `POST` | `/apps/:id/uninstall` | Uninstall an application |

---

## Catalog

Each catalog entry:

```json
{ "app_type": "wordpress", "name": "WordPress", "icon": "🚀",
  "runtime": "PHP 8.3 · WP-CLI", "db": "MariaDB",
  "needsDb": true, "needsPhp": true, "desc": "…" }
```

App types: `wordpress`, `laravel`, `node`, `nextjs`, `static`.

---

## POST /apps/install

```json
{
  "app_type": "wordpress",
  "system_user": "demo",
  "domain": "blog.s2u.me",
  "title": "My Blog",
  "admin_email": "me@example.com"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `app_type` | string | yes | One of the catalog types |
| `system_user` | string | yes | OS user (uid ≥ 1000, not `root`); steps run via `sudo -u` |
| `domain` | string | yes | Existing domain in `data/domains.json`, no active install |
| `title` | string | no | Site/app title (defaults to domain) |
| `admin_email` | string | WordPress only | Valid email required for WP admin |

Responses:

```json
{ "ok": true, "id": "uuid", "status": "installing" }
```

| HTTP | Condition |
|------|-----------|
| `202` | Accepted; watch `GET /apps/:id` + `/log` |
| `400` | Invalid app type, user, domain, duplicate install, non-empty path, bad email |
| `429` | > 2 simultaneous installs for the same system user |

---

## GET /apps/:id

```json
{ "app": { "id": "…", "user_id": "demo", "domain": "blog.s2u.me",
  "app_type": "wordpress", "install_path": "/home/demo/…",
  "web_root": "…", "proxy_port": null, "status": "running",
  "url": "https://blog.s2u.me", "error": "",
  "created_at": "…", "updated_at": "…", "finished_at": "…" } }
```

For admins and the owning user, credential fields are added: `admin_username`, `admin_password`, `db_name`, `db_user`, `db_password`, `login_url`.

---

## Install behavior (background)

- `ensureMysqlReady` — installs `mariadb-server` + `php-mysqlnd` lazily/idempotently on first DB app.
- `ensurePrereqs` — installs WP-CLI / Composer when missing.
- Per-user php-fpm pool (`/etc/php-fpm.d/<user>.conf`, ondemand) for PHP apps.
- Node/Next.js apps: PM2 under the user (`PM2_HOME=/home/<user>/.pm2`), bound 127.0.0.1 on a free 41000–49999 port, nginx `proxy_pass`.
- WP/Laravel: nginx `root` set to `public_html` (Laravel: `…/public`) with a fastcgi `location ~ \.php$` block to the user's pool socket.
- Verify step curls the domain through nginx with a `Host` header; non-2xx is a warning, not a failure.
- On error: PM2 app deleted, DB dropped, files removed, nginx reverted, pool removed if unused, record marked `failed`.
- On panel boot, stale `pending`/`installing` records are swept to `failed`.
