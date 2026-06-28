import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { ReceiptGateError, resolveFromReceipt, verifyOuReceipt, type OnchainAccount } from "../src/onchain/settle_consumer.js";
import { KICKOFF_ORACLE_PROGRAM_ID, OU_BOUND_RECEIPT_DISCRIMINATOR, ouReceiptPda } from "../src/onchain/receipt.js";

const MK = new Uint8Array(32).fill(0xa1);
const SYSTEM = new PublicKey("11111111111111111111111111111111");

/** disc(8) + market(32)@8 + fixture(i64 LE)@40 + line_q(i16 LE)@48 + over(1)@50 — the current layout. */
function synthOu(marketId: Uint8Array, fixtureId: bigint, lineQ: number, over: boolean): Uint8Array {
  const d = new Uint8Array(51);
  d.set(OU_BOUND_RECEIPT_DISCRIMINATOR, 0);
  d.set(marketId, 8);
  const dv = new DataView(d.buffer);
  dv.setBigInt64(40, fixtureId, true);
  dv.setInt16(48, lineQ, true);
  d[50] = over ? 1 : 0;
  return d;
}
function acct(marketId: Uint8Array, data: Uint8Array, owner = KICKOFF_ORACLE_PROGRAM_ID, pubkey?: PublicKey): OnchainAccount {
  return { pubkey: pubkey ?? ouReceiptPda(marketId), owner, data };
}

describe("PROPCAST settle-consumer (OuBoundReceipt 3-step gate)", () => {
  it("the pinned OU discriminator equals the real devnet receipt's first 8 bytes", () => {
    expect([...OU_BOUND_RECEIPT_DISCRIMINATOR]).toEqual([106, 75, 124, 75, 179, 40, 64, 35]);
  });

  it("verifies a valid receipt: over -> YES, under -> NO", () => {
    const over = acct(MK, synthOu(MK, 17588395n, 10, true));
    expect(verifyOuReceipt(over, MK)).toEqual({ over: true, fixtureId: 17588395n });
    expect(resolveFromReceipt(over, MK)).toBe("YES");
    expect(resolveFromReceipt(acct(MK, synthOu(MK, 17588395n, 10, false)), MK)).toBe("NO");
  });

  it("reads over at byte 50, NOT 48 (line_q low byte != over)", () => {
    // line_q = 1 -> byte48=1, byte49=0; over@50 = 0. A naive @48 read would WRONGLY say over=true.
    expect(resolveFromReceipt(acct(MK, synthOu(MK, 1n, 1, false)), MK)).toBe("NO");
  });

  it("rejects a foreign owner", () => {
    expect(() => verifyOuReceipt(acct(MK, synthOu(MK, 1n, 10, true), SYSTEM), MK)).toThrow(ReceiptGateError);
  });

  it("rejects a wrong discriminator", () => {
    const data = synthOu(MK, 1n, 10, true);
    data.set([0, 0, 0, 0, 0, 0, 0, 0], 0);
    expect(() => verifyOuReceipt(acct(MK, data), MK)).toThrow(/WrongDiscriminator/);
  });

  it("rejects a wrong-market receipt (PDA mismatch)", () => {
    const OTHER = new Uint8Array(32).fill(0xb2);
    // a valid receipt for OTHER (at ouReceiptPda(OTHER)) passed when we expect MK -> PDA mismatch.
    expect(() => verifyOuReceipt(acct(OTHER, synthOu(OTHER, 1n, 10, true)), MK)).toThrow(/WrongPda/);
  });
});
