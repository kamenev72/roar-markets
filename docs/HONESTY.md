# HONESTY

The honesty invariant is the spine of PROPCAST. Every surface — UI, docs, demo — holds these lines.

1. **No money number.** No `$`-PnL, no MM-profit, no ROI, no "you could have made X". A fan venue is graded on
   experience + trust + coverage, never profit. The metrics module enforces this in code: a test asserts no
   metric field names a money quantity (`packages/core/test/metrics.test.ts`).
2. **Goal grain only (v1).** Only goal stat keys (`statKey 1/2`) are TxLINE-validated on-chain. PROPCAST does
   not imply coverage of corners/cards/possession or arbitrary markets.
3. **Event granularity, never per-second.** The intended private hook may act on goal/whistle frames; this
   public consumer does not prove that policy or finality. The free WC TxLINE tier is ~60s-delayed.
4. **The close-path is labeled.** Any future venue close (claim/payout) is authority-controlled and modeled
   as **"trusted-now, proof-gated-target"**. The public v1 has no fund-holding close path; receipt verification
   is never presented as proof of payout or finality.
5. **Resident MM disclosed.** The spawned book is seeded by a resident maker (the venue census says no organic
   two-sided football flow exists on Solana). Disclosed, not hidden as organic depth.
6. **Mock shape is not evidence.** The offline `mock_oracle` shares a discriminator with `validate_stat`, but
   the consumer also requires the deployed owner, PDA, embedded market, fixture, line, and canonical outcome.
   CPI validation binds supplied proof data; it still does not establish the private hook's finality policy.
7. **Real vs simulated is labeled everywhere.** The UI's headline card is a REAL on-chain re-verify; the
   interactive walkthrough is labeled SIMULATED. The line is drawn precisely in `MOCKS.md`.
8. **Novelty is scoped.** Goal grain + immutable Merkle-receipt binding — NOT proof of finality, "first
   on-chain", or "first in-play market".
9. **Deferrals are labeled, not hidden.** There is no public fund-holding venue, permissionless refund, or
   on-chain VOID path in v1; payout/refund design is deferred.
10. **Trust is bounded, not overstated.** The in-browser re-verify proves the queried RPC(s) report the right
    owner / discriminator / PDA / line_q / outcome — it is NOT a cryptographic light-client proof. The UI reads
    the receipt from the primary RPC AND cross-reads it from a 2nd independent keyless RPC, and labels the
    strength HONESTLY: **cross-confirmed on 2 RPCs** (green) only when both agree; **single-RPC** (amber caveat)
    when the 2nd is unreachable; **PARTIAL — divergence** (amber) when the 2nd RPC has no account or a different
    account at the PDA; and it never shows a green VERIFIED tick while the read is loading or errored. It always
    points to the explorer for a fully independent cross-check, never "no authority". No public v1 venue
    payout/refund is demonstrated. Full threat model: `SECURITY.md`.
11. **Finality is not implied.** The private mint hook chooses when to mint; the public consumer verifies a
    supplied binding, not that the match was final. Its encoder uses `minFinalTs=0` unless the hook supplies it.
12. **Private record is not standing.** The v1 history, streak, accuracy, and downloadable SVG card are bounded
    device-local display state. They do not establish PnL, rank, reward, public leaderboard placement, or a
    "Prediction IQ". Any future shared score needs identity, anti-sybil controls, server-authoritative pick locks,
    settlement and probability scoring, retention, and proof rules first.
