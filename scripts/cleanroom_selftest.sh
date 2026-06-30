#!/usr/bin/env bash
# Selftest for the clean-room/secret gate: prove each secret-shape pattern FIRES on a synthetic, and that the
# gate is GREEN on the real tracked tree (no false-positive). Reuses the gate's own PATTERNS via CLEANROOM_EXTRA_FILES
# (no pattern duplication). Synthetics are FAKE — random digits / a fabricated base58 run / a non-secret JWT-shaped
# string — never a real key.
set -uo pipefail
cd "$(dirname "$0")/.."
GATE="scripts/check_cleanroom.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fail=0

# one synthetic per new secret shape (fabricated, not a real secret)
printf '[%s]\n' "$(seq -s, 1 64)" > "$TMP/keypair.json"                          # 64-int keypair array
printf '{"jwt":"eyJ%s.eyJ%s.%s"}\n' "abcdefghij12" "klmnopqrst34" "sig0sig0sig0" > "$TMP/jwt.json"   # bare JWT shape
printf '{"secretKey":"%s"}\n' "$(printf '5%.0s' {1..88})" > "$TMP/base58.json"    # base58-length secret (all 5s)

for f in keypair.json jwt.json base58.json; do
  if CLEANROOM_EXTRA_FILES="$TMP/$f" bash "$GATE" >/dev/null 2>&1; then
    echo "❌ selftest: gate did NOT flag synthetic $f (pattern miss)"; fail=1
  else
    echo "✓ pattern fires on synthetic $f"
  fi
done

# the real tracked tree must stay GREEN (0 false-positives from the new patterns)
if bash "$GATE" >/dev/null 2>&1; then
  echo "✓ gate green on the real tracked tree (0 false-positives)"
else
  echo "❌ selftest: gate is RED on the real tree — a new pattern false-positives; tighten it"; fail=1
fi

[ "$fail" -eq 0 ] && echo "✅ cleanroom selftest passed" || echo "❌ cleanroom selftest FAILED"
exit $fail
