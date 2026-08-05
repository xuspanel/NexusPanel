# Development Guide

Tech stack, project structure, testing, and contribution workflow for NexusPanel.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 18+ |
| HTTP Framework | Express | 5.2.1 |
| WebSocket | ws | 8.21.0 |
| Terminal Backend | node-pty | 1.1.0 |
| Terminal Frontend | xterm.js | 5.5.0 |
| Database | PostgreSQL (pg) | 8.22.0 |
| Auth | jsonwebtoken + bcryptjs + speakeasy | 9.0.3 / 3.0.3 / 2.0.0 |
| Security | Helmet + express-rate-limit | 8.2.0 / 8.5.2 |
| Frontend | Vanilla JavaScript | ES2022 |
| Code Editor | Ace Editor | 1.36.2 |
| Charts | Chart.js | 4.4.7 |
| Containers | Dockerode | 5.0.1 |
| Testing | Vitest + Supertest | 4.1.10 / 7.2.2 |

---

## Module Architecture

Every feature follows a three-layer pattern:

```
Route (HTTP handling)
  -> Service (business logic)
    -> System commands / File I/O / Database
```

### Route Layer (`src/routes/`)

- Handles HTTP requests and responses
- Applies middleware (auth, admin-only)
- Calls service functions
- Returns JSON responses

### Service Layer (`src/services/`)

- Pure business logic, no HTTP awareness
- Reads/writes JSON data files
- Executes system commands via `runSafeSync()`
- Handles file locking and atomic writes

### Frontend Layer (`public/js/`)

- IIFE pattern (no global pollution)
- Event delegation via `data-*-action` attributes
- API calls via `API.*` namespace
- Loading/error/empty state management
- Toast notifications (no `alert()` or `confirm()`)
- Module-specific CSS class prefixes

---

## Coding Conventions

### Backend (CommonJS)

```javascript
const fs = require('fs');
const path = require('path');
const { runSafeSync } = require('../utils/shell');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'module.json');

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch { return []; }
}

function saveData(data) {
  const tmpFile = DATA_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DATA_FILE);
}

module.exports = { loadData, saveData };
```

### Frontend (IIFE)

```javascript
(function() {
  'use strict';
  const PREFIX = 'mod';
  let state = { items: [], loading: false };

  function render() { /* ... */ }

  function bindEvents() {
    document.querySelector('#viewModule').addEventListener('click', (e) => {
      const el = e.target.closest('[data-' + PREFIX + '-action]');
      if (!el) return;
      switch (el.dataset[Prefix + 'Action']) {
        case 'create': handleCreate(); break;
      }
    });
  }

  window.ModuleName = { init };
})();
```

### CSS Namespacing

| Module | Prefix | Example |
|--------|--------|---------|
| Dashboard | `dash-` | `.dash-stats-grid` |
| File Manager | `fm-` | `.fm-toolbar` |
| Docker | `docker-` | `.docker-prompt` |
| Firewall | `fw-` | `.fw-zone-card` |
| Cron | `cron-` | `.cron-entry` |
| SSL | `ssl-` | `.ssl-cert-card` |
| PHP-FPM | `fpm-` | `.fpm-pool-card` |
| Settings | `settings-` | `.settings-tab` |
| Profile | `profile-` | `.profile-avatar` |

---

## Testing

### Running Tests

```bash
npm test           # Full suite
npm run test:watch # Watch mode
npm run test:coverage
```

### Architecture

- **Framework**: Vitest 4 (ESM-native)
- **HTTP Testing**: Supertest
- **File Extension**: `.mjs` (required for Vitest 4)
- **Module Loading**: `createRequire()` for CJS source modules

### App Factory Pattern

Tests create an Express app without starting a server:

```javascript
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export function createApp() {
  const app = express();
  // Mount routes...
  return app;
}

export function getAuthToken(role = 'admin') {
  return jwt.sign({ username: 'test', role }, JWT_SECRET, { expiresIn: '1h' });
}
```

### Test Categories

| Category | Files | What's Tested |
|----------|-------|---------------|
| Unit | 9 | Validators, shell utils, auth middleware, services |
| Integration | 28 | Every route module |

---

## Frontend Development

### No Build Step

Edit `public/js/*.js` or `public/css/style.css` and refresh the browser.

### Cache Busting

Asset URLs include `?v=<VERSION>`:

```html
<link rel="stylesheet" href="/css/style.css?v=1.35.3">
<script defer src="/js/dashboard.js?v=1.35.3"></script>
```

### Theme System

CSS custom properties switch between dark and light:

```css
:root, [data-theme="dark"] {
  --bg-primary: #0f172a;
  --text-primary: #e2e8f0;
}
[data-theme="light"] {
  --bg-primary: #ffffff;
  --text-primary: #1e293b;
}
```

---

## Commit Conventions

- Commits to `main` must be **GPG-signed**
- Use conventional messages: `v1.35.3: Add Git Deploy with webhook auto-deploy`
- Never commit `.env`, `node_modules/`, `data/`, or proprietary directories

---

## Contribution Workflow

1. Fork and create a feature branch from `main`
2. Follow existing module structure (route + service + frontend)
3. Run `npm test` to verify
4. GPG-sign your commit
5. Open a pull request against `main`

---

*Part of [NexusPanel Documentation](../README.md)*
