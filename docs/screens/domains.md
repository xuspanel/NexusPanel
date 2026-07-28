# Domains Screen

nginx virtual host management with SSL certificate issuance and live config editing.

---

## Layout

```
+------------------------------------------------------------------+
|  Domain Manager   [Create Domain]   [Search: ____________]       |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ 🌐 example.com        :443   SSL ✓   nginx: active  [...]  │|
|  │ 🌐 api.example.com    :3000  SSL ✓   nginx: active  [...]  │|
|  │ 🌐 staging.example.com:8080  SSL ✗   nginx: active  [...]  │|
|  └──────────────────────────────────────────────────────────────┘|
+------------------------------------------------------------------+
```

---

## Features

| Feature | Description |
|---------|-------------|
| Domain List | All configured vhosts |
| Create Domain | Name, port, SSL toggle |
| Edit Domain | Modify port, SSL settings |
| Delete Domain | Remove vhost (with confirmation) |
| nginx Config | View/edit raw nginx config |
| SSL Issue | Issue Let's Encrypt certificate |
| Subdomain Support | Create subdomains under parent |
| Bulk Delete | Delete multiple domains |
| Auto Port | Get next available port |

---

## Modals

- Create Domain (domain, port, enable SSL)
- nginx Config Editor (Ace editor with syntax highlighting)
- SSL Issue (domain, email, staging toggle)
- Delete Confirmation

---

## Event Delegation

Buttons use `data-domains-action` attributes.

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
