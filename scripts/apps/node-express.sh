#!/usr/bin/env bash
# Node.js Express installer. Runs as the target system user.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

for v in INSTALL_PATH PORT APP_NAME; do
  require_env "$v"
done

cd "$INSTALL_PATH"

log "Initializing npm package ..."
npm init -y >/dev/null 2>&1

log "Installing express ..."
npm install express --no-audit --no-fund >/dev/null 2>&1

log "Writing server.js (port $PORT) ..."
cat > server.js <<'EOF'
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const name = process.env.APP_NAME || 'Nexus Node App';

app.get('/healthz', (req, res) => res.json({ ok: true, pid: process.pid, uptime: process.uptime() }));

app.use((req, res) => {
  const html = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + name.replace(/[<>&"']/g, '') + '</title>'
    + '<style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}'
    + '.card{text-align:center;padding:48px;border:1px solid rgba(148,163,184,.2);border-radius:20px;background:rgba(30,41,59,.5)}'
    + 'h1{margin:0 0 8px}code{color:#06b6d4}</style></head>'
    + '<body><div class="card"><h1>' + name.replace(/[<>&"']/g, '') + '</h1>'
    + '<p>Running on Node <code>' + process.version + '</code> via PM2.</p>'
    + '<p><a href="/healthz" style="color:#10b981">/healthz</a></p></div></body></html>';
  res.send(html);
});

app.listen(port, '127.0.0.1', () => console.log('listening on 127.0.0.1:' + port));
EOF

log "Node app scaffold complete."
