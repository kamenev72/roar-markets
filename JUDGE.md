# Judge — the 90-second path

One command, hermetic, no credentials:

```bash
npm install && npm run judge-demo
```

It runs (~10s, deterministic): `build` (tsc) → `test` (130 tests) → `cleanroom` → `doc-drift` → `xss-guard`.
The factory auto-spawns per-goal micro-markets, the 3-step fail-closed settle-consumer gate re-verifies an
on-chain `OuBoundReceipt`, and the fan UI all pass.

## The wedge — see it in the browser (no wallet, no API key)

```bash
npm --prefix ui install && npm --prefix ui run dev
```

Open the app → the top **REAL · on-chain · devnet** card fetches the live `OuBoundReceipt` and
**re-computes the settlement in your own browser** — no wallet connect, no API key, no trusted oracle to take
on faith. That is the one unclaimed property: **the fan settles the market THEMSELVES.** The same 3-step gate,
in the terminal:

```bash
node --import tsx scripts/verify_real_settle.ts
```

## What to look for

- `Tests 130 passed` — the factory + line-bound settle-consumer + the in-browser re-verify.
- The REAL card resolving `over=false → NO` (Under 2.5) on fixture 17588395 — a proven on-chain artifact
  (`kickoff_oracle`-minted receipt, PDA `39vT6hs7…`), re-verified with zero credentials.

## Honest scope

Goal-grain only (v1); the v1 venue is **in-process** (bankrun against the deployed `.so`) — the PROVEN
on-chain artifact is the **settle receipt**, not a live venue-init tx (SECURITY §1). No $-PnL hero number — a
fan venue is measured on market quality/coverage. No wallet/faucet needed: the trust flow is **read-only
re-verification**, which is exactly the point. Full detail: `README.md`, `SECURITY.md`, `CLAIMS.md`.
