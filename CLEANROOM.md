# Clean-room contract

PROPCAST is a public, clean-room project. Nothing in this repo derives from any private codebase.

- **No proprietary vocabulary** — internal finding-codes, private memory layers, private repo names, or
  private plan ids must never appear in a tracked file. `scripts/check_cleanroom.sh` enforces a denylist
  (run in CI on every push).
- **No secrets** — the wallet keypair, the TxLINE guest JWT, and the X-Api-Token are RUNTIME-ONLY (env /
  local files, gitignored). They are never committed, never in docs, never in fixtures.
- **Public-knowledge math only** — de-vig is standard proportional overround removal; the pricing seed is
  Avellaneda-Stoikov / GLFT, all from public literature.
- **Consume, don't fork** — the Solana escrow-cross venue and the trustless settlement/dispute + Merkle re-verify
  rails are deployed programs PROPCAST CALLS. PROPCAST does not re-implement a venue or an oracle.

Run the gate locally before any push: `npm run cleanroom`.
