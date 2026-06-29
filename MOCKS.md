# MOCKS — the real-vs-simulated line

PROPCAST draws this line precisely so nothing is over-read.

## REAL (on-chain, verifiable independently)

- **The settle mechanism.** A real `OuBoundReceipt` minted on Solana devnet through `kickoff_oracle`'s
  CPI-gated `settle_ou_bound`, gated by a live TxLINE Merkle proof. Hashes in `evidence/real_onchain_settle.md`.
- **The fan re-verify.** The UI's top **REAL · on-chain** card does a read-only devnet `getAccountInfo` for
  the live receipt `39vT6hs7…` and runs the SAME 3-step gate in the browser — no API key, no wallet. If devnet
  has pruned the account (~30-day prune), the card shows an honest "not found — re-mint to refresh", never a
  fabricated pass.
- **The deployed program it consumes.** `kickoff_oracle 34FXjUuikioZy4fcUKSoP9NVW7WWKQnpJUZQcRDTNLtw`.

## SIMULATED (for UX exploration, clearly labeled)

- **The interactive walkthrough** below the REAL card (kickoff → spawn → pick → settle) uses a SYNTHETIC
  receipt so a judge can click through the flow without a live match. It runs the **identical** gate
  (`verifyOuReceipt`) — same code path, synthetic input. Labeled "interactive walkthrough (SIMULATED)".
- **The de-vigged seed line + scoreline** in the walkthrough are demo values, not a live odds feed.

## Why the headline is real but the walkthrough is synthetic

The real receipt (`39vT6hs7…`) was minted for `market_id 532843…` (fixture 17588395), not for a market the UI
walkthrough spawns — minting a fresh receipt per UI click would need a live TxLINE proof per click. So the
demo shows **both**: the real receipt re-verified on-chain at the top (the trust proof), and a synthetic
click-through below (the experience). The mechanism is identical; only the input differs, and the difference
is labeled on every card.

## Pending (labeled, not hidden)

- The live in-play `Participant` (which-side) schema pin awaits a live WC match (auto-captured then). Until
  then which-side is a labeled proxy; the trustless OU/goal-total lead is unaffected.
- Order-account rent reclaim + USDC-SPL collateral are post-v1 deferrals (`HONESTY.md`).
