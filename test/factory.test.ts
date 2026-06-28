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
  it("spawns + seeds one micro-market on a replayed goal, with the contract market_id", async () => {
    const t = new MemoryTransport();
    const f = new PropMarketFactory(t);
    const m = await f.onGoal(goal(17588395n, 23, 1, 0));

    // the market_id matches the frozen contract for (fixture, OuAnotherGoal, nonce 0)
    const expected = deriveMarketId(17588395n, PrimitiveKind.OuAnotherGoal, 0);
    expect(marketIdHex(m.id)).toBe(marketIdHex(expected));
    expect(m.venueU64).toBe(expected.u64);
    expect(m.primitive.trustlessSettleV1).toBe(true);
    expect(f.listMarkets()).toHaveLength(1);

    // the venue exists and a two-sided book was seeded (levels * 2 orders)
    const v = await t.readVenue(m.venueU64);
    expect(v).not.toBeNull();
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
