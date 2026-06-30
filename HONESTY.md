# HONESTY

The honesty invariant is the spine of PROPCAST. Every surface — UI, docs, demo — holds these lines.

1. **No money number.** No `$`-PnL, no MM-profit, no ROI, no "you could have made X". A fan venue is graded on
   experience + trust + coverage, never profit. The metrics module enforces this in code: a test asserts no
   metric field names a money quantity (`test/metrics.test.ts`).
2. **Goal grain only (v1).** Only goal stat keys (`statKey 1/2`) are TxLINE-validated on-chain. PROPCAST does
   not imply coverage of corners/cards/possession or arbitrary markets.
3. **Event granularity, never per-second.** Settle fires at the goal/whistle. The free WC TxLINE tier is
   ~60s-delayed; PROPCAST never dresses that as real-time / live cash-out.
4. **The close-path is labeled.** The v1 venue close (claim/payout) is the venue authority's `resolve()`,
   shown on-screen as **"trusted-now, proof-gated-target"** beside the filed kickoff receipt. The TRUSTLESS
   datum is the receipt (real, on-chain, re-verifiable); a trusted-now resolve is never presented as trustless.
5. **Resident MM disclosed.** The spawned book is seeded by a resident maker (the venue census says no organic
   two-sided football flow exists on Solana). Disclosed, not hidden as organic depth.
6. **`cpi_gated=true` is a gate, not a convention.** A receipt is trusted only after the on-chain CPI verify;
   the offline `mock_oracle` (which shares `validate_stat`'s discriminator and returns Ok) can never wire into
   a "trustless" demo.
7. **Real vs simulated is labeled everywhere.** The UI's headline card is a REAL on-chain re-verify; the
   interactive walkthrough is labeled SIMULATED. The line is drawn precisely in `MOCKS.md`.
8. **Novelty is scoped.** Goal grain + objective Merkle settle — NOT "first on-chain / first in-play market".
9. **Deferrals are labeled, not hidden.** Order-account rent reclaim is a documented post-v1 deferral (the
   lamport stake returns to fans on `claim`); USDC-SPL collateral is deferred (v1 is lamports).
10. **Trust is bounded, not overstated.** The in-browser re-verify proves the queried RPC reports the right
    owner / discriminator / PDA / outcome — it is NOT a cryptographic light-client proof, so the UI says
    "verified against api.devnet.solana.com (one read-only RPC)" and points to the explorer for an independent
    cross-check, never "no authority". The v1 venue payout has no permissionless / timeout refund (close-path A,
    single-key) — a labeled residual, latent because v1 holds no fan funds. Full threat model: `SECURITY.md`.
