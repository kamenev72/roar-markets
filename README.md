# PROPCAST

**The live in-play micro-market the fan settles THEMSELVES** — re-compute the Merkle-anchored settlement in
your own browser, no API key, no trusted oracle to take on faith — auto-spawned from an objective goal,
auto-settled against TxODDS's own on-chain scores, at a goal-grain Polymarket's oracle economics can't service.

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
- Reuses ~70-75% of two shipped assets: a deployed Solana escrow-cross venue + a TxLINE de-vig/GLFT pricing rail, and
  a trustless settlement + credential-free Merkle re-verify rail. PROPCAST CONSUMES those deployed programs;
  it adds the per-prop market **factory** and the consumer surface.

## How it compares

The differentiator is the COMBINATION, not any single axis (on-chain markets,
parlays, and in-game markets already exist — Azuro / Overtime / SX / Polymarket
Combos). PROPCAST is the only fan venue that auto-spawns per-goal micro-markets
AND settles them trustlessly against the provider's own Merkle-anchored score at
zero per-market oracle cost, re-verifiable by the fan with no key.

| Capability | PROPCAST | Polymarket / Kalshi | Generic on-chain venues |
|---|:---:|:---:|:---:|
| Auto-spawns a per-goal micro-market live | ✅ | ❌ (coarse whole-match only) | ❌ (curated lists) |
| Trustless objective-Merkle settle (no token-vote oracle) | ✅ | ❌ | ⚠️ varies |
| In-browser credential-free Merkle re-verify (no API key) | ✅ | ❌ | ❌ |
| Zero per-market oracle cost (economic at $50–500 turnover) | ✅ | ❌ (oracle cost ≫ turnover) | ❌ |
| Goal-grain (O/U another-goal · total-goals 1.5/2.5/3.5 · BTTS) | ✅ | ❌ | ⚠️ coarse |

Honest scope: the matrix names market CATEGORIES, not any rival's code; every
PROPCAST ✅ is backed by a test or a devnet hash (see `CLAIMS.md`).

**Within this hackathon's field (re-census 2026-07-11):** several entries (predict.day, finalwhistle,
proofmarket) now ship the GENERIC "the fan re-verifies the score client-side" idea, so that alone is no longer
a differentiator — and a near name-twin `nayrbryanGaming/proofcast` exists (a DIFFERENT mechanism: an
analyst-accuracy commit-reveal bond, not an O/U receipt consumer). What stays specific to PROPCAST is the
**LINE-BOUND, fail-closed settle-consumer over a REAL cross-repo `kickoff_oracle` receipt**: **(1) each
market's SETTLEMENT is an on-chain instrument** — a `kickoff_oracle`-minted `OuBoundReceipt`, proven on devnet
and re-verifiable credential-free, and the 3-step gate binds `line_q` (`verifyOuReceiptForLine` / `WrongLine`),
so a receipt at the wrong O/U line fail-closes in the browser (the per-goal factory + venue run against the
deployed `pitchmaker_book` `.so` in a deterministic in-process ledger — bankrun — with a live devnet venue-init
a labeled DESIGN target per SECURITY §1; the PROVEN on-chain artifact is the settle receipt, not a live
venue-init tx), where elsewhere a "market" is a server/DB pick reconciled after the fact, and **(2) the settle
is gated BEFORE funds move** (the common rival pattern is settle-first-claw-back-later — a real fraud window
during the reconcile). The
engagement layer here (streaks, share-cards, the `?demo=` replay) deliberately sits OUTSIDE the trust core:
it consumes gate-verified results and never touches verification.

## Status

**Complete end-to-end.** The auto-spawn factory, the `market_id[32]` integration
contract, the on-chain settle-consumer (a 3-step fail-closed gate over a kickoff `OuBoundReceipt`), and the
fan UI all ship. The trustless settle is proven end-to-end on Solana devnet: a live TxLINE Merkle goal-total
proof → a real `OuBoundReceipt` minted via `kickoff_oracle`'s CPI-gated `settle_ou_bound` → PROPCAST's own
gate re-verifies it on-chain, and the fan re-verifies it in-browser with no key.

### Deployed (Solana devnet)

- `kickoff_oracle` (the trust root PROPCAST consumes): `34FXjUuikioZy4fcUKSoP9NVW7WWKQnpJUZQcRDTNLtw`
- receipt PDA scheme: `["ou_bound", market_id]` · `market_id = SHA-256(domain ‖ fixtureId ‖ kind ‖ nonce)`.

Gate: `npm install && npm run build && npm test && npm run cleanroom && npm run doc-drift`.
