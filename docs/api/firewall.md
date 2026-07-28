# Firewall API

Multi-backend firewall management supporting firewalld, ufw, nftables, and iptables.

All endpoints are prefixed with `/api/firewall`. Admin only.

---

## Core Operations

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/firewall` | Get all rules |
| `GET` | `/firewall/backend` | Detect active backend |
| `GET` | `/firewall/services` | Available services |
| `POST` | `/firewall/save` | Persist rules |
| `GET` | `/firewall/raw` | Raw iptables output |
| `GET` | `/firewall/export` | Export rules |

## iptables Rules

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/firewall/rule` | Append rule |
| `PUT` | `/firewall/rule` | Insert/replace rule |
| `DELETE` | `/firewall/rule/:chain/:num` | Delete rule |
| `PUT` | `/firewall/policy` | Set chain policy |
| `POST` | `/firewall/chain` | Create chain |
| `DELETE` | `/firewall/chain/:chain` | Delete chain |
| `PUT` | `/firewall/chain/:chain/rename` | Rename chain |
| `POST` | `/firewall/flush/:chain` | Flush chain |

## firewalld Zones

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/firewall/zone/service` | Add service to zone |
| `DELETE` | `/firewall/zone/service` | Remove service |
| `POST` | `/firewall/zone/port` | Add port to zone |
| `DELETE` | `/firewall/zone/port` | Remove port |
| `POST` | `/firewall/zone/rich-rule` | Add rich rule |
| `DELETE` | `/firewall/zone/rich-rule` | Remove rich rule |
| `PUT` | `/firewall/zone/default` | Set default zone |
| `PUT` | `/firewall/zone/masquerade` | Toggle masquerade |
| `POST` | `/firewall/zone/icmp-block` | Add ICMP block |
| `DELETE` | `/firewall/zone/icmp-block` | Remove ICMP block |

## Monitoring

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/firewall/stats` | Live rule stats |
| `GET` | `/firewall/conntrack` | Connection tracking |
| `GET` | `/firewall/top-talkers` | Top bandwidth consumers |
| `GET` | `/firewall/log` | Firewall log |

---

## Backend Detection

NexusPanel auto-detects the active firewall in priority order:

1. **firewalld** — `firewall-cmd --state`
2. **ufw** — `ufw status`
3. **nftables** — `nft list ruleset`
4. **iptables** — `iptables -L`
5. **none** — No firewall detected

---

*Part of [NexusPanel API Reference](../README.md)*
