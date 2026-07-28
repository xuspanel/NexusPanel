# FTP API

vsftpd account management, SSL, quotas, bandwidth monitoring, and configuration.

All endpoints are prefixed with `/api/ftp`. Admin only.

---

## Service & Status

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/ftp/status` | vsftpd service status |
| `POST` | `/ftp/service/:action` | start/stop/restart vsftpd |

## Account Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/ftp/accounts` | List FTP accounts |
| `GET` | `/ftp/accounts/:user` | Get account detail |
| `POST` | `/ftp/accounts` | Create FTP user |
| `PUT` | `/ftp/accounts/:user` | Edit FTP user |
| `DELETE` | `/ftp/accounts/:user` | Delete FTP user |
| `POST` | `/ftp/enable/:user` | Enable account |
| `POST` | `/ftp/disable/:user` | Disable account |

## Bulk Operations

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/ftp/bulk/enable` | Bulk enable |
| `POST` | `/ftp/bulk/disable` | Bulk disable |
| `POST` | `/ftp/bulk/delete` | Bulk delete |

## Quotas & Bandwidth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/ftp/quota/:user` | Set disk quota |
| `GET` | `/ftp/quota/:user` | Get disk quota |
| `GET` | `/ftp/bandwidth` | Bandwidth stats |

## Configuration

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/ftp/config` | Read vsftpd.conf |
| `PUT` | `/ftp/config` | Save vsftpd.conf |
| `PUT` | `/ftp/config/value` | Update single config key |
| `PUT` | `/ftp/passive-ports` | Set passive port range |

## SSL

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/ftp/ssl` | Get FTP SSL config |
| `POST` | `/ftp/ssl/generate` | Generate SSL cert |

## Monitoring

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/ftp/logs` | FTP logs |
| `GET` | `/ftp/activity` | Connection activity |
| `POST` | `/ftp/test` | Test FTP connection |

---

*Part of [NexusPanel API Reference](../README.md)*
