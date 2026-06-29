// The pinned REAL on-chain receipt (W2c) — the PDA derivation is locked against the live devnet account, and
// the shared 3-step gate re-verifies it. If anyone breaks ouReceiptPda(), the PDA pin fails loudly.

import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  REAL_MARKET_ID_HEX,
  REAL_RECEIPT_PDA,
  REAL_FIXTURE_ID,
  marketIdFromHex,
  verifyRealReceipt,
  type FetchedAccount,
} from "../src/onchain/real_receipt.js";
import { ReceiptGateError } from "../src/onchain/settle_consumer.js";
import { KICKOFF_ORACLE_PROGRAM_ID, OU_BOUND_RECEIPT_DISCRIMINATOR, ouReceiptPda } from "../src/onchain/receipt.js";

const SYSTEM = new PublicKey("11111111111111111111111111111111");

/** A real-SHAPED receipt: the real market_id, real fixture, Under 2.5 (over=false → NO), as the live one is. */
function realShapedData(over: boolean): Uint8Array {
  const d = new Uint8Array(51);
  d.set(OU_BOUND_RECEIPT_DISCRIMINATOR, 0);
  d.set(marketIdFromHex(REAL_MARKET_ID_HEX), 8);
  const dv = new DataView(d.buffer);
  dv.setBigInt64(40, REAL_FIXTURE_ID, true);
  dv.setInt16(48, 10, true); // line_q
  d[50] = over ? 1 : 0;
  return d;
}

describe("REAL on-chain receipt (W2c pin + in-browser re-verify)", () => {
  it("market_id hex decodes to 32 bytes and round-trips", () => {
    const b = marketIdFromHex(REAL_MARKET_ID_HEX);
    expect(b).toHaveLength(32);
    expect(Buffer.from(b).toString("hex")).toBe(REAL_MARKET_ID_HEX);
  });

  it("PIN: ouReceiptPda(real market_id) equals the live devnet receipt PDA", () => {
    expect(ouReceiptPda(marketIdFromHex(REAL_MARKET_ID_HEX)).toBase58()).toBe(REAL_RECEIPT_PDA);
  });

  it("the shared gate re-verifies the real-shaped receipt: Under → NO, fixture pinned", () => {
    const fetched: FetchedAccount = { owner: KICKOFF_ORACLE_PROGRAM_ID, data: realShapedData(false) };
    const v = verifyRealReceipt(fetched);
    expect(v.resolution).toBe("NO");
    expect(v.fixtureId).toBe(REAL_FIXTURE_ID);
    expect(v.pda.toBase58()).toBe(REAL_RECEIPT_PDA);
  });

  it("a pruned/absent account throws an honest not-found (no fabricated pass)", () => {
    expect(() => verifyRealReceipt(null)).toThrow(/not found on devnet/);
  });

  it("a wrong-owner account is fail-closed (ReceiptGateError), never a silent pass", () => {
    const foreign: FetchedAccount = { owner: SYSTEM, data: realShapedData(false) };
    expect(() => verifyRealReceipt(foreign)).toThrow(ReceiptGateError);
  });
});
