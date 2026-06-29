// On-chain kickoff OuBoundReceipt — the trust root + the byte layout PROPCAST's settle-consumer reads.
//
// PROPCAST resolves a micro-market by reading a kickoff_oracle `OuBoundReceipt` (the trustless attestation
// that TxODDS's signed goal total settled an Over/Under for a fixture). The consumer trusts it only after the
// p2p_pool-style three-step gate (owner / discriminator / PDA) — never via a blind deserialize.

import { PublicKey } from "@solana/web3.js";

/** The deployed kickoff_oracle program that owns + produces the receipts (the trust root). */
export const KICKOFF_ORACLE_PROGRAM_ID = new PublicKey("34FXjUuikioZy4fcUKSoP9NVW7WWKQnpJUZQcRDTNLtw");

/** Anchor discriminator of `OuBoundReceipt` = sha256("account:OuBoundReceipt")[..8]. Confirmed equal to a
 *  real devnet receipt's first 8 bytes (read this session). */
export const OU_BOUND_RECEIPT_DISCRIMINATOR = new Uint8Array([106, 75, 124, 75, 179, 40, 64, 35]);

// Layout AFTER the 8-byte Anchor discriminator:
export const MARKET_ID_OFFSET = 8; // [u8;32] @ 8..40
export const FIXTURE_ID_OFFSET = 40; // i64 LE @ 40..48
export const LINE_Q_OFFSET = 48; // i16 LE @ 48..50
/** `over: bool` @ 50 — AFTER line_q (48..50). A naive @48 read mis-reads line_q's low byte and fail-opens. */
export const OVER_OFFSET = 50;

/** The receipt PDA for a market: `["ou_bound", market_id]` under kickoff_oracle. Uses `Uint8Array` seeds
 *  (not Node `Buffer`) so the module is browser-safe (the fan UI calls this) while giving the identical PDA. */
export function ouReceiptPda(marketId: Uint8Array): PublicKey {
  return PublicKey.findProgramAddressSync([new TextEncoder().encode("ou_bound"), marketId], KICKOFF_ORACLE_PROGRAM_ID)[0];
}

// ---------- BTTS ("both teams to score") — the SECONDARY goal-key primitive ----------
//
// `BttsBoundReceipt` is a SEPARATE kickoff_oracle account (its own discriminator + PDA seed) — it is two-proof
// (P1>0 AND P2>0 for `yes`). Layout AFTER the 8-byte discriminator: market_id[32]@8, fixture_id:i64@40,
// `yes:bool`@48 (NO `line_q`, so the outcome sits at 48 — UNLIKE OU's `over`@50). Reading BTTS at @50 (or OU at
// @48) mis-reads a neighbouring field and fail-opens; the per-kind offset is load-bearing.

/** Anchor discriminator of `BttsBoundReceipt` = sha256("account:BttsBoundReceipt")[..8]. */
export const BTTS_BOUND_RECEIPT_DISCRIMINATOR = new Uint8Array([142, 71, 83, 247, 15, 163, 91, 164]);
/** `yes: bool` @ 48 — directly after `fixture_id`@40..48 (no `line_q`). */
export const BTTS_YES_OFFSET = 48;

/** The BTTS receipt PDA: `["btts_bound", market_id]` under kickoff_oracle (browser-safe `Uint8Array` seeds). */
export function bttsReceiptPda(marketId: Uint8Array): PublicKey {
  return PublicKey.findProgramAddressSync([new TextEncoder().encode("btts_bound"), marketId], KICKOFF_ORACLE_PROGRAM_ID)[0];
}
