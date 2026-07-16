# MOCKS — the real-vs-simulated line

PROPCAST draws this line precisely so nothing is over-read.

## REAL (on-chain, verifiable independently)

- **The historical receipt evidence.** A real `OuBoundReceipt` was minted on Solana devnet through
  `kickoff_oracle`'s CPI-gated `settle_ou_bound` against a TxLINE Merkle proof. This proves that receipt and
  its immutable binding, not the policy that selected mint time. Hashes in `artifacts/evidence/real_onchain_settle.md`.
- **The fan re-verify.** The UI's top **REAL · on-chain** card does a read-only devnet `getAccountInfo` for
  the historical receipt `39vT6hs7…` and runs the SAME complete binding gate in the browser — no API key, no
  wallet. If the selected RPC returns no account, the card reports it unavailable and points to the explorer;
  it never guesses the cause or fabricates a pass.
- **The deployed receipt owner it checks.** `kickoff_oracle 34FXjUuikioZy4fcUKSoP9NVW7WWKQnpJUZQcRDTNLtw`.

## SIMULATED (for UX exploration, clearly labeled)

- **The interactive walkthrough** below the REAL card (kickoff → spawn → pick → settle) uses a SYNTHETIC
  receipt so a judge can click through the flow without a live match. It runs the **identical** gate
  (`verifyOuReceiptForMarket`) — same binding rules, synthetic input. Labeled "interactive walkthrough (SIMULATED)".
- **The de-vigged seed line + scoreline** in the walkthrough are demo values, not a live odds feed.

## Why the headline is real but the walkthrough is synthetic

The real receipt (`39vT6hs7…`) was minted for `market_id 532843…` (fixture 17588395), not for a market the UI
walkthrough spawns — minting a fresh receipt per UI click would need a live TxLINE proof per click. So the
demo shows **both**: the real receipt re-verified on-chain at the top (the trust proof), and a synthetic
click-through below (the experience). The binding verifier is identical; the source, finality decision, and
venue effects are not. The difference is labeled on every card.

## Pending (labeled, not hidden)

- A captured in-play `Participant` schema informs the bridge, but which-side remains a labeled proxy because
  no on-chain goal-order proof is demonstrated.
- No public venue payout/refund, finality hook, video, or public-access/submission artifact is evidenced here.
