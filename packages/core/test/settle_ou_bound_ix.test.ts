// Roar Markets' flagship claim is a REAL, CPI-gated kickoff receipt minted for a Roar Markets market — and it is
// produced by hand-encoding an instruction of a program we do not own. That encoder silently drifted once:
// kickoff appended a trailing `min_final_ts: i64`, our mint kept sending the old shape, and every attempt died
// with Anchor error 102 (InstructionDidNotDeserialize) while the script's comment still described the old
// signature. Anchor arg encoding is positional, so a missing or reordered field kills the WHOLE instruction —
// there is no partial success to notice. These tests pin the wire shape so the next drift fails here, loudly,
// instead of on devnet.

import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { ixDiscriminator, settleOuBoundIxData } from "../src/onchain/settle_ou_bound.js";

const marketId = new Uint8Array(32).fill(7);
const proof = new Uint8Array([1, 2, 3, 4, 5]);

describe("settle_ou_bound instruction data (the kickoff wire contract)", () => {
  it("lays the args out in kickoff's declared order, with min_final_ts LAST", () => {
    const data = settleOuBoundIxData({
      marketId,
      fixtureId: 17_588_395n,
      lineQ: 10,
      over: false,
      validateStatIxData: proof,
      minFinalTs: 1_760_000_000n,
    });
    // disc(8) ‖ market_id(32) ‖ fixture_id:i64 ‖ line_q:i16 ‖ over:u8 ‖ vec_len:u32 ‖ proof ‖ min_final_ts:i64
    expect(data.subarray(0, 8)).toEqual(ixDiscriminator("settle_ou_bound"));
    expect(data.subarray(8, 40)).toEqual(Buffer.from(marketId));
    expect(data.readBigInt64LE(40)).toBe(17_588_395n);
    expect(data.readInt16LE(48)).toBe(10);
    expect(data.readUInt8(50)).toBe(0); // over = false ⇒ Under
    expect(data.readUInt32LE(51)).toBe(proof.length);
    expect(data.subarray(55, 55 + proof.length)).toEqual(Buffer.from(proof));
    // THE regression: the trailing i64 whose absence made Anchor reject the whole instruction.
    expect(data.readBigInt64LE(55 + proof.length)).toBe(1_760_000_000n);
    expect(data.length).toBe(8 + 32 + 8 + 2 + 1 + 4 + proof.length + 8);
  });

  it("defaults min_final_ts to the finality-UNBOUND sentinel (0), still present on the wire", () => {
    const data = settleOuBoundIxData({ marketId, fixtureId: 1n, lineQ: 10, over: true, validateStatIxData: proof });
    expect(data.readBigInt64LE(55 + proof.length)).toBe(0n); // present, not omitted
    expect(data.length).toBe(8 + 32 + 8 + 2 + 1 + 4 + proof.length + 8);
  });

  it("uses Anchor's global-instruction discriminator", () => {
    expect(ixDiscriminator("settle_ou_bound")).toEqual(
      createHash("sha256").update("global:settle_ou_bound").digest().subarray(0, 8),
    );
  });

  it("refuses a market_id that is not 32 bytes (it is also the receipt PDA seed)", () => {
    expect(() =>
      settleOuBoundIxData({ marketId: new Uint8Array(31), fixtureId: 1n, lineQ: 10, over: true, validateStatIxData: proof }),
    ).toThrow(/32 bytes/);
  });
});
