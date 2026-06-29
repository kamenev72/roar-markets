# TxLINE usage — the load-bearing rail

PROPCAST cannot exist without TxLINE: a goal-grain micro-market is only **trustlessly settleable** because
TxODDS/TxLINE publishes a signed, Merkle-anchored goal total that an on-chain program can verify. Remove
TxLINE and there is no objective, on-chain-provable event to settle against — the whole product collapses to a
trusted feed. This table maps each TxLINE touchpoint to where it is consumed.

| TxLINE datum | How it is used | Where (file / artifact) |
|---|---|---|
| **Goal-total stat proof** — `/api/scores/stat-validation?fixtureId=&seq=&statKey=1&statKey2=2` (composite P1+P2 goal totals) | Built into a `validate_stat` Merkle proof; the on-chain `kickoff_oracle::settle_ou_bound` mints an `OuBoundReceipt` ONLY if `txoracle::validate_stat` verifies it (CPI-gated). This is the trust root. | proof build runs in the operator's private spike (the TxLINE proof builder + `txoracle` IDL are not in this public clean-room repo); the receipt mint that consumes the proof = `scripts/mint_real_receipt.ts` |
| **Anchored day root** — TxLINE's finalized `daily_scores_roots` for the match day | The proof must match the finalized day-root, else the on-chain Merkle verify fails (`0x66`). Guarantees the settle binds the FINAL total (a VAR-reversed goal cannot settle early). | on-chain `daily_scores_roots` PDA `CdUmkUdc4XBKeeq7Kq6JxQvnVMNuDA21mp98x4Rs3jHQ`; verified by `txoracle` `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| **The minted `OuBoundReceipt`** (TxLINE-anchored) | PROPCAST's settle-consumer re-derives + re-verifies it via a 3-step fail-closed gate (owner / discriminator / PDA), then reads the outcome — no blind deserialize, no authority. | `src/onchain/settle_consumer.ts` (`verifyOuReceipt`), `src/onchain/receipt.ts` (layout + PDA), re-verified in-browser by the fan in `ui/src/App.tsx` |
| **In-play scoring frames** (live goal trigger, `X-Api-Token`) | The goal event that spawns a micro-market + advances the score. v1 leads with goal-total (OU); the in-play which-side (`Participant`) schema pin awaits a live match (it auto-captures during the next live WC fixture). | `src/factory/primitives.ts` (the goal → "another goal" primitive), `src/factory/factory.ts` (spawn + seed) |
| **Another-goal odds line** | De-vigged to the seed fair probability — the cold-start price of the spawned micro-market. | `src/signal/devig.ts` (de-vig), `src/signal/bootstrap.ts` (the depth ladder) |
| **Goal-per-team stats** (P1>0 ∧ P2>0) — the SECONDARY "both teams to score" primitive | A two-proof composite settles `settle_btts_bound` (a `BttsBoundReceipt`, `yes`@48); PROPCAST's BTTS consumer re-verifies it via the same 3-step gate at the BTTS PDA `["btts_bound", market_id]`. Still goal-key only. | `src/factory/primitives.ts` (`bttsPrimitive`), `src/onchain/settle_consumer.ts` (`verifyBttsReceipt`) |

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
- PROPCAST's gate re-verified it on-chain: `over=false → NO` (Under 2.5).

Full hashes + reproduce steps: `../evidence/real_onchain_settle.md`.
