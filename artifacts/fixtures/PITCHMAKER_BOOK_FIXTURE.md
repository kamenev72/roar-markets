# Touchline MM (formerly PitchMaker) book binary fixture

Canonical source repository: `https://github.com/kamenev72/pitchmaker.git`

Source commit: `ed567ea53e87329819ac8b98fab2ad1ee3dbb031`

Repository-relative source path: `artifacts/fixtures/pitchmaker_book.so`

SHA-256: `8734bbc374700870bedbce1a0f230600298b68a022ffd503aaef0c299aced646`

License: Apache License 2.0. See the repository root [`LICENSE`](../LICENSE) and [`NOTICE`](../NOTICE) for the
license text and retained Touchline MM former-name attribution.

The committed Roar Markets fixture is directly verifiable without a sibling checkout:

```sh
expected=8734bbc374700870bedbce1a0f230600298b68a022ffd503aaef0c299aced646
test "$(shasum -a 256 artifacts/fixtures/pitchmaker_book.so | awk '{print $1}')" = "$expected"
```

Reproduce its source equivalence from a fresh detached checkout:

```sh
tmp="$(mktemp -d)"
git clone https://github.com/kamenev72/pitchmaker.git "$tmp/pitchmaker"
git -C "$tmp/pitchmaker" checkout --detach ed567ea53e87329819ac8b98fab2ad1ee3dbb031
test "$(git -C "$tmp/pitchmaker" rev-parse HEAD)" = ed567ea53e87329819ac8b98fab2ad1ee3dbb031
cmp "$tmp/pitchmaker/artifacts/fixtures/pitchmaker_book.so" artifacts/fixtures/pitchmaker_book.so
shasum -a 256 "$tmp/pitchmaker/artifacts/fixtures/pitchmaker_book.so" artifacts/fixtures/pitchmaker_book.so
rm -rf "$tmp"
```

Public access to the canonical source remote is an external publication gate; the committed fixture and its
recorded digest remain locally verifiable regardless of remote availability.
