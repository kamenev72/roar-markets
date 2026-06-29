#!/usr/bin/env bash
# PROPCAST doc-drift gate — fail if a shipped current-state doc carries stale-progress language, names a
# deployed program with a non-canonical id, or a required doc is missing. DEVLOG.md is an append-only history
# and is intentionally NOT scanned for stale markers. Portable (GNU + BSD grep): no \b, uses -w for whole words.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

fail=0

# Shipped current-state docs that must exist + stay drift-free. The full submission set is enforced.
REQUIRED=(README.md CLAIMS.md DEMO.md HONESTY.md MOCKS.md DEPLOYMENTS.md docs/TXLINE_USAGE.md)

# 1. required docs exist
for f in "${REQUIRED[@]}"; do
  if [[ ! -f "$f" ]]; then echo "❌ doc-drift: required doc missing: $f"; fail=1; fi
done

# 2. no stale-progress language in the shipped docs
WORDS='TODO|TBD|WIP|FIXME|XXX'
PHRASES='in progress|work in progress|coming soon|to be done|placeholder'
for f in "${REQUIRED[@]}"; do
  [[ -f "$f" ]] || continue
  if grep -nwiE "$WORDS" "$f" >/dev/null 2>&1 || grep -niE "$PHRASES" "$f" >/dev/null 2>&1; then
    echo "❌ doc-drift: stale-progress marker in $f:"
    grep -nwiE "$WORDS" "$f" 2>/dev/null
    grep -niE "$PHRASES" "$f" 2>/dev/null
    fail=1
  fi
done

# 3. deployed-id pin: a doc that names kickoff_oracle must carry its canonical program id from the code.
KID=$(grep -oE 'new PublicKey\("[1-9A-HJ-NP-Za-km-z]{32,44}"\)' src/onchain/receipt.ts | head -1 | grep -oE '[1-9A-HJ-NP-Za-km-z]{32,44}')
if [[ -n "${KID:-}" ]]; then
  for f in "${REQUIRED[@]}"; do
    [[ -f "$f" ]] || continue
    if grep -qi 'kickoff_oracle' "$f" && ! grep -q "$KID" "$f"; then
      echo "❌ doc-drift: $f names kickoff_oracle but not its canonical id ($KID)"
      fail=1
    fi
  done
fi

if [[ $fail -eq 0 ]]; then
  echo "✅ doc-drift gate passed (no stale-progress language; deployed ids consistent)."
fi
exit $fail
