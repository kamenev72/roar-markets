# SECURITY

PROPCAST's security posture, threat model, and trust assumptions — stated, not hidden.
Severity throughout is calibrated to what PROPCAST actually is: a **read-only Solana
devnet consumer** for a hackathon, holding **no mainnet value and no fan funds** in v1.

## 1. Overview & scope

PROPCAST auto-spawns goal-grain micro-markets, seeds a de-vigged line, and **settles**
by re-verifying an on-chain bound-receipt minted by a deployed kickoff-oracle program
(`kickoff_oracle` `34FXjUuikioZy4fcUKSoP9NVW7WWKQnpJUZQcRDTNLtw`) through a 3-step
fail-closed gate. The fan UI is read-only (a devnet `getAccountInfo` + an in-browser
re-verify; no wallet, no key). The v1 venue is in-process (no escrow). There is **no
real-money PnL** anywhere; market quality/coverage is the only metric.

In scope: receipt forgery/confusion, RPC trust, settlement correctness & finality,
idempotency, credential hygiene, supply-chain. Out of scope: the internals of the
deployed kickoff-oracle / venue programs (PROPCAST is their consumer), and any
real-money custody (v1 holds none).

## 2. Threat model

Actors: (a) a fan loading the read-only UI; (b) a network-position adversary on the
path to the RPC; (c) a hostile/compromised RPC operator; (d) the off-chain
proof-builder + autonomous mint daemon (the operator's own credentialed tooling);
(e) the venue/oracle authority key-holder. The trust root is the on-chain receipt;
everything a fan sees is re-derivable from it.

## 3. Trust assumptions (stated)

1. **The trustless datum is the on-chain bound receipt** — anyone can re-verify it via
   the 3-step gate (owner / Anchor discriminator / `["ou_bound" | "btts_bound",
   market_id]` PDA), with the per-kind outcome offset and the `line_q` line-binding.
2. **The receipt MINT is gated to a fresh, finalized, signed Merkle-proven score ONLY
   when the oracle's `cpi_gated` flag is true.** The offline default is fail-open — a
   config-validation gate must assert `cpi_gated=true` for any trust-bearing settle.
3. **The oracle ships a mock variant that shares a real discriminator and returns
   Ok().** The consumer's owner+discriminator+PDA gate makes that collision irrelevant
   to settlement; the minting-trust footgun belongs to the oracle, not the consumer.
4. **The v1 venue close-path (A) is the venue authority's `resolve()`** — labeled
   on-screen and in docs as "trusted-now, proof-gated-target". The venue payout is
   **not** claimed trustless; a fully proof-gated venue close is future work (B).

## 4. Attack-surface map

- The in-browser re-verify (`getAccountInfo` over a single RPC — trust = RPC honesty;
  no light-client proof; see §6).
- The settle consumer gate (owner / discriminator / PDA / per-kind outcome offset /
  `line_q` binding / VOID-on-absent).
- The `market_id` derivation (full 32-byte SHA-256 receipt PDA vs the u64 venue bridge).
- The off-chain proof-builder + autonomous mint daemon (finality trigger, idempotency,
  credential files, success signalling).
- CI / clean-room / secret gate; dependency trees (root vs the browser-shipped UI).

## 5. Mitigations in place

- Owner-first fail-closed ordering before any byte read; Anchor discriminator + PDA
  binding; per-kind outcome offset (over@50 / btts-yes@48) with length-guards before
  every byte read (no out-of-bounds fail-open); `line_q` binding so a wrong-line
  receipt fail-closes; VOID-on-absent distinct from the fail-closed throw.
- The receipt PDA seeds the full 32-byte SHA-256 `market_id` (collision-resistant);
  only the venue bridge truncates to u64.
- One reused verifier (no weaker second path); React auto-escaping (no HTML-injection
  sink); `@solana/web3.js` pinned past the December-2024 backdoor with lockfile
  integrity; no Clock/slot trust in the read path; per-signature idempotent spawn dedup.
- A clean-room + secret CI gate that detects proprietary vocabulary, private-key
  blocks, Solana keypair byte-arrays, base58 secrets, and JWTs, with a selftest.

## 6. Residual risks (honest)

- **Single-RPC trust on the in-browser read.** The re-verify proves the queried RPC
  reports the right owner / discriminator / PDA / outcome; it is **not** a
  cryptographic light-client proof, so a hostile or man-in-the-middle RPC could report
  a fabricated account. Cross-check the receipt on a block explorer (and/or a second
  RPC) for stronger assurance. A validator-attested light client is out of v1 scope.
- **v1 venue payout is single-key trusted** (close-path A): a lost / compromised /
  withholding authority key has no permissionless or timeout-driven refund. v1 holds
  no fan funds, so this is latent; it becomes real only if a fund-holding venue is
  wired, which must gate on close-path (B) or an on-chain timeout refund.
- **Off-chain trust boundary**: the proof-builder + mint daemon run with live data
  credentials; a compromise of that tooling or the oracle mint key could mint a
  valid-but-mislabeled receipt. `cpi_gated=true` binds the outcome to a Merkle-proven
  score, so that config gate is the load-bearing control.
- The clean-room secret gate is a denylist; the durable backstop is keeping all keys
  outside the work tree.
- Dev-toolchain advisories reachable only by a developer running the dev server on a
  hostile network — never the shipped fan bundle.

## 7. Scope & non-claims

- "next-goal which-side" is not a trustless v1 primitive (no on-chain proof attests
  goal order) — a labeled proxy only.
- The venue payout is not trustless (trusted-now, proof-gated-target).
- No real-money PnL; goal-grain only; event-granularity (~60s) settle, not per-second.
- The in-browser re-verify proves provenance as reported by one RPC, not absolute
  truth — cross-check on the explorer for independence.

## 8. Reporting a vulnerability

This is a hackathon submission on Solana devnet with no bounty. To report an issue,
open a private advisory on the repository (or contact the maintainer via the
submission channel) with steps to reproduce. Please do not publish before a fix.
Scope is THIS consumer repository; the deployed kickoff-oracle / venue programs are
third-party and out of our control.

## 9. Security testing & CI gates

The test suite pins the fail-closed gate (forged / foreign / wrong-type /
wrong-market / wrong-line / truncated / absent), the per-kind offset traps, the
collision-free `market_id` grid, and idempotency. CI enforces typecheck + build +
tests, the clean-room/secret scan and its selftest, doc-drift (including the pinned
deployed program id), and the UI subproject build + audit.

## 10. Change control for trust-bearing code

Any edit to the settle gate, the `market_id` derivation, the finality trigger, or the
trust labels requires a regression test plus a docs update. The deployed program id
(`34FXjUuikioZy4fcUKSoP9NVW7WWKQnpJUZQcRDTNLtw`) is pinned and doc-drift-checked. The
trust assumptions in §3 must be re-stated on any change, never silently dropped.
