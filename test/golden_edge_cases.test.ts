// PROPCAST golden edge-case battery (PLAN-1908 W3 Phase 1). Settle-lifecycle correctness over the REAL
// settle-consumer + factory seams: abandoned -> VOID, VAR-disallowed goal, own-goal proxy, double-goal-in-tick.
// Synthetic fixtures only (no live rail). Each case exercises the actual code path it claims to cover.

import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  ReceiptGateError,
  resolveFromReceipt,
  resolveFromReceiptOrVoid,
  type OnchainAccount,
} from "../src/onchain/settle_consumer.js";
import { KICKOFF_ORACLE_PROGRAM_ID, OU_BOUND_RECEIPT_DISCRIMINATOR, ouReceiptPda } from "../src/onchain/receipt.js";
import { MemoryTransport } from "../src/loop/memory_transport.js";
import { PropMarketFactory } from "../src/factory/factory.js";
import { deriveMarketId, marketIdHex, PrimitiveKind } from "../src/factory/market_id.js";
import { anotherGoalPrimitive, type ScoreEvent } from "../src/factory/primitives.js";

const MK = new Uint8Array(32).fill(0xa1);
const SYSTEM = new PublicKey("11111111111111111111111111111111");

/** disc(8) + market(32)@8 + fixture(i64 LE)@40 + line_q(i16 LE)@48 + over(1)@50 — the on-chain layout. */
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
function acct(marketId: Uint8Array, data: Uint8Array, owner = KICKOFF_ORACLE_PROGRAM_ID, pubkey?: PublicKey): OnchainAccount {
  return { pubkey: pubkey ?? ouReceiptPda(marketId), owner, data };
}
const goal = (fixtureId: bigint, minute: number, h: number, a: number, odds: [number, number] = [1.8, 2.0]): ScoreEvent => ({
  fixtureId,
  minute,
  homeScore: h,
  awayScore: a,
  anotherGoalOdds: odds,
});

describe("PROPCAST golden edge-cases (settle-lifecycle correctness)", () => {
  // 1. ABANDONED -> VOID. A match abandoned mid-play never gets a final goal-total settle receipt, so there is
  //    no account at the market PDA -> the market VOIDs (stakes returned). VOID is distinct from a fail-closed
  //    throw (which guards a malicious/wrong account, NOT a legitimately-absent one).
  describe("abandoned -> VOID", () => {
    it("an absent receipt (no settle minted) resolves VOID, not YES/NO and not a throw", () => {
      expect(resolveFromReceiptOrVoid(null, MK)).toBe("VOID");
    });
    it("a present, valid receipt still resolves normally (VOID is ONLY the absent case)", () => {
      expect(resolveFromReceiptOrVoid(acct(MK, synthOu(MK, 17588395n, 10, true)), MK)).toBe("YES");
      expect(resolveFromReceiptOrVoid(acct(MK, synthOu(MK, 17588395n, 10, false)), MK)).toBe("NO");
    });
    it("a malicious/wrong-owner account is a THROW, never silently VOID (fail-closed, not fail-open)", () => {
      const foreign = acct(MK, synthOu(MK, 1n, 10, true), SYSTEM);
      expect(() => resolveFromReceiptOrVoid(foreign, MK)).toThrow(ReceiptGateError);
    });
  });

  // 2. VAR-DISALLOWED GOAL. The settle binds the FINAL cumulative total. A provisional goal later reversed by
  //    VAR must NOT collapse the "another goal" market to YES — the consumer reads ONLY the final minted
  //    receipt's `over` byte and holds no provisional state of its own.
  describe("VAR-disallowed goal binds the FINAL total", () => {
    it("a reversed goal (final receipt over=false) resolves NO, never the provisional YES", () => {
      const provisional = acct(MK, synthOu(MK, 17588395n, 10, true)); // the disallowed goal had it crossing -> YES
      const final = acct(MK, synthOu(MK, 17588395n, 10, false)); // after VAR: total did NOT cross -> NO
      // The provisional state would have said YES; the FINAL proven receipt is the only thing the consumer
      // trusts, so the market correctly resolves NO.
      expect(resolveFromReceipt(provisional, MK)).toBe("YES");
      expect(resolveFromReceipt(final, MK)).toBe("NO");
    });
    it("resolution is a pure function of the final receipt bytes (stateless across re-reads)", () => {
      const final = acct(MK, synthOu(MK, 17588395n, 10, false));
      expect(resolveFromReceipt(final, MK)).toBe("NO");
      expect(resolveFromReceipt(final, MK)).toBe("NO"); // re-reading never drifts to a provisional value
    });
  });

  // 3. OWN-GOAL. Which-side is a LABELED proxy only (no on-chain proof of scorer); the v1 PRIMARY OU
  //    "another goal" primitive counts a goal toward the total regardless of WHO scored, so an own-goal and a
  //    regular goal with the same line spawn the identical trustlessly-settleable market.
  describe("own-goal: OU primitive is attribution-agnostic; which-side stays a proxy", () => {
    it("own-goal vs regular goal with the same odds yield the identical OU primitive", () => {
      const regular = anotherGoalPrimitive(goal(7n, 55, 1, 0, [1.9, 1.95]));
      const ownGoal = anotherGoalPrimitive(goal(7n, 55, 0, 1, [1.9, 1.95])); // same line, goal credited to the other side
      expect(regular.fairYes).toBe(ownGoal.fairYes);
      expect(regular.kind).toBe(PrimitiveKind.OuAnotherGoal);
      expect(ownGoal.kind).toBe(PrimitiveKind.OuAnotherGoal);
    });
    it("the emitted v1 primitive is trustlessly settleable (OU), not a which-side proxy", () => {
      const prim = anotherGoalPrimitive(goal(7n, 55, 1, 0));
      expect(prim.trustlessSettleV1).toBe(true);
      expect(prim.kind).not.toBe(PrimitiveKind.NextGoalProxy);
    });
  });

  // 4. DOUBLE-GOAL-IN-TICK. The free ~60s poll can re-deliver the SAME goal frame -> a duplicate MUST NOT
  //    double-spawn (idempotent onGoal). A genuine second goal advances the score, so its signature differs
  //    and it correctly opens a fresh collision-free market (nonce increments).
  describe("double-goal-in-tick", () => {
    it("a duplicate re-delivery of the SAME frame is idempotent (one market, same id)", async () => {
      const t = new MemoryTransport();
      const f = new PropMarketFactory(t);
      const first = await f.onGoal(goal(17588395n, 23, 1, 0));
      const dup = await f.onGoal(goal(17588395n, 23, 1, 0)); // identical frame re-delivered by the poll
      expect(marketIdHex(dup.id)).toBe(marketIdHex(first.id));
      expect(f.listMarkets()).toHaveLength(1);
    });
    it("two genuine goals in the same minute (score advances) open two distinct markets", async () => {
      const t = new MemoryTransport();
      const f = new PropMarketFactory(t);
      const m1 = await f.onGoal(goal(17588395n, 45, 1, 0));
      const m2 = await f.onGoal(goal(17588395n, 45, 2, 0)); // a real 2nd goal, same minute, score 1-0 -> 2-0
      expect(marketIdHex(m1.id)).not.toBe(marketIdHex(m2.id));
      expect(m2.venueU64).toBe(deriveMarketId(17588395n, PrimitiveKind.OuAnotherGoal, 1).u64);
      expect(f.listMarkets()).toHaveLength(2);
    });
  });
});
