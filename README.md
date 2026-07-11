# TheNexusPanel — Marketing & E-Commerce Website

The official marketing website, documentation portal, and e-commerce platform for NexusPanel — a self-hosted VPS control panel.

Built with Node.js, Express 5, and vanilla JavaScript with EJS templating.

## Features

- **Pricing** — 4 plan tiers ($29–$299) with feature comparison
- **Documentation** — Installation guide, 20+ feature articles, knowledge base
- **Authentication** — Register, login, profile with order history
- **E-Commerce** — Cart/checkout flow, license key generation via nxLicensing API, invoice PDF download
- **Blog** — Admin markdown editor with live publishing
- **Knowledge Base** — Categorized articles with search
- **Contact Form** — Email notifications via sendmail
- **Dark Theme** — Full dark mode across all pages
- **Responsive** — Desktop-first responsive layout

## Quick Start

```bash
npm install
npm start
# Running on http://127.0.0.1:3450
```

## Environment

Copy `.env.example` to `.env` and configure:

| Variable | Description |
|----------|-------------|
| `PORT` | Web server port (default: 3450) |
| `JWT_SECRET` | JWT signing key |
| `SESSION_SECRET` | Session encryption key |
| `NXL_LICENSE_API` | nxLicensing server URL |
| `NXL_CHECKOUT_API_KEY` | License server checkout API key |
| `ADMIN_EMAIL` | Admin notification email |
| `CONTACT_EMAIL` | Contact form recipient |

## License

MIT
