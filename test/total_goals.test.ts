import { describe, it, expect } from "vitest";
import { MemoryTransport } from "../src/loop/memory_transport.js";
import { PropMarketFactory } from "../src/factory/factory.js";
import { marketIdHex, PrimitiveKind } from "../src/factory/market_id.js";
import {
  ReceiptGateError,
  resolveOuLineFromReceipt,
  verifyOuReceiptForLine,
  type OnchainAccount,
} from "../src/onchain/settle_consumer.js";
import {
  KICKOFF_ORACLE_PROGRAM_ID,
  lineToLineQ,
  OU_BOUND_RECEIPT_DISCRIMINATOR,
  ouReceiptPda,
} from "../src/onchain/receipt.js";

const FIXTURE = 17588395n;
const OU: [number, number] = [1.9, 1.9]; // [OVER, UNDER] decimals

/** A shape-exact OuBoundReceipt for a market id at a given line_q (disc+market@8+fixture@40+line_q@48+over@50). */
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

describe("PROPCAST total-goals O/U line-variant primitive (breadth)", () => {
  it("spawns 1.5 / 2.5 / 3.5 as THREE distinct, line-bound trustless markets", async () => {
    const f = new PropMarketFactory(new MemoryTransport());
    const m15 = await f.spawnTotalGoals(FIXTURE, 1.5, OU);
    const m25 = await f.spawnTotalGoals(FIXTURE, 2.5, OU);
    const m35 = await f.spawnTotalGoals(FIXTURE, 3.5, OU);

    // distinct ids + venues
    const ids = new Set([marketIdHex(m15.id), marketIdHex(m25.id), marketIdHex(m35.id)]);
    expect(ids.size).toBe(3);
    expect(new Set([m15.venueU64, m25.venueU64, m35.venueU64]).size).toBe(3);
    expect(f.listMarkets()).toHaveLength(3);

    // each is goal-key trustless, kind OuTotalGoals, with the bound line_q recorded (x4 quantization)
    for (const m of [m15, m25, m35]) {
      expect(m.primitive.kind).toBe(PrimitiveKind.OuTotalGoals);
      expect(m.primitive.trustlessSettleV1).toBe(true);
    }
    expect(m15.lineQ).toBe(lineToLineQ(1.5)); // 6
    expect(m25.lineQ).toBe(lineToLineQ(2.5)); // 10
    expect(m35.lineQ).toBe(lineToLineQ(3.5)); // 14
    expect(m25.line).toBe(2.5);
    expect(m25.primitive.question).toBe("Over/Under 2.5 total goals?");
  });

  it("is idempotent per line: a re-delivered same-line frame dedups (no double-spawn)", async () => {
    const f = new PropMarketFactory(new MemoryTransport());
    const a = await f.spawnTotalGoals(FIXTURE, 2.5, OU);
    const b = await f.spawnTotalGoals(FIXTURE, 2.5, OU);
    expect(marketIdHex(a.id)).toBe(marketIdHex(b.id));
    expect(f.listMarkets()).toHaveLength(1);
  });

  it("the settle path binds the line: own line resolves, a wrong-line receipt fail-closes", async () => {
    const f = new PropMarketFactory(new MemoryTransport());
    const m = await f.spawnTotalGoals(FIXTURE, 2.5, OU); // lineQ = 10
    const acct = (lineQ: number, over: boolean): OnchainAccount => ({
      pubkey: ouReceiptPda(m.id.bytes),
      owner: KICKOFF_ORACLE_PROGRAM_ID,
      data: synthOu(m.id.bytes, FIXTURE, lineQ, over),
    });
    // a receipt minted at THIS market's line resolves
    expect(resolveOuLineFromReceipt(acct(m.lineQ!, true), m.id.bytes, m.lineQ!)).toBe("YES");
    expect(verifyOuReceiptForLine(acct(m.lineQ!, false), m.id.bytes, m.lineQ!).over).toBe(false);
    // a receipt minted for a DIFFERENT line (1.5 = line_q 6) is fail-closed for this 2.5 market
    expect(() => verifyOuReceiptForLine(acct(6, true), m.id.bytes, m.lineQ!)).toThrow(ReceiptGateError);
    expect(() => verifyOuReceiptForLine(acct(6, true), m.id.bytes, m.lineQ!)).toThrow(/WrongLine/);
  });

  it("is deterministic: replaying the same (fixture, line) yields identical ids", async () => {
    const run = async () => {
      const f = new PropMarketFactory(new MemoryTransport());
      const m = await f.spawnTotalGoals(42n, 2.5, OU);
      return marketIdHex(m.id);
    };
    expect(await run()).toBe(await run());
  });
});
