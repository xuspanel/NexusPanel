# Git Deploy API

Clone, build, and deploy Git repositories to panel-managed domains. Includes SSH key management, environment variable injection, symlink-based rollback, and webhook auto-deploy (GitHub/GitLab push events).

All endpoints are prefixed with `/api/deploy` and require authentication, except the webhook endpoint at `/webhook/:deploymentId/:token`.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/deploy/history` | List all deployments |
| `POST` | `/api/deploy/git` | Start a new deployment (202) |
| `GET` | `/api/deploy/:id` | Get deployment record |
| `GET` | `/api/deploy/:id/log?lines=N` | Last N log lines (default 50, max 1000) |
| `POST` | `/api/deploy/:id/rollback` | Rollback to previous deployment |
| `GET` | `/api/deploy/:id/env` | Get environment variables |
| `PUT` | `/api/deploy/:id/env` | Update environment variables |
| `POST` | `/api/deploy/:id/webhook-url` | Regenerate webhook URL |
| `GET` | `/api/deploy/ssh` | Check if SSH key is stored |
| `POST` | `/api/deploy/ssh` | Store SSH private key |
| `DELETE` | `/api/deploy/ssh` | Delete SSH key |
| `POST` | `/webhook/:deploymentId/:token` | GitHub/GitLab webhook (no auth) |

---

## POST /api/deploy/git

```json
{
  "repo_url": "https://github.com/user/repo.git",
  "branch": "main",
  "domain": "myapp.s2u.me",
  "system_user": "testuser",
  "app_type": "auto",
  "build_cmd": "",
  "env_vars": "NODE_ENV=production\nAPI_KEY=xyz",
  "force": false
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `repo_url` | string | yes | `https://`, `git@`, `ssh://` only; `file://` blocked |
| `branch` | string | no | Default: `main`; alphanumeric + `-`, `_`, `/` |
| `domain` | string | yes | Existing domain in `data/domains.json` |
| `system_user` | string | yes | OS user (uid ≥ 1000, login shell) |
| `app_type` | string | no | `auto` (detect), `node`, `php`, `static` |
| `build_cmd` | string | no | Override build command |
| `env_vars` | string | no | `KEY=value` lines, encrypted at rest |
| `force` | boolean | no | Overwrite existing deployment |

Response (202):

```json
{ "ok": true, "id": "uuid", "status": "deploying" }
```

| HTTP | Condition |
|------|-----------|
| `202` | Accepted; watch `GET /api/deploy/:id` + `/log` |
| `400` | Invalid URL, domain, user, branch, duplicate deploy |
| `429` | \> 3 simultaneous deploys for same system user |

---

## Deployment Record

```json
{
  "id": "uuid",
  "user_id": "testuser",
  "domain": "myapp.s2u.me",
  "repo_url": "https://github.com/user/repo.git",
  "branch": "main",
  "commit_hash": "a1b2c3d4e5f6",
  "app_type": "node",
  "install_path": "/home/testuser/domains/myapp.s2u.me/public_html",
  "deploy_base": "/home/testuser/deployments/myapp.s2u.me",
  "deploy_dir": "/home/testuser/deployments/myapp.s2u.me/20260804T120000Z",
  "build_cmd": "npm run build",
  "pm2_name": "myapp.s2u.me",
  "proxy_port": 41001,
  "status": "running",
  "url": "http://myapp.s2u.me:8000",
  "webhook_url": "https://panel.meedo51.com/webhook/<id>/<token>",
  "env_vars_stored": false,
  "error": "",
  "created_at": "2026-08-04T12:00:00.000Z",
  "finished_at": "2026-08-04T12:01:30.000Z"
}
```

Statuses: `deploying`, `running`, `failed`, `rolled_back`.

---

## SSH Key Management

### POST /api/deploy/ssh

```json
{ "private_key": "-----BEGIN OPENSSH PRIVATE KEY-----\n..." }
```

The key is AES-256-GCM encrypted and stored in `data/deploy_keys.json`. Before each git clone, the key is decrypted and written to `/home/<user>/.ssh/id_rsa` (chmod 600). Host keys for `github.com` and `gitlab.com` are scanned into `known_hosts`.

---

## Webhook (`POST /webhook/:deploymentId/:token`)

Triggered by GitHub/GitLab push events. No authentication required — the token in the URL path verifies the deployment.

1. Verify webhook token against deployment record
2. Optionally verify `X-Hub-Signature-256` against `WEBHOOK_SECRET` env var
3. Background job: `git pull`, re-run build, atomically switch symlink, restart PM2
4. Returns `202 { status: "triggered", id: "..." }`

---

## Rollback (`POST /api/deploy/:id/rollback`)

Switches the `public_html` symlink to the previous deployment directory (sorted by timestamp, keep last 5). Nginx is reloaded if needed. The previous deployment stays accessible for future rollbacks.

---

## Install behavior (background)

- Git clone with `--depth 1` (shallow clone, 5 min timeout)
- For SSH repos: decrypt key → write to `~/.ssh/id_rsa` → `ssh-keyscan github.com` → clone with `GIT_SSH_COMMAND`
- Auto-detect: scan for `package.json` → Node, `composer.json` → PHP, fallback → Static
- Node: `npm ci --production=false` → `npm run build` (or custom command)
- PHP: `composer install --no-dev --optimize-autoloader`
- Static: skip build
- Symlink: `ln -sfn <deploy_dir> <public_html>` atomically
- PM2 for Node: generate `ecosystem.config.js`, `pm2 start` + `pm2 save`
- Nginx: `proxy_pass` for Node, `fastcgi` + PHP pool for PHP, `root` for Static
- Verify: curl to domain through nginx with proper Host header
- Cleanup: remove deploy dirs older than the last 5
- On error: revert symlink to previous directory, stop PM2, revert nginx
