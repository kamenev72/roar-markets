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

/** A receipt account shaped like a real OuBoundReceipt: the embedded market_id@8 MUST match the market (the gate
 *  now self-validates it, not just the caller-supplied PDA), plus the bound line_q@48 and the over@50 outcome. */
function synthOu(marketId: Uint8Array, over: boolean, lineQ = 10, fixtureId = 17588395n): { owner: PublicKey; data: Uint8Array } {
  const d = new Uint8Array(51);
  d.set(OU_BOUND_RECEIPT_DISCRIMINATOR, 0);
  d.set(marketId, 8);
  const dv = new DataView(d.buffer);
  dv.setBigInt64(40, fixtureId, true);
  dv.setInt16(48, lineQ, true);
  d[50] = over ? 1 : 0;
  return { owner: KICKOFF_ORACLE_PROGRAM_ID, data: d };
}

const hookReturning = (tx: string | null): SettleHook => ({ mint: async () => tx });
const fetcherReturning = (acct: { owner: PublicKey; data: Uint8Array } | null): ReceiptFetcher => ({ fetchOu: async () => acct });

describe("PROPCAST LiveResolver (auto-detect → spawn → mint → verify → record)", () => {
  it("a goal then a settle trigger: mint + on-chain re-verify (Over → YES) is recorded", async () => {
    const f = new PropMarketFactory(new MemoryTransport());
    const m = await f.onGoal(goal(17588395n, 23, 1, 0));
    const r = new LiveResolver(f, hookReturning("MINT_TX_1"), fetcherReturning(synthOu(m.id.bytes, true, m.lineQ!)), { now: () => 123 });
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
    const m = await f.onGoal(goal(7n, 10, 1, 0));
    const r = new LiveResolver(f, hookReturning("MINT_TX_2"), fetcherReturning(synthOu(m.id.bytes, false, m.lineQ!)));
    const res = await r.settle(m, goal(7n, 90, 1, 0));
    expect(res!.resolution).toBe("NO");
  });

  it("not yet provable (hook returns null) → no settle, nothing recorded (the daemon retries)", async () => {
    const f = new PropMarketFactory(new MemoryTransport());
    const m = await f.onGoal(goal(7n, 10, 1, 0));
    const r = new LiveResolver(f, hookReturning(null), fetcherReturning(synthOu(m.id.bytes, true)));
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
    const a = await f.onGoal(goal(9n, 30, 1, 0));
    const r = new LiveResolver(f, hookReturning("MINT_TX_4"), fetcherReturning(synthOu(a.id.bytes, true, a.lineQ!)));
    const b = await r.onGoal(goal(9n, 30, 1, 0)); // duplicate poll re-delivery
    expect(marketIdHex(a.id)).toBe(marketIdHex(b.id));
    expect(f.listMarkets()).toHaveLength(1);
    await r.settle(a, goal(9n, 90, 1, 0));
    // resolved markets are never reaped by the orphan-sweep
    expect(f.sweep(0)).toBe(0);
    expect(f.listMarkets()).toHaveLength(1);
  });

  it("a LINE market (total-goals) settles via the BOUND resolver: own line → YES", async () => {
    const f = new PropMarketFactory(new MemoryTransport());
    const m = await f.spawnTotalGoals(17588395n, 2.5, [1.9, 1.9]); // lineQ = 10
    const r = new LiveResolver(f, hookReturning("MINT_TX_5"), fetcherReturning(synthOu(m.id.bytes, true, m.lineQ!)));
    const res = await r.settle(m, goal(17588395n, 80, 3, 0));
    expect(res!.resolution).toBe("YES");
  });

  it("no-clock-trust: the settle resolution is identical under a mutated injected clock (only verifiedAtMs moves)", async () => {
    const run = async (now: number) => {
      const f = new PropMarketFactory(new MemoryTransport());
      const m = await f.onGoal(goal(17588395n, 23, 1, 0));
      const r = new LiveResolver(f, hookReturning("TX"), fetcherReturning(synthOu(m.id.bytes, true, m.lineQ!)), { now: () => now });
      return (await r.settle(m, goal(17588395n, 67, 2, 0)))!;
    };
    const a = await run(111);
    const b = await run(999_999);
    expect(a.resolution).toBe(b.resolution); // pure function of the receipt bytes, NOT the clock
    expect(a.verifiedAtMs).toBe(111);
    expect(b.verifiedAtMs).toBe(999_999);
  });

  it("a LINE market fail-closes on a WRONG-line receipt (WrongLine), not a silent mis-resolve", async () => {
    const f = new PropMarketFactory(new MemoryTransport());
    const m = await f.spawnTotalGoals(17588395n, 2.5, [1.9, 1.9]); // expects lineQ 10
    // a receipt minted at line 1.5 (lineQ 6) for THIS market's PDA must NOT resolve the 2.5 market
    const r = new LiveResolver(f, hookReturning("MINT_TX_6"), fetcherReturning(synthOu(m.id.bytes, true, 6)));
    await expect(r.settle(m, goal(17588395n, 80, 3, 0))).rejects.toThrow(/WrongLine/);
  });

  it("the PRIMARY 'another goal' market is ALSO line-bound: a wrong-line receipt fail-closes (WrongLine)", async () => {
    const f = new PropMarketFactory(new MemoryTransport());
    const m = await f.onGoal(goal(17588395n, 23, 1, 0)); // "another goal after 1-0" ⇔ Over 1.5 ⇔ lineQ 6
    expect(m.lineQ).toBe(6);
    // a receipt minted at a DIFFERENT line (2.5 = lineQ 10) for THIS market's PDA must NOT silently resolve it
    const r = new LiveResolver(f, hookReturning("MINT_TX_7"), fetcherReturning(synthOu(m.id.bytes, true, 10)));
    await expect(r.settle(m, goal(17588395n, 67, 2, 0))).rejects.toThrow(/WrongLine/);
  });
});
