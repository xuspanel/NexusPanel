# Email Manager Screen

Email account management with full IMAP webmail client (inbox, compose, reply, forward, folders).

---

## Layout

```
+------------------------------------------------------------------+
|  Email Accounts   [Create Account]                               |
+------------------------------------------------------------------+
|  ┌────────────┐  ┌────────────────────────────────────────────┐ |
|  │ Accounts   │  │  Inbox                                     │ |
|  ├────────────┤  │  ┌──────────────────────────────────────┐ │ |
|  │ john@...   │  │  │ 📧 From: sender@...  Re: Hello  Jul 28│ │ |
|  │ jane@...   │  │  │ 📧 From: admin@...   Alert    Jul 27 │ │ |
|  │            │  │  │ 📧 From: team@...    Update   Jul 26 │ │ |
|  │ Domains    │  │  └──────────────────────────────────────┘ │ |
|  ├────────────┤  │                                            │ |
|  │ example.com│  │  [Reply] [Forward] [Delete]                │ |
|  │ dev.local  │  └────────────────────────────────────────────┘ |
|  └────────────┘                                                 |
+------------------------------------------------------------------+
```

---

## Views

| View | Description |
|------|-------------|
| Accounts | List email accounts with quotas |
| Compose | New email composer |
| Inbox | Message list with folder navigation |
| Message | Full message view |

---

## Account Management

| Action | Description |
|--------|-------------|
| Create Account | Username, domain, password, quota |
| Delete Account | Remove email account |
| View Quota | Mailbox storage usage |

---

## Webmail Features

| Feature | Description |
|---------|-------------|
| Folder Navigation | INBOX, Sent, Drafts, Trash, custom folders |
| Message List | Subject, from, date, size, read/unread |
| Compose | To, CC, BCC, subject, body |
| Reply | Reply to sender |
| Forward | Forward message |
| Move | Move to folder |
| Delete | Move to trash |
| Quota | Mailbox storage indicator |

---

## Event Delegation

All buttons use `data-mail-action` attributes.

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.mail-accounts-panel` | Account list sidebar |
| `.mail-inbox` | Message list |
| `.mail-message` | Full message view |
| `.mail-compose` | Compose form |
| `.mail-folder-list` | Folder navigation |

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/emails/list` | List accounts |
| `GET` | `/api/emails/domains` | List domains |
| `POST` | `/api/emails/create` | Create account |
| `GET` | `/api/emails/:user/inbox` | Fetch messages |
| `GET` | `/api/emails/:user/message/:file` | Read message |
| `GET` | `/api/emails/:user/folders` | List folders |
| `POST` | `/api/emails/:user/send` | Send email |
| `POST` | `/api/emails/:user/move` | Move message |
| `POST` | `/api/emails/:user/delete` | Delete message |
| `GET` | `/api/emails/:user/quota` | Get quota |

---

*Part of [NexusPanel Documentation](../README.md)*
