# Deployment Center (Git Deploy)

Clone, build, and deploy any Git repository to a panel-managed domain — with automatic type detection, PM2 management, symlink-based rollback, and webhook auto-deploy for GitHub/GitLab push events.

Accessible via the **Deployments** screen → **Git Deploy** tab.

---

## Layout

```
+------------------------------------------------------------------+
|  🚀 Deployments  One-Click Apps · Git Deploy              [↻]     |
+------------------------------------------------------------------+
|  [⚡ Quick Apps]  [📦 Git Deploy]                                 |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ New Deployment                                                │|
|  │ Repo URL: [https://github.com/user/repo.git            ]      │|
|  │ Branch: [main      ]  Domain: [myapp.s2u.me            ]      │|
|  │ System User: [testuser  ]  Type: [Auto-detect  v]             │|
|  │ Build Command: [                                     ]        │|
|  │ Env Vars: [NODE_ENV=production                       ]        │|
|  │ [Force overwrite]  [🚀 Deploy]                                │|
|  └──────────────────────────────────────────────────────────────┘|
|  ┌────────────────┐                                               |
|  │ SSH Key: ✅ set │ 🔑 Manage SSH Key                           │|
|  │ Recent: ...     │                                              │|
|  └────────────────┘                                               |
|                                                                   |
|  Deployment History                                               |
|  ┌──────────────────────────────────────────────────────────────┐│
|  │ Repo    │ Branch │ Domain │ Commit │ Type │ Status │ Actions ││
|  │ my-app  │ main   │ d.com   │ a1b2c3 │ node │ 🟢Live │ Logs ↩││
|  └──────────────────────────────────────────────────────────────┘│
+------------------------------------------------------------------+
```

## Features

| Feature | Description |
|---------|-------------|
| Git URL validation | Only `https://`, `git@`, `ssh://` allowed; `file://` blocked |
| Branch sanitization | Alphanumeric + `-`, `_`, `/` only |
| Auto-detection | Scans for `package.json` (Node), `composer.json` (PHP), falls back to Static |
| Build step | Node: `npm ci` → `npm run build`; PHP: `composer install --no-dev`; Static: skip |
| Symlink deployment | New deploy creates timestamped dir under `/home/user/deployments/domain/`; `public_html` is a symlink |
| Rollback | Switch symlink to previous deployment (keeps last 5) |
| PM2 | Node apps: generated `ecosystem.config.js`, `pm2 start` + `pm2 save` under the system user |
| Nginx | Node: `proxy_pass`; PHP: fastcgi + php-fpm pool; Static: `root` |
| SSH deploy keys | Per-user, encrypted with AES-256-GCM, written to `~/.ssh/id_rsa` (chmod 600) before clone |
| Webhook auto-deploy | POST to `https://panel.meedo51.com/webhook/<id>/<token>` → git pull + rebuild + pm2 restart |
| Env vars | KEY=value stored encrypted, injected into `.env` on each deploy |
| Concurrency | Max 3 simultaneous deploys per system user (HTTP 429 beyond) |
| Timeout | Build step killed after 10 minutes |

---

## Deployment Flow

1. Enter the **Git repo URL**, choose a **branch**, pick a **domain** and **system user**.
2. Optionally set a custom **build command**, **environment variables**, and toggle **force overwrite**.
3. Click **Deploy** — the request returns immediately (HTTP 202).
4. The progress modal streams logs every 2 seconds.
5. On success: URL + webhook URL + branch/commit info shown with copy buttons.
6. On failure: log preserved, error shown, symlink reverted.

## Webhook Flow

1. After first successful deploy, a webhook URL is generated (`https://panel.meedo51.com/webhook/<id>/<token>`).
2. Add this URL to your GitHub/GitLab repo settings (content type: `application/json`, trigger: push).
3. On push events, the webhook handler:
   - Verifies the token
   - `git pull origin <branch>` in the existing deploy directory
   - Re-runs the build step
   - Switches the symlink atomically
   - Restarts PM2 (Node apps)
   - Returns 202

---

## Security

- Git clone and build run as `sudo -u <system_user>` — never as root.
- SSH keys stored AES-256-GCM encrypted (key derived from `JWT_SECRET`).
- Environment variables encrypted at rest, decrypted only for injection during deploy.
- Webhook tokens are 32-char URL-safe random strings, verified on every request.
- Optional `X-Hub-Signature-256` verification via `WEBHOOK_SECRET` env var.
- `file://` protocol blocked to prevent filesystem escape.
