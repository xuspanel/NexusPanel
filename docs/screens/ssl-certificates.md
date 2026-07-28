# SSL Certificates Screen

Let's Encrypt certificate management with expiry tracking, issuance, and renewal.

---

## Layout

```
+------------------------------------------------------------------+
|  SSL Certificates   Total: 32  Expiring: 3  [Issue] [Renew All]  |
+------------------------------------------------------------------+
|  Search: [________________]   Sort: [Expiry ▼]                   |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ 🔒 example.com           RSA   Exp: Oct 26 (90d)  ✅ Valid  │|
|  │ 🔒 api.example.com       ECDSA Exp: Sep 15 (49d)  ✅ Valid  │|
|  │ ⚠️  old.example.com       RSA   Exp: Aug 05 (8d)   ⚡ Expiring│|
|  │ 🔒 staging.example.com   ECDSA Exp: Jul 30 (2d)   ⚡ Expiring│|
|  └──────────────────────────────────────────────────────────────┘|
+------------------------------------------------------------------+
```

---

## Features

| Feature | Description |
|---------|-------------|
| Certificate List | All certs with expiry badges |
| Expiry Tracking | Days remaining with color coding |
| Issue | Request new certificate via certbot |
| Renew | Force-renew individual certificate |
| Renew All | Bulk renew all certificates |
| Dry Run | Test renewal without applying |
| Auto-Renewal | Timer/cron status display |
| Detail View | Full cert info via openssl |
| Search | Filter by domain, key type |
| Revocation | Revoke via certbot |

---

## Expiry Color Coding

| Days Left | Badge Color |
|-----------|-------------|
| > 30 days | Green (Valid) |
| 7-30 days | Yellow (Warning) |
| < 7 days | Red (Critical) |
| Expired | Gray (Expired) |

---

## Modals

- Issue Certificate (domain, email, staging toggle)
- Certificate Detail (full openssl info)
- Dry Run Results
- Revoke Confirmation

---

## Event Delegation

Buttons use `data-ssl-action` attributes.

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.ssl-cert-card` | Certificate list item |
| `.ssl-status-badge` | Expiry status badge |
| `.ssl-summary-bar` | Stats bar |
| `.ssl-detail-modal` | Certificate detail view |

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/ssl` | List certificates |
| `GET` | `/api/ssl/:name` | Certificate details |
| `POST` | `/api/ssl/issue` | Issue certificate |
| `POST` | `/api/ssl/renew/:domain` | Renew |
| `POST` | `/api/ssl/renew-all` | Renew all |
| `POST` | `/api/ssl/dry-run` | Test renewal |
| `GET` | `/api/ssl/auto-renew` | Auto-renew status |

---

*Part of [NexusPanel Documentation](../README.md)*
