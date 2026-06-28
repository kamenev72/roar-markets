# PROPCAST

**The live in-match micro-market that cannot exist on Polymarket** — auto-spawned from an objective goal,
auto-settled trustlessly against TxODDS's own Merkle-anchored scores, and re-verifiable by the fan in their
own browser with no API key.

PROPCAST auto-spawns a fresh binary YES/NO micro-market for each TxLINE-derived **goal primitive** of a live
World-Cup match (lead: *"will there be another goal"*), seeds the price from the de-vigged consensus line,
and auto-settles the market the instant its defining event is Merkle-proven on-chain. These markets are too
small for any paid per-market oracle (their turnover is dwarfed by an optimistic-oracle resolution cost), so
they **do not exist** on Polymarket/Kalshi today — there is no status quo to be undercut by.

## Honest scope

- **Goal-grain only** in v1 (only goal stat keys are validated on-chain); settle on **goal/whistle
  granularity**, never per-second (the free WC TxLINE tier is ~60s-delayed).
- **No $-PnL hero number** — a fan venue is measured on market **quality / coverage**, not profit.
- **Novelty = grain + objective-Merkle-settle**, not "first on-chain market" / "first in-play" (Azuro /
  Overtime / SX / Totalis / Polymarket Combos exist).
- Reuses ~70-75% of two shipped assets: a deployed Solana CLOB venue + a TxLINE de-vig/GLFT pricing rail, and
  a trustless settlement + credential-free Merkle re-verify rail. PROPCAST CONSUMES those deployed programs;
  it adds the per-prop market **factory** and the consumer surface.

## Status

**W1 — scaffold + factory spine (in progress).** Standalone repo scaffold, the vendored pure pricing/venue
modules, the `market_id[32]` integration contract, and a `PropMarketFactory` spine that spawns + seeds a
micro-market on a replayed goal over an in-process MemoryTransport (no live rail, no cluster). The live
in-play scores-schema pin, the on-chain settle path, and the fan UI follow in W2/W3.

Build + test + clean-room gate: `npm install && npm run build && npm test && npm run cleanroom`.
