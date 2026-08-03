# Domains Screen

nginx virtual host management with SSL certificate issuance, conflict-free port assignment, and live config editing.

---

## Layout

```
+------------------------------------------------------------------+
|  Domain Manager   [Create Domain]   [Search: ____________]       |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ 🌐 example.com        :443   SSL ✓   nginx: active  [...]  │|
|  │ 🌐 api.example.com    :8443  SSL ✓   nginx: active  [...]  │|
|  │ 🌐 staging.example.com:8002  SSL ✗   nginx: active  [...]  │|
|  └──────────────────────────────────────────────────────────────┘|
+------------------------------------------------------------------+
```

---

## Features

| Feature | Description |
|---------|-------------|
| Domain List | All configured vhosts |
| Create Domain | Name, optional port, optional document root, SSL toggle |
| Subdomain Support | Select the associated parent domain (required) |
| Conflict-Free Ports | User port is verified free; empty port auto-assigns a free one (no conflicts) |
| Auto Document Root | Default `/var/www/[domain]`; custom location supported |
| Live Landing Page | A styled "LIVE" index.html is auto-created on first deploy |
| Auto SSL | Let's Encrypt certificate issued automatically via certbot |
| Edit Domain | Modify port, document root, SSL settings |
| Delete Domain | Remove vhost (with confirmation) |
| nginx Config | View/edit raw nginx config |
| SSL Issue | Issue Let's Encrypt certificate |
| Bulk Delete | Delete multiple domains |
| Auto Port | Get next available port |

---

## Create Flow

1. Choose **Domain** or **Subdomain**.
2. For a subdomain, **select the associated parent domain** (must already exist).
3. Enter the full name (subdomains must belong to the selected parent, e.g. `sub.example.com`).
4. Optionally enter a custom port. If left empty, a free port is auto-assigned from `8000-9000` — never reusing a port bound by another domain, nginx vhost, or running service.
5. Optionally enter a document root (location). If left empty, `/var/www/[domain]` is created automatically.
6. A styled **"LIVE" landing page** is auto-created at the root (only if `index.html` does not already exist).
7. If SSL is enabled, a `[domain].conf` is written to `/etc/nginx/conf.d/`, a Let's Encrypt certificate is issued via certbot, and the vhost is served over HTTPS (on port 443 or the chosen custom port). If certbot fails (e.g. DNS not resolving), the domain is still created over HTTP and the SSL error is surfaced.

---

## Generated nginx Config

`[domain].conf` is written to `/etc/nginx/conf.d/` and includes:

- `server_name`, correct `listen` directives (SSL + custom-port redirects)
- `root` (custom or auto `/var/www/[domain]`)
- `index index.html`, `try_files`
- Security headers (`X-Frame-Options`, `X-Content-Type-Options`, etc.)
- Hidden-file access denial
- Per-domain access/error logs

---

## Modals

- Create Domain (type, name, parent domain, port, document root, enable SSL)
- nginx Config Editor (Ace editor with syntax highlighting)
- SSL Issue (domain, email, staging toggle)
- Delete Confirmation

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.dns-domain-card` | Domain list item |
| `.dns-ssl-badge` | SSL status badge |
| `.dns-config-editor` | nginx config editor |

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/domains` | List domains |
| `POST` | `/api/domains/create` | Create domain |
| `PUT` | `/api/domains/:name` | Update domain |
| `DELETE` | `/api/domains/:name` | Delete domain |
| `GET` | `/api/domains/:name/nginx` | Get nginx config |
| `PUT` | `/api/domains/:name/nginx` | Save nginx config |
| `POST` | `/api/domains/:name/ssl` | Issue SSL |

---

*Part of [NexusPanel Documentation](../README.md)*
