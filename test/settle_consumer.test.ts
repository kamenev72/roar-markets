import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  ReceiptGateError,
  resolveFromReceipt,
  resolveOuLineFromReceipt,
  verifyOuReceipt,
  verifyOuReceiptForLine,
  type OnchainAccount,
} from "../src/onchain/settle_consumer.js";
import {
  KICKOFF_ORACLE_PROGRAM_ID,
  lineQToLine,
  lineToLineQ,
  OU_BOUND_RECEIPT_DISCRIMINATOR,
  ouReceiptPda,
} from "../src/onchain/receipt.js";

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

  it("verifies a valid receipt: over -> YES, under -> NO (+ decodes line_q)", () => {
    const over = acct(MK, synthOu(MK, 17588395n, 10, true));
    expect(verifyOuReceipt(over, MK)).toEqual({ over: true, fixtureId: 17588395n, lineQ: 10 });
    expect(resolveFromReceipt(over, MK)).toBe("YES");
    expect(resolveFromReceipt(acct(MK, synthOu(MK, 17588395n, 10, false)), MK)).toBe("NO");
  });

  it("pins the line_q quantization to the real W2c receipt: Under 2.5 <-> line_q 10 (x4)", () => {
    expect(lineToLineQ(2.5)).toBe(10);
    expect(lineQToLine(10)).toBe(2.5);
    // the other v1 total-goals lines
    expect(lineToLineQ(1.5)).toBe(6);
    expect(lineToLineQ(3.5)).toBe(14);
  });

  it("binds line_q: a receipt for the WRONG line fail-closes (WrongLine)", () => {
    // a valid receipt minted at line 2.5 (line_q=10) must NOT resolve a market declared at line 1.5 (line_q=6).
    const at25 = acct(MK, synthOu(MK, 17588395n, 10, true));
    expect(() => verifyOuReceiptForLine(at25, MK, 6)).toThrow(ReceiptGateError);
    expect(() => verifyOuReceiptForLine(at25, MK, 6)).toThrow(/WrongLine/);
    // the SAME receipt at its OWN line passes and resolves
    expect(verifyOuReceiptForLine(at25, MK, 10)).toEqual({ over: true, fixtureId: 17588395n, lineQ: 10 });
    expect(resolveOuLineFromReceipt(at25, MK, 10)).toBe("YES");
    expect(resolveOuLineFromReceipt(acct(MK, synthOu(MK, 17588395n, 6, false)), MK, 6)).toBe("NO");
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

  it("self-contained gate: rejects a receipt at the RIGHT PDA carrying a DIFFERENT embedded market_id@8", () => {
    const OTHER = new Uint8Array(32).fill(0xb2);
    // pubkey = ouReceiptPda(MK) (the expected PDA, so the pubkey step passes) but the bytes embed OTHER's id@8.
    // Before the self-contained check this was silently accepted on the re-derived-PDA path; now it fail-closes.
    const acctAtMkPdaButOtherData = acct(MK, synthOu(OTHER, 1n, 10, true), KICKOFF_ORACLE_PROGRAM_ID, ouReceiptPda(MK));
    expect(() => verifyOuReceipt(acctAtMkPdaButOtherData, MK)).toThrow(/WrongPda/);
  });

  it("BadData on truncation: a too-short account fail-closes (no JS out-of-bounds fail-open)", () => {
    const full = synthOu(MK, 17588395n, 10, true); // 51 bytes, valid
    // < 8 (no discriminator), 40 (id but no line_q/over), exactly OVER_OFFSET=50 (over byte missing) all → BadData.
    for (const n of [5, 40, 50]) {
      expect(() => verifyOuReceipt(acct(MK, full.subarray(0, n)), MK), `len ${n}`).toThrow(/BadData/);
    }
    // the full 51-byte account still verifies (the boundary is one byte away)
    expect(verifyOuReceipt(acct(MK, full), MK).over).toBe(true);
  });
});
