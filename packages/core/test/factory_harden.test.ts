// PROPCAST factory hardening (phase 3): per-key lock (race-free dedup + no cross-market starvation) + orphan-sweep.

import { describe, it, expect } from "vitest";
import { MemoryTransport } from "../src/loop/memory_transport.js";
import { PropMarketFactory, DEFAULT_FACTORY_CONFIG } from "../src/factory/factory.js";
import { marketIdHex } from "../src/factory/market_id.js";
import type { ScoreEvent } from "../src/factory/primitives.js";

const goal = (fixtureId: bigint, minute: number, h: number, a: number): ScoreEvent => ({
  fixtureId,
  minute,
  homeScore: h,
  awayScore: a,
  anotherGoalOdds: [1.8, 2.0],
});

describe("PROPCAST factory hardening", () => {
  it("per-key lock: concurrent re-deliveries of the SAME frame spawn ONE market (race-free dedup)", async () => {
    const f = new PropMarketFactory(new MemoryTransport());
    const [a, b] = await Promise.all([f.onGoal(goal(3n, 10, 1, 0)), f.onGoal(goal(3n, 10, 1, 0))]);
    expect(marketIdHex(a.id)).toBe(marketIdHex(b.id));
    expect(f.listMarkets()).toHaveLength(1);
  });

  it("distinct frames are NOT serialized behind each other (no cross-market starvation)", async () => {
    const f = new PropMarketFactory(new MemoryTransport());
    const [a, b] = await Promise.all([f.onGoal(goal(4n, 10, 1, 0)), f.onGoal(goal(4n, 10, 2, 0))]);
    expect(marketIdHex(a.id)).not.toBe(marketIdHex(b.id));
    expect(f.listMarkets()).toHaveLength(2);
  });

  it("the SAME goal re-delivered with a drifted clock minute still dedups to ONE market", async () => {
    // The ~60s poll re-delivers the same 1-0 goal, but the match clock advanced a minute between polls.
    // The cumulative score is the identity of the goal; minute is NOT in the dedup key, so this is ONE market.
    const f = new PropMarketFactory(new MemoryTransport());
    const first = await f.onGoal(goal(5n, 23, 1, 0));
    const drifted = await f.onGoal(goal(5n, 24, 1, 0)); // same 1-0 goal, clock ticked 23 -> 24
    expect(marketIdHex(drifted.id)).toBe(marketIdHex(first.id));
    expect(f.listMarkets()).toHaveLength(1);
  });

  it("orphan-sweep reaps an unresolved market past its TTL and frees re-spawn", async () => {
    let clock = 0;
    const f = new PropMarketFactory(new MemoryTransport(), { ...DEFAULT_FACTORY_CONFIG, now: () => clock });
    await f.onGoal(goal(1n, 10, 1, 0)); // spawnedAt = 0
    clock = 5000;
    expect(f.sweep(3000)).toBe(1); // age 5000 > ttl 3000, unresolved -> swept
    expect(f.listMarkets()).toHaveLength(0);
    // the dedup signature is freed: an identical later frame can open a fresh market again
    await f.onGoal(goal(1n, 10, 1, 0));
    expect(f.listMarkets()).toHaveLength(1);
  });

  it("a RESOLVED market is never swept, however old", async () => {
    let clock = 0;
    const f = new PropMarketFactory(new MemoryTransport(), { ...DEFAULT_FACTORY_CONFIG, now: () => clock });
    const m = await f.onGoal(goal(2n, 10, 0, 0));
    const lease = f.beginSettlement(marketIdHex(m.id));
    expect(lease).toBeDefined();
    expect(f.finishSettlement(marketIdHex(m.id), lease!.token)).toBe(true);
    clock = 1_000_000;
    expect(f.sweep(1000)).toBe(0);
    expect(f.listMarkets()).toHaveLength(1);
  });

  it("exposes no tokenless mark-resolved bypass around the settlement lease", () => {
    const f = new PropMarketFactory(new MemoryTransport());
    expect((f as unknown as { markResolved?: unknown }).markResolved).toBeUndefined();
  });

  it("sweep leaves a still-young unresolved market alone", async () => {
    let clock = 0;
    const f = new PropMarketFactory(new MemoryTransport(), { ...DEFAULT_FACTORY_CONFIG, now: () => clock });
    await f.onGoal(goal(7n, 10, 1, 0));
    clock = 500;
    expect(f.sweep(3000)).toBe(0); // age 500 < ttl 3000
    expect(f.listMarkets()).toHaveLength(1);
  });
});
