#!/usr/bin/env bash
# Roar Markets doc-drift gate — fail if a shipped current-state doc carries stale-progress language, names a
# deployed program with a non-canonical id, or a required doc is missing. docs/DEVLOG.md is an append-only history
# and is intentionally NOT scanned for stale markers. Portable (GNU + BSD grep): no \b, uses -w for whole words.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

fail=0

# Require each regex exactly once and in the declared file order. This makes the
# gate reject both deletion and rearrangement of the advertised judge recipe.
require_ordered_unique_lines() {
  local file="$1"
  local label="$2"
  shift 2
  local previous=0
  local pattern matches count line
  for pattern in "$@"; do
    matches=$(grep -nE "$pattern" "$file" 2>/dev/null || true)
    count=$(printf '%s\n' "$matches" | sed '/^$/d' | wc -l | tr -d ' ')
    if [[ "$count" != "1" ]]; then
      echo "❌ doc-drift: $label requires exactly one line matching: $pattern"
      fail=1
      return
    fi
    line=${matches%%:*}
    if [[ "$line" -le "$previous" ]]; then
      echo "❌ doc-drift: $label command order is not the reviewed sequence"
      fail=1
      return
    fi
    previous=$line
  done
}

# Shipped current-state docs that must exist + stay drift-free. The full submission set is enforced.
REQUIRED=(README.md docs/CLAIMS.md docs/DEMO.md docs/HONESTY.md docs/MOCKS.md docs/DEPLOYMENTS.md docs/TXLINE_USAGE.md docs/SECURITY.md)

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
KID=$(grep -oE 'new PublicKey\("[1-9A-HJ-NP-Za-km-z]{32,44}"\)' packages/core/src/onchain/receipt.ts | head -1 | grep -oE '[1-9A-HJ-NP-Za-km-z]{32,44}')
if [[ -n "${KID:-}" ]]; then
  for f in "${REQUIRED[@]}"; do
    [[ -f "$f" ]] || continue
    if grep -qi 'kickoff_oracle' "$f" && ! grep -q "$KID" "$f"; then
      echo "❌ doc-drift: $f names kickoff_oracle but not its canonical id ($KID)"
      fail=1
    fi
  done
fi

# 4. The documented cold judge path must provision the exact browser dependency and
# deployment configuration it claims to verify. These checks intentionally inspect
# the real files instead of duplicating a second judge recipe.
expected_csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.devnet.solana.com https://devnet.rpcpool.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
actual_csp=$(node -e '
  const config = require("./vercel.json");
  const headers = (Array.isArray(config.headers) ? config.headers : [])
    .flatMap((rule) => Array.isArray(rule.headers) ? rule.headers : [])
    .filter((header) => String(header.key).toLowerCase() === "content-security-policy");
  if (headers.length !== 1 || typeof headers[0].value !== "string") process.exit(2);
  process.stdout.write(headers[0].value);
' 2>/dev/null)
if [[ $? -ne 0 || "$actual_csp" != "$expected_csp" ]]; then
  echo "❌ doc-drift: Vercel must declare exactly the reviewed CSP and only the two RPC origins"
  fail=1
fi
expected_vercel_install="npm ci --no-audit --no-fund && npm --prefix app ci --no-audit --no-fund"
actual_vercel_install=$(node -e '
  const config = require("./vercel.json");
  if (typeof config.installCommand !== "string") process.exit(2);
  process.stdout.write(config.installCommand);
' 2>/dev/null)
if [[ $? -ne 0 || "$actual_vercel_install" != "$expected_vercel_install" ]]; then
  echo "❌ doc-drift: Vercel install command must exactly run locked root then app installs"
  fail=1
fi
if ! node -e '
  const lock = require("./app/package-lock.json");
  const entry = lock.packages?.["node_modules/@playwright/test"];
  if (!entry ||
      entry.version !== "1.61.1" ||
      entry.resolved !== "https://registry.npmjs.org/@playwright/test/-/test-1.61.1.tgz" ||
      entry.integrity !== "sha512-8nKv6+0RJSL9FE4jYOEGXnPeM/Hg12qZpmqzZjRh3qM0Y7c3z1mrOTfFLids72RDQYVh9WpLEfR5WdpNX4fkig==") process.exit(2);
' 2>/dev/null; then
  echo "❌ doc-drift: app lockfile must pin the reviewed Playwright version, tarball, and integrity"
  fail=1
fi
if ! node -e '
  const fs = require("node:fs");
  const expected = [
    "node_modules/", "app/node_modules/", "app/dist/", "app/test-results/", "dist/", ".git/", ".github/",
    "artifacts/fixtures/", "reports/", "scripts/", "packages/core/test/", "tests/", "docs/", "*.md", "!README.md",
  ].join("\n") + "\n";
  if (fs.readFileSync(".vercelignore", "utf8") !== expected) process.exit(2);
' 2>/dev/null; then
  echo "❌ doc-drift: .vercelignore must exactly preserve the reviewed deploy-context boundary"
  fail=1
fi
if [[ ! -x scripts/judge_setup.sh ]]; then
  echo "❌ doc-drift: scripts/judge_setup.sh must be executable"
  fail=1
else
  require_ordered_unique_lines scripts/judge_setup.sh "local judge setup" \
    '^set -euo pipefail$' \
    '^[[:space:]]*npm ci --no-audit --no-fund$' \
    '^[[:space:]]*npm --prefix app ci --no-audit --no-fund$' \
    '^if \[\[ "\$\{CI:-\}" == "true" \]\]; then$' \
    '^[[:space:]]*npm --prefix app exec -- playwright install --with-deps chromium$' \
    '^else$' \
    '^[[:space:]]*npm --prefix app exec -- playwright install chromium$' \
    '^fi$' \
    '^[[:space:]]*npm run judge-demo$'
fi
require_ordered_unique_lines .github/workflows/ci.yml "CI judge setup" \
  '^[[:space:]]*node-version-file: "\.nvmrc"$' \
  '^[[:space:]]*- run: npm ci$' \
  '^[[:space:]]*- run: npm --prefix app ci$' \
  '^[[:space:]]*run: npm --prefix app exec -- playwright install --with-deps chromium$' \
  '^[[:space:]]*run: npm run judge-demo$'
if ! grep -qE '^[[:space:]]*contents: read$' .github/workflows/ci.yml; then
  echo "❌ doc-drift: CI must retain read-only repository token permissions"
  fail=1
fi
expected_judge_demo="npm test && npm run typecheck && npm run ui:bundle-check && npm run ui:e2e && npm run cleanroom && npm run cleanroom:selftest && npm run doc-drift && npm run xss-guard"
actual_judge_demo=$(node -e '
  const pkg = require("./package.json");
  if (typeof pkg.scripts?.["judge-demo"] !== "string") process.exit(2);
  process.stdout.write(pkg.scripts["judge-demo"]);
' 2>/dev/null)
if [[ $? -ne 0 || "$actual_judge_demo" != "$expected_judge_demo" ]]; then
  echo "❌ doc-drift: judge-demo must retain the complete reviewed gate sequence"
  fail=1
fi
if [[ "$(tr -d '[:space:]' < .nvmrc 2>/dev/null)" != "22" ]]; then
  echo "❌ doc-drift: .nvmrc must remain on the documented Node 22 line"
  fail=1
fi
if ! grep -q 'bash scripts/judge_setup.sh' README.md || ! grep -q 'bash scripts/judge_setup.sh' docs/JUDGE.md || ! grep -q 'bash scripts/judge_setup.sh' docs/DEMO.md; then
  echo "❌ doc-drift: README, JUDGE, and DEMO must advertise the cold judge setup command"
  fail=1
fi
for f in README.md docs/JUDGE.md docs/DEMO.md; do
  if ! grep -q "Chromium system libraries" "$f" || ! grep -q "never invokes.*sudo" "$f"; then
    echo "❌ doc-drift: $f must state the Linux Chromium-library prerequisite and no-sudo boundary"
    fail=1
  fi
done
if grep -q 'artifacts/evidence/ui' app/e2e/board.spec.ts; then
  echo "❌ doc-drift: the judge gate must not overwrite tracked UI evidence"
  fail=1
fi

if [[ $fail -eq 0 ]]; then
  echo "✅ doc-drift gate passed (no stale-progress language; deployed ids consistent)."
fi
exit $fail
