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

# 5. Judge/share metadata must use the reviewed raster rather than the small SVG application mark. Keep one
# byte-identical docs copy for review and pin the mobile glyph's native aspect ratio.
SOCIAL_PUBLIC="app/public/roar-social-1280x640.png"
SOCIAL_DOCS="docs/assets/roar-social-1280x640.png"
SOCIAL_SVG="docs/assets/roar-social-1280x640.svg"
SOCIAL_URL="https://roar-markets.vercel.app/roar-social-1280x640.png"
if [[ ! -f "$SOCIAL_PUBLIC" || ! -f "$SOCIAL_DOCS" || ! -f "$SOCIAL_SVG" ]]; then
  echo "❌ doc-drift: Roar social-preview source/public assets are incomplete"
  fail=1
else
  og_url=$(grep -oE 'property="og:image" content="[^"]+"' app/index.html 2>/dev/null | sed -E 's/.*content="([^"]+)"/\1/' | head -1)
  if [[ "$og_url" != "$SOCIAL_URL" ]]; then
    echo "❌ doc-drift: og:image is '${og_url:-missing}', expected ${SOCIAL_URL}"
    fail=1
  elif ! grep -Fq 'property="og:image:type" content="image/png"' app/index.html ||
       ! grep -Fq 'property="og:image:width" content="1280"' app/index.html ||
       ! grep -Fq 'property="og:image:height" content="640"' app/index.html ||
       ! grep -Fq 'name="twitter:card" content="summary_large_image"' app/index.html ||
       ! grep -Fq "name=\"twitter:image\" content=\"$SOCIAL_URL\"" app/index.html; then
    echo "❌ doc-drift: OG/Twitter metadata must declare the canonical 1280x640 PNG"
    fail=1
  elif ! cmp -s "$SOCIAL_PUBLIC" "$SOCIAL_DOCS"; then
    echo "❌ doc-drift: public and reviewed Roar social-preview PNGs differ"
    fail=1
  else
    if ! node - "$SOCIAL_PUBLIC" "$SOCIAL_SVG" <<'JS'
const fs = require("node:fs");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const reviewedPngSha256 = "286045577aed03b16155ff41f4f0af7e4676bce67b488da4cb18e83cd8867c61";
const reviewedSvgSha256 = "c00f318c064b6534f18724e54d8f9fe8ccc254d0c0ee26fc0aaf9e8aa5f829a5";
const signalPrimitives = [
  '<circle cx="8" cy="31" r="5.5" fill="#FFD65A"/>',
  '<path d="M8 20 A11 11 0 0 1 19 31" fill="none" stroke="#65D8FF" stroke-width="3.6" stroke-linecap="round"/>',
  '<path d="M8 13 A18 18 0 0 1 26 31" fill="none" stroke="#65D8FF" stroke-width="4.2" stroke-linecap="round"/>',
  '<path d="M8 6 A25 25 0 0 1 33 31" fill="none" stroke="#65D8FF" stroke-width="4.8" stroke-linecap="round"/>',
];

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function validateSignalGeometry(source) {
  for (const primitive of signalPrimitives) {
    if (!source.includes(primitive)) throw new Error(`social-preview SVG is missing signal primitive: ${primitive}`);
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validatePng(data) {
  if (!data.subarray(0, 8).equals(signature)) throw new Error("bad PNG signature");
  let offset = 8;
  let ihdr = null;
  const idat = [];
  let sawIend = false;
  let chunkIndex = 0;
  while (offset < data.length) {
    if (offset + 12 > data.length) throw new Error("truncated PNG chunk header");
    const length = data.readUInt32BE(offset);
    const kind = data.subarray(offset + 4, offset + 8);
    const payloadEnd = offset + 8 + length;
    const chunkEnd = payloadEnd + 4;
    if (chunkEnd > data.length) throw new Error("truncated PNG chunk payload");
    const payload = data.subarray(offset + 8, payloadEnd);
    if (crc32(Buffer.concat([kind, payload])) !== data.readUInt32BE(payloadEnd)) throw new Error("PNG chunk CRC mismatch");
    const name = kind.toString("ascii");
    if (chunkIndex === 0 && name !== "IHDR") throw new Error("IHDR is not the first chunk");
    if (name === "IHDR") {
      if (ihdr || length !== 13) throw new Error("invalid IHDR");
      ihdr = payload;
    } else if (name === "IDAT") {
      idat.push(payload);
    } else if (name === "IEND") {
      if (length !== 0 || chunkEnd !== data.length) throw new Error("invalid IEND or trailing bytes");
      sawIend = true;
      offset = chunkEnd;
      break;
    }
    offset = chunkEnd;
    chunkIndex += 1;
  }
  if (!ihdr || idat.length === 0 || !sawIend || offset !== data.length) throw new Error("PNG is missing IHDR, IDAT, or IEND");
  const fields = [ihdr.readUInt32BE(0), ihdr.readUInt32BE(4), ...ihdr.subarray(8, 13)];
  const expected = [1280, 640, 8, 2, 0, 0, 0];
  if (!fields.every((value, index) => value === expected[index])) throw new Error("PNG must be non-interlaced 1280x640 8-bit RGB");
  const decoded = zlib.inflateSync(Buffer.concat(idat));
  const stride = 1 + 1280 * 3;
  if (decoded.length !== 640 * stride) throw new Error("PNG scanline length mismatch");
  for (let row = 0; row < 640; row += 1) if (decoded[row * stride] > 4) throw new Error("invalid PNG scanline filter");
}

const blob = fs.readFileSync(process.argv[2]);
const svgBlob = fs.readFileSync(process.argv[3]);
const svgSource = svgBlob.toString("utf8");
validatePng(blob);
validateSignalGeometry(svgSource);
if (sha256(blob) !== reviewedPngSha256 || sha256(svgBlob) !== reviewedSvgSha256) {
  throw new Error("social-preview PNG/SVG no longer match the reviewed source/raster pair");
}
for (const corrupt of [blob.subarray(0, 24), Buffer.concat([blob.subarray(0, -1), Buffer.from([blob.at(-1) ^ 1])])]) {
  try {
    validatePng(corrupt);
    throw new Error("PNG validator self-test accepted corrupt input");
  } catch (error) {
    if (error.message === "PNG validator self-test accepted corrupt input") throw error;
  }
}
const withoutDot = svgSource.replace(signalPrimitives[0], "");
try {
  validateSignalGeometry(withoutDot);
  throw new Error("signal-geometry self-test accepted an SVG without the canonical dot");
} catch (error) {
  if (error.message === "signal-geometry self-test accepted an SVG without the canonical dot") throw error;
}
console.log("reviewed 1280x640 RGB PNG/SVG pair decoded and retained all signal primitives");
JS
    then
      echo "❌ doc-drift: public social preview is not a fully decodable 1280x640 RGB PNG"
      fail=1
    else
      echo "✅ social preview: canonical metadata, docs/public parity, and reviewed SVG/PNG signal pair match."
    fi
  fi
fi
if ! grep -Fq '.brand img { width: 38px; height: auto; }' app/src/app.css; then
  echo "❌ doc-drift: mobile Roar glyph must preserve its native 44:40 aspect ratio"
  fail=1
fi

if [[ $fail -eq 0 ]]; then
  echo "✅ doc-drift gate passed (docs, deployment contract, social card, and mobile mark stay aligned)."
fi
exit $fail
