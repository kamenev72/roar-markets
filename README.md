# Crowd90

### Pick the next moment. Keep the proof attached.

**Crowd90 is the public fan experience built by PROPCAST:** a responsive World Cup board for fast YES/NO match moments. When a result card appears, its evidence remains bound to the exact market, fixture and line instead of becoming an unexplained admin verdict.

> **Try the product:** open the **[live Crowd90 fan experience](https://propcast-one.vercel.app/)**. The walkthrough is explicit about what is simulated and what comes from a historical devnet receipt. Local verification: `npm run judge-demo`.

| Fan experience | Trust experience |
|---|---|
| Discover a live match and choose a simple moment. | Every evidence state is named: simulated, verified, unavailable, invalid or divergent. |
| Follow the market as the match changes. | A receipt for another fixture or line is rejected. |
| Share a result and streak card. | Finality, custody and payout are never implied by a green binding check. |

<details>
<summary><strong>Technical scope and evidence boundaries</strong></summary>

The implementation-level receipt contract and limitations follow.

---

**A goal-grain receipt-binding prototype** — re-check a real Merkle-anchored `kickoff_oracle` receipt in your
browser, with no API key or wallet. It demonstrates immutable market/fixture/line binding; the private mint
hook's finality decision and venue payout are explicitly not claimed.

PROPCAST is a devnet prototype for goal-grain YES/NO micro-markets. The factory commits each canonical market
to a `market_id`, fixture, and O/U line before seeding an in-process venue. The public consumer accepts only a
`kickoff_oracle` receipt bound to that same tuple; the live mint/finality hook remains private and injected.

## Honest scope

- **Goal-grain only** in v1 (only goal stat keys are validated on-chain). The intended private hook reacts at
  **goal/whistle granularity**, never per-second; the public consumer does not prove that finality policy.
- **No $-PnL hero number** — a fan venue is measured on market **quality / coverage**, not profit.
- **Novelty = grain + immutable Merkle-receipt binding**, not proof of finality, "first on-chain market", or
  "first in-play" (Azuro / Overtime / SX / Totalis / Polymarket Combos exist).
- Reuses ~70-75% of two shipped assets: a deployed Solana escrow-cross venue + a TxLINE de-vig/GLFT pricing rail, and
  an on-chain receipt + credential-free Merkle re-verify rail. PROPCAST CONSUMES those deployed programs;
  it adds the per-prop market **factory** and the consumer surface.

## What is demonstrated

The complete binding gate checks receipt owner, discriminator, PDA, embedded `market_id`, fixture, O/U line,
and encoded outcome before exposing YES/NO. Once a canonical market exists, callers cannot substitute another
market, fixture, line, or receipt outcome. OU and BTTS wrong-fixture cases are regression-tested. This does
not prove finality selection by the private hook or permissionless venue payout. See `SECURITY.md`.

## Status

**Implemented and evidenced.** A historical devnet `OuBoundReceipt` for fixture `17588395`, line `10` is
re-verified in browser and terminal. The current PitchMaker ABI is validated locally against the vendored
binary. This is not a live venue-init proof, public video, public-repo access guarantee, or production service.

### Deployed (Solana devnet)

- `kickoff_oracle` (the receipt owner PROPCAST checks): `34FXjUuikioZy4fcUKSoP9NVW7WWKQnpJUZQcRDTNLtw`
- receipt PDA scheme: `["ou_bound", market_id]` · `market_id = SHA-256(domain ‖ fixtureId ‖ kind ‖ nonce)`.

Gate: `npm ci && npm --prefix ui ci && npm run judge-demo`.

</details>
