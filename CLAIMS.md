# CLAIMS

Every public assertion PROPCAST makes, tagged. Tags: **VERIFIED-LIVE** (proven on devnet, hash on file),
**REPRODUCIBLE** (deterministic locally — run the gate), **DESIGN** (architecture intent, not yet proven
live), **EXTERNAL** (a third-party fact), **NOT-CLAIMED** (an explicit non-claim, to pre-empt over-reading).

## Evidence labels (rail × strength)

The fan UI tags every re-verify card with an honest **EvidenceLabel = rail × strength** so a viewer can never
mistake a walkthrough for a live settle:

- **rail** — `LIVE` (a real on-chain receipt, read from devnet) · `PARTIAL` (some steps live, some simulated) ·
  `SIMULATED` (a shape-exact synthetic receipt for the interactive walkthrough).
- **strength** — `VERIFIED` (the 3-step gate returned true on the shown bytes) · `DEMONSTRATED` (the same gate
  runs, on a synthetic receipt).

The top on-chain card is the ONLY `LIVE · VERIFIED` surface; the interactive walkthrough is `SIMULATED ·
DEMONSTRATED`. Both render the RAW gate-trace (decoded owner / discriminator / PDA / `line_q` / `over` bytes)
so the trust claim is checkable, not a bare green tick.

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
- **REPRODUCIBLE** — the SECONDARY "both teams to score" (BTTS) primitive: the consumer is grounded in the real
  `BttsBoundReceipt` layout (`yes`@48, the `["btts_bound", market_id]` PDA, the on-chain discriminator) and is
  fail-closed + offset-pinned by `test/btts.test.ts`. Not yet minted live for a PROPCAST market_id (DESIGN for
  the live mint); the OU primary is the proven (VERIFIED-LIVE) path.
- **REPRODUCIBLE** — the goal-grain BREADTH: an O/U total-goals line-variant primitive (1.5 / 2.5 / 3.5),
  goal-key only, settling via the SAME `settle_ou_bound` rail but BOUND to its line — the consumer reads the
  receipt's `line_q`@48 and fail-closes a wrong-line receipt (`WrongLine`), so a 2.5 receipt can never resolve a
  1.5 market. The `line_q = round(line × 4)` quantization is pinned to the real phase 2c receipt (Under 2.5 =
  line_q 10). `test/total_goals.test.ts` + `test/settle_consumer.test.ts`. The per-line LIVE mint is DESIGN
  (rail/proof-gated, like BTTS); the line-binding + spawn are REPRODUCIBLE under the gate.

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
- **NOT-CLAIMED** — the in-browser re-verify is **not** a cryptographic light-client proof: it re-derives the
  receipt's owner / discriminator / PDA / line_q / outcome from the primary RPC AND cross-reads it from a 2nd
  independent keyless RPC, but both are trusted to report honestly. The UI labels the strength: cross-confirmed
  on 2 RPCs only when they agree; single-RPC (caveat) when the 2nd is unreachable; PARTIAL-divergence when the
  2nd has no/other account. A hostile / man-in-the-middle RPC (or two colluding) could still report a fabricated
  account → cross-check on the block explorer for full independence. The gate defeats account-confusion /
  wrong-type / wrong-market / wrong-line vs an HONEST RPC; it is not a substitute for an on-chain SPV proof.
- **NOT-CLAIMED** — the v1 venue payout has no permissionless or timeout-driven refund (close-path A is a
  single authority key); VOID is CLASSIFIED (absent receipt) but VOID/refund SETTLEMENT is post-v1. v1 holds
  no fan funds (read-only UI, in-process venue) so this is a labeled latent residual, not a live fund risk.

## Supply-chain posture (per tree)

- **MEASURED** — `npm audit --omit=dev` on the ROOT package tree = 0 vulnerabilities. The browser-shipped `ui/`
  tree reports dev-toolchain + transitive advisories that are build-only / tree-shaken (the vulnerable code is
  not reachable from the read-only fan path); none ship in the fan bundle. `@solana/web3.js` is pinned past the
  December-2024 backdoor with lockfile integrity. Full posture + threat model: `SECURITY.md`.
