# DEVLOG — PROPCAST

Dated build journal for the PROPCAST goal-grain market and bound-receipt prototype (Track C).

---

2026-06-28  **phase 1 — repo scaffold + factory spine (synthetic, MemoryTransport).**
- **CP1 scaffold** — TS + vitest toolchain, the clean-room CI gate (no proprietary vocabulary / secrets),
  Apache-2.0 + NOTICE; private repo created.
- **CP2 vendored the pure pricing + venue modules** — de-vig, GLFT `quote`, the cold-start bootstrap ladder,
  the IDL-free `pitchmaker_book` venue client, and the in-process `MemoryTransport` — verbatim with
  attribution, proven in-repo (39/39). The TxLINE live-ingest modules defer to phase 2 (the phase 1 spine is synthetic).
- **CP3 the `market_id[32]` contract** — `SHA-256(domain || fixtureId || kind || nonce)`; `bytes[0..8]`
  (little-endian) == the `u64` the venue PDA seeds on, so one derivation bridges the venue id (now) and the
  bound-receipt PDA seed (phase 2). Collision-free over a grid + a venue-PDA cross-check (the frozen seam).
- **CP4 the `PropMarketFactory` spine** — `onGoal` → derive a `market_id` → `init_venue` → post the de-vigged
  two-sided seed ladder over `MemoryTransport`; "will there be another goal" (O/U) is the v1 PRIMARY
  (planned for a kickoff bound-receipt rail in phase 2); next-goal-which-side is a labeled
  proxy only (no on-chain proof of goal order). 47/47 tests, build + clean-room green.

**Deferred to a later phase:** the live in-play scores schema pin (needs a live TxLINE rail + a real scoring frame),
the on-chain settle path (mint + consume the kickoff bound receipt), and the fan UI. Honesty: goal-grain
only; the intended hook was event-granular, not per-second; the factory reports coverage/quality, never $-PnL.

2026-06-29  **phase 2a — on-chain settle-consumer (the trust gate, rail/proof-independent).**
- `packages/core/src/onchain/receipt.ts` + `packages/core/src/onchain/settle_consumer.ts` — the then-current consumer ran a three-check
  parser over a kickoff `OuBoundReceipt` (owner == kickoff_oracle / the OU discriminator
  / the `["ou_bound", market_id]` PDA), then reads `over`@**50** (NOT @48 — `line_q:i16` occupies 48..50) +
  `fixture_id`@40, mapping Over ⇒ "another goal" YES. The TS twin of the parlay_slip program's `verify_leg`.
- `packages/core/test/settle_consumer.test.ts` 6/6 (53/53 total): valid over/under, the OU@50-vs-@48 crafted-`line_q` trap,
  the 3 gate negatives (foreign owner / wrong disc / wrong-market PDA), and the discriminator pinned to a
  REAL devnet receipt's first 8 bytes (`gvSwgSD8…`, owner `34FXjU…`, read this session).
- **Deferred (rail/proof-gated):** the live devnet mint of a fresh OuBoundReceipt for a PROPCAST market_id
  (needs the VSD total proof = a TxLINE Merkle fetch for an anchored fixture) + the venue-resolve tx. The
  TxLINE rail is now live (subscribe + X-Api-Token); a background watcher auto-captures the in-play scores
  schema during the next live WC match.

2026-06-29  **phase 2b — fan Goal-Markets board (the Track-C consumer surface).**
- `app/` — a vite React app (mirrors the kickoff explorer) that runs the phase 1 de-vig seed + the phase 2a
  settle-consumer IN THE BROWSER: ⚽ a goal spawns the "another goal" micro-market (seeded from the de-vigged
  consensus YES%, keyed by the `market_id`), the fan picks YES/NO, the whistle settles it from a (clearly
  SYNTHETIC) `OuBoundReceipt` through the then-current gate (owner / OU disc /
  `["ou_bound", market_id]` PDA / `over`@50), and the then-current proof badge rendered. The 2026-07-15
  hardening replaced that overclaim with explicit receipt-binding and finality boundaries.
- `packages/core/src/onchain/receipt.ts` `ouReceiptPda` now uses `TextEncoder` (not Node `Buffer`) → browser-safe, the
  IDENTICAL PDA (root tests stay 53/53). `npm run build` (tsc + vite) green.
- HONESTY: the receipt is labeled SYNTHETIC (the live mint of a real receipt for this market is rail/proof-
  gated); no $-PnL; goal-grain only. Deferred: live mint, venue resolve, and live schema capture.

2026-06-29  **phase 2c — REAL on-chain settle (not synthetic).** The deferred live mint is DONE on devnet:
- A fresh TxLINE composite total-proof (P1+P2, op=Add) **verified live** via `txoracle::validate_stat`
  (tx `5k69yoyn…`), then a **real `OuBoundReceipt` minted** via `kickoff_oracle::settle_ou_bound`'s
  CPI-gated `validate_stat` (tx `4CzqNgSp…` → receipt `39vT6hs7…` at market_id `532843…` =
  `deriveMarketId(17588395, OuAnotherGoal, 0)`), and the then-current settle-consumer verified it
  on-chain** (`over=false fixtureId=17588395 → NO`). `scripts/mint_real_receipt.ts` (producer) +
  `scripts/verify_real_settle.ts` (consumer) + `artifacts/evidence/real_onchain_settle.md`.
- Root-caused the earlier `0x66`: `settle_ou_bound`'s current signature REQUIRES the `fixture_id:i64` field
  (added by the binding-gate hardening); the stale `live_ou_bound` layout omitted it → shifted the proof
  bytes → txoracle Merkle-fail. And the proof must be FRESH (matching the finalized day-root; a mid-day
  snapshot fails). No $-PnL. The `Participant` schema was captured later that day; it does not prove goal order.

2026-06-29  **phase 3 — finish + ship (primitives-harden-demo-docs).** The submittable v1:
- **Golden edge-case battery** (`packages/core/test/golden_edge_cases.test.ts`): then included abandoned/VOID lifecycle
  examples and supplied-byte VAR examples; later claim hardening clarifies these did not prove finality or refund.
  Own-goal remains attribution-agnostic;
  which-side stays a proxy), double-goal-in-tick (idempotent `onGoal` per goal frame — a duplicate poll
  re-delivery does not double-spawn; a real 2nd goal advances the score → a fresh market).
- **Quality/coverage metrics** (`packages/core/src/metrics/quality.ts`, NO $-PnL): markets spawned, coverage %, time-to-
  first-quote, time-to-settle, seed-vs-realized calibration markout — a code test asserts no money-named field.
- **REAL on-chain re-verify card** (`app/`, `packages/core/src/onchain/real_receipt.ts`): the headline fetches the live
  receipt `39vT6hs7…` read-only and ran the then-current gate in-browser (no key/wallet); a test PINS
  `ouReceiptPda(real market_id)` to the live PDA. The interactive walkthrough is relabeled SIMULATED;
  close-path (A) labeled "trusted-now, proof-gated-target".
- **Factory harden**: per-key lock (one micro-market's confirm-block never starves others; race-free dedup),
  orphan-sweep, rent-reclaim documented deferral.
- **doc-drift CI gate** (`scripts/check_doc_drift.sh`) + the submission package (`CLAIMS`/`DEMO`/`HONESTY`/
  `MOCKS`/`DEPLOYMENTS`/`docs/TXLINE_USAGE`) + README refreshed. Final gate green: **77/77** tests, typecheck,
  ui build, cleanroom, doc-drift.
- Pending (operator handoff, labeled): record + host the ≤5-min demo video, then flip the repo public before
  the 2026-07-19 submission close.
- **CP8 (if-time) — BTTS secondary primitive done** (`844fc38`): a "both teams to score" consumer
  (BTTS receipt parser, `yes`@48 — NOT 50, no `line_q`) + `bttsPrimitive`, grounded in the real
  `BttsBoundReceipt` layout + the verified discriminator + the `["btts_bound", market_id]` PDA;
  fail-closed + offset-pinned by `packages/core/test/btts.test.ts` (6). Live mint for a PROPCAST market_id is DESIGN.
  Remaining if-time: the live ~60s match beat (gated on a live WC match + the private proof-build).

2026-06-29  **phase 2 schema PINNED — risk #1 CLOSED (the daemon caught a live match).** The
  `com.propcast.scores-capture` launchd daemon AUTONOMOUSLY captured a real in-play frame at 17:08Z
  (Brazil-Japan, the R32 window) — the #1 cross-project unknown (the in-play `Participant`/which-side schema,
  never seen live) is now KNOWN. Pinned: `artifacts/fixtures/live_scores_frame.json` (a real captured frame) +
  `packages/core/src/factory/primitives.ts` gains `LiveScoreFrame` (the real schema — which-side = `Participant1IsHome`,
  goals = `Stats["1"]`/`["2"]` per-participant, `Clock.Seconds`, `StatusId===2` in-play) + `isInPlay` +
  `scoreEventFromLiveFrame` (bridges a real frame → the factory's `ScoreEvent`, resolving home/away via
  `Participant1IsHome`). `packages/core/test/live_frame.test.ts` 4/4 (the which-side mapping + its away-flip + the in-play
  guard); build + 92/92 green. The synthetic phase 1 replay path is unchanged; the live bridge is additive.

2026-06-30  **phase 4 — fan-experience polish + breadth (Track-C deepening).** v1 was already submittable; phase 4 adds
  breadth + trust-depth, all reuse, no net-new program.
- **CP1 — line_q-bound OU consumer.** The then-current API read the receipt's `line_q`@48 and bound it to
  the market's declared line — a wrong-line receipt fail-closes (`WrongLine`), the precondition for >1 O/U line
  (without it a single receipt would resolve every line the same way, the multi-line fail-open). `line_q =
  round(line × 4)` pinned to the real phase 2c receipt (Under 2.5 = line_q 10). `VerifiedOu` gains `lineQ`.
- **CP2 — total-goals O/U line-variant primitive.** `totalGoalsPrimitive(line, odds)` + `factory.spawnTotalGoals`
  auto-spawn O/U 1.5/2.5/3.5 as distinct, receipt-bindable markets (goal-key only), reusing the same spawn +
  per-key lock. `packages/core/test/total_goals.test.ts`.
- **CP3 — UI trust-deepening.** The re-verify panels (REAL on-chain card + the SIMULATED walkthrough) render a
  RAW gate-trace (decoded owner / discriminator / PDA / `line_q` / `over` bytes) via the SAME gate fn (no second
  verifier) + an honest EvidenceLabel badge (LIVE·VERIFIED vs SIMULATED·DEMONSTRATED); a compact auto-spawned
  total-goals line strip shows the breadth. ui build green.
- **CP4 — coverage + positioning + take harness.** per-primitive `byPrimitive` coverage in the metrics (no
  $-PnL, enforced), a judge-facing comparison matrix in README (categories, not rival code), an EvidenceLabel
  taxonomy in CLAIMS, and `scripts/demo.sh` (one-command repeatable take: gate-green print + the on-chain
  re-verify, RPC key masked).
- Gate at each CP: test ∧ typecheck ∧ cleanroom ∧ doc-drift (+ ui build for CP3). Final suite **99/99**.

2026-07-15  **claim and trust-boundary hardening.** The complete verifier now binds owner, type, PDA,
embedded market, fixture, line, and canonical outcome. The factory/resolver uses canonical immutable state
and an opaque settlement lease. Public copy and APIs now say `receiptBindableV1`, not "trustless settle": the
private mint hook's finality policy, nonce persistence, and any fund-holding payout/refund remain explicit gaps.
  Operator handoff unchanged: record + host the demo video, then flip the repo public before 2026-07-19.
