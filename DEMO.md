# DEMO — the ≤5-min walkthrough

**Video:** _(operator pastes the hosted unlisted URL here before the public repo flip)_

The recorded demo IS the MVP. It leads with the DETERMINISTIC fixture (a live `serviceLevelId=1` ~60s run is
an optional second beat, gated on a live WC match). Devnet prunes confirmed txs ~30 days, so it is recorded
against the still-resolvable W2c hashes.

## The spine (what the demo shows)

1. **A goal fires** → a fresh binary "another goal?" micro-market **spawns** on the fan board (auto-spawn
   factory derives a collision-free `market_id`, inits the venue, seeds the de-vigged line).
2. **A fan takes a side** (YES / NO) — no wallet connect needed to watch the trust flow.
3. **The next goal/whistle is Merkle-proven** on-chain (TxLINE goal-total → `kickoff_oracle` settle).
4. **AUTO-SETTLE** — PROPCAST's 3-step gate reads the proven receipt and resolves the market.
5. **One-tap in-browser re-verify** — the fan re-checks the receipt themselves, **no API key, no wallet**.

## The REAL on-chain beat (the climax — not a mock)

Open the app → the top **REAL · on-chain · devnet** card fetches the live receipt and re-verifies it in the
browser. Show these are real on a Solana explorer (devnet):

| Step | Tx / account |
|---|---|
| TxLINE composite goal-total proof verified (`txoracle::validate_stat`) | `5k69yoynmmieNqHNDpzCqozvffz8mKk8zwqZ7XTpDULSKwqGDLKQDZbkxkSvRoSrDd74teiDScQa1VyWuTPLCkpr` |
| Real `OuBoundReceipt` minted (`kickoff_oracle::settle_ou_bound`, CPI-gated) | `4CzqNgSp26tCbZ5NQx6mCErRQVHaZamScwD4JvTNmdo2Q885y2fHDtCqVfdyp8NDg7uajM2CsWMLrTvi1Z7kufAG` |
| Receipt PDA (owner = kickoff_oracle `34FXjUuikioZy4fcUKSoP9NVW7WWKQnpJUZQcRDTNLtw`) | `39vT6hs7hmqcQ3oaQ3AgCMJrdX2dz5973hhoffVQiX6n` |
| market_id | `532843d51b34f1140e08daf6570ee49204e65c670abf9b043bb37c7b5b452dc1` |

Outcome read on-chain: `over=false → NO` (Under 2.5), fixture 17588395.

## Breadth (the goal-grain market spread)

Beyond "another goal", the factory auto-spawns **O/U total-goals** lines
(1.5 / 2.5 / 3.5) — each goal-key only, each LINE-BOUND: the settle-consumer reads
the receipt's `line_q` and fail-closes a wrong-line receipt, so every line settles
independently and trustlessly. BTTS ("both teams to score") is the secondary
goal-key primitive. All shown on the fan board with their de-vigged seeds.

## Run it locally (for the recording)

```bash
bash scripts/demo.sh        # one command: gate-green print + the on-chain re-verify (RPC key masked)
# then, in a second terminal, open the fan board:
npm --prefix ui install && npm --prefix ui run dev
```

Or step by step:

```bash
npm install
npm run build && npm test && npm run cleanroom && npm run doc-drift   # all green
npm --prefix ui install && npm --prefix ui run dev                     # open the fan board
# the REAL card re-verifies the live receipt; the SIMULATED walkthrough clicks through the flow
node --import tsx scripts/verify_real_settle.ts                        # the same gate, in the terminal
```

## Positioning one-liner

"The live in-match micro-market at a goal-grain **Polymarket's oracle economics can't service** — auto-spawned from an objective goal,
auto-settled trustlessly, re-verifiable by the fan in their own browser with no key."

Deployed program ids + the full reproduce: `README.md`, `docs/TXLINE_USAGE.md`, `evidence/real_onchain_settle.md`.
