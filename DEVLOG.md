# DEVLOG — PROPCAST

Dated build journal for the auto-spawned, trustlessly-settled goal-grain micro-prop market venue (Track C).

---

2026-06-28  **W1 — repo scaffold + factory spine (synthetic, MemoryTransport).**
- **CP1 scaffold** — TS + vitest toolchain, the clean-room CI gate (no proprietary vocabulary / secrets),
  Apache-2.0 + NOTICE; private repo created.
- **CP2 vendored the pure pricing + venue modules** — de-vig, GLFT `quote`, the cold-start bootstrap ladder,
  the IDL-free `pitchmaker_book` venue client, and the in-process `MemoryTransport` — verbatim with
  attribution, proven in-repo (39/39). The TxLINE live-ingest modules defer to W2 (the W1 spine is synthetic).
- **CP3 the `market_id[32]` contract** — `SHA-256(domain || fixtureId || kind || nonce)`; `bytes[0..8]`
  (little-endian) == the `u64` the venue PDA seeds on, so one derivation bridges the venue id (now) and the
  bound-receipt PDA seed (W2). Collision-free over a grid + a venue-PDA cross-check (the frozen seam).
- **CP4 the `PropMarketFactory` spine** — `onGoal` → derive a `market_id` → `init_venue` → post the de-vigged
  two-sided seed ladder over `MemoryTransport`; "will there be another goal" (O/U) is the v1 PRIMARY
  (trustlessly settleable via the kickoff `settle_ou_bound` rail in W2); next-goal-which-side is a labeled
  proxy only (no on-chain proof of goal order). 47/47 tests, build + clean-room green.

**Deferred to W2/W3:** the live in-play scores schema pin (needs a live TxLINE rail + a real scoring frame),
the on-chain settle path (mint + consume the kickoff bound receipt), and the fan UI. Honesty: goal-grain
only; event-granularity settle (not per-second); the factory reports coverage/quality, never a $-PnL.

2026-06-29  **W2a — on-chain settle-consumer (the trust gate, rail/proof-independent).**
- `src/onchain/receipt.ts` + `src/onchain/settle_consumer.ts` — `verifyOuReceipt` runs the p2p_pool
  three-step fail-closed gate over a kickoff `OuBoundReceipt` (owner == kickoff_oracle / the OU discriminator
  / the `["ou_bound", market_id]` PDA), then reads `over`@**50** (NOT @48 — `line_q:i16` occupies 48..50) +
  `fixture_id`@40, mapping Over ⇒ "another goal" YES. The TS twin of the parlay_slip program's `verify_leg`.
- `test/settle_consumer.test.ts` 6/6 (53/53 total): valid over/under, the OU@50-vs-@48 crafted-`line_q` trap,
  the 3 gate negatives (foreign owner / wrong disc / wrong-market PDA), and the discriminator pinned to a
  REAL devnet receipt's first 8 bytes (`gvSwgSD8…`, owner `34FXjU…`, read this session).
- **Deferred (rail/proof-gated):** the live devnet mint of a fresh OuBoundReceipt for a PROPCAST market_id
  (needs the VSD total proof = a TxLINE Merkle fetch for an anchored fixture) + the venue-resolve tx. The
  TxLINE rail is now live (subscribe + X-Api-Token); a background watcher auto-captures the in-play scores
  schema during the next live WC match.

2026-06-29  **W2b — fan Goal-Markets board (the Track-C consumer surface).**
- `ui/` — a vite React app (mirrors the kickoff explorer) that runs the W1 de-vig seed + the W2a
  settle-consumer IN THE BROWSER: ⚽ a goal spawns the "another goal" micro-market (seeded from the de-vigged
  consensus YES%, keyed by the `market_id`), the fan picks YES/NO, the whistle settles it from a (clearly
  SYNTHETIC) `OuBoundReceipt` through the identical 3-step gate (`verifyOuReceipt` → owner / OU disc /
  `["ou_bound", market_id]` PDA / `over`@50), and a "✓ trustless verify — the proof decides" badge renders.
- `src/onchain/receipt.ts` `ouReceiptPda` now uses `TextEncoder` (not Node `Buffer`) → browser-safe, the
  IDENTICAL PDA (root tests stay 53/53). `npm run build` (tsc + vite) green.
- HONESTY: the receipt is labeled SYNTHETIC (the live mint of a real receipt for this market is rail/proof-
  gated); no $-PnL; goal-grain only; event-granularity settle. Deferred: the live mint + the real venue-resolve
  tx + the live scores-schema pin (the launchd daemon auto-captures that during a live WC match).

2026-06-29  **W2c — REAL on-chain settle (not synthetic).** The deferred live mint is DONE on devnet:
- A fresh TxLINE composite total-proof (P1+P2, op=Add) **verified live** via `txoracle::validate_stat`
  (tx `5k69yoyn…`), then a **real `OuBoundReceipt` minted** via `kickoff_oracle::settle_ou_bound`'s
  CPI-gated `validate_stat` (tx `4CzqNgSp…` → receipt `39vT6hs7…` at market_id `532843…` =
  `deriveMarketId(17588395, OuAnotherGoal, 0)`), and **PROPCAST's settle-consumer 3-step gate verified it
  on-chain** (`over=false fixtureId=17588395 → NO`). `scripts/mint_real_receipt.ts` (producer) +
  `scripts/verify_real_settle.ts` (consumer) + `evidence/real_onchain_settle.md`.
- Root-caused the earlier `0x66`: `settle_ou_bound`'s current signature REQUIRES the `fixture_id:i64` field
  (added by the trustless-gate hardening); the stale `live_ou_bound` layout omitted it → shifted the proof
  bytes → txoracle Merkle-fail. And the proof must be FRESH (matching the finalized day-root; a mid-day
  snapshot fails). No $-PnL. The live in-play (`Participant`) schema pin still needs a live match (the
  `com.propcast.scores-capture` launchd daemon auto-captures it).
