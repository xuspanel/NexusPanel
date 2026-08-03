# Apps & Installer Screen

One-click installation of WordPress, Laravel, Node.js/Express, Next.js (static export), and Static HTML onto any panel-managed domain, running entirely via `sudo -u <system_user>` — never as root.

---

## Layout

```
+------------------------------------------------------------------+
|  🚀 One-Click App Installer            WordPress·Laravel·Node·... [↻] |
+------------------------------------------------------------------+
|  INSTALL AN APPLICATION                                            |
|  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  |
|  │  🚀      │ │  🧩      │ │  🟢      │ │  ▲       │ │  📄      │  |
|  │ WordPress│ │ Laravel  │ │ Node.js  │ │ Next.js  │ │ Static   │  |
|  │ [Install]│ │ [Install]│ │ [Install]│ │ [Install]│ │ [Install]│  |
|  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  |
+------------------------------------------------------------------+
|  MY APPLICATIONS                                                   |
|  ┌────────────────────────────────────────────────────────────┐    |
|  │ Application  Domain  System User  Install Path  Status  …   │    |
|  │ WordPress    blog.com    demo      /home/demo/…   ● Running  │    |
|  └────────────────────────────────────────────────────────────┘    |
+------------------------------------------------------------------+
```

## Features

| Feature | Description |
|---------|-------------|
| App Catalog | 5 one-click apps: WordPress, Laravel, Node.js (Express), Next.js (static export), Static HTML |
| Install Modal | Pick a system user (real OS user, uid ≥ 1000), target domain, title, and WordPress admin email |
| `sudo -u` Execution | Every install/verify step runs as the chosen user with `HOME` set; root only for system prereqs (dnf, systemctl, nginx) |
| DB Auto-Provisioning | MariaDB database + user auto-created for WordPress/Laravel; MariaDB installed lazily on first use |
| Per-User PHP Pool | ondemand php-fpm pool per user with socket `/run/php-fpm/apps-<user>.sock` |
| PM2 Apps | Node/Next.js apps run under the chosen user's PM2, bound to 127.0.0.1 on a free 41000–49999 port, reverse-proxied by nginx |
| Live Progress | Progress modal polls every 2s and streams the last 50 log lines; processing bar |
| Logs Drawer | Per-install log file (`data/apps/<id>.log`) viewable with a refresh button |
| Success Modal | URL, login URL, admin username/password, and database credentials with copy buttons |
| Uninstall | Stops PM2, drops DB, removes files, reverts nginx, removes PHP pool if unused |
| Concurrency Guard | Max 2 simultaneous installs per system user → 3rd returns HTTP 429 |

---

## Install Flow

1. Click an **Install** card in the catalog.
2. In the modal: choose the **system user** (owner), a **domain** with no existing install, a **title**, and (WordPress only) the **admin email**.
3. Click **Install** — the request returns immediately (HTTP 202) and install runs in the background.
4. The progress modal streams logs every 2 seconds until the app reports `running` or `failed`.
5. On success a modal shows the site URL and admin credentials with copy buttons; on failure the log is retained and the app is marked `failed` with rollback performed.

## Statuses

| Status | Meaning |
|--------|---------|
| `installing` | Record created; install in progress (immune to boot sweep) |
| `running` | Deployed and verified (curl returned 2xx; non-2xx only warns) |
| `failed` | Install error; rollback already performed, log preserved |
| `removed` | Successfully uninstalled |

## Security

- Admin password and DB password are stored **AES-256-GCM encrypted** (key derived from `JWT_SECRET`), decrypted only for admins and the owning user.
- Install path is forced under `/home/<user>/domains/<domain>/public_html` (traversal-proof).
- `root` is rejected as an install user.
- After install: `chown -R user:user`, `chmod -R 755`, `wp-config.php`/`.env` → `0600`.
- Nginx changes are applied through the existing test-before-reload pipeline; rollback restores the previous root config.
