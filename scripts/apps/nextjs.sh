#!/usr/bin/env bash
# Next.js static export installer. Runs as the target system user.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

for v in INSTALL_PATH PORT APP_NAME; do
  require_env "$v"
done

cd "$INSTALL_PATH"

log "Scaffolding Next.js project (no-install) ..."
npx --yes create-next-app@latest . \
  --ts --eslint --app --no-tailwind --no-src-dir \
  --import-alias "@/*" --use-npm --skip-install >/dev/null 2>&1

log "Enabling static export ..."
if [ -f next.config.ts ]; then
  printf 'const nextConfig = { output: "export" };\n\nexport default nextConfig;\n' > next.config.ts
elif [ -f next.config.mjs ]; then
  printf 'const nextConfig = { output: "export" };\n\nexport default nextConfig;\n' > next.config.mjs
elif [ -f next.config.js ]; then
  printf 'module.exports = { output: "export" };\n' > next.config.js
fi

log "Installing dependencies ..."
npm install --no-audit --no-fund >/dev/null 2>&1

log "Building static export ..."
npm run build >/dev/null 2>&1

if [ ! -d "$INSTALL_PATH/out" ]; then
  echo "Static export directory 'out' was not produced by the build" >&2
  exit 1
fi

log "Next.js static export complete (out/)."
