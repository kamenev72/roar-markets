# SECURITY

Roar Markets' security posture, threat model, and trust assumptions — stated, not hidden.
Severity throughout is calibrated to what Roar Markets actually is: a **read-only Solana
devnet consumer** for a hackathon, holding **no mainnet value and no fan funds** in v1.

## 1. Overview & scope

Roar Markets auto-spawns goal-grain micro-markets, seeds a de-vigged line, and **settles**
by re-verifying an on-chain bound-receipt minted by a deployed kickoff-oracle program
(`kickoff_oracle` `34FXjUuikioZy4fcUKSoP9NVW7WWKQnpJUZQcRDTNLtw`) through a complete
binding gate. The fan UI is read-only (a devnet `getAccountInfo` + an in-browser
re-verify; no wallet, no key). The v1 venue is in-process (no escrow). There is **no
real-money PnL** anywhere; market quality/coverage is the only metric.

In scope: receipt forgery/confusion, RPC trust, settlement correctness & finality,
idempotency, credential hygiene, supply-chain. Out of scope: the internals of the
deployed kickoff-oracle / venue programs (Roar Markets is their consumer), and any
real-money custody (v1 holds none).

## 2. Threat model

Actors: (a) a fan loading the read-only UI; (b) a network-position adversary on the
path to the RPC; (c) a hostile/compromised RPC operator; (d) the off-chain
proof-builder + autonomous mint daemon (the operator's own credentialed tooling);
(e) the venue/oracle authority key-holder. The receipt binding is re-derivable; the
choice of when to mint it and venue payout are separate trust boundaries.

## 3. Trust assumptions (stated)

1. **The independently re-verifiable datum is the on-chain bound receipt** — anyone can
   re-check its immutable binding via owner, Anchor discriminator, PDA, embedded
   `market_id`, fixture, line (OU), and canonical 0/1 outcome byte. This is not proof
   of the off-chain finality decision or of payout.
2. **Receipt finality is not independently proven by this public consumer.**
   `LiveResolver` trusts an injected/private mint hook; `settle_ou_bound` defaults
   `minFinalTs` to `0` unless its caller supplies it. CPI proof validation binds supplied
   data, not a public finality policy.
3. **The oracle ships a mock variant that shares a real discriminator and returns
   Ok().** The full consumer gate additionally checks owner, PDA, embedded market,
   fixture, line, and canonical outcome; mock-shape similarity alone cannot pass it.
4. **There is no public fund-holding v1 close path.** A future authority `resolve()` is
   modeled as "trusted-now, proof-gated-target"; proof-gated payout/refund remains work.
5. **The fan re-derives the SETTLEMENT COMPUTATION, not the market FRAMING.** What is
   independently re-checkable is the bound outcome carried by the receipt: `over` for the
   receipt's `line_q`. The market's FRAMING (the base score it was spawned
   at, e.g. "another goal after 1-0" ⇒ line 1.5) comes from the off-chain TxLINE SSE feed,
   a STATED trusted input: a lied base score would mis-frame the market (wrong `line_q`)
   but is NOT itself proof-bound. The honest claim is "re-check OUR settlement", never
   "re-check the score we framed the market at". The `line_q` binding (§3.1) is what makes
   the settlement re-check meaningful — a receipt minted at any other line fail-closes
   (`WrongLine`), so the outcome the fan re-derives is the one bound to THIS market's line.

## 4. Attack-surface map

- The in-browser re-verify (`getAccountInfo` over primary and secondary RPCs; both remain
  trust assumptions, with no light-client proof; see §6).
- The complete binding gate (owner / discriminator / PDA / embedded market / fixture /
  line where applicable / canonical outcome byte).
- The `market_id` derivation (full 32-byte SHA-256 receipt PDA vs the u64 venue bridge).
- The off-chain proof-builder + autonomous mint daemon (finality trigger, idempotency,
  credential files, success signalling).
- CI / clean-room / secret gate; dependency trees (root vs the browser-shipped UI).

## 5. Mitigations in place

- Owner-first fail-closed ordering before any byte read; discriminator, PDA, embedded
  market, fixture, and line binding; canonical 0/1 outcome bytes and length guards.
- The receipt PDA seeds the full 32-byte SHA-256 `market_id` (collision-resistant);
  only the venue bridge truncates to u64.
- One reused verifier (no weaker second path); React auto-escaping (no HTML-injection
  sink); `@solana/web3.js` pinned past the December-2024 backdoor with lockfile
  integrity; no Clock/slot trust in the read path; per-signature idempotent spawn dedup.
- `LiveResolver` recovers the factory's canonical immutable market record before mint
  and uses its opaque settlement lease so sweep cannot reap an in-flight settlement.
- A clean-room + secret CI gate that detects proprietary vocabulary, private-key
  blocks, Solana keypair byte-arrays, base58 secrets, and JWTs, with a selftest.

## 6. Residual risks (honest)

- **RPC trust on the in-browser read.** Cross-RPC agreement is stronger than one read,
  but it is **not** a cryptographic light-client proof; colluding or intercepted RPCs
  could report fabricated bytes. The explorer is an additional check, not an SPV proof.
- **Future venue-close authority risk:** the public v1 holds no fan funds. If an
  authority-controlled fund-holding venue is wired, loss, compromise, or withholding
  creates payout/refund risk until proof-gated close or an on-chain timeout exists.
- **Off-chain finality boundary**: the private proof-builder/mint hook chooses when to
  request a receipt. The public consumer cannot prove the supplied score is final;
  `minFinalTs=0` is the encoder default unless the hook supplies a stronger value.
- The clean-room secret gate is a denylist; the durable backstop is keeping all keys
  outside the work tree.
- **Production dependency residual:** the app's full and `--omit=dev` audits each report
  3 moderate advisories through `@solana/web3.js → jayson → uuid@8.3.2`. This code ships
  in the lazy verifier chunk. The advisory's affected uuid buffer-writing paths are not
  identified in the read-only RPC flow (jayson uses v4 request IDs), so current
  exploitability is unproven, not absent. npm proposes only an incompatible web3.js
  replacement; no forced downgrade was applied.
- **Daemon-restart market_id reuse (PC-02, named gap)**: the factory derives each
  market's nonce from an IN-MEMORY per-(fixture,kind) counter, so a daemon restart
  mid-match resets it and can re-derive an already-used market_id — whose old on-chain
  receipt then mis-resolves (same line) or `WrongLine`-poisons (different line) the new
  market. The fix is a nonce derived from the market's bound line (restart-stable), but
  that changes market_id derivation and so must land WITH a re-mint of the pinned real
  receipt (`REAL_MARKET_ID`); it is deferred to that re-mint window to keep the flagship
  credential-free re-verify intact. Mitigated today by a single long-lived daemon
  process (no mid-match restart in the demo path).

## 7. Scope & non-claims

- "next-goal which-side" has no on-chain goal-order proof in v1 — a labeled proxy only.
- No public fund-holding venue, payout, refund, or proof-gated close is demonstrated.
- No real-money PnL; goal-grain only. The intended private hook is event-granular over a
  ~60s feed, but this public consumer does not implement or prove that policy.
- The in-browser re-verify proves provenance as reported by RPCs, not absolute
  truth — cross-check on the explorer for independence.
- **VAR/finality gap:** golden tests show the consumer is stateless over supplied bytes;
  they do not prove a receipt cannot be minted before a later correction. There is no
  public correction, dispute, or finality-enforcement path in v1.

## 8. Reporting a vulnerability

This is a hackathon submission on Solana devnet with no bounty. To report an issue,
open a private advisory on the repository (or contact the maintainer via the
submission channel) with steps to reproduce. Please do not publish before a fix.
Scope is THIS consumer repository; the deployed kickoff-oracle / venue programs are
third-party and out of our control.

## 9. Security testing & CI gates

The test suite pins the complete binding gate (forged / foreign / wrong-type /
wrong-market / wrong-fixture / wrong-line / truncated), the per-kind offset traps, the
collision-free `market_id` grid, and idempotency. CI enforces typecheck + build +
tests, the clean-room/secret scan and its selftest, doc-drift (including the pinned
deployed program id), bundle-budget checks, and Playwright browser checks for the UI.

## 10. Change control for trust-bearing code

Any edit to the settle gate, the `market_id` derivation, the finality trigger, or the
trust labels requires a regression test plus a docs update. The deployed program id
(`34FXjUuikioZy4fcUKSoP9NVW7WWKQnpJUZQcRDTNLtw`) is pinned and doc-drift-checked. The
trust assumptions in §3 must be re-stated on any change, never silently dropped.
