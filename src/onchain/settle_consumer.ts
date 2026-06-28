// PROPCAST on-chain settle-consumer — the p2p_pool three-step fail-closed gate over a kickoff OuBoundReceipt,
// then the over@50 read, mapped onto a PROPCAST "another goal" (O/U) micro-market resolution. The TS twin of
// the parlay_slip program's verify_leg. A foreign / wrong-type / wrong-market account can NEVER resolve a
// PROPCAST market (it throws). Pure (no I/O); the caller supplies the account read via getAccountInfo.

import { PublicKey } from "@solana/web3.js";
import {
  FIXTURE_ID_OFFSET,
  KICKOFF_ORACLE_PROGRAM_ID,
  OU_BOUND_RECEIPT_DISCRIMINATOR,
  OVER_OFFSET,
  ouReceiptPda,
} from "./receipt.js";

/** A raw on-chain account (as read via `connection.getAccountInfo`, or built in a test). */
export interface OnchainAccount {
  pubkey: PublicKey;
  owner: PublicKey;
  data: Uint8Array;
}

export type GateReason = "WrongOwner" | "WrongDiscriminator" | "WrongPda" | "BadData";

export class ReceiptGateError extends Error {
  constructor(public readonly reason: GateReason) {
    super(`OuBoundReceipt gate failed: ${reason}`);
    this.name = "ReceiptGateError";
  }
}

export interface VerifiedOu {
  /** true = "another goal" YES (Over); false = NO (Under). */
  over: boolean;
  fixtureId: bigint;
}

const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The three-step fail-closed gate over an OuBoundReceipt, then read `over`@50 + `fixture_id`@40. Throws a
 * `ReceiptGateError` on any failure. `expectedMarketId` is the PROPCAST market's id; the receipt MUST sit at
 * its `["ou_bound", market_id]` PDA, be owned by kickoff_oracle, and carry the OU discriminator.
 */
export function verifyOuReceipt(acct: OnchainAccount, expectedMarketId: Uint8Array): VerifiedOu {
  if (!acct.owner.equals(KICKOFF_ORACLE_PROGRAM_ID)) throw new ReceiptGateError("WrongOwner");
  if (acct.data.length < 8) throw new ReceiptGateError("BadData");
  if (!bytesEqual(acct.data.subarray(0, 8), OU_BOUND_RECEIPT_DISCRIMINATOR)) throw new ReceiptGateError("WrongDiscriminator");
  if (!acct.pubkey.equals(ouReceiptPda(expectedMarketId))) throw new ReceiptGateError("WrongPda");
  if (acct.data.length <= OVER_OFFSET) throw new ReceiptGateError("BadData");
  const dv = new DataView(acct.data.buffer, acct.data.byteOffset, acct.data.byteLength);
  return { fixtureId: dv.getBigInt64(FIXTURE_ID_OFFSET, true), over: acct.data[OVER_OFFSET] !== 0 };
}

export type PropResolution = "YES" | "NO";

/** Resolve a PROPCAST "another goal" market from a verified receipt: Over (another goal) ⇒ YES. */
export function resolveFromReceipt(acct: OnchainAccount, expectedMarketId: Uint8Array): PropResolution {
  return verifyOuReceipt(acct, expectedMarketId).over ? "YES" : "NO";
}
