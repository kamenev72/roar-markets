#!/usr/bin/env bash
# PROPCAST — one-command repeatable demo take. Prints the gate green, runs the on-chain re-verify in the
# terminal, and echoes the fan-board launch line — so the operator can record a clean ≤5-min screen capture in
# one shot. Read-only: it verifies an EXISTING on-chain receipt, it mints nothing (no devnet SOL burn).
#
# Any RPC endpoint that carries an api-key is MASKED in the printed output (no secret on camera).
set -euo pipefail
cd "$(dirname "$0")/.."

mask() { sed -E 's#(api[._-]?key=)[^[:space:]&]+#\1***MASKED***#gi; s#(/v2/)[A-Za-z0-9_-]{8,}#\1***MASKED***#g'; }

echo "── PROPCAST demo take ───────────────────────────────────────────"
echo "[1/4] gate: test · typecheck · clean-room · doc-drift"
npm test --silent >/dev/null 2>&1 && echo "      ✓ tests green"   || { echo "      ✗ tests"; exit 1; }
npm run typecheck --silent >/dev/null 2>&1 && echo "      ✓ typecheck" || { echo "      ✗ typecheck"; exit 1; }
npm run ui:bundle-check --silent >/dev/null 2>&1 && echo "      ✓ initial bundle budget" || { echo "      ✗ bundle"; exit 1; }
npm run ui:e2e --silent >/dev/null 2>&1 && echo "      ✓ responsive browser gate" || { echo "      ✗ browser"; exit 1; }
npm run cleanroom --silent >/dev/null 2>&1 && echo "      ✓ clean-room"  || { echo "      ✗ clean-room"; exit 1; }
npm run doc-drift --silent >/dev/null 2>&1 && echo "      ✓ doc-drift"   || { echo "      ✗ doc-drift"; exit 1; }

echo "[2/4] re-verify the REAL on-chain receipt (complete binding gate, no key, read-only)"
node --import tsx scripts/verify_real_settle.ts 2>&1 | mask

echo "[3/4] fan board — launch in a second terminal, then record:"
echo "      npm --prefix ui ci && npm --prefix ui run dev"

echo "[4/4] demo spine: synthetic board flow → receipt bytes re-verified in-browser."
echo "      The injected mint/finality hook and venue payout are not demonstrated by this script."
echo "─────────────────────────────────────────────────────────────────"
