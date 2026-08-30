#!/usr/bin/env bash
# Static HTML placeholder installer. Runs as the target system user.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

cleanup() {
  local exit_code=$?
  log "ERROR: Static placeholder creation failed (exit code $exit_code). Cleaning up..."
  cleanup_path "${INSTALL_PATH:-}"
  exit "$exit_code"
}
trap cleanup ERR

for v in INSTALL_PATH DOMAIN SITE_TITLE; do
  require_env "$v"
done

mkdir -p "$INSTALL_PATH"

cat > "$INSTALL_PATH/index.html" <<EOF
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${SITE_TITLE} — ${DOMAIN}</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    background:radial-gradient(1200px 600px at 50% -10%,#1e1b4b 0%,#0f172a 55%,#020617 100%);
    color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
  .card{text-align:center;max-width:560px;padding:56px 40px;border:1px solid rgba(148,163,184,.18);
    border-radius:20px;background:linear-gradient(180deg,rgba(30,41,59,.6),rgba(15,23,42,.6));
    box-shadow:0 24px 80px rgba(2,6,23,.6)}
  h1{font-size:clamp(22px,4.5vw,34px);color:#f8fafc;word-break:break-all;margin-bottom:14px}
  p{color:#94a3b8;font-size:16px;line-height:1.6}
  .footer{margin-top:28px;color:#64748b;font-size:13px}
</style>
</head>
<body>
  <div class="card">
    <h1>${SITE_TITLE}</h1>
    <p>${DOMAIN} is up and serving traffic via NexusPanel.<br>Static content can be placed here.</p>
    <div class="footer">Hosted with NexusPanel</div>
  </div>
</body>
</html>
EOF

log "Static site placeholder created for ${DOMAIN}."
