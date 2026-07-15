import { describe, it, expect } from "vitest";
import { MemoryTransport } from "../src/loop/memory_transport.js";
import { PropMarketFactory } from "../src/factory/factory.js";
import { deriveMarketId, marketIdHex, PrimitiveKind } from "../src/factory/market_id.js";
import type { ScoreEvent } from "../src/factory/primitives.js";
import { SIDE_ASK, SIDE_BID } from "../src/venue/client.js";

const goal = (fixtureId: bigint, minute: number, h: number, a: number): ScoreEvent => ({
  fixtureId,
  minute,
  homeScore: h,
  awayScore: a,
  anotherGoalOdds: [1.8, 2.0],
});

describe("PropMarketFactory spine (synthetic, MemoryTransport)", () => {
  it.each([
    ["fixture above i64 max", 1n << 63n, 10],
    ["fixture below i64 min", -(1n << 63n) - 1n, 10],
    ["fractional line", 42n, 1.5],
    ["NaN line", 42n, Number.NaN],
    ["line above i16 max", 42n, 32_768],
  ] as const)("MemoryTransport rejects %s before storing a venue", async (_case, fixtureId, lineQ) => {
    const t = new MemoryTransport();
    await expect(t.initVenue(1n, fixtureId, lineQ)).rejects.toThrow(/i16|i64/);
    expect(await t.readVenue(1n)).toBeNull();
  });

  it("MemoryTransport tracks BID and ASK gross lots without inverting maker or taker", async () => {
    const t = new MemoryTransport();
    await t.initVenue(1n, 42n, 10);
    const bid = await t.postOrder(1n, SIDE_BID, 600_000, 5n);
    await t.take(1n, bid.orderId, 3n);
    const ask = await t.postOrder(1n, SIDE_ASK, 400_000, 6n);
    await t.take(1n, ask.orderId, 4n);

    expect(await t.readPosition(1n, t.maker)).toMatchObject({ yes: -1n, yesBought: 3n, yesSold: 4n });
    expect(await t.readPosition(1n, t.taker)).toMatchObject({ yes: 1n, yesBought: 4n, yesSold: 3n });
  });

  it("spawns + seeds one micro-market on a replayed goal, with the contract market_id", async () => {
    const t = new MemoryTransport();
    const f = new PropMarketFactory(t);
    const m = await f.onGoal(goal(17588395n, 23, 1, 0));

    // the market_id matches the frozen contract for (fixture, OuAnotherGoal, nonce 0)
    const expected = deriveMarketId(17588395n, PrimitiveKind.OuAnotherGoal, 0);
    expect(marketIdHex(m.id)).toBe(marketIdHex(expected));
    expect(m.venueU64).toBe(expected.u64);
    expect(m.fixtureId).toBe(17_588_395n);
    expect(m.primitive.receiptBindableV1).toBe(true);
    expect(f.listMarkets()).toHaveLength(1);

    // the venue exists and a two-sided book was seeded (levels * 2 orders)
    const v = await t.readVenue(m.venueU64);
    expect(v).not.toBeNull();
    expect(v!.fixtureId).toBe(17_588_395n);
    expect(v!.lineQ).toBe(primLineQ(m));
    expect(Number(v!.nextOrderId)).toBe(m.seededLevels * 2);

    // a coherent two-sided book: the first BID rests below the first ASK
    const bid0 = await t.readOrder(m.venueU64, 0n);
    const ask0 = await t.readOrder(m.venueU64, 1n);
    expect(bid0!.side).toBe(SIDE_BID);
    expect(ask0!.side).toBe(SIDE_ASK);
    expect(bid0!.price).toBeLessThan(ask0!.price);
    // prices are valid venue u32 ticks (1 .. SCALE-1)
    expect(bid0!.price).toBeGreaterThanOrEqual(1);
    expect(ask0!.price).toBeLessThan(1_000_000);
  });

  it("a second goal opens a fresh market (nonce increments) — a distinct venue", async () => {
    const t = new MemoryTransport();
    const f = new PropMarketFactory(t);
    const m1 = await f.onGoal(goal(17588395n, 23, 1, 0));
    const m2 = await f.onGoal(goal(17588395n, 67, 2, 0));
    expect(marketIdHex(m1.id)).not.toBe(marketIdHex(m2.id));
    expect(m2.venueU64).toBe(deriveMarketId(17588395n, PrimitiveKind.OuAnotherGoal, 1).u64);
    expect(f.listMarkets()).toHaveLength(2);
  });

  it("freezes the spawned fixture and line binding", async () => {
    const f = new PropMarketFactory(new MemoryTransport());
    const m = await f.spawnTotalGoals(17_588_395n, 2.5, [1.8, 2.0]);
    const originalHex = marketIdHex(m.id);

    expect(Object.isFrozen(m)).toBe(true);
    expect(Object.isFrozen(m.primitive)).toBe(true);
    expect(Object.isFrozen(m.id)).toBe(true);
    expect(Reflect.set(m, "fixtureId", 1n)).toBe(false);
    expect(Reflect.set(m, "lineQ", 1)).toBe(false);
    expect(Reflect.set(m.primitive, "lineQ", 1)).toBe(false);
    expect(Reflect.set(m.id, "u64", 1n)).toBe(false);
    m.id.bytes.fill(0);
    expect(m.fixtureId).toBe(17_588_395n);
    expect(m.lineQ).toBe(10);
    expect(m.primitive.lineQ).toBe(10);
    expect(m.venueU64).toBe(m.id.u64);
    expect(marketIdHex(m.id)).toBe(originalHex);
    expect(f.get(originalHex)).toBe(m);
  });

  it("rejects an invalid fixture before deriving or initializing a venue", async () => {
    const f = new PropMarketFactory(new MemoryTransport());
    await expect(f.onGoal(goal(1n << 63n, 23, 1, 0))).rejects.toThrow(/fixtureId/);
    expect(f.listMarkets()).toHaveLength(0);
  });

  it("does not consume nonce when the first line binding is invalid", async () => {
    const fixtureId = 42n;
    const f = new PropMarketFactory(new MemoryTransport());
    await expect(f.spawnTotalGoals(fixtureId, Number.NaN, [1.8, 2.0])).rejects.toThrow(/lineQ/);

    const valid = await f.spawnTotalGoals(fixtureId, 2.5, [1.8, 2.0]);
    expect(marketIdHex(valid.id)).toBe(marketIdHex(deriveMarketId(fixtureId, PrimitiveKind.OuTotalGoals, 0)));
  });

  it("is deterministic: replaying the same fixture yields identical ids + seed counts", async () => {
    const run = async () => {
      const t = new MemoryTransport();
      const f = new PropMarketFactory(t);
      const m = await f.onGoal(goal(42n, 10, 0, 1));
      const v = await t.readVenue(m.venueU64);
      return { hex: marketIdHex(m.id), orders: Number(v!.nextOrderId) };
    };
    expect(await run()).toEqual(await run());
  });
});

function primLineQ(m: { primitive: { lineQ?: number } }): number {
  if (m.primitive.lineQ === undefined) throw new Error("spawned O/U primitive must have lineQ");
  return m.primitive.lineQ;
}
