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

/** The receipt PDA for a market: `["ou_bound", market_id]` under kickoff_oracle. */
export function ouReceiptPda(marketId: Uint8Array): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("ou_bound"), Buffer.from(marketId)], KICKOFF_ORACLE_PROGRAM_ID)[0];
}
