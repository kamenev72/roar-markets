// PROPCAST on-chain settle-consumer — the p2p_pool three-step fail-closed gate over a kickoff OuBoundReceipt,
// then the over@50 read, mapped onto a PROPCAST "another goal" (O/U) micro-market resolution. The TS twin of
// the parlay_slip program's verify_leg. A foreign / wrong-type / wrong-market account can NEVER resolve a
// PROPCAST market (it throws). Pure (no I/O); the caller supplies the account read via getAccountInfo.

import { PublicKey } from "@solana/web3.js";
import {
  BTTS_BOUND_RECEIPT_DISCRIMINATOR,
  BTTS_YES_OFFSET,
  bttsReceiptPda,
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

export type PropResolution = "YES" | "NO" | "VOID";

/** Resolve a PROPCAST "another goal" market from a verified receipt: Over (another goal) ⇒ YES. */
export function resolveFromReceipt(acct: OnchainAccount, expectedMarketId: Uint8Array): "YES" | "NO" {
  return verifyOuReceipt(acct, expectedMarketId).over ? "YES" : "NO";
}

/**
 * Resolve OR VOID. A match abandoned mid-play never gets a final goal-total settle receipt minted by
 * kickoff_oracle, so there is NO receipt at the market's PDA to consume — the market must VOID (stakes
 * returned). VOID is DISTINCT from the fail-closed throw: the throw guards a MALICIOUS / wrong-type / wrong-PDA
 * account, while VOID is the legitimately-ABSENT receipt (`acct === null`, fetched no account at the PDA).
 *
 * This also encodes the VAR-disallowed invariant: the settle binds the FINAL cumulative goal total, so a
 * provisional-then-reversed goal never collapses the market early — the consumer only ever reads the single
 * final minted receipt's `over` byte, it carries no intermediate/provisional state of its own.
 */
export function resolveFromReceiptOrVoid(acct: OnchainAccount | null, expectedMarketId: Uint8Array): PropResolution {
  if (acct === null) return "VOID";
  return resolveFromReceipt(acct, expectedMarketId);
}

// ---------- BTTS ("both teams to score") — the SECONDARY primitive ----------

export interface VerifiedBtts {
  /** true = BTTS yes (both teams scored). */
  yes: boolean;
  fixtureId: bigint;
}

/**
 * The three-step fail-closed gate over a `BttsBoundReceipt`, then read `yes`@48 + `fixture_id`@40. SAME gate
 * shape as OU but with the BTTS discriminator, the `["btts_bound", market_id]` PDA, and the outcome at byte
 * 48 (NOT 50 — BTTS has no `line_q`). A foreign / wrong-type / wrong-market account can NEVER resolve a BTTS
 * market (it throws).
 */
export function verifyBttsReceipt(acct: OnchainAccount, expectedMarketId: Uint8Array): VerifiedBtts {
  if (!acct.owner.equals(KICKOFF_ORACLE_PROGRAM_ID)) throw new ReceiptGateError("WrongOwner");
  if (acct.data.length < 8) throw new ReceiptGateError("BadData");
  if (!bytesEqual(acct.data.subarray(0, 8), BTTS_BOUND_RECEIPT_DISCRIMINATOR)) throw new ReceiptGateError("WrongDiscriminator");
  if (!acct.pubkey.equals(bttsReceiptPda(expectedMarketId))) throw new ReceiptGateError("WrongPda");
  if (acct.data.length <= BTTS_YES_OFFSET) throw new ReceiptGateError("BadData");
  const dv = new DataView(acct.data.buffer, acct.data.byteOffset, acct.data.byteLength);
  return { fixtureId: dv.getBigInt64(FIXTURE_ID_OFFSET, true), yes: acct.data[BTTS_YES_OFFSET] !== 0 };
}

/** Resolve a PROPCAST "both teams to score" market from a verified receipt: BTTS yes ⇒ YES. */
export function resolveBttsFromReceipt(acct: OnchainAccount, expectedMarketId: Uint8Array): "YES" | "NO" {
  return verifyBttsReceipt(acct, expectedMarketId).yes ? "YES" : "NO";
}
