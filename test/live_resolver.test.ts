// PROPCAST live-match auto-resolver — the orchestration core, driven with injected fakes (no live feed, no
// secrets, no RPC): a goal auto-spawns; a settle trigger mints (via the hook) + re-verifies on-chain (via the
// fetcher) + records evidence. The real feed / proof-build / mint / RPC are wired in the private daemon.

import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { MemoryTransport } from "../src/loop/memory_transport.js";
import { PropMarketFactory } from "../src/factory/factory.js";
import { marketIdHex } from "../src/factory/market_id.js";
import type { ScoreEvent } from "../src/factory/primitives.js";
import { KICKOFF_ORACLE_PROGRAM_ID, OU_BOUND_RECEIPT_DISCRIMINATOR } from "../src/onchain/receipt.js";
import { LiveResolver, type ReceiptFetcher, type SettleHook } from "../src/sse/live_resolver.js";

const goal = (fixtureId: bigint, minute: number, h: number, a: number): ScoreEvent => ({
  fixtureId,
  minute,
  homeScore: h,
  awayScore: a,
  anotherGoalOdds: [1.8, 2.0],
});

/** A receipt account shaped like a real OuBoundReceipt with the given outcome (the gate authenticates via the
 *  PDA the orchestrator supplies, so the embedded market_id bytes can be zero). */
function synthOu(over: boolean, fixtureId = 17588395n): { owner: PublicKey; data: Uint8Array } {
  const d = new Uint8Array(51);
  d.set(OU_BOUND_RECEIPT_DISCRIMINATOR, 0);
  const dv = new DataView(d.buffer);
  dv.setBigInt64(40, fixtureId, true);
  dv.setInt16(48, 10, true);
  d[50] = over ? 1 : 0;
  return { owner: KICKOFF_ORACLE_PROGRAM_ID, data: d };
}

const hookReturning = (tx: string | null): SettleHook => ({ mint: async () => tx });
const fetcherReturning = (acct: { owner: PublicKey; data: Uint8Array } | null): ReceiptFetcher => ({ fetchOu: async () => acct });

describe("PROPCAST LiveResolver (auto-detect → spawn → mint → verify → record)", () => {
  it("a goal then a settle trigger: mint + on-chain re-verify (Over → YES) is recorded", async () => {
    const f = new PropMarketFactory(new MemoryTransport());
    const r = new LiveResolver(f, hookReturning("MINT_TX_1"), fetcherReturning(synthOu(true)), { now: () => 123 });
    const m = await r.onGoal(goal(17588395n, 23, 1, 0));
    const res = await r.settle(m, goal(17588395n, 67, 2, 0));
    expect(res).not.toBeNull();
    expect(res!.resolution).toBe("YES");
    expect(res!.mintTx).toBe("MINT_TX_1");
    expect(res!.fixtureId).toBe(17588395n);
    expect(res!.verifiedAtMs).toBe(123);
    expect(r.list()).toHaveLength(1);
  });

  it("whistle with no more goals (Under → NO) resolves NO", async () => {
    const f = new PropMarketFactory(new MemoryTransport());
    const r = new LiveResolver(f, hookReturning("MINT_TX_2"), fetcherReturning(synthOu(false)));
    const m = await r.onGoal(goal(7n, 10, 1, 0));
    const res = await r.settle(m, goal(7n, 90, 1, 0));
    expect(res!.resolution).toBe("NO");
  });

  it("not yet provable (hook returns null) → no settle, nothing recorded (the daemon retries)", async () => {
    const f = new PropMarketFactory(new MemoryTransport());
    const r = new LiveResolver(f, hookReturning(null), fetcherReturning(synthOu(true)));
    const m = await r.onGoal(goal(7n, 10, 1, 0));
    expect(await r.settle(m, goal(7n, 11, 1, 0))).toBeNull();
    expect(r.list()).toHaveLength(0);
  });

  it("an absent receipt (minted-but-not-found / abandoned) resolves VOID, never a fabricated YES/NO", async () => {
    const f = new PropMarketFactory(new MemoryTransport());
    const r = new LiveResolver(f, hookReturning("MINT_TX_3"), fetcherReturning(null));
    const m = await r.onGoal(goal(7n, 10, 1, 0));
    const res = await r.settle(m, goal(7n, 90, 1, 0));
    expect(res!.resolution).toBe("VOID");
  });

  it("idempotent on a re-delivered goal frame (one market) and marks resolved (sweep-safe)", async () => {
    const f = new PropMarketFactory(new MemoryTransport(), { bootstrap: { levels: 4, baseHalfSpread: 0.02, levelStep: 0.01, sizePerLevel: 10, coldExtra: 2 }, confidence: 0, now: () => 0 });
    const r = new LiveResolver(f, hookReturning("MINT_TX_4"), fetcherReturning(synthOu(true)));
    const a = await r.onGoal(goal(9n, 30, 1, 0));
    const b = await r.onGoal(goal(9n, 30, 1, 0)); // duplicate poll re-delivery
    expect(marketIdHex(a.id)).toBe(marketIdHex(b.id));
    expect(f.listMarkets()).toHaveLength(1);
    await r.settle(a, goal(9n, 90, 1, 0));
    // resolved markets are never reaped by the orphan-sweep
    expect(f.sweep(0)).toBe(0);
    expect(f.listMarkets()).toHaveLength(1);
  });
});
