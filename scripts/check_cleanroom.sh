#!/usr/bin/env bash
# Clean-room + secret CI gate. Fails (exit 1) if the staged Git tree leaks proprietary vocabulary or secrets.
# Run before every push; wired into CI.
set -uo pipefail
cd "$(dirname "$0")/.."

# The compatibility marker is allowed only when the path and entire matching
# content line are both exact. Keep them as separate values: formatting a
# newline-bearing path into a grep record before classification would let a
# crafted path shed its rejected prefix and masquerade as an allowed record.
BRAND_ALLOW_PATHS=(
  'packages/core/src/index.ts'
  'packages/core/test/smoke.test.ts'
  'packages/core/test/smoke.test.ts'
)
BRAND_ALLOW_LINES=(
  'export const PROPCAST = "propcast" as const;'
  'import { PROPCAST } from "../src/index.js";'
  '    expect(PROPCAST).toBe("propcast");'
)

# Opaque assets cannot be searched line-by-line without false positives from
# compressed bytes. Permit only the exact reviewed Git blobs at exact paths;
# every new or changed binary is rejected until its immutable OID is reviewed.
BINARY_ALLOW_PATHS=(
  'app/public/roar-social-1280x640.png'
  'artifacts/evidence/ui/chromium-1440.png'
  'artifacts/evidence/ui/chromium-360.png'
  'artifacts/evidence/ui/chromium-768.png'
  'artifacts/fixtures/pitchmaker_book.so'
  'docs/assets/roar-social-1280x640.png'
  'docs/deck/Roar Markets Deck.pdf'
)
BINARY_ALLOW_OIDS=(
  '3376d224c5569526447a65481f25b5e300eb5c25'
  '9706b349648c70f4b6f3324c4604fa6b17e7ebca'
  'd018f80868888447b820e29a0ad5eb0d1d2aeede'
  '3e4b4b02bd076a04837550d1fb7af2d2431a3fdc'
  '7e4911111df801523ed742320b766eace88f615f'
  '3376d224c5569526447a65481f25b5e300eb5c25'
  '131ac4311a768d328ca95a83fd7784013d602ee3'
)

brand_hit_allowed() {
  local file="$1"
  local line="$2"
  local i
  for ((i = 0; i < ${#BRAND_ALLOW_PATHS[@]}; i++)); do
    if [[ "$file" == "${BRAND_ALLOW_PATHS[$i]}" && "$line" == "${BRAND_ALLOW_LINES[$i]}" ]]; then
      return 0
    fi
  done
  return 1
}

binary_blob_allowed() {
  local file="$1"
  local oid="$2"
  local i
  for ((i = 0; i < ${#BINARY_ALLOW_PATHS[@]}; i++)); do
    if [[ "$file" == "${BINARY_ALLOW_PATHS[$i]}" && "$oid" == "${BINARY_ALLOW_OIDS[$i]}" ]]; then
      return 0
    fi
  done
  return 1
}

if [[ "${1:-}" == "--classify-brand-hit" ]]; then
  [[ $# -eq 3 ]] || exit 2
  brand_hit_allowed "$2" "$3"
  exit $?
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

# Snapshot the staged Git index, which is the tree that can actually be
# committed. Never reopen working-tree paths: doing so would follow symlinked
# ancestors and leave a check-then-grep race. Each manifest entry is the exact
# logical path plus an owned regular-file snapshot of its indexed blob.
SNAPSHOT_ROOT=""
SNAPSHOT_OWNED=0
cleanup() {
  [[ "$SNAPSHOT_OWNED" -ne 1 ]] || rm -rf -- "$SNAPSHOT_ROOT"
}
if ! SNAPSHOT_ROOT=$(mktemp -d) || [[ -z "$SNAPSHOT_ROOT" || ! -d "$SNAPSHOT_ROOT" ]]; then
  echo "❌ clean-room: could not create the index snapshot directory" >&2
  exit 2
fi
SNAPSHOT_OWNED=1
trap cleanup EXIT
FILE_LIST="$SNAPSHOT_ROOT/manifest"
INDEX_LIST="$SNAPSHOT_ROOT/index"
if ! : > "$FILE_LIST"; then
  echo "❌ clean-room: could not create the scan manifest" >&2
  exit 2
fi
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ clean-room: a Git worktree/index is required for an immutable scan" >&2
  exit 2
fi
if ! git ls-files --stage -z -- . > "$INDEX_LIST"; then
  echo "❌ clean-room: could not enumerate the staged index" >&2
  FAIL=1
fi

MANIFEST_COUNT=0
INDEX_RECORDS=0
IGNORE_SNAPSHOT=""
while IFS= read -r -d '' record; do
  INDEX_RECORDS=$((INDEX_RECORDS + 1))
  if [[ "$record" != *$'\t'* ]]; then
    echo "❌ clean-room: malformed staged-index record" >&2
    FAIL=1
    continue
  fi
  metadata=${record%%$'\t'*}
  file=${record#*$'\t'}
  mode=${metadata%% *}
  remainder=${metadata#* }
  oid=${remainder%% *}
  stage=${metadata##* }
  if [[ "$stage" != "0" || ( "$mode" != "100644" && "$mode" != "100755" ) ]]; then
    printf '❌ clean-room: staged path is conflicted or non-regular (mode=%q stage=%q): %q\n' "$mode" "$stage" "$file" >&2
    FAIL=1
    continue
  fi
  snapshot="$SNAPSHOT_ROOT/blob-$MANIFEST_COUNT"
  if ! git cat-file blob "$oid" > "$snapshot"; then
    printf '❌ clean-room: could not snapshot indexed blob for %q\n' "$file" >&2
    FAIL=1
    continue
  fi
  if [[ -s "$snapshot" ]]; then
    nul_stripped="$SNAPSHOT_ROOT/no-nul-$MANIFEST_COUNT"
    if ! LC_ALL=C tr -d '\000' < "$snapshot" > "$nul_stripped"; then
      printf '❌ clean-room: could not classify indexed blob for %q (tr failed)\n' "$file" >&2
      FAIL=1
      continue
    fi
    cmp -s "$snapshot" "$nul_stripped"
    text_status=$?
    if [[ $text_status -eq 1 ]]; then
      if ! binary_blob_allowed "$file" "$oid"; then
        printf '❌ clean-room: unreviewed binary blob (oid=%q): %q\n' "$oid" "$file" >&2
        FAIL=1
      fi
      continue
    elif [[ $text_status -ne 0 ]]; then
      printf '❌ clean-room: could not classify indexed blob for %q (status %s)\n' "$file" "$text_status" >&2
      FAIL=1
      continue
    fi
  fi
  case "$file" in
    scripts/check_cleanroom.sh|*.lock|yarn.lock|*/yarn.lock) continue ;;
  esac
  if [[ "$file" == '.gitignore' ]]; then
    IGNORE_SNAPSHOT="$snapshot"
  fi
  if ! printf '%s\0%s\0' "$file" "$snapshot" >> "$FILE_LIST"; then
    printf '❌ clean-room: could not append indexed snapshot for %q\n' "$file" >&2
    FAIL=1
    continue
  fi
  MANIFEST_COUNT=$((MANIFEST_COUNT + 1))
done < "$INDEX_LIST"

snapshot_acceptable() {
  local snapshot="$1"
  [[ ! -L "$snapshot" && -f "$snapshot" && -r "$snapshot" ]]
}

scan_pattern() {
  local pattern="$1"
  local file snapshot status seen=0
  while IFS= read -r -d '' file && IFS= read -r -d '' snapshot; do
    seen=$((seen + 1))
    if ! snapshot_acceptable "$snapshot"; then
      printf '❌ clean-room: indexed snapshot is missing, non-regular, or unreadable: %q\n' "$file" >&2
      return 2
    fi
    LC_ALL=C grep -nE "$pattern" -- "$snapshot" >/dev/null 2>&1
    status=$?
    if [[ $status -eq 0 ]]; then
      if ! printf '%q\n' "$file"; then return 2; fi
    elif [[ $status -ne 1 ]]; then
      printf '❌ clean-room: grep failed for %q (status %s)\n' "$file" "$status" >&2
      return 2
    fi
  done < "$FILE_LIST"
  if [[ "$seen" -ne "$MANIFEST_COUNT" ]]; then
    echo "❌ clean-room: indexed snapshot manifest is truncated" >&2
    return 2
  fi
  return 0
}

scan_brand_hits() {
  local file snapshot status filter_status filtered_input filtered_output i seen=0
  local brand_matches="$SNAPSHOT_ROOT/brand-matches"
  while IFS= read -r -d '' file && IFS= read -r -d '' snapshot; do
    seen=$((seen + 1))
    if ! snapshot_acceptable "$snapshot"; then
      printf '❌ clean-room: indexed brand snapshot is missing, non-regular, or unreadable: %q\n' "$file" >&2
      return 2
    fi
    case "$file" in package-lock.json|app/package-lock.json) continue ;; esac
    LC_ALL=C grep -E 'PROPCAST|Propcast|PropCast' -- "$snapshot" > "$brand_matches" 2>/dev/null
    status=$?
    if [[ $status -eq 0 ]]; then
      filtered_input="$brand_matches"
      for ((i = 0; i < ${#BRAND_ALLOW_PATHS[@]}; i++)); do
        if [[ "$file" == "${BRAND_ALLOW_PATHS[$i]}" ]]; then
          filtered_output="$SNAPSHOT_ROOT/brand-filter-$i"
          LC_ALL=C grep -vxF -- "${BRAND_ALLOW_LINES[$i]}" "$filtered_input" > "$filtered_output" 2>/dev/null
          filter_status=$?
          if [[ $filter_status -ne 0 && $filter_status -ne 1 ]]; then
            printf '❌ clean-room: brand allowlist filter failed for %q (status %s)\n' "$file" "$filter_status" >&2
            return 2
          fi
          filtered_input="$filtered_output"
        fi
      done
      if [[ -s "$filtered_input" ]]; then
        if ! printf '%q\n' "$file"; then return 2; fi
      fi
    elif [[ $status -ne 1 ]]; then
      printf '❌ clean-room: brand grep failed for %q (status %s)\n' "$file" "$status" >&2
      return 2
    fi
  done < "$FILE_LIST"
  if [[ "$seen" -ne "$MANIFEST_COUNT" ]]; then
    echo "❌ clean-room: indexed brand snapshot manifest is truncated" >&2
    return 2
  fi
  return 0
}

# Roar Markets is the public product name. The lowercase compatibility domain
# remains intentional; uppercase PROPCAST is permitted only at its exported API
# seam and the assertion that proves that seam. Former PitchMaker material is
# retained only as explicit Apache-2.0 provenance in NOTICE and its fixture note.
BRAND_HITS=$(scan_brand_hits)
BRAND_SCAN_STATUS=$?
if [[ $BRAND_SCAN_STATUS -ne 0 ]]; then
  echo "❌ clean-room: retired-brand scan could not complete"
  FAIL=1
fi
if [[ -n "${BRAND_HITS:-}" ]]; then
  echo "❌ clean-room violation (retired public brand outside compatibility allowlist):"
  echo "$BRAND_HITS"
  FAIL=1
fi
for p in "${PATTERNS[@]}"; do
  HITS=$(scan_pattern "$p")
  SCAN_STATUS=$?
  if [[ $SCAN_STATUS -ne 0 ]]; then
    echo "❌ clean-room: scan could not complete for pattern: $p"
    FAIL=1
  elif [[ -n "$HITS" ]]; then
    echo "❌ clean-room violation (pattern: $p):"
    echo "$HITS"
    FAIL=1
  fi
done

# Scan COMMIT MESSAGES too (a public repo exposes git history): plan-ids, checkpoint tags, AI co-author
# trailers must not ride in. Unpushed range vs origin/main; pass --full for the whole history (pre-flip check).
MSG_PATTERNS=('PLAN-[0-9]' '\[checkpoint' '\[CP[0-9]' '\[W[0-9]' 'Co-Authored-By' '[0-9]+ agents' 'COMMITTED[- ]PARALLEL' '\bcouncil\b' '\bP-[LMH][0-9]')
if [ "${1:-}" = "--full" ]; then RANGE=""; else
  if git rev-parse --verify --quiet origin/main >/dev/null 2>&1; then RANGE="origin/main..HEAD"; else RANGE="-30"; fi
fi
if ! MSGS=$(git log $RANGE --format='%H%n%B' 2>&1); then
  echo "❌ clean-room: commit-message scan could not read ${RANGE:-full history}"
  echo "$MSGS"
  MSGS=""
  FAIL=1
fi
for p in "${MSG_PATTERNS[@]}"; do
  MSG_HITS=$(printf '%s' "$MSGS" | grep -inE "$p" 2>&1)
  MSG_SCAN_STATUS=$?
  if [[ $MSG_SCAN_STATUS -eq 0 ]]; then
    echo "❌ clean-room violation (commit message pattern: $p) in ${RANGE:-full history}:"
    echo "$MSG_HITS"
    FAIL=1
  elif [[ $MSG_SCAN_STATUS -ne 1 ]]; then
    echo "❌ clean-room: commit-message grep failed for pattern '$p' (status $MSG_SCAN_STATUS):"
    echo "$MSG_HITS"
    FAIL=1
  fi
done

# The .gitignore secrets backstop must actually WORK, not merely look right. A
# lost newline once folded `.env` and `target/` into a comment. Probe the exact
# indexed blob as an excludes file inside an owned empty Git repository; never
# consult the mutable working-tree .gitignore.
IGNORE_PROBE="$SNAPSHOT_ROOT/ignore-probe"
EMPTY_GIT_TEMPLATE=""
if [[ -z "$IGNORE_SNAPSHOT" || ! -f "$IGNORE_SNAPSHOT" || -L "$IGNORE_SNAPSHOT" ]]; then
  echo "❌ clean-room: staged .gitignore snapshot is unavailable" >&2
  FAIL=1
elif ! EMPTY_GIT_TEMPLATE=$(mktemp -d "$SNAPSHOT_ROOT/git-template.XXXXXX") ||
     [[ -z "$EMPTY_GIT_TEMPLATE" || ! -d "$EMPTY_GIT_TEMPLATE" ]]; then
  echo "❌ clean-room: could not create an empty Git template for the staged .gitignore probe" >&2
  FAIL=1
elif ! git init -q --template="$EMPTY_GIT_TEMPLATE" "$IGNORE_PROBE" >/dev/null 2>&1; then
  echo "❌ clean-room: could not create the staged .gitignore behavior probe" >&2
  FAIL=1
else
  for pat in .env "target/" .DS_Store; do
    if ! git -C "$IGNORE_PROBE" -c core.excludesFile="$IGNORE_SNAPSHOT" check-ignore --no-index -q -- "$pat" 2>/dev/null; then
      echo "❌ clean-room: staged .gitignore does not ignore '$pat' — the secrets backstop is disarmed (folded/lost newline?)"
      FAIL=1
    fi
  done
fi

if [ "$FAIL" -eq 0 ]; then echo "✅ clean-room gate passed (no proprietary vocabulary or secrets in staged files or commit messages)."; fi
exit $FAIL
