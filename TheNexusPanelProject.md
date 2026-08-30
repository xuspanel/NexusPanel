# The NexusPanel Project

## A Unified Server Management Ecosystem

---

## Executive Summary

**The NexusPanel Project** is a three-pillar ecosystem designed to deliver a complete, self-hosted server management experience — from commercial acquisition to live server administration. It consists of three tightly integrated components:

| Pillar | Role | Location | Status |
|--------|------|----------|--------|
| **TheNexusPanel** | Commercial storefront & license marketplace | `nxp.xus.me` | Proprietary (private) |
| **NexusPanelLicensing** | License validation & key management server | `nxl.xus.me` (port 3444) | Bundled (`nxLicensing/`) |
| **NexusPanel** | Self-hosted VPS control center | Customer's server (port 3443) | Source-available (BSL 1.1) |

Together, these three systems form a closed-loop lifecycle:

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                       THE NEXUSPANEL ECOSYSTEM                          │
  │                                                                         │
  │   ┌───────────────┐         ┌──────────────────┐       ┌─────────────┐ │
  │   │               │   API   │                  │  HMAC │             │ │
  │   │ TheNexusPanel  │────────▶│ NexusPanelLicensing│◀───────│  NexusPanel  │ │
  │   │  (Storefront)  │         │ (License Server)  │       │  (VPS Panel) │ │
  │   │               │         │                  │       │             │ │
  │   │  nxp.xus.me   │         │  nxl.xus.me      │       │   :3443     │ │
  │   └───────┬───────┘         └────────┬─────────┘       └──────┬──────┘ │
  │           │                          │                          │       │
  │           │     Customer Purchase    │   License Validate       │       │
  │           │     + Key Generation     │   + Feature Gating       │       │
  │           │                          │                          │       │
  │           └──────────────────────────┴──────────────────────────┘       │
  │                         Complete Lifecycle                              │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## Table of Contents

1. [Pillar I — NexusPanel (The VPS Control Center)](#pillar-i--nexuspanel-the-vps-control-center)
2. [Pillar II — TheNexusPanel (Commercial Website)](#pillar-ii--thenexuspanel-commercial-website)
3. [Pillar III — NexusPanelLicensing (License Server)](#pillar-iii--nexuspanellicensing-license-server)
4. [Inter-System Architecture](#inter-system-architecture)
5. [Data Flow & Request Lifecycle](#data-flow--request-lifecycle)
6. [Technology Stack](#technology-stack)
7. [Frontend Architecture](#frontend-architecture)
8. [Backend Architecture](#backend-architecture)
9. [Authentication & Security Model](#authentication--security-model)
10. [Licensing System Deep Dive](#licensing-system-deep-dive)
11. [Database & Storage Layer](#database--storage-layer)
12. [External Service Integrations](#external-service-integrations)
13. [Deployment & Infrastructure](#deployment--infrastructure)
14. [Testing Architecture](#testing-architecture)
15. [Future Roadmap](#future-roadmap)

---

## Pillar I — NexusPanel (The VPS Control Center)

### Overview

NexusPanel is a **self-hosted, single-tenant VPS control center** — a web-based server management panel that orchestrates every layer of Linux server administration into a single responsive web console. Think of it as an open alternative to cPanel or Plesk, built for the modern era.

**Version**: 1.35.8
**Runtime**: Node.js 18+ (CommonJS)
**Framework**: Express 5.2.1
**License**: Business Source License 1.1 (converts to Apache 2.0 on 2027-07-20)
**Entry Point**: `server.js` → Express on port 3443

### Capability Matrix

NexusPanel manages **18+ server subsystems** through a unified interface:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        NexusPanel Capabilities                          │
├───────────────────┬───────────────────┬───────────────────┬─────────────┤
│    FILE OPS       │    DATABASES      │    NETWORKING     │   SECURITY  │
│                   │                   │                   │             │
│  File Manager     │  PostgreSQL       │  Domain Mgmt      │  Firewall   │
│  Upload/Download  │  MySQL/MariaDB    │  Nginx Vhosts     │  SSL/TLS    │
│  Archive/Extract  │  Query Editor     │  DNS Records      │  Virus Scan │
│  Permissions      │  Import/Export    │  FTP (vsftpd)     │  Audit Trail│
│  Trash/Restore    │  Bookmarks        │  Email (IMAP)     │  2FA (TOTP) │
│  Search           │  Column Order     │  Git Deploy       │  Rate Limit │
├───────────────────┼───────────────────┼───────────────────┼─────────────┤
│   CONTAINERS      │    SYSTEM         │   AUTOMATION      │  MONITORING │
│                   │                   │                   │             │
│  Docker Mgmt      │  Service Ctrl     │  Cron Jobs        │  CPU/RAM    │
│  Container Exec   │  Process Mgmt     │  App Installer    │  Disk I/O   │
│  Image Manager    │  System Stats     │  Auto-Update      │  Network    │
│  Docker Compose   │  Log Viewer       │  Webhooks         │  Metrics    │
│  Container Logs   │  User Mgmt        │  Backup Wizard    │  Alerts     │
│  Image Pull       │  Terminal          │  PHP-FPM Mgmt     │  Notify     │
└───────────────────┴───────────────────┴───────────────────┴─────────────┘
```

### Architecture

NexusPanel runs as a **single-process monolith** with no external workers:

```
┌──────────────────────────────────────────────────────────────────────┐
│                    NexusPanel Node.js Process                         │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                   Express 5 HTTP Server                       │    │
│  │                   Listening: 127.0.0.1:3443                  │    │
│  │                                                              │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │    │
│  │  │   32 Route    │  │    Static     │  │    Middleware     │  │    │
│  │  │   Modules     │  │    SPA        │  │    Stack         │  │    │
│  │  │              │  │   (public/)   │  │                  │  │    │
│  │  │   /api/*     │  │  index.html   │  │  • Helmet CSP   │  │    │
│  │  │   /webhook   │  │  CSS/JS       │  │  • JWT Auth     │  │    │
│  │  └──────┬───────┘  └──────────────┘  │  • License Chk  │  │    │
│  │         │                             │  • Rate Limit   │  │    │
│  │         v                             │  • CSRF Guard   │  │    │
│  │  ┌──────────────┐                    └──────────────────┘  │    │
│  │  │  31 Service  │                                          │    │
│  │  │   Modules    │                                          │    │
│  │  │              │                                          │    │
│  │  │  Business    │                                          │    │
│  │  │  Logic       │                                          │    │
│  │  └──────┬───────┘                                          │    │
│  │         │                                                   │    │
│  └─────────┼───────────────────────────────────────────────────┘    │
│            │                                                        │
│  ┌─────────┼───────────────────────────────────────────────────┐    │
│  │  WebSocket Server                                           │    │
│  │  ├── /ws/terminal  (node-pty shell sessions)                │    │
│  │  └── /ws/docker    (container exec sessions)                │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  Background Schedulers (setInterval)                          │    │
│  │  ├── License revalidation (every 60 min)                      │    │
│  │  ├── Metrics collection (every 60 sec)                        │    │
│  │  ├── Backup scheduler (cron-like)                             │    │
│  │  ├── Notification polling                                     │    │
│  │  └── Update checker                                           │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  External Service Bridges                                     │    │
│  │  ├── pg (PostgreSQL connection pool)                          │    │
│  │  ├── dockerode (Docker API)                                   │    │
│  │  ├── node-pty (terminal sessions)                             │    │
│  │  ├── systemctl CLI (service management)                       │    │
│  │  ├── certbot CLI (SSL certificates)                           │    │
│  │  ├── clamscan CLI (virus scanning)                            │    │
│  │  ├── nginx CLI (vhost management)                             │    │
│  │  ├── iptables/firewalld/ufw (firewall)                       │    │
│  │  └── git CLI (deployment)                                     │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
NexusPanel/
├── server.js                     # Entry point: Express + WebSocket
├── package.json                  # Dependencies & scripts
├── VERSION                       # Current version string
├── .env                          # Environment configuration
│
├── src/                          # Backend source code
│   ├── config/
│   │   └── deploy.js             # Git deploy constants
│   ├── middleware/
│   │   ├── auth.js               # JWT + API token authentication
│   │   ├── license.js            # License validation gate
│   │   └── security.js           # Helmet CSP, rate limiting
│   ├── routes/                   # 32 API route modules
│   │   ├── auth.js               # Login, 2FA, logout, me
│   │   ├── dashboard.js          # System stats, service health
│   │   ├── files.js              # File manager operations
│   │   ├── databases.js          # PostgreSQL management (55+ endpoints)
│   │   ├── docker.js             # Container/image management
│   │   ├── domains.js            # Nginx vhost management
│   │   ├── ssl.js                # Certbot SSL management
│   │   ├── firewall.js           # Multi-backend firewall
│   │   ├── emails.js             # Email account management
│   │   ├── deploy.js             # Git deployment management
│   │   ├── apps.js               # One-click app installer
│   │   ├── ... (20 more)         # Additional route modules
│   │   └── webhook.js            # Git webhook receiver (unauthenticated)
│   ├── services/                 # 31 business-logic service modules
│   │   ├── users.js              # Panel + system user management
│   │   ├── databases.js          # PostgreSQL operations (1000+ lines)
│   │   ├── license.js            # License validation & HMAC verification
│   │   ├── terminal.js           # node-pty terminal sessions
│   │   ├── docker.js             # Docker API integration
│   │   ├── filemanager.js        # File operations engine
│   │   ├── backups.js            # Backup engine
│   │   ├── apps.js               # App installer orchestrator
│   │   ├── git-deploy.js         # Git deployment service
│   │   ├── ... (22 more)         # Additional service modules
│   │   └── system.js             # System info gathering
│   └── utils/
│       └── shell.js              # Safe shell execution + validators
│
├── public/                       # Frontend SPA (no build step)
│   ├── index.html                # Single-page app (2000+ lines)
│   ├── license-error.html        # License error page
│   ├── css/
│   │   ├── style.css             # Main stylesheet (11,600+ lines)
│   │   ├── emails.css            # Email client styles
│   │   └── docker.prompt.css     # Docker prompt styles
│   ├── js/                       # 32 frontend controller modules
│   │   ├── api.js                # Central API client
│   │   ├── auth.js               # Login/2FA/logout
│   │   ├── dashboard.js          # Dashboard controller
│   │   ├── filemanager.js        # File manager
│   │   ├── databases.js          # Database manager
│   │   ├── docker.js             # Docker manager
│   │   ├── terminal.js           # xterm.js terminal
│   │   └── ... (25 more)         # Additional view controllers
│   └── libs/                     # Vendored libraries
│       ├── xterm.js              # Terminal renderer
│       └── xterm-addon-*.js      # Terminal addons
│
├── scripts/                      # Shell scripts for operations
│   ├── apps/                     # One-click installer scripts
│   │   ├── wordpress.sh          # WordPress via WP-CLI
│   │   ├── laravel.sh            # Laravel via Composer
│   │   ├── node-express.sh       # Node.js via PM2
│   │   ├── nextjs.sh             # Next.js static export
│   │   ├── static.sh             # Static HTML
│   │   └── lib.sh                # Shared app library
│   └── deploy/
│       └── lib.sh                # Git deploy helpers
│
├── data/                         # JSON-file-based storage
│   ├── users.json                # Panel user accounts
│   ├── settings.json             # Panel configuration
│   ├── audit.json                # Audit trail log
│   ├── notifications.json        # In-app notifications
│   ├── tokens.json               # Bearer auth tokens
│   ├── domains.json              # Nginx vhost records
│   ├── apps.json                 # Installed applications
│   ├── deployments.json          # Git deployment records
│   ├── metrics/
│   │   └── history.jsonl         # Time-series metrics data
│   └── filebin/                  # File trash/recycle bin
│
├── tests/                        # 183 automated tests
│   ├── unit/                     # 11 unit test files
│   └── integration/              # 30 integration test files
│
├── install.sh                    # Universal installer
├── install-*.sh                  # OS-specific installers
├── update.sh                     # Lightweight updater
├── upgrade.sh                    # Config-preserving upgrade
├── uninstall.sh                  # Comprehensive uninstaller
├── troubleshoot.sh               # Diagnostic wizard
├── health.sh                     # Cron-friendly health monitor
│
└── nxLicensing/                  # License server (separate process)
    └── ...                       # See Pillar III
```

---

## Pillar II — TheNexusPanel (Commercial Website)

### Overview

**TheNexusPanel** is the commercial storefront and license marketplace — the customer-facing website where users discover, purchase, and manage NexusPanel license keys. It is the commercial gateway to the entire ecosystem.

**URL**: `https://nxp.xus.me`
**Status**: Proprietary (excluded from public repository via `.gitignore`)
**Role**: License key generation, customer billing, product marketing

### Purpose & Responsibilities

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     TheNexusPanel (nxp.xus.me)                          │
│                                                                         │
│  ┌───────────────────┐  ┌───────────────────┐  ┌────────────────────┐  │
│  │   Product Pages    │  │   License Shop    │  │  Customer Portal   │  │
│  │                   │  │                   │  │                    │  │
│  │  • Features       │  │  • Plan Compare   │  │  • Key Management  │  │
│  │  • Pricing        │  │  • Checkout       │  │  • Download Panel  │  │
│  │  • Demos          │  │  • Payment        │  │  • Support Access  │  │
│  │  • Documentation  │  │  • Key Delivery   │  │  • Billing History │  │
│  └───────────────────┘  └─────────┬─────────┘  └────────────────────┘  │
│                                    │                                    │
│                                    │  REST API + CHECKOUT_API_KEY       │
│                                    v                                    │
│                     ┌─────────────────────────┐                         │
│                     │   nxLicensing Server     │                         │
│                     │   POST /api/checkout     │                         │
│                     │           /generate       │                         │
│                     └─────────────────────────┘                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Integration with NexusPanelLicensing

TheNexusPanel communicates with NexusPanelLicensing via a **server-to-server REST API** authenticated with a shared `CHECKOUT_API_KEY`:

```
TheNexusPanel ──────── POST /api/checkout/generate ────────> nxLicensing
                    { key, plan, customer, domains }

nxLicensing ──────── 201 Created ──────────────────────────> TheNexusPanel
                    { license: { key, status, plan, ... } }
```

This ensures that license keys are cryptographically generated and stored in the license server the moment a customer completes checkout — no manual intervention required.

### Customer Journey

```
  Customer visits nxp.xus.me
         │
         v
  Browses features & plans
         │
         v
  Selects a plan (Starter / Professional / Business / Enterprise)
         │
         v
  Completes payment via integrated checkout
         │
         v
  TheNexusPanel calls nxLicensing API to generate key
         │
         v
  Customer receives license key: NX-XXXX-XXXX-XXXX
         │
         v
  Customer installs NexusPanel on their VPS (install.sh)
         │
         v
  Customer configures .env with LICENSE_KEY + LICENSE_DOMAIN
         │
         v
  NexusPanel validates license with nxLicensing on boot
         │
         v
  Full server management unlocked (based on plan tier)
```

---

## Pillar III — NexusPanelLicensing (License Server)

### Overview

**NexusPanelLicensing** (branded as **nxLicensing**) is a standalone Express.js application that serves as the **centralized license validation and management authority** for the entire NexusPanel ecosystem. It is the trust anchor that connects the commercial storefront to the deployed panels.

**Version**: 1.0.0
**Runtime**: Node.js 18+ (CommonJS)
**Framework**: Express 5.2.1
**Port**: 3444 (localhost-only)
**Storage**: JSON files (no database)

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    nxLicensing Server Process                        │
│                    Listening: 127.0.0.1:3444                         │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │                   Express 5 HTTP Server                     │     │
│  └────────────────────────────────┬───────────────────────────┘     │
│                                    │                                  │
│  ┌────────────────────────────────┼───────────────────────────┐     │
│  │  Route Modules                                              │     │
│  │                                                            │     │
│  │  /api/validate      → License validation endpoint          │     │
│  │  /api/licenses/*    → CRUD for license management          │     │
│  │  /api/checkout/*    → Key generation for storefront        │     │
│  │  /api/stats         → License statistics                   │     │
│  │  /api/analytics     → Usage analytics                      │     │
│  │  /api/auth/*        → Admin authentication                 │     │
│  │  /api/profile/*     → Admin profile management             │     │
│  └────────────────────────────────┬───────────────────────────┘     │
│                                    │                                  │
│  ┌────────────────────────────────┼───────────────────────────┐     │
│  │  Service Layer                                               │     │
│  │                                                            │     │
│  │  license.js  → Key generation, validation, HMAC signing    │     │
│  │  users.js    → Admin user management                       │     │
│  │                                                            │     │
│  │  Key Features:                                              │     │
│  │  • HMAC-SHA256 response signing                            │     │
│  │  • Domain binding & limits                                 │     │
│  │  • Plan-based feature gating                               │     │
│  │  • Expiry management                                       │     │
│  │  • Status tracking (active/suspended/revoked/expired)      │     │
│  └────────────────────────────────┬───────────────────────────┘     │
│                                    │                                  │
│  ┌────────────────────────────────┼───────────────────────────┐     │
│  │  Data Layer                                                 │     │
│  │                                                            │     │
│  │  data/licenses.json  → License key database                │     │
│  │  data/users.json     → Admin user accounts                 │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  Admin Dashboard (public/)                                  │     │
│  │  ├── index.html      → License management SPA              │     │
│  │  ├── login.html      → Admin login page                    │     │
│  │  ├── profile.html    → Profile management                  │     │
│  │  └── css/, js/       → Dashboard UI assets                 │     │
│  └────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

### License Data Model

```json
{
  "key": "NX-5A77-AD5C-EC3E",
  "status": "active",
  "plan": "Professional",
  "max_domains": 5,
  "domains": ["example.com", "api.example.com"],
  "contact_email": "customer@example.com",
  "issued_to": "Customer Name",
  "issued_at": "2026-07-12T10:30:00.000Z",
  "expires_at": "2027-07-12T10:30:00.000Z",
  "last_check_in": "2026-08-18T14:22:00.000Z",
  "check_in_count": 42,
  "notes": "Order #o_12345",
  "created_at": "2026-07-12T10:30:00.000Z"
}
```

### Plan-Based Feature Gating

| Plan | Included Features | Target Audience |
|------|-------------------|-----------------|
| **Starter** | Dashboard, Files, Terminal, Services, Processes, Logs, Cron, Users, Profile, Theme | Personal servers, hobby projects |
| **Professional** | + Docker, Domains, SSL, Backups, Firewall, FTP, Emails, Databases, Audit | Small businesses, freelancers |
| **Business** | + Virus Scanner, PHP-FPM, Updates, MIME Types, Metrics, Alerts | Growing teams, agencies |
| **Enterprise** | All features (unrestricted) | Large organizations, data centers |

### Admin Dashboard

nxLicensing includes its own management dashboard for license administrators:

```
┌─────────────────────────────────────────────────────────────────┐
│  nxLicensing Admin Dashboard                                    │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │  Total    │ │  Active  │ │ Expiring │ │ Revenue  │          │
│  │ Licenses │ │   Keys   │ │   Soon   │ │  Est.    │          │
│  │  1,247   │ │  1,102   │ │    89    │ │ $48,920  │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ License List                                             │   │
│  │ Key               │ Plan         │ Status   │ Domains   │   │
│  │ NX-5A77-AD5C-EC3E │ Professional │ Active   │ 3/5       │   │
│  │ NX-9B23-FF81-C4A1 │ Enterprise   │ Active   │ 12/∞      │   │
│  │ NX-1C44-EE92-B5D2 │ Starter      │ Expired  │ 1/1       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Features: Create, Suspend, Revoke, Extend, Rebind              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Inter-System Architecture

### Full Connectivity Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ECOSYSTEM TOPOLOGY                                 │
│                                                                             │
│  ┌────────────────────────┐                                                 │
│  │    CUSTOMER BROWSER     │                                                 │
│  │                         │                                                 │
│  │  ┌───────────────────┐ │   HTTPS      ┌────────────────────────┐        │
│  │  │  NexusPanel UI    │─┼─────────────▶│   NexusPanel Server     │        │
│  │  │  (SPA in browser) │ │   :3443       │   (Node.js :3443)      │        │
│  │  │                   │ │               │                         │        │
│  │  │  • REST API calls │ │               │  ┌───────────────────┐ │        │
│  │  │  • WebSocket      │ │               │  │  License Service   │ │ HTTPS  │
│  │  │  • xterm.js       │ │               │  │                   │─┼──────┐ │
│  │  └───────────────────┘ │               │  │  bootstrapLicense │ │      │ │
│  │                         │               │  │  revalidate       │ │      │ │
│  └────────────────────────┘               │  └───────────────────┘ │      │ │
│                                             └───────────┬───────────┘      │ │
│                                                          │                  │ │
│                                                          │  HMAC-SHA256     │ │
│                                                          │  Signed Requests │ │
│                                                          │                  │ │
│                                             ┌────────────▼─────────────┐   │ │
│                                             │   nxLicensing Server      │   │ │
│                                             │   (Node.js :3444)        │◀──┘ │
│                                             │                           │     │
│                                             │  ┌─────────────────────┐ │     │
│                                             │  │  Validation Engine  │ │     │
│                                             │  │  HMAC-SHA256 Sign   │ │     │
│                                             │  │  Domain Binding     │ │     │
│                                             │  │  Plan Gating        │ │     │
│                                             │  │  Expiry Management  │ │     │
│                                             │  └─────────────────────┘ │     │
│                                             └────────────┬─────────────┘     │
│                                                          │                   │
│  ┌──────────────────────────────────────┐  ┌─────────────▼─────────────┐    │
│  │  EXTERNAL SERVICES                    │  │  TheNexusPanel Store      │    │
│  │                                       │  │  (nxp.xus.me)             │    │
│  │  ┌───────────┐ ┌───────────┐         │  │                            │    │
│  │  │PostgreSQL │ │  Docker   │         │  │  ┌─────────────────────┐  │    │
│  │  │ Database  │ │   API     │         │  │  │  Product Pages      │  │    │
│  │  │ (managed) │ │           │         │  │  │  License Shop       │  │    │
│  │  └───────────┘ └───────────┘         │  │  │  Customer Portal    │  │    │
│  │                                       │  │  │  Checkout Flow      │  │    │
│  │  ┌───────────┐ ┌───────────┐         │  │  └─────────────────────┘  │    │
│  │  │  nginx    │ │ certbot   │         │  │                            │    │
│  │  │  Reverse  │ │   SSL     │         │  │  Calls nxLicensing API    │    │
│  │  │  Proxy    │ │  Certs    │         │  │  to generate license keys │    │
│  │  └───────────┘ └───────────┘         │  └────────────────────────────┘    │
│  │                                       │                                    │
│  │  ┌───────────┐ ┌───────────┐         └────────────────────────────────────┘
│  │  │ ClamAV    │ │ vsftpd    │
│  │  │  Virus    │ │   FTP     │
│  │  │  Scan     │ │           │
│  │  └───────────┘ └───────────┘
│  │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
│  │  │systemd    │ │ Postfix   │ │ PHP-FPM   │ │  git CLI  │
│  │  │ Services  │ │  Mail     │ │  PHP      │ │  Deploy   │
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘
│  └───────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────┘
```

### Communication Protocols

| Source | Destination | Protocol | Authentication | Purpose |
|--------|-------------|----------|----------------|---------|
| Customer Browser | NexusPanel | HTTPS | JWT Cookie / Bearer Token | Server management |
| Customer Browser | NexusPanel | WebSocket | JWT in upgrade headers | Terminal & Docker exec |
| NexusPanel | nxLicensing | HTTPS REST | HMAC-SHA256 shared secret | License validation |
| TheNexusPanel | nxLicensing | HTTPS REST | CHECKOUT_API_KEY | Key generation |
| NexusPanel | PostgreSQL | TCP | DB_USER/DB_PASSWORD | Database management |
| NexusPanel | Docker Engine | Unix Socket / TCP | Docker API | Container management |
| NexusPanel | nginx | CLI | Root execution | Vhost management |
| NexusPanel | certbot | CLI | Root execution | SSL certificate automation |
| NexusPanel | systemctl | CLI | Root execution | Service management |
| NexusPanel | ClamAV | CLI | Root execution | Virus scanning |
| NexusPanel | git | CLI | SSH keys / tokens | Code deployment |
| NexusPanel | Let's Encrypt | ACME Protocol | certbot | Certificate issuance |

---

## Data Flow & Request Lifecycle

### License Validation Flow (Boot Time)

```
  NexusPanel starts (server.js)
         │
         v
  bootstrapLicense() called
         │
         ├── 1. Read .env: LICENSE_KEY, LICENSE_DOMAIN, LICENSE_SECRET
         │
         ├── 2. Check local cache (data/license-cache.json)
         │      └── If valid cache exists AND age < 60 min → skip network call
         │
         ├── 3. POST https://nxl.xus.me/api/validate
         │      Body: { key: "NX-5A77-AD5C-EC3E", domain: "myserver.com" }
         │
         ├── 4. nxLicensing receives request
         │      ├── Look up key in data/licenses.json
         │      ├── Check status (active/suspended/revoked/expired)
         │      ├── Verify domain is within allowed list
         │      ├── Check domain count vs max_domains
         │      ├── Check expiry date
         │      ├── Sign response with HMAC-SHA256 (VALIDATION_SECRET)
         │      └── Return signed response
         │
         ├── 5. NexusPanel receives response
         │      ├── Verify HMAC signature using crypto.timingSafeEqual()
         │      ├── Parse validation result
         │      ├── Cache result in data/license-cache.json
         │      └── Update in-memory license state
         │
         ├── If VALID → Panel starts normally
         │
         └── If INVALID → Panel blocks all requests
              ├── HTML requests → redirect to /license-error.html
              └── API requests → HTTP 402 Payment Required
```

### API Request Lifecycle (Runtime)

```
  Browser sends: GET /api/files/list?path=/var/www
         │
         v
  ┌─── Express Middleware Stack ───┐
  │                                │
  │  1. Helmet (CSP headers)      │
  │  2. Rate limiter (120/min)    │
  │  3. CSRF origin check         │
  │  4. License check             │──▶ If invalid → 402
  │  5. JWT/Token auth            │──▶ If unauthenticated → 401
  │  6. Role check                │──▶ If unauthorized → 403
  │                                │
  └────────────┬───────────────────┘
               │
               v
  ┌─── Route Handler (files.js) ──┐
  │                                │
  │  - Validate query params       │
  │  - Check path permissions      │
  │  - Call service module         │
  │                                │
  └────────────┬───────────────────┘
               │
               v
  ┌─── Service Module ────────────┐
  │                                │
  │  - Execute business logic      │
  │  - Interact with filesystem    │
  │  - Return structured response  │
  │                                │
  └────────────┬───────────────────┘
               │
               v
  Response: { success: true, files: [...] }
         │
         v
  Browser renders file list in SPA
```

### Terminal WebSocket Flow

```
  User opens Terminal tab
         │
         v
  Frontend: new WebSocket('wss://host/ws/terminal?token=JWT')
         │
         v
  Server: Verify JWT from query param
         │
         ├── Invalid → Destroy connection (401)
         │
         └── Valid → Create node-pty session
              │
              ├── Spawn: /bin/bash (or configured shell)
              │
              ├── Pipe: WebSocket ↔ PTY
              │   ├── Client → Server: Terminal input
              │   └── Server → Client: Terminal output
              │
              └── Handle: resize events, disconnect, cleanup
```

---

## Technology Stack

### Backend

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Runtime | Node.js | 18+ | JavaScript runtime |
| HTTP | Express | 5.2.1 | Web framework |
| Auth | jsonwebtoken | - | JWT token signing |
| Auth | bcryptjs | - | Password hashing |
| Auth | speakeasy | - | TOTP 2FA |
| Auth | qrcode | - | QR code generation |
| Database | pg | 8.x | PostgreSQL client |
| Terminal | node-pty | - | Pseudo-terminal |
| WebSocket | ws | - | WebSocket server |
| Docker | dockerode | - | Docker API client |
| Files | multer | - | File upload |
| Files | adm-zip | - | ZIP operations |
| Files | archiver | - | Archive creation |
| Email | mailparser | - | Email parsing |
| Security | helmet | - | HTTP security headers |
| Security | express-rate-limit | - | Rate limiting |

### Frontend

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Vanilla JavaScript | Zero-dependency SPA |
| Terminal | xterm.js 5.5.0 | Terminal rendering |
| Code Editor | Ace Editor | File editing |
| Charts | Chart.js 4.4.7 | Metrics visualization |
| Rich Text | Quill 1.3.7 | Email compose |
| Styling | Custom CSS (11,600+ lines) | Dark/light themes |
| Security | Event delegation + sanitize.js | XSS prevention |

### Infrastructure

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Process | systemd | Service management |
| Reverse Proxy | nginx | External access |
| SSL | Let's Encrypt (certbot) | HTTPS certificates |
| Firewall | firewalld/ufw/nftables/iptables | Network security |
| Antivirus | ClamAV | Malware scanning |
| FTP | vsftpd | File transfer |
| Mail | Postfix/Dovecot | Email delivery |
| PHP | PHP-FPM | PHP execution |
| Deployment | Git (CLI) | Code deployment |

### Testing

| Tool | Version | Purpose |
|------|---------|---------|
| Vitest | 4.1.10 | Test runner |
| Supertest | 7.2.2 | HTTP assertions |

---

## Frontend Architecture

### Design Philosophy

NexusPanel's frontend is a **zero-build-step SPA** — no webpack, no Vite, no React. Pure vanilla JavaScript served directly from `public/`. This design choice means:

- **Instant deployment**: No build process, no node_modules in frontend
- **Zero dependencies**: No framework lock-in
- **Fast startup**: Files served as-is by Express static middleware
- **Small footprint**: Entire frontend is ~32 JS modules + 1 HTML file

### SPA Navigation Model

```
┌───────────────────────────────────────────────────────────────────┐
│  Single index.html                                                │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  <main id="viewDashboard">  ← SHOWN when active             │ │
│  │    Dashboard HTML content...                                 │ │
│  │  </main>                                                     │ │
│  │                                                              │ │
│  │  <main id="viewFiles" class="hidden">  ← HIDDEN             │ │
│  │    File Manager HTML content...                              │ │
│  │  </main>                                                     │ │
│  │                                                              │ │
│  │  <main id="viewDatabases" class="hidden">  ← HIDDEN         │ │
│  │    Database Manager HTML content...                          │ │
│  │  </main>                                                     │ │
│  │                                                              │ │
│  │  ... (22 more views)                                         │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  Navigation: Toggle class "hidden" on <main> elements             │
│  No URL routing: All views in single page                         │
│  State: In-memory JavaScript objects                              │
└───────────────────────────────────────────────────────────────────┘
```

### Frontend Module Pattern

Each frontend module follows a consistent pattern:

```javascript
// Example: public/js/dashboard.js
const Dashboard = {
    init() {
        // Register navigation handler
        document.querySelector('[data-view="dashboard"]')
            .addEventListener('click', () => this.show());
    },

    async show() {
        // Hide all views, show dashboard
        Utils.hideAllViews();
        document.getElementById('viewDashboard').classList.remove('hidden');

        // Fetch and render data
        const stats = await API.request('/api/system/stats');
        this.renderStats(stats);
    },

    renderStats(data) {
        // Update DOM with fetched data
    }
};
```

### View-to-Module Mapping

| View ID | Frontend Module | Navigation Label | Key Features |
|---------|----------------|------------------|--------------|
| `viewDashboard` | dashboard.js | Home | System stats, service health, quick actions |
| `viewFiles` | filemanager.js | File Manager | Browse, edit, upload, download, permissions |
| `viewDatabases` | databases.js | Databases | Create, query, import/export, manage |
| `viewEmails` | emails.js | Emails | Accounts, compose, webmail, aliases |
| `viewDocker` | docker.js | Docker | Containers, images, compose, exec |
| `viewTerminal` | terminal.js | Terminal | Interactive shell via xterm.js |
| `viewUsers` | users.js | Users | System user CRUD |
| `viewFtp` | ftp.js | FTP | vsftpd account management |
| `viewDomains` | domains.js | Domains | Nginx vhost management |
| `viewApps` | apps.js | App Installer | One-click WordPress/Laravel/Node |
| `viewBackups` | backups.js | Backups | Backup wizard & scheduler |
| `viewVirusScanner` | virusscanner.js | Scanner | ClamAV malware scanning |
| `viewMimeTypes` | mimetypes.js | MIME Types | Custom MIME type management |
| `viewAudit` | audit.js | Audit Trail | Security event logging |
| `viewServices` | services.js | Services | systemd service control |
| `viewProcesses` | processes.js | Processes | Process list & kill |
| `viewLogs` | logs.js | Log Viewer | /var/log browser |
| `viewCron` | cron.js | Cron Jobs | Crontab editor |
| `viewFirewall` | firewall.js | Firewall | Rule management |
| `viewSsl` | ssl.js | SSL Certs | Let's Encrypt management |
| `viewPhpfpm` | phpfpm.js | PHP-FPM | PHP pool management |
| `viewUpdates` | updates.js | Updates | System & panel updates |
| `viewSettings` | settings.js | Settings | Panel configuration |
| `viewProfile` | profile.js | Profile | Avatar, password, 2FA, sessions |

---

## Backend Architecture

### Route → Service → External Pattern

Every API request follows a consistent three-layer pattern:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────┐
│   Route Module   │────▶│  Service Module  │────▶│  External System     │
│   (src/routes/)  │     │  (src/services/) │     │  (OS / CLI / API)   │
│                  │     │                  │     │                      │
│  • Parse request │     │  • Business      │     │  • systemctl         │
│  • Validate input│     │    logic         │     │  • docker API        │
│  • Auth checks   │     │  • Data transform│     │  • pg client         │
│  • Call service  │     │  • File I/O      │     │  • nginx CLI         │
│  • Send response │     │  • Shell exec    │     │  • certbot CLI       │
│                  │     │                  │     │  • clamscan CLI      │
└─────────────────┘     └─────────────────┘     └─────────────────────┘
```

### 32 Route Modules

| Route Module | Prefix | Auth Level | Description |
|-------------|--------|------------|-------------|
| auth.js | `/api/auth/` | Public (login) | Login, 2FA, logout, session check |
| dashboard.js | `/api/system/` | User | System stats, service health, reboot |
| profile.js | `/api/profile/` | User | Avatar, password, 2FA, sessions |
| files.js | `/api/files/` | User | File manager (CRUD, upload, archive) |
| databases.js | `/api/databases/` | Admin | PostgreSQL management (55+ endpoints) |
| emails.js | `/api/emails/` | Admin | Email accounts, webmail, compose |
| docker.js | `/api/docker/` | Admin | Container/image management |
| terminal.js | `/api/terminal/` | User | Terminal presets CRUD |
| users.js | `/api/users/` | Admin | System user management |
| ftp.js | `/api/ftp/` | Admin | vsftpd account management |
| domains.js | `/api/domains/` | Admin | Nginx vhost management |
| alerts.js | `/api/alerts/` | Admin | Alert configuration |
| tokens.js | `/api/tokens/` | Admin | API token CRUD |
| backups.js | `/api/backups/` | Admin | Backup wizard |
| virusscanner.js | `/api/virusscanner/` | Admin | ClamAV scanning |
| mimetypes.js | `/api/mimetypes/` | User | MIME type management |
| audit.js | `/api/audit/` | Admin | Audit trail |
| metrics.js | `/api/metrics/` | User | System metrics/history |
| services.js | `/api/services/` | Admin | systemd service management |
| processes.js | `/api/processes/` | Admin | Process list/kill |
| logs.js | `/api/logs/` | Admin | /var/log browser |
| cron.js | `/api/cron/` | Admin | Crontab editor |
| firewall.js | `/api/firewall/` | Admin | Multi-backend firewall |
| ssl.js | `/api/ssl/` | Admin | Certbot SSL management |
| phpfpm.js | `/api/phpfpm/` | Admin | PHP-FPM pool management |
| updates.js | `/api/updates/` | Admin | System + panel updates |
| notifications.js | `/api/notifications/` | User | In-app notifications |
| settings.js | `/api/settings/` | Admin | Panel settings |
| search.js | `/api/search/` | User | Global cross-module search |
| apps.js | `/api/apps/` | Admin | One-click app installer |
| deploy.js | `/api/deploy/` | Admin | Git deploy management |
| webhook.js | `/webhook/` | Token | Git webhook receiver |

### 31 Service Modules

| Service Module | Responsibility | Key Complexity |
|---------------|----------------|----------------|
| users.js | Panel + system user management | 764 lines |
| databases.js | PostgreSQL operations via `pg` Pool | 1000+ lines |
| terminal.js | node-pty terminal sessions | WebSocket + PTY |
| license.js | License validation, HMAC, caching | Crypto operations |
| docker.js / docker-ws.js | Docker API + WebSocket exec | Multi-protocol |
| filemanager.js | File operations engine | FS + Archive |
| apps.js | App installer orchestrator | Shell scripts |
| git-deploy.js | Git deployment service | Git CLI + SSH |
| backups.js / backup-scheduler.js | Backup engine + scheduler | Scheduling |
| domains.js | Nginx domain management | Config templates |
| firewall.js | Firewall abstraction | Multi-backend |
| ssl.js | SSL certificate management | certbot integration |
| emails.js | Email service | Postfix/Dovecot |
| metrics.js | CPU/RAM/disk/network metrics | /proc + /sys |
| audit.js | Audit logging | JSON append |
| settings.js | Settings persistence | Atomic JSON |

### WebSocket Endpoints

| Path | Purpose | Authentication |
|------|---------|---------------|
| `/ws/terminal` | Interactive terminal sessions | JWT from query param |
| `/ws/docker` | Docker container exec | JWT from query param |

---

## Authentication & Security Model

### Authentication Layers

```
┌───────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION STACK                             │
│                                                                    │
│  Layer 1: License Gate                                             │
│  ├── Check: Is license valid?                                     │
│  ├── Block: All requests if invalid (HTTP 402)                    │
│  └── Cache: License state in memory                               │
│                                                                    │
│  Layer 2: Rate Limiting                                            │
│  ├── Login: 10 attempts per 15 min per IP                         │
│  ├── API: 120 requests per minute per IP                          │
│  └── Global: express-rate-limit middleware                         │
│                                                                    │
│  Layer 3: CSRF Protection                                          │
│  ├── Check: Origin/Referer on POST/PUT/DELETE/PATCH                │
│  ├── Reject: Non-HTTPS origins (except localhost)                  │
│  └── Header: X-Requested-With for AJAX                             │
│                                                                    │
│  Layer 4: JWT Authentication                                       │
│  ├── Login: Username + password → bcrypt verify                    │
│  ├── Token: JWT in httpOnly cookie (2hr expiry)                    │
│  ├── 2FA: TOTP via speakeasy (temp token flow)                     │
│  └── API: Bearer token alternative (npt_ prefix)                   │
│                                                                    │
│  Layer 5: Role-Based Access Control                                 │
│  ├── admin: Full access to all endpoints                           │
│  ├── user: Limited access (non-admin routes)                       │
│  └── Check: req.user?.role in route handlers                       │
│                                                                    │
│  Layer 6: Security Headers                                         │
│  ├── Helmet: CSP, HSTS, X-Frame-Options, etc.                     │
│  └── Custom: CORS, origin validation                               │
└───────────────────────────────────────────────────────────────────┘
```

### Login Flow

```
  User submits: POST /api/auth/login { username, password }
         │
         v
  Rate limit check (10/15 min per IP)
         │
         ├── Exceeded → HTTP 429 Too Many Requests
         │
         └── OK → bcrypt.compareSync(password, storedHash)
              │
              ├── Mismatch → HTTP 401 Unauthorized
              │
              └── Match → Check 2FA status
                   │
                   ├── 2FA enabled → Return tempToken (5min, step="2fa")
                   │      │
                   │      v
                   │   User submits: POST /api/auth/verify-2fa { tempToken, code }
                   │      │
                   │      v
                   │   speakeasy.totp.verify({ secret, encoding, token, window: 1 })
                   │      │
                   │      ├── Invalid → HTTP 401
                   │      │
                   │      └── Valid → Issue JWT cookie (2hr)
                   │
                   └── 2FA disabled → Issue JWT cookie (2hr)
```

### WebSocket Authentication

```
  Client: new WebSocket('wss://host/ws/terminal?token=JWT_TOKEN')
         │
         v
  Server: Parse JWT from URL query parameter
         │
         ├── Invalid/missing → Destroy socket (close code 1008)
         │
         └── Valid → Attach user info to socket, establish session
```

---

## Licensing System Deep Dive

### HMAC-SHA256 Signature Verification

The licensing system uses cryptographic signing to prevent key spoofing:

```
  nxLicensing (Server Side):
  ┌─────────────────────────────────────────────────┐
  │  1. Validate license key against database        │
  │  2. Build response payload                       │
  │  3. signature = HMAC-SHA256(                     │
  │       JSON.stringify(payload),                    │
  │       VALIDATION_SECRET                           │
  │     )                                             │
  │  4. Return: { payload, signature }               │
  └─────────────────────────────────────────────────┘
                    │
                    │ HTTPS Response
                    v
  NexusPanel (Client Side):
  ┌─────────────────────────────────────────────────┐
  │  1. Receive { payload, signature }               │
  │  2. expected = HMAC-SHA256(                      │
  │       JSON.stringify(payload),                    │
  │       LICENSE_SECRET (= VALIDATION_SECRET)        │
  │     )                                             │
  │  3. Verify: crypto.timingSafeEqual(              │
  │       Buffer.from(signature),                     │
  │       Buffer.from(expected)                       │
  │     )                                             │
  │  4. If match → Accept license state              │
  │     If no match → Reject (possible tampering)    │
  └─────────────────────────────────────────────────┘
```

### Grace Period & Offline Resilience

```
  ┌──────────────────────────────────────────────────────────────┐
  │  License Cache Strategy                                       │
  │                                                               │
  │  data/license-cache.json:                                    │
  │  {                                                           │
  │    "valid": true,                                            │
  │    "checkedAt": "2026-08-18T14:22:00.000Z",                 │
  │    "expiresAt": "2026-08-18T15:22:00.000Z",  ← 60 min     │
  │    "features": ["dashboard", "files", "terminal", ...],      │
  │    "plan": "Professional"                                    │
  │  }                                                           │
  │                                                               │
  │  Scenarios:                                                   │
  │  ├── Cache valid (< 60 min) → Skip network call              │
  │  ├── Cache expired → Revalidate with nxLicensing              │
  │  ├── Network error → Use cache for up to 1 hour              │
  │  ├── Grace period exceeded → Block all requests              │
  │  └── Key revoked → Immediate block                           │
  └──────────────────────────────────────────────────────────────┘
```

### License Key Format

```
  NX-XXXX-XXXX-XXXX

  │  │    │    │
  │  │    │    └── Group 3: 4 hex characters (random)
  │  │    └─────── Group 2: 4 hex characters (random)
  │  └──────────── Group 1: 4 hex characters (random)
  └─────────────── Prefix: "NX" (NexusPanel identifier)

  Example: NX-5A77-AD5C-EC3E
```

---

## Database & Storage Layer

### NexusPanel: JSON-File Storage

NexusPanel uses **atomic JSON file storage** — no ORM, no migrations. All state is persisted in `data/*.json` with atomic writes (temp file + `fs.rename()`):

```
┌──────────────────────────────────────────────────────────────┐
│                    NexusPanel Data Layer                       │
│                                                               │
│  data/users.json           → User accounts & auth             │
│  data/settings.json        → Panel configuration              │
│  data/tokens.json          → API bearer tokens                │
│  data/domains.json         → Nginx vhost records              │
│  data/apps.json            → Installed applications           │
│  data/deployments.json     → Git deployment records           │
│  data/deploy_keys.json     → Encrypted SSH deploy keys        │
│  data/deploy_env_vars.json → Encrypted deploy env vars        │
│  data/audit.json           → Audit trail log                  │
│  data/notifications.json   → In-app notifications             │
│  data/mime-types.json      → Custom MIME types                │
│  data/update-history.json  → System update history            │
│  data/panel-version-cache.json → Panel version cache          │
│  data/metrics/history.jsonl   → Time-series metrics (append)  │
│  data/license-cache.json   → License validation cache         │
│  data/avatars/             → User avatar images               │
│  data/apps/                → App installation logs            │
│  data/deploy/              → Git deployment logs              │
│  data/filebin/             → File trash/recycle bin           │
│                                                               │
│  Write Pattern:                                              │
│  1. Write to temp file (data/.tmp-XXXXXX)                    │
│  2. fs.rename(tempFile, targetFile)  ← atomic on Linux       │
│  3. No partial writes, no corruption                         │
└──────────────────────────────────────────────────────────────┘
```

### Key Data Schemas

**Users** (`data/users.json`):
```json
{
  "admin": {
    "passwordHash": "$2b$12$...",
    "email": "admin@example.com",
    "twoFactorSecret": "GFAD...",
    "twoFactorEnabled": false,
    "role": "admin",
    "createdAt": "2026-07-15T10:30:00.000Z",
    "displayName": "Admin User",
    "avatar": "admin"
  }
}
```

**Settings** (`data/settings.json`):
```json
{
  "panelName": "MyPanel",
  "serverLocation": "Amsterdam, Netherlands",
  "defaultPage": "dashboard",
  "sessionTimeout": 60,
  "idleTimeout": 30,
  "language": "en",
  "timezone": "UTC",
  "theme": "light",
  "sidebarPosition": "right",
  "accentColor": "#007bff",
  "autoUpdate": false,
  "updateChannel": "stable"
}
```

**Domains** (`data/domains.json`):
```json
{
  "example.com": {
    "type": "domain",
    "domain": "example.com",
    "parentDomain": null,
    "port": 443,
    "root": "/var/www/example.com",
    "sslEnabled": true,
    "sslCert": "/etc/letsencrypt/live/example.com/fullchain.pem",
    "autoPort": false,
    "nginxFile": "example.com.conf",
    "syncedFromNginx": true,
    "createdAt": "2026-07-12T10:30:00.000Z"
  }
}
```

**Apps** (`data/apps.json`):
```json
{
  "id": "UUID",
  "user_id": "admin",
  "domain": "example.com",
  "app_type": "wordpress",
  "install_path": "/home/admin/domains/example.com/wordpress",
  "admin_username": "admin",
  "admin_password_encrypted": "AES-256-GCM...",
  "status": "running",
  "php_pool_created": true,
  "db_name": "nxp_abc123",
  "db_password_encrypted": "AES-256-GCM..."
}
```

### PostgreSQL: Managed Resource

NexusPanel connects to the user's PostgreSQL server to manage their databases. It does NOT use PostgreSQL for its own storage:

```
┌──────────────────────────────────────────────────────────────┐
│  NexusPanel → PostgreSQL Connection                           │
│                                                               │
│  Purpose: Manage user databases (create, query, backup)      │
│  Connection: pg.Pool with DB_HOST/PORT/USER/PASSWORD          │
│  Schema: User manages their own databases                     │
│                                                               │
│  Internal Tables (auto-created):                              │
│  ├── nexus_panel_column_order                                │
│  │   (tracks column display order per table)                 │
│  └── nexus_query_bookmarks                                   │
│      (saved SQL queries per database)                        │
└──────────────────────────────────────────────────────────────┘
```

### nxLicensing: JSON-File Storage

```
┌──────────────────────────────────────────────────────────────┐
│  nxLicensing Data Layer                                       │
│                                                               │
│  data/licenses.json   → License key database                 │
│  data/users.json      → Admin user accounts                  │
│                                                               │
│  Same atomic write pattern as NexusPanel                     │
└──────────────────────────────────────────────────────────────┘
```

---

## External Service Integrations

### System Service Bridge

NexusPanel bridges to numerous external Linux services through CLI execution and API calls:

```
┌──────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICE MAP                            │
│                                                                   │
│  ┌──────────────┐                                                │
│  │  NexusPanel  │                                                │
│  │   Process    │                                                │
│  │              │                                                │
│  │  Spawns:     │                                                │
│  └──────┬───────┘                                                │
│         │                                                         │
│         ├── systemctl start/stop/restart/status nginx            │
│         │   → Service management                                 │
│         │                                                         │
│         ├── nginx -t && nginx -s reload                          │
│         │   → Vhost configuration                                │
│         │                                                         │
│         ├── certbot certonly --webroot -d example.com            │
│         │   → SSL certificate automation                          │
│         │                                                         │
│         ├── clamscan -r /home/user/files                         │
│         │   → Virus scanning                                     │
│         │                                                         │
│         ├── vsftpd configuration management                     │
│         │   → FTP account management                             │
│         │                                                         │
│         ├── git clone / git pull / git checkout                  │
│         │   → Code deployment                                    │
│         │                                                         │
│         ├── WP-CLI (wp-cli.phar)                                 │
│         │   → WordPress management                               │
│         │                                                         │
│         ├── composer create-project                              │
│         │   → Laravel management                                 │
│         │                                                         │
│         ├── pm2 start/stop/restart                               │
│         │   → Node.js process management                         │
│         │                                                         │
│         ├── docker container exec                                │
│         │   → Docker container management                        │
│         │                                                         │
│         ├── iptables / firewalld / ufw / nftables                │
│         │   → Firewall management (multi-backend)                │
│         │                                                         │
│         └── /proc/*, /sys/*                                      │
│             → System metrics collection                          │
└──────────────────────────────────────────────────────────────────┘
```

### One-Click App Installers

```
┌──────────────────────────────────────────────────────────────┐
│  scripts/apps/                                                │
│                                                               │
│  wordpress.sh    → WordPress via WP-CLI                       │
│  ├── Download WordPress core                                  │
│  ├── Create PostgreSQL database                               │
│  ├── Configure wp-config.php                                  │
│  ├── Run wp-core install                                      │
│  └── Create PHP-FPM pool                                     │
│                                                               │
│  laravel.sh      → Laravel via Composer                       │
│  ├── composer create-project laravel/laravel                 │
│  ├── Configure .env (DB, APP_KEY)                             │
│  ├── Run migrations                                          │
│  └── Set permissions                                         │
│                                                               │
│  node-express.sh → Node.js via PM2                            │
│  ├── npm init + npm install                                   │
│  ├── Create ecosystem.config.js                               │
│  ├── pm2 start + pm2 save                                     │
│  └── Configure reverse proxy                                 │
│                                                               │
│  nextjs.sh       → Next.js static export                      │
│  ├── npx create-next-app                                      │
│  ├── next build + next export                                 │
│  └── Configure nginx static serving                          │
│                                                               │
│  static.sh       → Static HTML site                           │
│  ├── Create directory structure                               │
│  └── Configure nginx server block                             │
└──────────────────────────────────────────────────────────────┘
```

### Git Deployment Pipeline

```
  Developer pushes to GitHub/GitLab
         │
         v
  GitHub sends webhook to NexusPanel
  POST /webhook/github { ref: "refs/heads/main" }
         │
         v
  NexusPanel webhook.js receives (token-authenticated)
         │
         v
  git-deploy service:
  ├── Verify webhook signature
  ├── cd /path/to/project
  ├── git pull origin main
  ├── Run pre-deploy hooks (if configured)
  │   ├── npm install
  │   ├── npm run build
  │   └── Run migrations
  ├── Restart service (PM2 / systemd)
  └── Log deployment to data/deployments.json
```

---

## Deployment & Infrastructure

### Installation Matrix

```
┌──────────────────────────────────────────────────────────────┐
│  Supported Operating Systems                                  │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Ubuntu      │  │   Debian      │  │  AlmaLinux   │       │
│  │   install-    │  │   install-    │  │  install-    │       │
│  │   ubuntu.sh   │  │   debian.sh   │  │  almalinux.sh│       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   CentOS      │  │  Rocky Linux  │  │   Fedora     │       │
│  │   install-    │  │   install-    │  │   install-   │       │
│  │   centos.sh   │  │   rocky.sh    │  │   fedora.sh  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   macOS       │  │   Windows     │  │   Docker     │       │
│  │   install-    │  │   install-    │  │   install-   │       │
│  │   macos.sh    │  │   windows.ps1 │  │   docker.sh  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                               │
│  Universal: install.sh (auto-detects OS)                     │
└──────────────────────────────────────────────────────────────┘
```

### Systemd Service

```ini
[Unit]
Description=NexusPanel - VPS Control Center
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/NexusPanel
ExecStart=/usr/bin/node /root/NexusPanel/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Environment Configuration

```bash
# .env — Primary configuration

# Server
PORT=3443
NODE_ENV=production
SERVER_LOCATION=Amsterdam, Netherlands

# Authentication
JWT_SECRET=<64-char-hex-string>
ADMIN_USER=admin
ADMIN_PASS=<bcrypt-hash-or-plaintext>
SSH_USER=root

# License
LICENSE_KEY=NX-XXXX-XXXX-XXXX
LICENSE_DOMAIN=your-domain.com
LICENSE_SERVER_URL=https://nxl.xus.me/api
LICENSE_SECRET=<hmac-shared-secret>

# Database (managed PostgreSQL)
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=<password>
```

### Reverse Proxy (nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name panel.example.com;

    ssl_certificate /etc/letsencrypt/live/panel.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/panel.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3443;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Testing Architecture

### Test Structure

```
tests/
├── helpers/
│   └── setup.mjs              # App factory + test utilities
├── unit/                       # 11 unit test files
│   ├── middleware/
│   │   ├── auth.test.mjs       # Auth middleware tests
│   │   └── security.test.mjs   # Security middleware tests
│   ├── services/
│   │   ├── notifications.test.mjs
│   │   ├── audit.test.mjs
│   │   └── ... (service tests)
│   └── utils/
│       └── shell.test.mjs      # Shell utility tests
└── integration/                # 30 integration test files
    ├── auth.test.mjs           # Auth flow tests
    ├── databases.test.mjs      # Database manager tests
    ├── files.test.mjs          # File manager tests
    ├── docker.test.mjs         # Docker tests
    ├── deploy.test.mjs         # Git deploy tests
    ├── domains.test.mjs        # Domain management tests
    ├── ssl.test.mjs            # SSL management tests
    ├── firewall.test.mjs       # Firewall tests
    ├── backups.test.mjs        # Backup tests
    └── ... (21 more)
```

### Test Configuration

```javascript
// vitest.config.mjs
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 15000,
    include: ['tests/**/*.test.mjs'],
    pool: 'forks',
  },
});
```

### Test Utilities

The `tests/helpers/setup.mjs` module provides:
- **App factory**: Creates a test Express app instance with mocked services
- **Auth helpers**: Generate JWT tokens for test users
- **Mock data**: Pre-built test fixtures for users, settings, databases
- **Cleanup utilities**: Reset JSON files between tests

---

## Future Roadmap

### Planned Enhancements

| Category | Feature | Priority |
|----------|---------|----------|
| **Database** | MySQL/MariaDB full management parity | High |
| **Frontend** | Real-time dashboard with WebSocket push | High |
| **Security** | Fail2Ban integration | High |
| **Docker** | Docker Compose management | Medium |
| **Monitoring** | Custom alert webhooks (Slack, Discord, Telegram) | Medium |
| **Backup** | Remote backup destinations (S3, GCS, SFTP) | Medium |
| **API** | REST API v2 with OpenAPI/Swagger documentation | Medium |
| **Multi-tenancy** | Multi-user panel access with permission granularity | Low |
| **Themes** | Custom theme engine with CSS variables | Low |
| **i18n** | Full internationalization support | Low |

### Architecture Evolution

```
  Current: Single-process monolith
            │
            ▼
  Phase 1: Background worker separation (backup, metrics)
            │
            ▼
  Phase 2: Plugin/extension system
            │
            ▼
  Phase 3: Multi-server management (agent-based)
```

---

## Summary

The NexusPanel Project represents a **complete server management lifecycle** — from the moment a customer discovers the product on TheNexusPanel commercial website, through license acquisition via NexusPanelLicensing, to the daily operational management of their VPS through NexusPanel.

The three pillars work in concert:

- **TheNexusPanel** drives customer acquisition and revenue
- **NexusPanelLicensing** ensures license integrity and enables feature gating
- **NexusPanel** delivers the actual server management value

Together, they form a self-contained ecosystem where each component has a clear responsibility and well-defined interfaces, enabling a seamless experience from purchase to production.

---

*Document generated for The NexusPanel Project — Version 1.35.8*
*License: Business Source License 1.1 (Apache 2.0 after 2027-07-20)*
