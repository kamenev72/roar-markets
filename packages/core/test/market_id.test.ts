import { describe, it, expect } from "vitest";
import { deriveMarketId, marketIdHex, PrimitiveKind } from "../src/factory/market_id.js";
import { PitchmakerBookClient } from "../src/venue/client.js";

describe("market_id contract", () => {
  it("is deterministic (same input -> same id)", () => {
    const a = deriveMarketId(17588395n, PrimitiveKind.OuAnotherGoal, 0);
    const b = deriveMarketId(17588395n, PrimitiveKind.OuAnotherGoal, 0);
    expect(marketIdHex(a)).toBe(marketIdHex(b));
    expect(a.u64).toBe(b.u64);
    expect(a.bytes.length).toBe(32);
  });

  it("bridges bytes[0..8] (little-endian) == u64 (the venue PDA seed form)", () => {
    const id = deriveMarketId(17588395n, PrimitiveKind.GoalTotal, 3);
    let le = 0n;
    for (let i = 0; i < 8; i++) le += BigInt(id.bytes[i]!) << BigInt(8 * i);
    expect(id.u64).toBe(le);
    expect(id.u64).toBeGreaterThanOrEqual(0n);
    expect(id.u64).toBeLessThan(1n << 64n);
  });

  it("is collision-free over a (fixture, kind, nonce) grid", () => {
    const seenHex = new Set<string>();
    const seenU64 = new Set<bigint>();
    const fixtures = [1n, 2n, 17588395n, 999_999_999n];
    const kinds = [PrimitiveKind.OuAnotherGoal, PrimitiveKind.GoalTotal, PrimitiveKind.NextGoalProxy];
    let n = 0;
    for (const f of fixtures) {
      for (const k of kinds) {
        for (let nonce = 0; nonce < 16; nonce++) {
          const id = deriveMarketId(f, k, nonce);
          const hex = marketIdHex(id);
          expect(seenHex.has(hex)).toBe(false);
          seenHex.add(hex);
          expect(seenU64.has(id.u64)).toBe(false);
          seenU64.add(id.u64);
          n++;
        }
      }
    }
    expect(n).toBe(fixtures.length * kinds.length * 16);
  });

  it("feeds the pitchmaker_book venue PDA derivation deterministically (the frozen seam)", () => {
    const client = new PitchmakerBookClient();
    const id = deriveMarketId(17588395n, PrimitiveKind.OuAnotherGoal, 0);
    const pda1 = client.venuePda(id.u64);
    const pda2 = client.venuePda(id.u64);
    expect(pda1.toBase58()).toBe(pda2.toBase58()); // same u64 -> same venue PDA
    expect(pda1.toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/); // a real base58 pubkey
    // distinct ids -> distinct venues
    const other = deriveMarketId(17588395n, PrimitiveKind.OuAnotherGoal, 1);
    expect(client.venuePda(other.u64).toBase58()).not.toBe(pda1.toBase58());
  });

  it("rejects an out-of-range nonce or fixtureId", () => {
    expect(() => deriveMarketId(1n, PrimitiveKind.OuAnotherGoal, -1)).toThrow();
    expect(() => deriveMarketId(1n, PrimitiveKind.OuAnotherGoal, 2 ** 33)).toThrow();
    expect(() => deriveMarketId(-1n, PrimitiveKind.OuAnotherGoal, 0)).toThrow();
  });
});
