// PROPCAST quality/coverage metrics — the venue is graded on EXPERIENCE + TRUST, never profit. This module
// reports market QUALITY and coverage ONLY: NO $-PnL, NO MM-profit, ever (the honesty contract). Pure +
// side-effect-free: identical records ⇒ identical metrics; all timestamps are passed in (no clock / RNG /
// global reads), mirroring the pricing kernel's purity discipline.

import type { VerifiedResolution } from "../onchain/settle_consumer.js";

/** Lifecycle classification owned by metrics; VOID is never derived from a present receipt. */
export type QualityResolution = VerifiedResolution | "VOID";

/** One micro-market's lifecycle, timestamped by the caller (the resolver/factory supplies the clock). */
export interface MarketQualityRecord {
  /** the market_id hex (the factory Map key). */
  marketId: string;
  /** wall-clock ms when the goal frame was observed (the spawn trigger). */
  goalSeenAtMs: number;
  /** wall-clock ms when the seed ladder was first posted (the market became quotable). */
  firstQuoteAtMs: number;
  /** wall-clock ms when the market resolved; undefined = still open. */
  settledAtMs?: number;
  /** the de-vigged seed P(YES) at spawn — the quality-of-seed reference. */
  seedFairYes: number;
  /** the realized outcome; undefined = still open. VOID is excluded from calibration. */
  resolution?: QualityResolution;
  /** the goal-primitive kind (PrimitiveKind int) — for the per-primitive coverage breakdown. */
  primitiveKind?: number;
}

/** Coverage + quality aggregate. EVERY field is dimensionless / a count / a probability / ms — NEVER a $. */
export interface QualityMetrics {
  marketsSpawned: number;
  goalsSeen: number;
  /** coverage %, clamped to [0,100] (markets also spawn pre-goal, so raw marketsSpawned/goalsSeen can exceed 1). */
  goalCoveragePct: number;
  marketsSettled: number;
  marketsVoided: number;
  /** median (firstQuote − goalSeen) ms over all spawned markets. */
  timeToFirstQuoteMsP50: number;
  /** mean (firstQuote − goalSeen) ms over all spawned markets. */
  timeToFirstQuoteMsMean: number;
  /** median (settled − goalSeen) ms over SETTLED markets (YES/NO; VOID excluded). */
  timeToSettleMsP50: number;
  /** mean signed calibration markout over SETTLED markets: mean(realized − seedFairYes), realized∈{0,1}.
   *  0 = well-calibrated seed; >0 = seed under-priced YES; <0 = over-priced. A SEED-QUALITY gauge, NOT PnL. */
  seedVsRealizedMarkout: number;
  /** markets spawned per goal-primitive kind (PrimitiveKind int → count) — the breadth-coverage breakdown.
   *  A dimensionless COUNT per kind, NEVER a $; markets with no `primitiveKind` are bucketed under -1. */
  byPrimitive: Record<number, number>;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Aggregate coverage + quality from the per-market records and the number of goal frames seen.
 * `goalsSeen` is the count of distinct goal frames presented to the factory (a deduped re-delivery is NOT a
 * second goal), so coverage = spawned / seen ∈ [0,100]. Pure: no clock, no RNG, no I/O.
 */
export function aggregateQuality(records: readonly MarketQualityRecord[], goalsSeen: number): QualityMetrics {
  const ttfq = records.map((r) => r.firstQuoteAtMs - r.goalSeenAtMs);
  const settled = records.filter((r) => r.resolution === "YES" || r.resolution === "NO");
  const ttsettle = settled
    .filter((r) => r.settledAtMs !== undefined)
    .map((r) => r.settledAtMs! - r.goalSeenAtMs);
  const markout = settled.map((r) => (r.resolution === "YES" ? 1 : 0) - r.seedFairYes);

  const byPrimitive: Record<number, number> = {};
  for (const r of records) {
    const k = r.primitiveKind ?? -1;
    byPrimitive[k] = (byPrimitive[k] ?? 0) + 1;
  }

  return {
    marketsSpawned: records.length,
    goalsSeen,
    // PC-08: a coverage percentage is bounded at 100. The "another goal" market spawns per score frame —
    // including the pre-goal 0-0 frame — so raw marketsSpawned can EXCEED goalsSeen; clamp so the reported
    // coverage never reads above 100% (a >100% "coverage" is a metric artifact, not extra coverage).
    goalCoveragePct: goalsSeen === 0 ? 0 : Math.min(100, (records.length / goalsSeen) * 100),
    marketsSettled: settled.length,
    marketsVoided: records.filter((r) => r.resolution === "VOID").length,
    timeToFirstQuoteMsP50: median(ttfq),
    timeToFirstQuoteMsMean: mean(ttfq),
    timeToSettleMsP50: median(ttsettle),
    seedVsRealizedMarkout: mean(markout),
    byPrimitive,
  };
}
