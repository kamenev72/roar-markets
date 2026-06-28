#!/usr/bin/env bash
# Clean-room + secret CI gate. Fails (exit 1) if any tracked file leaks proprietary vocabulary or secrets.
# Run before every push; wired into CI.
set -uo pipefail
cd "$(dirname "$0")/.."

# Proprietary-vocabulary patterns (internal finding-codes, memory layer, private repo names) + secret patterns.
PATTERNS=(
  'pmem' 'PM_bot' 'rtk' '\[COPY-' '\[STRATEGY-' '\[INFRA-' '\[CROSS-' 'finding:' 'PLAN-[0-9]'
  'BEGIN .*PRIVATE KEY' '0x[0-9a-fA-F]{64}' 'Bearer eyJ' 'POLYGONSCAN' 'DASHBOARD_'
  'api-key=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}'
)
FAIL=0
# Search tracked files only (git ls-files); skip this script itself and lockfiles.
FILES=$(git ls-files 2>/dev/null | grep -vE 'scripts/check_cleanroom\.sh$|\.lock$|yarn\.lock$' || true)
[ -z "$FILES" ] && FILES=$(find . -type f -not -path './.git/*' -not -path './node_modules/*' -not -path './target/*' -not -name 'check_cleanroom.sh')
for p in "${PATTERNS[@]}"; do
  HITS=$(printf '%s\n' $FILES | xargs grep -nIE "$p" 2>/dev/null || true)
  if [ -n "$HITS" ]; then echo "❌ clean-room violation (pattern: $p):"; echo "$HITS"; FAIL=1; fi
done
if [ "$FAIL" -eq 0 ]; then echo "✅ clean-room gate passed (no proprietary vocabulary or secrets in tracked files)."; fi
exit $FAIL
