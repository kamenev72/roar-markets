# Judge — the one-command path

Prerequisites are Node.js 22 and npm. Linux hosts must also already provide Playwright's Chromium system libraries
(or use a Playwright-supported image). The setup script never invokes `sudo` on a judge machine; CI provisions
those host libraries with `playwright install --with-deps chromium`.

With those platform prerequisites in place, one locked, credential-free install-and-check command runs the
deterministic judge path:

```bash
bash scripts/judge_setup.sh
```

It runs the full deterministic test suite, root typecheck, the production UI build, initial bundle budget, Playwright
360/768/1440 browser checks, clean-room plus its selftest, doc-drift, and XSS checks. Tests cover the factory
and complete receipt-binding gate. This command does not
make a live RPC request; the historical devnet receipt is the separate browser/terminal beat below.

## The wedge — see it in the browser (no wallet, no API key)

```bash
npm --prefix app ci && npm --prefix app run dev
```

Open the app → the top **REAL · on-chain · devnet** card fetches the live `OuBoundReceipt` and
**re-computes the receipt binding in your own browser** — no wallet connect or API key. Client-side re-verify
is not unique; the SPECIFIC,
defensible property here is **a LINE-BOUND, fail-closed settle-consumer over a REAL cross-repo `kickoff_oracle`
receipt** — the complete binding gate checks owner, discriminator, PDA, embedded market, fixture, line, and
outcome. Once canonical market state exists, an admin cannot substitute those fields. The same gate in terminal:

```bash
node --import tsx scripts/verify_real_settle.ts
```

## What to look for

- `npm test` passes — factory, canonical binding, evidence states, local-history bounds, bundle traversal, and browser re-verify coverage.
- `ui:bundle-check` reports the initial board below 200 kB raw / 65 kB gzip, with Solana verification lazy-loaded.
- The REAL card resolving `over=false → NO` (Under 2.5) on fixture 17588395 — a historical on-chain
  artifact (`kickoff_oracle`-minted receipt, PDA `39vT6hs7…`), re-verified with zero credentials.

## Honest scope

Goal-grain only (v1); the venue ABI is **locally bankrun-validated** against a vendored current `.so` — the PROVEN
on-chain artifact is the **settle receipt**, not a live venue-init tx (SECURITY §1). No $-PnL hero number — a
fan venue is measured on market quality/coverage. Finality selection is private/injected and payout/refund is
not demonstrated. Full detail: `README.md`, `SECURITY.md`, `CLAIMS.md`.
