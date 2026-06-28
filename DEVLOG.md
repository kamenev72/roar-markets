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
