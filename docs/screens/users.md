# Users Screen

System user management with bulk operations for locking, unlocking, and deleting users.

---

## Layout

```
+------------------------------------------------------------------+
|  VPS Users   [Create User]   [Search: ____________]              |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ ☐  username   uid   gid   shell         home       actions  │|
|  │ ☐  root       0     0     /bin/bash     /root      [...]   │|
|  │ ☐  www-data   33    33    /usr/sbin/... /var/www   [...]   │|
|  │ ☐  deploy     1000  1000  /bin/bash     /home/...  [...]   │|
|  └──────────────────────────────────────────────────────────────┘|
|                                                                  |
|  Selected: 2  [Lock] [Unlock] [Delete]                          |
+------------------------------------------------------------------+
```

---

## Features

| Feature | Description |
|---------|-------------|
| User List | System users with uid, gid, shell, home |
| Search/Filter | Real-time search by username |
| Select All | Toggle all users checkbox |
| Bulk Operations | Lock, unlock, delete multiple users |
| Create User | Form with username, password, shell, groups |
| Edit User | Modify shell, groups, home directory |
| Delete User | Remove user (with confirmation) |

---

## User Detail

| Field | Description |
|-------|-------------|
| Username | Login name |
| UID | User ID |
| GID | Primary group ID |
| Shell | Login shell |
| Home | Home directory |
| Groups | Group memberships |

---

## Modals

- Create User (username, password, shell, home, groups)
- Edit User (shell, groups)
- Delete Confirmation

---

## Event Delegation

Buttons use `data-users-action` attributes.

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.db-header` | Module header |
| `.db-search-input` | Search input |
| `.db-table` | User list table |
| `.db-toolbar` | Bulk action toolbar |

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/users/list` | List users |
| `GET` | `/api/users/meta/options` | Shells/groups |
| `POST` | `/api/users/create` | Create user |
| `PUT` | `/api/users/:user` | Update user |
| `DELETE` | `/api/users/:user` | Delete user |
| `POST` | `/api/users/bulk` | Bulk operations |

---

*Part of [NexusPanel Documentation](../README.md)*
