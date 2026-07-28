# Emails API

Email account management and IMAP webmail client.

All endpoints are prefixed with `/api/emails`. Admin only.

---

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/emails/list` | Admin | List all email accounts |
| `GET` | `/emails/domains` | Admin | List email domains |
| `POST` | `/emails/create` | Admin | Create email account |
| `GET` | `/emails/:user/inbox` | Admin | Fetch mailbox messages |
| `GET` | `/emails/:user/message/:file` | Admin | Read single message |
| `GET` | `/emails/:user/folders` | Admin | List IMAP folders |
| `POST` | `/emails/:user/send` | Admin | Send email |
| `POST` | `/emails/:user/move` | Admin | Move messages |
| `POST` | `/emails/:user/delete` | Admin | Delete messages |
| `GET` | `/emails/:user/quota` | Admin | Mailbox storage quota |

---

## Request/Response Examples

### POST /emails/create

```json
{
  "username": "john",
  "domain": "example.com",
  "password": "securepass",
  "quota": "1024"
}
```

### GET /emails/:user/inbox

**Params:** `folder` (default: INBOX), `page`, `limit`

```json
{
  "messages": [
    {
      "uid": "1",
      "from": "sender@example.com",
      "to": "john@example.com",
      "subject": "Hello World",
      "date": "2026-07-28T12:00:00Z",
      "size": 12345,
      "read": false
    }
  ],
  "total": 42,
  "page": 1,
  "pages": 5
}
```

### POST /emails/:user/send

```json
{
  "to": "recipient@example.com",
  "subject": "Test Email",
  "body": "Hello, this is a test.",
  "cc": "",
  "bcc": ""
}
```

---

*Part of [NexusPanel API Reference](../README.md)*
