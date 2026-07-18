#!/usr/bin/env bash
# End-to-end selftest for the immutable Git-index clean-room scanner. Every
# synthetic is committed only inside an owned temporary repository, so tests
# exercise real staged blobs without exposing a working-tree path race.
set -uo pipefail
cd "$(dirname "$0")/.."
GATE="scripts/check_cleanroom.sh"
SYSTEM_PATH="/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin"
GIT_BIN=$(PATH="$SYSTEM_PATH" command -v git)
if [[ -z "$GIT_BIN" || ! -x "$GIT_BIN" ]]; then
  echo "❌ selftest: system Git is unavailable" >&2
  exit 2
fi
TMP=""
TMP_OWNED=0
cleanup() {
  [[ "$TMP_OWNED" -ne 1 ]] || rm -rf -- "$TMP"
}
if ! TMP=$(mktemp -d) || [[ -z "$TMP" || ! -d "$TMP" ]]; then
  echo "❌ selftest: could not create an isolated temporary directory" >&2
  exit 2
fi
TMP_OWNED=1
trap cleanup EXIT
fail=0
fixture_id=0
FIXTURE_REPO=""
CLEAN_FIXTURE_REPO=""

prepare_fixture_repo() {
  fixture_id=$((fixture_id + 1))
  FIXTURE_REPO="$TMP/fixture-$fixture_id"
  if ! mkdir -p "$FIXTURE_REPO/scripts" ||
     ! cp "$GATE" "$FIXTURE_REPO/scripts/check_cleanroom.sh" ||
     ! printf '.env\ntarget/\n.DS_Store\n' > "$FIXTURE_REPO/.gitignore" ||
     ! "$GIT_BIN" -C "$FIXTURE_REPO" init -q ||
     ! "$GIT_BIN" -C "$FIXTURE_REPO" config user.name 'Cleanroom Selftest' ||
     ! "$GIT_BIN" -C "$FIXTURE_REPO" config user.email 'cleanroom-selftest.invalid@example.invalid'; then
    return 2
  fi
}

commit_regular_fixture() {
  local logical_path="$1"
  local content="$2"
  if ! prepare_fixture_repo ||
     ! mkdir -p "$(dirname "$FIXTURE_REPO/$logical_path")" ||
     ! printf '%s\n' "$content" > "$FIXTURE_REPO/$logical_path" ||
     ! "$GIT_BIN" -C "$FIXTURE_REPO" add -- .gitignore scripts/check_cleanroom.sh "$logical_path" ||
     ! "$GIT_BIN" -C "$FIXTURE_REPO" -c commit.gpgsign=false commit -q -m fixture; then
    return 2
  fi
}

run_fixture_gate() {
  (cd "$FIXTURE_REPO" && PATH="$SYSTEM_PATH" bash scripts/check_cleanroom.sh >/dev/null 2>&1)
}

expect_rejected_fixture() {
  local label="$1"
  local logical_path="$2"
  local content="$3"
  local status
  if ! commit_regular_fixture "$logical_path" "$content"; then
    echo "❌ selftest: could not prepare fixture $label"; fail=1
    return
  fi
  run_fixture_gate
  status=$?
  if [[ "$status" -eq 1 ]]; then
    echo "✓ indexed scanner rejects $label"
  elif [[ "$status" -eq 0 ]]; then
    echo "❌ selftest: indexed scanner accepted $label"; fail=1
  else
    echo "❌ selftest: fixture $label hit scanner infrastructure status $status"; fail=1
  fi
}

expect_rejected_binary_fixture() {
  local label="$1"
  local logical_path="$2"
  local content="$3"
  local prefix_blocks="${4:-0}"
  local status i
  if ! prepare_fixture_repo ||
     ! { printf 'benign'; for ((i = 0; i < prefix_blocks; i++)); do printf 'aaaaaaaa'; done; printf '\0%s\n' "$content"; } > "$FIXTURE_REPO/$logical_path" ||
     ! "$GIT_BIN" -C "$FIXTURE_REPO" add -- .gitignore scripts/check_cleanroom.sh "$logical_path" ||
     ! "$GIT_BIN" -C "$FIXTURE_REPO" -c commit.gpgsign=false commit -q -m fixture; then
    echo "❌ selftest: could not prepare binary fixture $label"; fail=1
    return
  fi
  run_fixture_gate
  status=$?
  if [[ "$status" -eq 1 ]]; then
    echo "✓ indexed scanner rejects $label"
  elif [[ "$status" -eq 0 ]]; then
    echo "❌ selftest: indexed scanner accepted $label"; fail=1
  else
    echo "❌ selftest: binary fixture $label hit scanner infrastructure status $status"; fail=1
  fi
}

keypair_content="[$(seq -s, 1 64)]"
jwt_content="{\"jwt\":\"$(printf '%s%s' 'eyJabcdefghij12.' 'eyJklmnopqrst34.sig0sig0sig0')\"}"
base58_content="{\"secretKey\":\"$(printf '5%.0s' {1..88})\"}"
retired_content="Retired product: $(printf '%s%s' 'Prop' 'Cast')"
bearer_content="$(printf '%s%s' 'Bearer ey' 'Jfabricated.fabricated.signature')"

expect_rejected_fixture "keypair payload" "keypair.json" "$keypair_content"
expect_rejected_fixture "JWT payload" "jwt.json" "$jwt_content"
expect_rejected_fixture "base58 secret payload" "base58.json" "$base58_content"
expect_rejected_fixture "retired brand payload" "retired-brand.txt" "$retired_content"
expect_rejected_fixture "secret in a spaced filename" "secret payload.txt" "$bearer_content"
expect_rejected_fixture "secret in a newline filename" $'secret\npayload.txt' "$bearer_content"
expect_rejected_binary_fixture "retired brand after NUL" "binary-brand.bin" "$retired_content"
expect_rejected_binary_fixture "secret after NUL" "binary-secret.bin" "$bearer_content"
expect_rejected_binary_fixture "secret after a late NUL" "late-binary-secret.bin" "$bearer_content" 16384
expect_rejected_binary_fixture "binary excluded lockfile" "payload.lock" "$bearer_content"

# The indexed ignore contract governs even when the working tree has already
# been repaired. This catches a staged-bad/worktree-good TOCTOU bypass.
poison_template="$TMP/poison-template"
if ! mkdir -p "$poison_template/info" ||
   ! printf '.env\ntarget/\n.DS_Store\n' > "$poison_template/info/exclude" ||
   ! prepare_fixture_repo ||
   ! printf '# folded .envtarget/\n.DS_Store\n' > "$FIXTURE_REPO/.gitignore" ||
   ! "$GIT_BIN" -C "$FIXTURE_REPO" add -- .gitignore scripts/check_cleanroom.sh ||
   ! "$GIT_BIN" -C "$FIXTURE_REPO" -c commit.gpgsign=false commit -q -m fixture ||
   ! printf '.env\ntarget/\n.DS_Store\n' > "$FIXTURE_REPO/.gitignore"; then
  echo "❌ selftest: could not prepare staged-ignore mismatch fixture"; fail=1
else
  (cd "$FIXTURE_REPO" && GIT_TEMPLATE_DIR="$poison_template" PATH="$SYSTEM_PATH" bash scripts/check_cleanroom.sh >/dev/null 2>&1)
  ignore_mismatch_status=$?
  if [[ "$ignore_mismatch_status" -eq 1 ]]; then
    echo "✓ staged broken .gitignore is rejected despite a safe working copy"
  elif [[ "$ignore_mismatch_status" -eq 0 ]]; then
    echo "❌ selftest: safe working copy masked the staged broken .gitignore"; fail=1
  else
    echo "❌ selftest: staged-ignore mismatch hit scanner infrastructure status $ignore_mismatch_status"; fail=1
  fi
fi

# Git mode 120000 must be rejected before its stored target path or filesystem
# target can be followed. The target is benign; only the link payload carries
# the retired marker, reproducing the former false-negative.
if ! prepare_fixture_repo; then
  echo "❌ selftest: could not prepare symlink fixture"; fail=1
else
  retired_target="$TMP/$(printf '%s%s' 'Prop' 'Cast')-target.txt"
  if ! printf 'benign payload\n' > "$retired_target" ||
     ! ln -s "$retired_target" "$FIXTURE_REPO/benign-link" ||
     ! "$GIT_BIN" -C "$FIXTURE_REPO" add -- .gitignore scripts/check_cleanroom.sh benign-link ||
     ! "$GIT_BIN" -C "$FIXTURE_REPO" -c commit.gpgsign=false commit -q -m fixture; then
    echo "❌ selftest: could not commit synthetic symlink fixture"; fail=1
  else
    run_fixture_gate
    symlink_status=$?
    if [[ "$symlink_status" -eq 1 ]]; then
      echo "✓ staged symlink mode fails closed without target traversal"
    elif [[ "$symlink_status" -eq 0 ]]; then
      echo "❌ selftest: staged symlink bypassed the immutable scanner"; fail=1
    else
      echo "❌ selftest: symlink fixture hit scanner infrastructure status $symlink_status"; fail=1
    fi
  fi
fi
if ! prepare_fixture_repo; then
  echo "❌ selftest: could not prepare excluded-path symlink fixture"; fail=1
else
  excluded_target="$TMP/excluded-$(printf '%s%s' 'Prop' 'Cast')-target.txt"
  if ! printf 'benign payload\n' > "$excluded_target" ||
     ! ln -s "$excluded_target" "$FIXTURE_REPO/package-lock.json" ||
     ! "$GIT_BIN" -C "$FIXTURE_REPO" add -- .gitignore scripts/check_cleanroom.sh package-lock.json ||
     ! "$GIT_BIN" -C "$FIXTURE_REPO" -c commit.gpgsign=false commit -q -m fixture; then
    echo "❌ selftest: could not commit excluded-path symlink fixture"; fail=1
  else
    run_fixture_gate
    excluded_symlink_status=$?
    if [[ "$excluded_symlink_status" -eq 1 ]]; then
      echo "✓ excluded lockfile path still rejects staged symlink mode"
    elif [[ "$excluded_symlink_status" -eq 0 ]]; then
      echo "❌ selftest: excluded lockfile symlink bypassed mode validation"; fail=1
    else
      echo "❌ selftest: excluded-path symlink hit scanner infrastructure status $excluded_symlink_status"; fail=1
    fi
  fi
fi

# Exact compatibility tuple remains allowed; changing either the line or path
# is rejected. The newline-path case also runs through the real index scanner.
marker=$(printf '%s%s' 'PROP' 'CAST')
allowed_path="packages/core/src/index.ts"
allowed_line="export const ${marker} = \"propcast\" as const;"
if ! bash "$GATE" --classify-brand-hit "$allowed_path" "$allowed_line"; then
  echo "❌ selftest: exact compatibility tuple was not allowlisted"; fail=1
else
  echo "✓ exact compatibility tuple is allowlisted"
fi
if bash "$GATE" --classify-brand-hit "$allowed_path" "${allowed_line} // ${marker}"; then
  echo "❌ selftest: appended retired marker bypassed the exact allowlist"; fail=1
else
  echo "✓ appended retired marker cannot bypass the exact allowlist"
fi
newline_brand_path=$'\n'"$allowed_path"
if bash "$GATE" --classify-brand-hit "$newline_brand_path" "$allowed_line"; then
  echo "❌ selftest: leading-newline path bypassed the exact allowlist"; fail=1
else
  echo "✓ leading-newline path cannot bypass the exact allowlist"
fi
if ! commit_regular_fixture "$allowed_path" "$allowed_line"; then
  echo "❌ selftest: could not prepare exact compatibility fixture"; fail=1
else
  CLEAN_FIXTURE_REPO="$FIXTURE_REPO"
  run_fixture_gate
  allowed_status=$?
  if [[ "$allowed_status" -eq 0 ]]; then
    echo "✓ exact compatibility tuple passes the indexed scanner"
  else
    echo "❌ selftest: exact compatibility fixture failed with status $allowed_status"; fail=1
  fi
fi
expect_rejected_fixture "leading-newline compatibility path" "$newline_brand_path" "$allowed_line"

# Required tools and immutable-blob materialization must fail closed.
mkdir -p "$TMP/failing-grep" "$TMP/failing-mktemp" "$TMP/failing-git" "$TMP/failing-tr" "$TMP/failing-cmp"
printf '#!/bin/sh\nexit 2\n' > "$TMP/failing-grep/grep"
printf '#!/bin/sh\nexit 2\n' > "$TMP/failing-mktemp/mktemp"
printf '#!/bin/sh\nexit 2\n' > "$TMP/failing-tr/tr"
printf '#!/bin/sh\nexit 2\n' > "$TMP/failing-cmp/cmp"
printf '%s\n' '#!/bin/sh' \
  'for arg in "$@"; do [ "$arg" != "$FAIL_GIT_SUBCOMMAND" ] || exit 2; done' \
  'exec "$CLEANROOM_REAL_GIT" "$@"' > "$TMP/failing-git/git"
chmod +x "$TMP/failing-grep/grep" "$TMP/failing-mktemp/mktemp" "$TMP/failing-tr/tr" "$TMP/failing-cmp/cmp" "$TMP/failing-git/git"
if [[ -z "$CLEAN_FIXTURE_REPO" || ! -d "$CLEAN_FIXTURE_REPO" ]]; then
  echo "❌ selftest: clean fault-injection fixture is unavailable"; fail=1
else
  (cd "$CLEAN_FIXTURE_REPO" && PATH="$TMP/failing-grep:$SYSTEM_PATH" bash scripts/check_cleanroom.sh >/dev/null 2>&1)
  grep_fault_status=$?
  if [[ "$grep_fault_status" -eq 1 ]]; then
    echo "✓ grep failure fails closed"
  else
    echo "❌ selftest: grep failure returned status $grep_fault_status, expected 1"; fail=1
  fi
  (cd "$CLEAN_FIXTURE_REPO" && PATH="$TMP/failing-mktemp:$SYSTEM_PATH" bash scripts/check_cleanroom.sh >/dev/null 2>&1)
  mktemp_fault_status=$?
  if [[ "$mktemp_fault_status" -eq 2 ]]; then
    echo "✓ snapshot creation failure fails closed"
  else
    echo "❌ selftest: snapshot creation failure returned status $mktemp_fault_status, expected 2"; fail=1
  fi
  for failed_classifier in tr cmp; do
    (cd "$CLEAN_FIXTURE_REPO" && PATH="$TMP/failing-$failed_classifier:$SYSTEM_PATH" bash scripts/check_cleanroom.sh >/dev/null 2>&1)
    classifier_fault_status=$?
    if [[ "$classifier_fault_status" -eq 1 ]]; then
      echo "✓ $failed_classifier failure fails closed"
    else
      echo "❌ selftest: $failed_classifier failure returned status $classifier_fault_status, expected 1"; fail=1
    fi
  done
  real_git="$GIT_BIN"
  for failed_subcommand in ls-files cat-file init check-ignore log; do
    (cd "$CLEAN_FIXTURE_REPO" && CLEANROOM_REAL_GIT="$real_git" FAIL_GIT_SUBCOMMAND="$failed_subcommand" \
        PATH="$TMP/failing-git:$SYSTEM_PATH" bash scripts/check_cleanroom.sh >/dev/null 2>&1)
    git_fault_status=$?
    if [[ "$git_fault_status" -eq 1 ]]; then
      echo "✓ git $failed_subcommand failure fails closed"
    else
      echo "❌ selftest: git $failed_subcommand failure returned status $git_fault_status, expected 1"; fail=1
    fi
  done
fi

if PATH="$SYSTEM_PATH" bash "$GATE" >/dev/null 2>&1; then
  echo "✓ gate green on the real staged tree (0 false-positives)"
else
  echo "❌ selftest: gate is red on the real staged tree"; fail=1
fi

[[ "$fail" -eq 0 ]] && echo "✅ cleanroom selftest passed" || echo "❌ cleanroom selftest FAILED"
exit "$fail"
