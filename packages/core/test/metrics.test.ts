// PROPCAST quality/coverage metrics — golden vectors + the honesty guard (NO $-PnL field, ever).

import { describe, it, expect } from "vitest";
import { aggregateQuality, type MarketQualityRecord, type QualityMetrics } from "../src/metrics/quality.js";

const rec = (over: Partial<MarketQualityRecord> & Pick<MarketQualityRecord, "marketId">): MarketQualityRecord => ({
  goalSeenAtMs: 1000,
  firstQuoteAtMs: 1200,
  seedFairYes: 0.5,
  ...over,
});

describe("PROPCAST quality/coverage metrics (no $-PnL)", () => {
  it("empty set: zeroed + no division-by-zero", () => {
    const m = aggregateQuality([], 0);
    expect(m.marketsSpawned).toBe(0);
    expect(m.goalsSeen).toBe(0);
    expect(m.goalCoveragePct).toBe(0);
    expect(m.timeToFirstQuoteMsP50).toBe(0);
    expect(m.timeToSettleMsP50).toBe(0);
    expect(m.seedVsRealizedMarkout).toBe(0);
  });

  it("single settled market: coverage, latencies, calibration markout", () => {
    const m = aggregateQuality([rec({ marketId: "aa", firstQuoteAtMs: 1300, settledAtMs: 4000, seedFairYes: 0.6, resolution: "YES" })], 1);
    expect(m.marketsSpawned).toBe(1);
    expect(m.goalCoveragePct).toBe(100);
    expect(m.timeToFirstQuoteMsP50).toBe(300); // 1300 - 1000
    expect(m.timeToSettleMsP50).toBe(3000); // 4000 - 1000
    expect(m.marketsSettled).toBe(1);
    // realized YES = 1, seed 0.6 -> markout +0.4 (seed under-priced YES)
    expect(m.seedVsRealizedMarkout).toBeCloseTo(0.4, 10);
  });

  it("PC-08: coverage % is clamped to 100 when markets outnumber goals (pre-goal 0-0 markets spawn too)", () => {
    // 3 markets spawned, only 1 goal seen (the extras are pre-goal "another goal?" markets) → raw 300% → 100
    const m = aggregateQuality([rec({ marketId: "a" }), rec({ marketId: "b" }), rec({ marketId: "c" })], 1);
    expect(m.marketsSpawned).toBe(3);
    expect(m.goalCoveragePct).toBe(100); // a coverage % never exceeds 100 (was a spurious 300 pre-fix)
  });

  it("coverage < 100% when not every goal spawns a market", () => {
    const m = aggregateQuality([rec({ marketId: "a" }), rec({ marketId: "b" })], 4);
    expect(m.goalCoveragePct).toBe(50);
  });

  it("VOID is counted + excluded from settle latency and calibration", () => {
    const recs = [
      rec({ marketId: "y", settledAtMs: 3000, seedFairYes: 0.5, resolution: "YES" }), // markout +0.5, tts 2000
      rec({ marketId: "n", settledAtMs: 5000, seedFairYes: 0.5, resolution: "NO" }), //  markout -0.5, tts 4000
      rec({ marketId: "v", seedFairYes: 0.9, resolution: "VOID" }), //                   excluded from both
      rec({ marketId: "open" }), //                                                      still open
    ];
    const m = aggregateQuality(recs, 4);
    expect(m.marketsSpawned).toBe(4);
    expect(m.marketsSettled).toBe(2); // YES + NO only
    expect(m.marketsVoided).toBe(1);
    expect(m.timeToSettleMsP50).toBe(3000); // median(2000, 4000)
    expect(m.seedVsRealizedMarkout).toBeCloseTo(0, 10); // (+0.5 - 0.5)/2; VOID & open excluded
  });

  it("byPrimitive: per-kind spawn breakdown (breadth coverage), dimensionless counts", () => {
    const recs = [
      rec({ marketId: "g1", primitiveKind: 0 }), // OuAnotherGoal
      rec({ marketId: "g2", primitiveKind: 0 }), // OuAnotherGoal
      rec({ marketId: "t1", primitiveKind: 4 }), // OuTotalGoals
      rec({ marketId: "t2", primitiveKind: 4 }), // OuTotalGoals
      rec({ marketId: "t3", primitiveKind: 4 }), // OuTotalGoals
      rec({ marketId: "b1", primitiveKind: 3 }), // BttsYes
      rec({ marketId: "x1" }), //                   no kind -> bucket -1
    ];
    const m = aggregateQuality(recs, 7);
    expect(m.byPrimitive).toEqual({ 0: 2, 4: 3, 3: 1, [-1]: 1 });
    expect(m.marketsSpawned).toBe(7);
  });

  it("HONESTY GUARD: no metric field names a dollar / pnl / profit quantity", () => {
    const m = aggregateQuality([rec({ marketId: "a", resolution: "YES", settledAtMs: 2000 })], 1);
    const banned = /pnl|profit|usd|usdc|dollar|\$|cash|earnings|revenue/i;
    for (const k of Object.keys(m as QualityMetrics)) {
      expect(k, `metric field "${k}" must not imply money`).not.toMatch(banned);
    }
  });
});
