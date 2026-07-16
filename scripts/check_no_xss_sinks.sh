#!/usr/bin/env bash
# XSS-sink guard: the fan UI renders ONLY React auto-escaped values (numerics / base58 / decoded bytes), never
# raw HTML — this locks that invariant as the close-path grows. Fails (exit 1) if any tracked app/src or src file
# introduces an HTML-injection sink. Portable POSIX ERE (macOS BSD grep + CI GNU grep). Run before push + in CI.
set -uo pipefail
cd "$(dirname "$0")/.."

# HTML-injection sinks. `eval\(` / `new Function` need the call form to avoid matching the word in prose.
SINKS='dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function\('
FILES=$(git ls-files 'app/src/*' 'packages/core/src/*' 2>/dev/null || true)
[ -z "$FILES" ] && FILES=$(find app/src src -type f 2>/dev/null)

HITS=$(printf '%s\n' $FILES | xargs grep -nIE "$SINKS" 2>/dev/null || true)
if [ -n "$HITS" ]; then
  echo "❌ XSS-sink guard: an HTML-injection sink appeared in the UI/lib — render via React escaping instead:"
  echo "$HITS"
  exit 1
fi
echo "✅ XSS-sink guard passed (no HTML-injection sinks in app/src or src)."
