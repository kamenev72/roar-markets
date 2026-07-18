#!/usr/bin/env bash
# Clean-room + secret CI gate. Fails (exit 1) if any tracked file leaks proprietary vocabulary or secrets.
# Run before every push; wired into CI.
set -uo pipefail
cd "$(dirname "$0")/.."

# The compatibility marker is allowed only when the entire git-grep record is
# one of these three API-seam lines. Substring filtering would let an appended
# retired-brand occurrence hide behind an allowed prefix.
filter_brand_hits() {
  grep -vFx 'packages/core/src/index.ts:export const PROPCAST = "propcast" as const;' \
    | grep -vFx 'packages/core/test/smoke.test.ts:import { PROPCAST } from "../src/index.js";' \
    | grep -vFx 'packages/core/test/smoke.test.ts:    expect(PROPCAST).toBe("propcast");'
  return 0
}

if [[ "${1:-}" == "--filter-brand-hits" ]]; then
  filter_brand_hits
  exit 0
fi

# Proprietary-vocabulary patterns (internal finding-codes, memory layer, private repo names) + secret patterns.
# Secret-shape patterns below use only POSIX ERE (no \s / \d) so they run identically on macOS BSD grep and CI GNU grep.
PATTERNS=(
  'pmem' 'PM_bot' 'rtk' '\[COPY-' '\[STRATEGY-' '\[INFRA-' '\[CROSS-' 'finding:' 'PLAN-[0-9]'
  '\[checkpoint' '\[CP[0-9]' '\[W[0-9]' 'V[0-9]+[a-z]?-H[0-9]' '\bCF[0-9]+\b'
  '[0-9]+-lens' '[0-9]+ agents' 'council v[0-9]' '\bcouncil\b' 'COMMITTED[- ]PARALLEL'
  '\bP-[LMH][0-9]' '§[0-9]+-P' '\(review \)' '[Mm]aster plan'
  '[0-9]+-agent' 'review rank [0-9]' 'operator (rule|planning|directed|gated|authorized)' '\+H[0-9]' '\bW[1-9]\b'
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

# Emit paths as NUL-delimited records end to end. Whitespace-splitting a scalar
# filename list would let a tracked secret in e.g. "submission notes.txt" evade
# grep. CLEANROOM_EXTRA_FILES is newline-delimited when a selftest supplies more
# than one path; production CI leaves it empty.
extra_file_stream() {
  local extra
  [[ -n "${CLEANROOM_EXTRA_FILES:-}" ]] || return 0
  while IFS= read -r extra; do
    [[ -n "$extra" ]] && printf '%s\0' "$extra"
  done <<< "$CLEANROOM_EXTRA_FILES"
}

scan_file_stream() {
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git ls-files -z -- . ':!scripts/check_cleanroom.sh' ':!*.lock' ':!yarn.lock'
  else
    find . -type f -not -path './.git/*' -not -path './node_modules/*' -not -path './target/*' -not -name 'check_cleanroom.sh' -print0
  fi
  extra_file_stream
}

# Roar Markets is the public product name. The lowercase compatibility domain
# remains intentional; uppercase PROPCAST is permitted only at its exported API
# seam and the assertion that proves that seam. Former PitchMaker material is
# retained only as explicit Apache-2.0 provenance in NOTICE and its fixture note.
collect_brand_hits() {
  git grep -I -E 'PROPCAST|Propcast|PropCast' -- ':!package-lock.json' ':!app/package-lock.json' ':!scripts/check_cleanroom.sh' 2>/dev/null || true
  if [ -n "${CLEANROOM_EXTRA_FILES:-}" ]; then
    extra_file_stream | xargs -0 grep -HnIE 'PROPCAST|Propcast|PropCast' -- 2>/dev/null || true
  fi
}
BRAND_HITS=$(collect_brand_hits | filter_brand_hits)
if [ -n "$BRAND_HITS" ]; then
  echo "❌ clean-room violation (retired public brand outside compatibility allowlist):"
  echo "$BRAND_HITS"
  FAIL=1
fi
for p in "${PATTERNS[@]}"; do
  HITS=$(scan_file_stream | xargs -0 grep -nIE "$p" -- 2>/dev/null || true)
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

# The .gitignore secrets backstop must actually WORK, not merely look right. A lost newline once folded `.env`
# and `target/` into the tail of a COMMENT line — the file still read plausibly, but git ignored neither, so
# the last net between a stray `git add` and a committed key was silently gone. Assert the BEHAVIOUR
# (`git check-ignore`), never the file's text.
for pat in .env "target/" .DS_Store; do
  if ! git check-ignore -q "$pat" 2>/dev/null; then
    echo "❌ clean-room: .gitignore does not actually ignore '$pat' — the secrets backstop is disarmed (folded/lost newline?)"
    FAIL=1
  fi
done

if [ "$FAIL" -eq 0 ]; then echo "✅ clean-room gate passed (no proprietary vocabulary or secrets in tracked files or commit messages)."; fi
exit $FAIL
