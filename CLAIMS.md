# CLAIMS

Every public assertion PROPCAST makes, tagged. Tags: **VERIFIED-LIVE** (proven on devnet, hash on file),
**REPRODUCIBLE** (deterministic locally — run the gate), **DESIGN** (architecture intent, not yet proven
live), **EXTERNAL** (a third-party fact), **NOT-CLAIMED** (an explicit non-claim, to pre-empt over-reading).

## What is proven

- **VERIFIED-LIVE** — a real `OuBoundReceipt` was minted on Solana devnet via `kickoff_oracle::settle_ou_bound`,
  gated by a live TxLINE Merkle goal-total proof (`txoracle::validate_stat`), and PROPCAST's own 3-step gate
  re-verified it on-chain (`over=false → NO`). Txs: proof `5k69yoyn…`, mint `4CzqNgSp…`, receipt `39vT6hs7…`,
  `market_id 532843…`, kickoff_oracle `34FXjUuikioZy4fcUKSoP9NVW7WWKQnpJUZQcRDTNLtw`. See
  `evidence/real_onchain_settle.md`.
- **VERIFIED-LIVE** — the fan re-verifies that real receipt **in the browser with no API key and no wallet**:
  the UI does a read-only devnet `getAccountInfo` and runs the identical 3-step gate (`ui/src/App.tsx` →
  `src/onchain/real_receipt.ts`). The PDA derivation is pinned to the live account by a test.
- **REPRODUCIBLE** — the full gate is deterministic locally: `npm test` (settle-gate, factory, golden
  edge-cases, metrics, the real-receipt PDA pin), `npm run typecheck`, `npm run cleanroom`, `npm run doc-drift`,
  and `npm --prefix ui run build`.
- **REPRODUCIBLE** — the settle binds the FINAL goal total: the golden battery proves a VAR-reversed goal does
  not settle the market early, an abandoned match VOIDs (stakes returned, not a fabricated YES/NO), a duplicate
  goal frame does not double-spawn, and a foreign/wrong account is fail-closed (`test/golden_edge_cases.test.ts`).

## What is design / pending

- **DESIGN** — the live `serviceLevelId=1` (~60s) end-to-end demo against a live WC match. The mechanism is
  proven on a finalized historical fixture; the live in-play `Participant` (which-side) schema pin auto-captures
  during the next live match. v1 leads with the deterministic fixture; the live run is an optional second beat.
- **DESIGN** — N co-existing micro-markets at scale. The factory is architected for N (per-key lock so one
  market never starves others, orphan-sweep); the live demo shows ≥1 end-to-end.

## External facts

- **EXTERNAL** — these goal-grain micro-markets do not exist on Polymarket/Kalshi: their turnover is far below
  an optimistic-oracle resolution cost, so no paid oracle covers them. (The supply-gap thesis; see README.)
- **EXTERNAL** — on-chain prediction markets, parlays, and in-game markets already exist (Azuro, Overtime, SX,
  Totalis, Polymarket Combos). PROPCAST does NOT claim to be the first of those.

## Explicit non-claims

- **NOT-CLAIMED** — no `$`-PnL, no MM-profit, no ROI. PROPCAST reports market **quality / coverage** only.
- **NOT-CLAIMED** — not "real-time" / not per-second. Settle fires at goal/whistle **event granularity** (the
  free WC TxLINE tier is ~60s-delayed); a per-second claim would be dishonest.
- **NOT-CLAIMED** — "next-goal which-side" is NOT a trustless primitive in v1 (no on-chain proof attests goal
  order); it is a labeled proxy only.
- **NOT-CLAIMED** — novelty is scoped to **goal grain + objective Merkle settle**, not "first on-chain market"
  or "first in-play market".
- **NOT-CLAIMED** — the venue close (claim/payout) in v1 is the venue authority's `resolve()` LABELED
  "trusted-now, proof-gated-target"; the trustless datum is the kickoff receipt, shown + re-verifiable. A
  fully-gated venue-close program is a post-v1 upgrade, not claimed for v1.
