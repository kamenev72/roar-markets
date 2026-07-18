# DEMO — the ≤5-min walkthrough

**Video:** not recorded or linked in this repository.

The intended demo leads with the deterministic fixture. A live `serviceLevelId=1` ~60s run is an optional
second beat, gated on a live WC match. It must be recorded against still-resolvable devnet evidence; no video
artifact is currently published here.

## The spine (what the demo shows)

1. **A synthetic walkthrough frame** → the fan board illustrates a fresh "another goal?" market. The factory
   behavior is unit/bankrun tested; this UI click does not perform a live venue initialization.
2. **A fan takes a side** (YES / NO) — no wallet connect needed to watch the trust flow.
3. **A supplied receipt is inspected** — the real evidence is a historical devnet receipt; this walkthrough
   does not prove a whistle/finality decision.
4. **Receipt verification** — the complete binding gate accepts a receipt only for the canonical market,
   fixture, and line. The private mint/finality hook is a disclosed boundary, not proof.
5. **One-tap in-browser re-verify** — the fan re-checks the receipt themselves, **no API key, no wallet**.

## The REAL on-chain beat (the climax — not a mock)

Open the app → the top **REAL · on-chain · devnet** card fetches the live receipt and re-verifies it in the
browser. On an explorer, show the **receipt PDA address page** (`39vT6hs7…` — the account is live and
resolves); the mint tx signatures below are the historical record — devnet prunes tx history ~30 days, so a
`getTransaction`/explorer-tx lookup may return "not found". The account re-verify is the durable proof:

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
independently once a correctly bound receipt exists. BTTS ("both teams to score") is the secondary
goal-key primitive. All shown on the fan board with their de-vigged seeds.

## Run it locally (for the recording)

Linux hosts must already provide Playwright's Chromium system libraries (or use a Playwright-supported image).
The setup script never invokes `sudo`; CI alone provisions those libraries with
`playwright install --with-deps chromium`.

```bash
bash scripts/judge_setup.sh # locked dependencies + Chromium + the complete deterministic gate
bash scripts/demo.sh        # gate-green print + the on-chain re-verify (RPC key masked)
# then, in a second terminal, open the fan board:
npm --prefix app run dev
```

Or step by step:

```bash
bash scripts/judge_setup.sh                                            # install + all deterministic gates
npm --prefix app run dev                                               # open the fan board
# the REAL card re-verifies the live receipt; the SIMULATED walkthrough clicks through the flow
node --import tsx scripts/verify_real_settle.ts                        # the receipt gate, in the terminal
```

## Positioning one-liner

"A goal-grain devnet prototype: browser-verifiable receipt binding, with finality and payout stated as
remaining boundaries."

Deployed program ids + the full reproduce: `README.md`, `docs/TXLINE_USAGE.md`, `artifacts/evidence/real_onchain_settle.md`.
