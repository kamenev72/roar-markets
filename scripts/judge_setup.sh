#!/usr/bin/env bash
# Cold, credential-free judge setup. CI supplies Linux dependencies; local hosts only install Chromium.
set -euo pipefail
cd "$(dirname "$0")/.."

npm ci --no-audit --no-fund
npm --prefix app ci --no-audit --no-fund
if [[ "${CI:-}" == "true" ]]; then
  npm --prefix app exec -- playwright install --with-deps chromium
else
  npm --prefix app exec -- playwright install chromium
fi
npm run judge-demo
