// The pinned REAL on-chain OuBoundReceipt (minted phase 2c on devnet) + a pure verify over a fetched account.
//
// This is the demo CLIMAX: a REAL kickoff_oracle receipt that PROPCAST's own 3-step gate re-verifies in the
// fan's browser with NO API key. The fetch (getAccountInfo) is I/O and lives in the caller (the UI / a script);
// the verify is this pure function, which REUSES `verifyOuReceipt` (no second verifier — no-duplicate-mechanism).

import { PublicKey } from "@solana/web3.js";
import { ouReceiptPda } from "./receipt.js";
import { verifyOuReceipt, type OnchainAccount } from "./settle_consumer.js";

/** market_id of the phase 2c real settle: deriveMarketId(17588395, OuAnotherGoal, 0). */
export const REAL_MARKET_ID_HEX = "532843d51b34f1140e08daf6570ee49204e65c670abf9b043bb37c7b5b452dc1";
/** the on-chain receipt PDA (owner = kickoff_oracle) — pinned to the live devnet account. */
export const REAL_RECEIPT_PDA = "39vT6hs7hmqcQ3oaQ3AgCMJrdX2dz5973hhoffVQiX6n";
/** the anchored fixture the proof settled. */
export const REAL_FIXTURE_ID = 17588395n;

/** Browser-safe hex → 32-byte id (no Node Buffer, so the UI bundle stays clean). */
export function marketIdFromHex(h: string): Uint8Array {
  if (h.length !== 64) throw new Error("market_id hex must be 32 bytes (64 hex chars)");
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) b[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return b;
}

/** The shape returned by `connection.getAccountInfo` (the fields the gate needs). */
export interface FetchedAccount {
  owner: PublicKey;
  data: Uint8Array;
}

export interface RealReceiptVerification {
  resolution: "YES" | "NO";
  fixtureId: bigint;
  /** the PDA the gate re-derived from market_id and matched against the fetched account. */
  pda: PublicKey;
}

/**
 * Verify the REAL on-chain receipt, in-browser, via the SAME 3-step gate. `fetched === null` means the account
 * was not found on devnet (devnet prunes confirmed txs ~30 days) — surfaced as a throw so the UI shows an
 * honest "receipt pruned" state rather than a fabricated pass. A wrong owner/discriminator/PDA throws a
 * `ReceiptGateError` (fail-closed).
 */
export function verifyRealReceipt(fetched: FetchedAccount | null, marketIdHex = REAL_MARKET_ID_HEX): RealReceiptVerification {
  const marketId = marketIdFromHex(marketIdHex);
  const pda = ouReceiptPda(marketId);
  if (fetched === null) throw new Error(`receipt ${pda.toBase58()} not found on devnet (devnet prunes ~30 days — re-mint to refresh)`);
  const acct: OnchainAccount = { pubkey: pda, owner: fetched.owner, data: fetched.data };
  const v = verifyOuReceipt(acct, marketId);
  return { resolution: v.over ? "YES" : "NO", fixtureId: v.fixtureId, pda };
}
