// PROPCAST PropMarketFactory — the auto-spawn multiplexer. On each goal-derived primitive it derives a
// collision-free market_id, inits a fresh pitchmaker_book micro-venue, and posts the de-vigged two-sided
// seed ladder, registering the market for the fan board + the (phase 2) auto-settle path.
//
// phase 1: synthetic fixture + an in-process MemoryTransport (no chain, no RPC). The on-chain settle path
// (mint + consume the kickoff bound receipt), the live TxLINE feed, and the fan UI arrive in a later phase. The
// factory reports market QUALITY/coverage (markets spawned, levels seeded) — never a $-PnL.

import { SCALE, SIDE_ASK, SIDE_BID } from "../venue/client.js";
import type { VenueTransport } from "../loop/transport.js";
import { bootstrapLadder, type BootstrapConfig } from "../signal/bootstrap.js";
import { deriveMarketId, marketIdHex, type MarketId } from "./market_id.js";
import { anotherGoalPrimitive, totalGoalsPrimitive, type PropPrimitive, type ScoreEvent } from "./primitives.js";

const SCALE_N = Number(SCALE);

/** Map a probability in [0,1] to the venue's u32 price (1 .. SCALE-1). */
export function probToU32(p: number): number {
  return Math.min(SCALE_N - 1, Math.max(1, Math.round(p * SCALE_N)));
}

export interface SpawnedMarket {
  id: MarketId;
  /** the pitchmaker_book venue id (u64). */
  venueU64: bigint;
  primitive: PropPrimitive;
  seededLevels: number;
  /** O/U total-goals half-line (display) — OuTotalGoals markets only. */
  line?: number;
  /** the on-chain `line_q` bound at settle (`verifyOuReceiptForLine`) — OuTotalGoals markets only. */
  lineQ?: number;
}

export interface FactoryConfig {
  bootstrap: BootstrapConfig;
  /** cold-start confidence seed (0 = cold → conservative spread). */
  confidence: number;
  /** clock for spawn-time stamping + orphan-sweep (injectable for tests; defaults to Date.now). */
  now?: () => number;
}

export const DEFAULT_FACTORY_CONFIG: FactoryConfig = {
  bootstrap: { levels: 4, baseHalfSpread: 0.02, levelStep: 0.01, sizePerLevel: 10, coldExtra: 2 },
  confidence: 0,
};

export class PropMarketFactory {
  private readonly markets = new Map<string, SpawnedMarket>();
  private readonly spawnedSig = new Map<string, SpawnedMarket>(); // per goal-frame signature (idempotency)
  // sweep/lock metadata kept OUT of the public SpawnedMarket shape (zero churn for the board/UI).
  private readonly meta = new Map<string, { spawnedAtMs: number; sig: string; resolved: boolean }>();
  private readonly nonce = new Map<string, number>(); // per (fixtureId, kind) instance counter (PC-02: see spawn)
  private readonly tails = new Map<string, Promise<void>>(); // per-signature mutex tails

  constructor(
    private readonly transport: VenueTransport,
    private readonly cfg: FactoryConfig = DEFAULT_FACTORY_CONFIG,
  ) {}

  private now(): number {
    return (this.cfg.now ?? Date.now)();
  }

  /**
   * Serialize work on ONE key (a goal frame) without a GLOBAL lock — so a confirm-block on one micro-market
   * NEVER starves spawn/seed on OTHER markets (open-risk #7: DevnetTransport polls, no WS). Distinct keys run
   * fully concurrently; same-key calls queue, which is what makes the duplicate-frame dedup race-free.
   */
  private async withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    this.tails.set(key, mine);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.tails.get(key) === mine) this.tails.delete(key);
    }
  }

  /**
   * On a goal event, spawn + seed the v1 PRIMARY "another goal" micro-market — IDEMPOTENT per goal frame.
   * The free ~60s TxLINE poll can re-deliver the SAME scoring frame; a duplicate frame MUST NOT double-spawn.
   * We key on the goal signature (fixture, kind, cumulative score) — the score is MONOTONIC, so each goal
   * advances it (0-0 -> 1-0 -> 1-1) and gets a distinct signature + a fresh market (nonce increments), while a
   * re-delivery of the same score returns the already-spawned market unchanged. `minute` is deliberately NOT
   * in the key: the poll re-delivers the same goal with a drifted clock (floor(sec/60) ticks up between polls),
   * so keying on minute would spawn a DUPLICATE market for the same goal. The per-key lock makes the
   * check-then-spawn atomic even under concurrent re-deliveries.
   */
  async onGoal(ev: ScoreEvent): Promise<SpawnedMarket> {
    const prim = anotherGoalPrimitive(ev);
    const sig = `${ev.fixtureId}:${prim.kind}:${ev.homeScore}-${ev.awayScore}`;
    return this.withKeyLock(sig, async () => {
      const existing = this.spawnedSig.get(sig);
      if (existing) return existing;
      const m = await this.spawn(ev.fixtureId, prim);
      this.spawnedSig.set(sig, m);
      this.meta.set(marketIdHex(m.id), { spawnedAtMs: this.now(), sig, resolved: false });
      return m;
    });
  }

  private async spawn(fixtureId: bigint, prim: PropPrimitive): Promise<SpawnedMarket> {
    // PC-02 (NAMED gap, SECURITY §7): the nonce is an in-memory per-(fixture,kind) counter, so a daemon
    // restart mid-match resets it and can re-derive an already-used market_id. A deterministic nonce (from the
    // bound line) is the fix, but it changes market_id derivation — which requires re-minting the pinned real
    // receipt (REAL_MARKET_ID = deriveMarketId(fixture, OuAnotherGoal, 0)) in the SAME window. Deferred to the
    // re-mint window so the flagship credential-free re-verify pin stays intact until then.
    const nkey = `${fixtureId}:${prim.kind}`;
    const nonce = this.nonce.get(nkey) ?? 0;
    this.nonce.set(nkey, nonce + 1);
    const id = deriveMarketId(fixtureId, prim.kind, nonce);
    await this.transport.initVenue(id.u64);

    const ladder = bootstrapLadder(prim.fairYes, this.cfg.confidence, this.cfg.bootstrap);
    for (const lvl of ladder) {
      await this.transport.postOrder(id.u64, SIDE_BID, probToU32(lvl.bidPrice), BigInt(Math.round(lvl.size)));
      await this.transport.postOrder(id.u64, SIDE_ASK, probToU32(lvl.askPrice), BigInt(Math.round(lvl.size)));
    }

    const m: SpawnedMarket = { id, venueU64: id.u64, primitive: prim, seededLevels: ladder.length, line: prim.line, lineQ: prim.lineQ };
    this.markets.set(marketIdHex(id), m);
    return m;
  }

  /**
   * BREADTH: spawn + seed a trustless O/U total-goals micro-market at an explicit half-line (1.5/2.5/3.5) —
   * IDEMPOTENT per (fixture, line). Distinct lines are distinct markets (the dedup signature carries the line),
   * while a re-delivered same-line frame returns the already-spawned market unchanged. Reuses the SAME private
   * spawn (init venue + de-vigged ladder) and the SAME per-key lock as `onGoal` — no forked spawn path. The
   * market records `lineQ` so the settle path binds it (`verifyOuReceiptForLine`, fail-closed on a wrong line).
   */
  async spawnTotalGoals(fixtureId: bigint, line: number, odds: [number, number]): Promise<SpawnedMarket> {
    const prim = totalGoalsPrimitive(line, odds);
    const sig = `${fixtureId}:${prim.kind}:line${prim.lineQ}`;
    return this.withKeyLock(sig, async () => {
      const existing = this.spawnedSig.get(sig);
      if (existing) return existing;
      const m = await this.spawn(fixtureId, prim);
      this.spawnedSig.set(sig, m);
      this.meta.set(marketIdHex(m.id), { spawnedAtMs: this.now(), sig, resolved: false });
      return m;
    });
  }

  /** All live micro-markets (the fan board source). */
  listMarkets(): SpawnedMarket[] {
    return [...this.markets.values()];
  }

  get(hex: string): SpawnedMarket | undefined {
    return this.markets.get(hex);
  }

  /** Mark a market resolved (settled or VOIDed) so the orphan-sweep never reaps it. */
  markResolved(hex: string): void {
    const mt = this.meta.get(hex);
    if (mt) mt.resolved = true;
  }

  /**
   * Orphan-sweep: drop micro-markets that never resolved within `ttlMs` (a match ended / a goal frame led to a
   * market that never settled), freeing the board + the dedup signature so an identical later frame can re-open.
   * Returns the number swept. A RESOLVED market is never reaped. Run on a timer in the live demo.
   *
   * Rent-reclaim is a DOCUMENTED v1 DEFERRAL: the lamport stake escrow returns to fans on `claim()`; reclaiming
   * the closed venue/order ACCOUNTS' rent is a post-v1 op (labeled in HONESTY.md/MOCKS.md), not done on sweep.
   */
  sweep(ttlMs: number): number {
    const now = this.now();
    let swept = 0;
    for (const [hex, mt] of this.meta) {
      if (!mt.resolved && now - mt.spawnedAtMs > ttlMs) {
        this.markets.delete(hex);
        this.spawnedSig.delete(mt.sig);
        this.meta.delete(hex);
        swept++;
      }
    }
    return swept;
  }
}
