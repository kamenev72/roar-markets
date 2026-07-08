#!/usr/bin/env bash
# Clean-room + secret CI gate. Fails (exit 1) if any tracked file leaks proprietary vocabulary or secrets.
# Run before every push; wired into CI.
set -uo pipefail
cd "$(dirname "$0")/.."

# Proprietary-vocabulary patterns (internal finding-codes, memory layer, private repo names) + secret patterns.
# Secret-shape patterns below use only POSIX ERE (no \s / \d) so they run identically on macOS BSD grep and CI GNU grep.
PATTERNS=(
  'pmem' 'PM_bot' 'rtk' '\[COPY-' '\[STRATEGY-' '\[INFRA-' '\[CROSS-' 'finding:' 'PLAN-[0-9]'
  '\[checkpoint' '\[CP[0-9]' '\[W[0-9]' 'V[0-9]+[a-z]?-H[0-9]' '\bCF[0-9]+\b'
  '[0-9]+-lens' '[0-9]+ agents' 'council v[0-9]' '\bcouncil\b' 'COMMITTED[- ]PARALLEL'
  '\bP-[LMH][0-9]' '§[0-9]+-P' '\(review \)' 'master plan §'
  'BEGIN .*PRIVATE KEY' '0x[0-9a-fA-F]{64}' 'Bearer eyJ' 'POLYGONSCAN' 'DASHBOARD_'
  'api-key=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}'
  # Solana keypair byte-array (id.json / Keypair.fromSecretKey(Array)) — 50+ comma-separated 1-3 digit ints.
  '([0-9]{1,3}, *){50,}[0-9]{1,3}'
  # Bare JWT (no Bearer prefix) — header.payload. (the guest JWT shape).
  'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.'
  # Key-scoped base58 secret (secretKey/private_key = <base58 80+>).
  '(secretKey|secret_key|private[_-]?key)[": =]+[1-9A-HJ-NP-Za-km-z]{80,}'
)
FAIL=0
# Search tracked files only (git ls-files); skip this script itself and lockfiles.
FILES=$(git ls-files 2>/dev/null | grep -vE 'scripts/check_cleanroom\.sh$|\.lock$|yarn\.lock$' || true)
[ -z "$FILES" ] && FILES=$(find . -type f -not -path './.git/*' -not -path './node_modules/*' -not -path './target/*' -not -name 'check_cleanroom.sh')
# Optional extra files to scan (used by the selftest to prove the patterns fire on a synthetic; empty in CI).
[ -n "${CLEANROOM_EXTRA_FILES:-}" ] && FILES="$FILES $CLEANROOM_EXTRA_FILES"
for p in "${PATTERNS[@]}"; do
  HITS=$(printf '%s\n' $FILES | xargs grep -nIE "$p" 2>/dev/null || true)
  if [ -n "$HITS" ]; then echo "❌ clean-room violation (pattern: $p):"; echo "$HITS"; FAIL=1; fi
done

# Scan COMMIT MESSAGES too (a public repo exposes git history): plan-ids, checkpoint tags, AI co-author
# trailers must not ride in. Unpushed range vs origin/main; pass --full for the whole history (pre-flip check).
MSG_PATTERNS=('PLAN-[0-9]' '\[checkpoint' '\[CP[0-9]' '\[W[0-9]' 'Co-Authored-By' '[0-9]+ agents' 'COMMITTED[- ]PARALLEL' '\bcouncil\b' '\bP-[LMH][0-9]')
if [ "${1:-}" = "--full" ]; then RANGE=""; else
  if git rev-parse --verify --quiet origin/main >/dev/null 2>&1; then RANGE="origin/main..HEAD"; else RANGE="-30"; fi
fi
MSGS=$(git log $RANGE --format='%H%n%B' 2>/dev/null || true)
for p in "${MSG_PATTERNS[@]}"; do
  if printf '%s' "$MSGS" | grep -qiE "$p"; then
    echo "❌ clean-room violation (commit message pattern: $p) in ${RANGE:-full history}:"
    printf '%s' "$MSGS" | grep -inE "$p" | head; FAIL=1
  fi
done

if [ "$FAIL" -eq 0 ]; then echo "✅ clean-room gate passed (no proprietary vocabulary or secrets in tracked files or commit messages)."; fi
exit $FAIL
