// PROPCAST PropMarketFactory — the auto-spawn multiplexer. On each goal-derived primitive it derives a
// collision-free market_id, inits a fresh pitchmaker_book micro-venue, and posts the de-vigged two-sided
// seed ladder, registering the market for the fan board + the (W2) auto-settle path.
//
// W1: synthetic fixture + an in-process MemoryTransport (no chain, no RPC). The on-chain settle path
// (mint + consume the kickoff bound receipt), the live TxLINE feed, and the fan UI arrive in W2/W3. The
// factory reports market QUALITY/coverage (markets spawned, levels seeded) — never a $-PnL.

import { SCALE, SIDE_ASK, SIDE_BID } from "../venue/client.js";
import type { VenueTransport } from "../loop/transport.js";
import { bootstrapLadder, type BootstrapConfig } from "../signal/bootstrap.js";
import { deriveMarketId, marketIdHex, type MarketId } from "./market_id.js";
import { anotherGoalPrimitive, type PropPrimitive, type ScoreEvent } from "./primitives.js";

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
}

export interface FactoryConfig {
  bootstrap: BootstrapConfig;
  /** cold-start confidence seed (0 = cold → conservative spread). */
  confidence: number;
}

export const DEFAULT_FACTORY_CONFIG: FactoryConfig = {
  bootstrap: { levels: 4, baseHalfSpread: 0.02, levelStep: 0.01, sizePerLevel: 10, coldExtra: 2 },
  confidence: 0,
};

export class PropMarketFactory {
  private readonly markets = new Map<string, SpawnedMarket>();
  private readonly nonce = new Map<string, number>(); // per (fixtureId, kind) instance counter

  constructor(
    private readonly transport: VenueTransport,
    private readonly cfg: FactoryConfig = DEFAULT_FACTORY_CONFIG,
  ) {}

  /** On a goal event, spawn + seed the v1 PRIMARY "another goal" micro-market. */
  async onGoal(ev: ScoreEvent): Promise<SpawnedMarket> {
    return this.spawn(ev.fixtureId, anotherGoalPrimitive(ev));
  }

  private async spawn(fixtureId: bigint, prim: PropPrimitive): Promise<SpawnedMarket> {
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

    const m: SpawnedMarket = { id, venueU64: id.u64, primitive: prim, seededLevels: ladder.length };
    this.markets.set(marketIdHex(id), m);
    return m;
  }

  /** All live micro-markets (the fan board source). */
  listMarkets(): SpawnedMarket[] {
    return [...this.markets.values()];
  }

  get(hex: string): SpawnedMarket | undefined {
    return this.markets.get(hex);
  }
}
