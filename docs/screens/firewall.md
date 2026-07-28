# Firewall Screen

Multi-backend firewall management with zones, rules, conntrack, and live stats.

---

## Layout

```
+------------------------------------------------------------------+
|  Firewall Rules   Backend: firewalld   Zone: [public ▼]          |
+------------------------------------------------------------------+
|  Zones │ Rules │ Services │ Monitoring │ Raw                      |
+------------------------------------------------------------------+
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ Zone: public (default)                                       │|
|  │                                                              │|
|  │ Services:                                                    │|
|  │   [http] [https] [ssh]  [+ Add Service]                    │|
|  │                                                              │|
|  │ Ports:                                                       │|
|  │   8080/tcp  3000/tcp  [+ Add Port]                         │|
|  │                                                              │|
|  │ Rich Rules:                                                  │|
|  │   rule family="ipv4" source address="..." accept           │|
|  │                                                              │|
|  │ Masquerade: [✓ Enabled]                                     │|
|  └──────────────────────────────────────────────────────────────┘|
+------------------------------------------------------------------+
```

---

## Tabs

| Tab | Content |
|-----|---------|
| Zones | firewalld zone management |
| Rules | iptables chain/rule management |
| Services | Service overview across zones |
| Monitoring | Live stats, conntrack, top talkers, log |
| Raw | Raw iptables/firewalld output |

---

## Backend Detection

NexusPanel auto-detects the active firewall:

| Priority | Backend | Detection |
|----------|---------|-----------|
| 1 | firewalld | `firewall-cmd --state` |
| 2 | ufw | `ufw status` |
| 3 | nftables | `nft list ruleset` |
| 4 | iptables | `iptables -L` |
| 5 | none | No firewall |

---

## firewalld Features

| Feature | Description |
|---------|-------------|
| Zone Management | List, default zone, active zones |
| Service Management | Add/remove services per zone |
| Port Management | Add/remove ports (tcp/udp) |
| Rich Rules | Add/remove rich rules |
| Masquerade | Enable/disable per zone |
| ICMP Blocks | Manage ICMP type blocks |

## iptables Features

| Feature | Description |
|---------|-------------|
| Chain Management | List, create, delete, rename, flush |
| Policy Editor | Change chain policy (ACCEPT/DROP/REJECT) |
| Rule CRUD | Add, insert, replace, delete rules |
| Rule Templates | 13 common preset rules |
| Export | Download rules as text |

## Monitoring Features

| Feature | Description |
|---------|-------------|
| Live Stats | Packet/byte counters per chain (5s refresh) |
| Conntrack | Active connection tracking table |
| Top Talkers | Top 20 source/destination IPs |
| Firewall Log | journalctl firewall entries |
| Conntrack Usage | Table utilization bar |

---

## Event Delegation

Buttons use `data-fw-action` attributes.

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.fw-zone-card` | Zone container |
| `.fw-rule-row` | Individual rule row |
| `.fw-service-chip` | Service badge chip |
| `.fw-stats-table` | Stats table |
| `.fw-conntrack-table` | Connection tracking table |

---

## API Calls

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/firewall` | Get rules |
| `GET` | `/api/firewall/backend` | Detect backend |
| `POST` | `/api/firewall/rule` | Add rule |
| `DELETE` | `/api/firewall/rule/:chain/:num` | Delete rule |
| `POST` | `/api/firewall/zone/service` | Add service |
| `GET` | `/api/firewall/stats` | Live stats |
| `GET` | `/api/firewall/conntrack` | Connections |

---

*Part of [NexusPanel Documentation](../README.md)*
