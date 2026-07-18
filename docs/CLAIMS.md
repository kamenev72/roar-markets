# CLAIMS

Every public assertion Roar Markets makes, tagged. Tags: **VERIFIED-LIVE** (proven on devnet, hash on file),
**REPRODUCIBLE** (deterministic locally — run the gate), **DESIGN** (architecture intent, not yet proven
live), **EXTERNAL** (a third-party fact), **NOT-CLAIMED** (an explicit non-claim, to pre-empt over-reading).

## Evidence labels (rail × strength)

The fan UI tags every re-verify card with an honest **EvidenceLabel = rail × strength** so a viewer can never
mistake a walkthrough for a live settle:

- **rail** — `LIVE` (a real on-chain receipt, read from devnet) · `PARTIAL` (some steps live, some simulated) ·
  `SIMULATED` (a shape-exact synthetic receipt for the interactive walkthrough).
- **strength** — `VERIFIED` (the complete binding gate accepted the shown bytes) · `DEMONSTRATED` (the same gate
  runs, on a synthetic receipt).

The top on-chain card is the ONLY `LIVE · VERIFIED` surface; the interactive walkthrough is `SIMULATED ·
DEMONSTRATED`. Both render the RAW gate-trace (decoded owner / discriminator / PDA / `line_q` / `over` bytes)
so the trust claim is checkable, not a bare green tick.

## What is proven

- **VERIFIED-LIVE** — a real `OuBoundReceipt` was minted on Solana devnet via `kickoff_oracle::settle_ou_bound`,
  gated by a TxLINE Merkle goal-total proof (`txoracle::validate_stat`), and Roar Markets' complete binding gate
  re-verified it on-chain (`over=false → NO`). Txs: proof `5k69yoyn…`, mint `4CzqNgSp…`, receipt `39vT6hs7…`,
  `market_id 532843…`, kickoff_oracle `34FXjUuikioZy4fcUKSoP9NVW7WWKQnpJUZQcRDTNLtw`. See
  `artifacts/evidence/real_onchain_settle.md`.
- **VERIFIED-LIVE** — the fan re-verifies that real receipt **in the browser with no API key and no wallet**:
  the UI does a read-only devnet `getAccountInfo` and runs the identical complete binding gate (`app/src/App.tsx` →
  `packages/core/src/onchain/real_receipt.ts`). The PDA derivation is pinned to the live account by a test.
- **REPRODUCIBLE** — the full gate is deterministic locally: `npm test` (settle-gate, factory, golden
  edge-cases, metrics, the real-receipt PDA pin), `npm run typecheck`, `npm run cleanroom`, `npm run doc-drift`,
  and `npm --prefix app run build`.
- **REPRODUCIBLE** — golden tests prove stateless handling of supplied receipt bytes, duplicate-frame handling,
  and fail-closed foreign/wrong bindings. They do not prove finality, a VAR correction path, on-chain VOID, or refunds.
- **REPRODUCIBLE** — resolver tests recover the factory's canonical immutable market record and protect an
  in-flight settlement with an opaque lease; forged market objects and sweep races fail closed.
- **REPRODUCIBLE** — the SECONDARY "both teams to score" (BTTS) primitive: the consumer is grounded in the real
  `BttsBoundReceipt` layout (`yes`@48, the `["btts_bound", market_id]` PDA, the on-chain discriminator) and is
  fail-closed + offset-pinned by `packages/core/test/btts.test.ts`. Not yet minted live for a Roar Markets market_id (DESIGN for
  the live mint); the OU primary is the proven (VERIFIED-LIVE) path.
- **REPRODUCIBLE** — the goal-grain BREADTH: an O/U total-goals line-variant primitive (1.5 / 2.5 / 3.5),
  goal-key only, settling via the SAME `settle_ou_bound` rail but BOUND to its line — the consumer reads the
  receipt's `line_q`@48 and fail-closes a wrong-line receipt (`WrongLine`), so a 2.5 receipt can never resolve a
  1.5 market. The `line_q = round(line × 4)` quantization is pinned to the real phase 2c receipt (Under 2.5 =
  line_q 10). `packages/core/test/total_goals.test.ts` + `packages/core/test/settle_consumer.test.ts`. The per-line LIVE mint is DESIGN
  (rail/proof-gated, like BTTS); the line-binding + spawn are REPRODUCIBLE under the gate.

## What is design / pending

- **DESIGN** — a live `serviceLevelId=1` (~60s) run against a current WC match. A historical receipt and the
  `Participant` schema were captured, but no public live-finality run is evidenced; which-side remains a proxy.
  v1 leads with the deterministic receipt-verification fixture; a live run is an optional second beat.
- **DESIGN** — N co-existing micro-markets at scale. The factory is architected for N (per-key lock so one
  market never starves others, orphan-sweep); deterministic tests cover the lifecycle, not a public live demo.

## External facts

- **DESIGN THESIS** — a named 2026-07-11 comparison sample informed the goal-grain supply-gap thesis; it is
  not a field-wide certainty or an external fact.
- **EXTERNAL** — on-chain prediction markets, parlays, and in-game markets already exist (Azuro, Overtime, SX,
  Totalis, Polymarket Combos). Roar Markets does NOT claim to be the first of those.

## Explicit non-claims

- **NOT-CLAIMED** — no `$`-PnL, no MM-profit, no ROI. Roar Markets reports market **quality / coverage** only.
- **NOT-CLAIMED** — device-local history, streak, accuracy, and the downloadable private SVG record card are not a
  public leaderboard, rank, reward, or "Prediction IQ". Those future concepts require identity, anti-sybil,
  server-authoritative pick locks, settlement and probability-scoring, retention, and proof prerequisites that v1
  does not provide.
- **NOT-CLAIMED** — not "real-time" / not per-second. The intended private hook may react to goal/whistle
  frames at **event granularity**; the public consumer does not prove this policy or finality. The free WC
  TxLINE tier is ~60s-delayed.
- **NOT-CLAIMED** — "next-goal which-side" has no on-chain proof of goal order in v1; it is a labeled proxy.
- **NOT-CLAIMED** — novelty is scoped to **goal grain + immutable Merkle-receipt binding**, not "first
  on-chain market", "first in-play market", or proof of finality.
- **NOT-CLAIMED** — there is no public fund-holding venue close in v1. A future authority-controlled
  `resolve()` is modeled as "trusted-now, proof-gated-target"; a proof-gated close is post-v1.
- **NOT-CLAIMED** — the in-browser re-verify is **not** a cryptographic light-client proof: it re-derives the
  receipt's owner / discriminator / PDA / line_q / outcome from the primary RPC AND cross-reads it from a 2nd
  independent keyless RPC, but both are trusted to report honestly. The UI labels the strength: cross-confirmed
  on 2 RPCs only when they agree; single-RPC (caveat) when the 2nd is unreachable; PARTIAL-divergence when the
  2nd has no/other account. A hostile / man-in-the-middle RPC (or two colluding) could still report a fabricated
  account → cross-check on the block explorer for full independence. The gate defeats account-confusion /
  wrong-type / wrong-market / wrong-fixture / wrong-line vs an HONEST RPC; it is not a substitute for an
  on-chain SPV proof.
- **NOT-CLAIMED** — v1 has no public fund-holding venue, permissionless payout, timeout refund, or on-chain
  VOID/refund path. Receipt absence and factory sweep are lifecycle behavior, not an on-chain settlement outcome.
- **NOT-CLAIMED** — the public consumer does not prove finality. The private/injected mint hook selects when to
  mint and encoder defaults `minFinalTs` to `0` unless supplied; the nonce counter is in memory and resets on restart.
- **NOT-CLAIMED** — no public video, public repository-access guarantee, or submission completion is evidenced here.

## Supply-chain posture (per tree)

- **MEASURED** — `npm audit --omit=dev` on the ROOT package tree = 0 vulnerabilities. The browser `app/` production
  tree reports 3 moderate transitive advisories through `@solana/web3.js → jayson → uuid@8.3.2`; that dependency
  code ships in the lazy verifier chunk. The cited uuid buffer-writing paths are not identified in the current
  read-only RPC flow (jayson generates v4 request IDs), so exploitability is unproven rather than zero. npm offers
  only an incompatible web3.js replacement, so no forced downgrade was applied. `@solana/web3.js` remains pinned
  past the December-2024 backdoor with lockfile integrity. Full posture + threat model: `SECURITY.md`.
