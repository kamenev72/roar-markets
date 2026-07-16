// PROPCAST on-chain settle-consumer — a complete market/fixture/line fail-closed gate over a kickoff OuBoundReceipt,
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
  LINE_Q_OFFSET,
  MARKET_ID_OFFSET,
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

export type GateReason = "WrongOwner" | "WrongDiscriminator" | "WrongPda" | "BadData" | "WrongFixture" | "WrongLine";

export class ReceiptGateError extends Error {
  constructor(public readonly reason: GateReason) {
    super(`bound receipt gate failed: ${reason}`);
    this.name = "ReceiptGateError";
  }
}

export interface VerifiedOu {
  /** true = "another goal" YES (Over); false = NO (Under). */
  over: boolean;
  fixtureId: bigint;
  /** the bound half-line as the on-chain integer (`line_q:i16`@48); `lineQToLine` decodes the human line. */
  lineQ: number;
}

const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The immutable binding held by a spawned O/U market. Its fixture and line are part of the receipt trust
 * boundary, not caller metadata.
 */
export interface OuMarketBinding {
  marketId: Uint8Array;
  fixtureId: bigint;
  lineQ: number;
}

export interface BttsMarketBinding {
  marketId: Uint8Array;
  fixtureId: bigint;
}

const I64_MIN = -(1n << 63n);
const I64_MAX = (1n << 63n) - 1n;

function assertMarketId(marketId: Uint8Array): void {
  if (marketId.length !== 32) throw new ReceiptGateError("BadData");
}

function assertFixtureId(fixtureId: bigint): void {
  if (fixtureId < I64_MIN || fixtureId > I64_MAX) throw new ReceiptGateError("BadData");
}

function assertLineQ(lineQ: number): void {
  if (!Number.isInteger(lineQ) || lineQ < -32_768 || lineQ > 32_767) throw new ReceiptGateError("BadData");
}

/** Internal parse-only OU gate. Callers must bind its decoded values to a spawned market before use. */
function parseOuReceipt(acct: OnchainAccount, expectedMarketId: Uint8Array): VerifiedOu {
  if (!acct.owner.equals(KICKOFF_ORACLE_PROGRAM_ID)) throw new ReceiptGateError("WrongOwner");
  if (acct.data.length < 8) throw new ReceiptGateError("BadData");
  if (!bytesEqual(acct.data.subarray(0, 8), OU_BOUND_RECEIPT_DISCRIMINATOR)) throw new ReceiptGateError("WrongDiscriminator");
  if (!acct.pubkey.equals(ouReceiptPda(expectedMarketId))) throw new ReceiptGateError("WrongPda");
  // Self-contained binding: the EMBEDDED market_id@8 must equal the expected id (not just the caller-supplied
  // pubkey — closes the tautological pubkey check on the re-derived-PDA path; data length<40 fails closed).
  if (acct.data.length < MARKET_ID_OFFSET + 32) throw new ReceiptGateError("BadData");
  if (!bytesEqual(acct.data.subarray(MARKET_ID_OFFSET, MARKET_ID_OFFSET + 32), expectedMarketId)) throw new ReceiptGateError("WrongPda");
  if (acct.data.length <= OVER_OFFSET) throw new ReceiptGateError("BadData");
  const dv = new DataView(acct.data.buffer, acct.data.byteOffset, acct.data.byteLength);
  const overByte = acct.data[OVER_OFFSET];
  if (overByte !== 0 && overByte !== 1) throw new ReceiptGateError("BadData");
  return {
    fixtureId: dv.getBigInt64(FIXTURE_ID_OFFSET, true),
    lineQ: dv.getInt16(LINE_Q_OFFSET, true),
    over: overByte === 1,
  };
}

/**
 * Verify owner, type, PDA, embedded market id, fixture id, and the receipt's `line_q`@48 against the immutable
 * spawned-market binding. A receipt minted for
 * a DIFFERENT total-goals line (e.g. a 2.5 receipt) can NEVER resolve a market declared at another line (e.g.
 * 1.5) — it fail-closes with `WrongLine`. Without this binding a single shared receipt account would silently
 * resolve every line market the same way (the multi-line fail-open docs/SECURITY.md warns about); with it, each line is
 * independently bound. `binding.lineQ` is the integer `lineToLineQ(line)` recorded at spawn.
 */
export function verifyOuReceiptForMarket(acct: OnchainAccount, binding: OuMarketBinding): VerifiedOu {
  assertMarketId(binding.marketId);
  assertFixtureId(binding.fixtureId);
  assertLineQ(binding.lineQ);
  const v = parseOuReceipt(acct, binding.marketId);
  if (v.fixtureId !== binding.fixtureId) throw new ReceiptGateError("WrongFixture");
  if (v.lineQ !== binding.lineQ) throw new ReceiptGateError("WrongLine");
  return v;
}

/** A present, fully verified bound receipt can produce only a binary outcome. */
export type VerifiedResolution = "YES" | "NO";

// ---------- BTTS ("both teams to score") — the SECONDARY primitive ----------

export interface VerifiedBtts {
  /** true = BTTS yes (both teams scored). */
  yes: boolean;
  fixtureId: bigint;
}

/**
 * The fail-closed gate over a `BttsBoundReceipt`, then read `yes`@48 + `fixture_id`@40. SAME gate
 * shape as OU but with the BTTS discriminator, the `["btts_bound", market_id]` PDA, and the outcome at byte
 * 48 (NOT 50 — BTTS has no `line_q`). A foreign / wrong-type / wrong-market account can NEVER resolve a BTTS
 * market (it throws).
 */
function parseBttsReceipt(acct: OnchainAccount, expectedMarketId: Uint8Array): VerifiedBtts {
  if (!acct.owner.equals(KICKOFF_ORACLE_PROGRAM_ID)) throw new ReceiptGateError("WrongOwner");
  if (acct.data.length < 8) throw new ReceiptGateError("BadData");
  if (!bytesEqual(acct.data.subarray(0, 8), BTTS_BOUND_RECEIPT_DISCRIMINATOR)) throw new ReceiptGateError("WrongDiscriminator");
  if (!acct.pubkey.equals(bttsReceiptPda(expectedMarketId))) throw new ReceiptGateError("WrongPda");
  // Self-contained binding: the EMBEDDED market_id@8 must equal the expected id (same defense as the OU gate).
  if (acct.data.length < MARKET_ID_OFFSET + 32) throw new ReceiptGateError("BadData");
  if (!bytesEqual(acct.data.subarray(MARKET_ID_OFFSET, MARKET_ID_OFFSET + 32), expectedMarketId)) throw new ReceiptGateError("WrongPda");
  if (acct.data.length <= BTTS_YES_OFFSET) throw new ReceiptGateError("BadData");
  const dv = new DataView(acct.data.buffer, acct.data.byteOffset, acct.data.byteLength);
  const yesByte = acct.data[BTTS_YES_OFFSET];
  if (yesByte !== 0 && yesByte !== 1) throw new ReceiptGateError("BadData");
  return { fixtureId: dv.getBigInt64(FIXTURE_ID_OFFSET, true), yes: yesByte === 1 };
}

/** Verify a BTTS receipt against the complete immutable spawned-market binding before exposing its outcome. */
export function verifyBttsReceiptForMarket(acct: OnchainAccount, binding: BttsMarketBinding): VerifiedBtts {
  assertMarketId(binding.marketId);
  assertFixtureId(binding.fixtureId);
  const v = parseBttsReceipt(acct, binding.marketId);
  if (v.fixtureId !== binding.fixtureId) throw new ReceiptGateError("WrongFixture");
  return v;
}
