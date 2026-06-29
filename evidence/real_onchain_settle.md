# Real on-chain settle — devnet evidence

PROPCAST's trustless settle, end-to-end on Solana devnet (NOT synthetic): a live TxLINE Merkle total-proof,
a real `OuBoundReceipt` minted through the `kickoff_oracle` `settle_ou_bound` `validate_stat` CPI gate, and
PROPCAST's own 3-step consumer gate verifying that receipt.

| Step | Artifact (devnet) |
|---|---|
| 1. TxLINE total-proof (P1+P2, op=Add) **verified live** via `txoracle::validate_stat` | tx `5k69yoynmmieNqHNDpzCqozvffz8mKk8zwqZ7XTpDULSKwqGDLKQDZbkxkSvRoSrDd74teiDScQa1VyWuTPLCkpr` |
| 2. real `OuBoundReceipt` minted via `kickoff_oracle::settle_ou_bound` (CPI-gated, Under 2.5) | tx `4CzqNgSp26tCbZ5NQx6mCErRQVHaZamScwD4JvTNmdo2Q885y2fHDtCqVfdyp8NDg7uajM2CsWMLrTvi1Z7kufAG` |
| 3. PROPCAST consumer 3-step gate over the on-chain receipt | `scripts/verify_real_settle.ts` → `over=false fixtureId=17588395 → NO` |

- **market_id**: `532843d51b34f1140e08daf6570ee49204e65c670abf9b043bb37c7b5b452dc1` (`deriveMarketId(17588395, OuAnotherGoal, 0)`)
- **receipt PDA**: `39vT6hs7hmqcQ3oaQ3AgCMJrdX2dz5973hhoffVQiX6n` (owner = `kickoff_oracle` `34FXjUuikioZy4fcUKSoP9NVW7WWKQnpJUZQcRDTNLtw`)
- **txoracle**: `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` · **daily_scores_roots**: `CdUmkUdc4XBKeeq7Kq6JxQvnVMNuDA21mp98x4Rs3jHQ` (fixture 17588395, day 2026-06-25, finalized)

## Reproduce

1. Build a fresh composite total proof for an ANCHORED fixture (fetch `/api/scores/stat-validation?fixtureId=&seq=&statKey=1&statKey2=2`, build the `validateStat` ix; the day's `daily_scores_roots` PDA must be anchored — finalized past days work, the current day anchors after it closes).
2. `VSD_TOTAL_PATH=<fresh.json> node --import tsx scripts/mint_real_receipt.ts` → mints the receipt at `["ou_bound", market_id]`.
3. `node --import tsx scripts/verify_real_settle.ts` → PROPCAST's consumer reads + verifies it on devnet.

## Notes (load-bearing)

- The proof must be **fresh** (matching the current finalized day-root); a stale mid-day snapshot fails the
  txoracle Merkle verify (`custom program error: 0x66`).
- `settle_ou_bound`'s current signature requires the **`fixture_id:i64`** field (added by the trustless-gate
  hardening); a layout omitting it shifts the proof bytes → `0x66`.
- The synthetic-demo fan board (`ui/`) shows the same flow offline; THIS is the real on-chain instance.
- Honesty: this proves the trustless settle mechanism on a finalized historical fixture; the live in-play
  pin (the `Participant`/which-side schema) still needs a live match (the `com.propcast.scores-capture`
  launchd daemon auto-captures it). No $-PnL.
