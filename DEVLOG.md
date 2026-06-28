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
