// BTTS ("both teams to score") secondary primitive — the consumer is grounded in the REAL kickoff_oracle
// BttsBoundReceipt layout: disc(8) + market_id[32]@8 + fixture_id:i64@40 + yes:bool@48 (no line_q). The
// discriminator + the yes@48 offset + the ["btts_bound", market_id] PDA seed are all verified against the
// on-chain program (and the parlay_slip BTTS_BOUND_RECEIPT_DISCRIMINATOR).

import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  ReceiptGateError,
  resolveBttsFromReceipt,
  verifyBttsReceipt,
  type OnchainAccount,
} from "../src/onchain/settle_consumer.js";
import {
  BTTS_BOUND_RECEIPT_DISCRIMINATOR,
  bttsReceiptPda,
  ouReceiptPda,
  KICKOFF_ORACLE_PROGRAM_ID,
} from "../src/onchain/receipt.js";
import { bttsPrimitive } from "../src/factory/primitives.js";
import { PrimitiveKind } from "../src/factory/market_id.js";

const MK = new Uint8Array(32).fill(0xb7);
const SYSTEM = new PublicKey("11111111111111111111111111111111");

/** A shape-exact BttsBoundReceipt: disc(8)+market(32)@8+fixture(i64)@40+yes(1)@48 (+ trailing struct bytes). */
function synthBtts(marketId: Uint8Array, fixtureId: bigint, yes: boolean): Uint8Array {
  const d = new Uint8Array(59); // disc+market+fixture+yes+key_a(4)+comparator(1)+threshold(4)+bump(1)
  d.set(BTTS_BOUND_RECEIPT_DISCRIMINATOR, 0);
  d.set(marketId, 8);
  const dv = new DataView(d.buffer);
  dv.setBigInt64(40, fixtureId, true);
  d[48] = yes ? 1 : 0;
  return d;
}
function acct(marketId: Uint8Array, data: Uint8Array, owner = KICKOFF_ORACLE_PROGRAM_ID, pubkey?: PublicKey): OnchainAccount {
  return { pubkey: pubkey ?? bttsReceiptPda(marketId), owner, data };
}

describe("PROPCAST BTTS secondary primitive", () => {
  it("the BTTS discriminator matches the on-chain account discriminator", () => {
    expect([...BTTS_BOUND_RECEIPT_DISCRIMINATOR]).toEqual([142, 71, 83, 247, 15, 163, 91, 164]);
  });

  it("verifies a valid BTTS receipt: yes -> YES, no -> NO, fixture pinned", () => {
    const yes = acct(MK, synthBtts(MK, 17588395n, true));
    expect(verifyBttsReceipt(yes, MK)).toEqual({ yes: true, fixtureId: 17588395n });
    expect(resolveBttsFromReceipt(yes, MK)).toBe("YES");
    expect(resolveBttsFromReceipt(acct(MK, synthBtts(MK, 17588395n, false)), MK)).toBe("NO");
  });

  it("reads yes at byte 48, NOT 50 (BTTS has no line_q — the per-kind offset is load-bearing)", () => {
    // yes@48 = 1; bytes 49.. (key_a) = 0, so byte 50 = 0. An OU-style @50 read would WRONGLY say NO.
    const d = synthBtts(MK, 1n, true);
    expect(d[48]).toBe(1);
    expect(d[50]).toBe(0);
    expect(resolveBttsFromReceipt(acct(MK, d), MK)).toBe("YES");
  });

  it("the BTTS PDA seed differs from OU (same market_id → different receipt account)", () => {
    expect(bttsReceiptPda(MK).toBase58()).not.toBe(ouReceiptPda(MK).toBase58());
  });

  it("is fail-closed: wrong owner / discriminator / PDA all throw", () => {
    expect(() => verifyBttsReceipt(acct(MK, synthBtts(MK, 1n, true), SYSTEM), MK)).toThrow(ReceiptGateError);
    const bad = synthBtts(MK, 1n, true);
    bad.set([0, 0, 0, 0, 0, 0, 0, 0], 0);
    expect(() => verifyBttsReceipt(acct(MK, bad), MK)).toThrow(/WrongDiscriminator/);
    const OTHER = new Uint8Array(32).fill(0xc8);
    expect(() => verifyBttsReceipt(acct(OTHER, synthBtts(OTHER, 1n, true)), MK)).toThrow(/WrongPda/);
  });

  it("the BTTS primitive is trustlessly settleable and goal-key only", () => {
    const p = bttsPrimitive([1.9, 1.95]);
    expect(p.kind).toBe(PrimitiveKind.BttsYes);
    expect(p.trustlessSettleV1).toBe(true);
    expect(p.fairYes).toBeGreaterThan(0);
    expect(p.fairYes).toBeLessThan(1);
  });
});
