# TxLINE usage — the load-bearing rail

Roar Markets' receipt-binding thesis depends on TxLINE: it publishes a signed, Merkle-anchored goal total that
an on-chain program can verify. Remove TxLINE and the public consumer loses its independently re-verifiable
score receipt and falls back to a trusted feed. TxLINE proof validation does not by itself prove that the
private mint hook waited for final match state. This table maps each touchpoint to where it is consumed.

| TxLINE datum | How it is used | Where (file / artifact) |
|---|---|---|
| **Goal-total stat proof** — `/api/scores/stat-validation?fixtureId=&seq=&statKey=1&statKey2=2` (composite P1+P2 goal totals) | Built into a `validate_stat` Merkle proof; the on-chain `kickoff_oracle::settle_ou_bound` mints an `OuBoundReceipt` ONLY if `txoracle::validate_stat` verifies it (CPI-gated). This is the trust root. | proof build runs in the operator's private spike (the TxLINE proof builder + `txoracle` IDL are not in this public clean-room repo); the receipt mint that consumes the proof = `scripts/mint_real_receipt.ts` |
| **Anchored day root** — TxLINE's finalized `daily_scores_roots` for the match day | The proof must match the anchored root or Merkle verification fails (`0x66`). This does not itself prove the mint hook waited for final match state; finality depends on hook policy and any supplied `minFinalTs`. | on-chain `daily_scores_roots` PDA `CdUmkUdc4XBKeeq7Kq6JxQvnVMNuDA21mp98x4Rs3jHQ`; verified by `txoracle` `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| **The minted `OuBoundReceipt`** (TxLINE-anchored) | Roar Markets verifies the complete immutable binding: owner, discriminator, PDA, embedded market, fixture, line, and canonical outcome byte. | `packages/core/src/onchain/settle_consumer.ts` (`verifyOuReceiptForMarket`), `packages/core/src/onchain/receipt.ts`, re-verified in-browser by the fan in `app/src/App.tsx` |
| **In-play scoring frames** (live goal trigger, `X-Api-Token`) | The private bridge uses a goal event to spawn a micro-market and advance the score. A `Participant` schema sample was captured, but which-side remains a labeled proxy with no on-chain goal-order proof. | `packages/core/src/factory/primitives.ts` (the goal → "another goal" primitive), `packages/core/src/factory/factory.ts` (spawn + seed) |
| **Another-goal odds line** | De-vigged to the seed fair probability — the cold-start price of the spawned micro-market. | `packages/core/src/signal/devig.ts` (de-vig), `packages/core/src/signal/bootstrap.ts` (the depth ladder) |
| **Goal-per-team stats** (P1>0 ∧ P2>0) — the SECONDARY "both teams to score" primitive | A two-proof composite settles `settle_btts_bound`; the BTTS consumer verifies owner, type, PDA, embedded market, fixture, and canonical yes byte. Still goal-key only. | `packages/core/src/factory/primitives.ts` (`bttsPrimitive`), `packages/core/src/onchain/settle_consumer.ts` (`verifyBttsReceiptForMarket`) |

## What is on-chain vs in the private spike

- **In this public repo:** the settle-consumer gate, the `market_id` contract, the factory, the fan UI, and
  the mint/verify scripts that operate against the deployed devnet programs.
- **In the operator's private spike (NOT committed, clean-room §8):** the TxLINE proof builder (`build_total`)
  and the `txoracle` Anchor IDL. The public repo consumes the *result* (a TxLINE-anchored on-chain receipt),
  never proprietary build internals.

## Proven live (Solana devnet, fixture 17588395, day 2026-06-25 finalized)

- TxLINE composite goal-total proof verified via `txoracle::validate_stat` — tx `5k69yoyn…`.
- Real `OuBoundReceipt` minted via `kickoff_oracle` (`34FXjUuikioZy4fcUKSoP9NVW7WWKQnpJUZQcRDTNLtw`)
  `settle_ou_bound` (CPI-gated) — tx `4CzqNgSp…`, receipt `39vT6hs7…`, `market_id 532843…`.
- Roar Markets' gate re-verified it on-chain: `over=false → NO` (Under 2.5).

Full hashes + reproduce steps: `../artifacts/evidence/real_onchain_settle.md`. (Devnet prunes tx history
~30 days — the durable on-chain evidence is the receipt ACCOUNT `39vT6hs7…`, re-verified live by
`scripts/verify_real_settle.ts`; the tx sigs are the historical record.)
