# DEPLOYMENTS — Solana devnet

The deployed programs PROPCAST consumes, the `market_id` scheme, and the proven phase 2c settle artifacts. PROPCAST
itself is a TypeScript consumer + fan UI — it deploys no program of its own (no-duplicate-mechanism); it CALLS
these.

## Programs (devnet)

| Program | Program id | Role |
|---|---|---|
| `kickoff_oracle` | `34FXjUuikioZy4fcUKSoP9NVW7WWKQnpJUZQcRDTNLtw` | the trust root — mints the TxLINE-anchored `OuBoundReceipt` via CPI-gated `settle_ou_bound` |
| `pitchmaker_book` | `JBK6odPfCTuHp1cb3Yr76PPTdnhpGgQwrZ9oszhSjh3R` | the binary escrow-cross venue (ADR-0003, in the PitchMaker repo) PROPCAST inits + seeds per micro-market |
| `txoracle` | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` | verifies the TxLINE Merkle stat proof (`validate_stat`) |

`daily_scores_roots` PDA (the finalized day root the proof binds to): `CdUmkUdc4XBKeeq7Kq6JxQvnVMNuDA21mp98x4Rs3jHQ`.

## market_id scheme (the frozen seam)

```
market_id[32] = SHA-256("propcast:market:v1" ‖ fixtureId_le64 ‖ kind_u8 ‖ nonce_le32)
venue_u64     = little-endian decode of market_id[0..8]   (the pitchmaker_book venue id)
receipt PDA   = findProgramAddress(["ou_bound",   market_id], kickoff_oracle)   # OU (primary)
              | findProgramAddress(["btts_bound", market_id], kickoff_oracle)   # BTTS (secondary)
```

One `market_id` threads spawn → settle → re-verify (`src/factory/market_id.ts`, `src/onchain/receipt.ts`).

## Proven settle (devnet, fixture 17588395, day 2026-06-25 finalized)

| Artifact | Value |
|---|---|
| TxLINE goal-total proof verified (`txoracle::validate_stat`) | tx `5k69yoynmmieNqHNDpzCqozvffz8mKk8zwqZ7XTpDULSKwqGDLKQDZbkxkSvRoSrDd74teiDScQa1VyWuTPLCkpr` |
| `OuBoundReceipt` minted (`kickoff_oracle::settle_ou_bound`) | tx `4CzqNgSp26tCbZ5NQx6mCErRQVHaZamScwD4JvTNmdo2Q885y2fHDtCqVfdyp8NDg7uajM2CsWMLrTvi1Z7kufAG` |
| receipt PDA | `39vT6hs7hmqcQ3oaQ3AgCMJrdX2dz5973hhoffVQiX6n` |
| market_id | `532843d51b34f1140e08daf6570ee49204e65c670abf9b043bb37c7b5b452dc1` |
| outcome (over@50) | `false → NO` (Under 2.5) |

Reproduce: `evidence/real_onchain_settle.md`.
