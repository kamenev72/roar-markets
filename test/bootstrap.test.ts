// Vendored verbatim from the PitchMaker repo (Apache-2.0; public-knowledge market-making math + an IDL-free Solana venue client). See NOTICE.
import { describe, it, expect } from "vitest";
import { bootstrapLadder, coldStartMultiplier, type BootstrapConfig } from "../src/signal/bootstrap.js";

const cfg: BootstrapConfig = { levels: 4, baseHalfSpread: 0.02, levelStep: 0.01, sizePerLevel: 10, coldExtra: 2 };

describe("cold-start liquidity ladder", () => {
  it("coldStartMultiplier: cold (conf 0) = 1+coldExtra; warm (conf 1) = 1; clamped", () => {
    expect(coldStartMultiplier(0, 2)).toBe(3);
    expect(coldStartMultiplier(1, 2)).toBe(1);
    expect(coldStartMultiplier(-5, 2)).toBe(3); // clamped to conf 0
    expect(coldStartMultiplier(0.5, 2)).toBe(2);
  });

  it("seeds a coherent two-sided ladder: bid < fair < ask, monotone step-out, size>0", () => {
    const L = bootstrapLadder(0.5, 0.5, cfg);
    expect(L.length).toBe(4);
    let prevBid = Infinity;
    let prevAsk = -Infinity;
    for (const lv of L) {
      expect(lv.bidPrice).toBeLessThan(0.5);
      expect(lv.askPrice).toBeGreaterThan(0.5);
      expect(lv.size).toBeGreaterThan(0);
      expect(lv.bidPrice).toBeLessThan(prevBid); // bids step DOWN with depth
      expect(lv.askPrice).toBeGreaterThan(prevAsk); // asks step UP with depth
      prevBid = lv.bidPrice;
      prevAsk = lv.askPrice;
    }
  });

  it("a COLD market quotes a strictly WIDER touch than a WARM one", () => {
    const cold = bootstrapLadder(0.5, 0, cfg)[0]!;
    const warm = bootstrapLadder(0.5, 1, cfg)[0]!;
    expect(cold.askPrice - cold.bidPrice).toBeGreaterThan(warm.askPrice - warm.bidPrice);
    // warm touch half-spread = the base (the GLFT optimum); cold = 3× it
    expect(warm.askPrice - warm.bidPrice).toBeCloseTo(2 * cfg.baseHalfSpread, 9);
    expect(cold.askPrice - cold.bidPrice).toBeCloseTo(2 * cfg.baseHalfSpread * 3, 9);
  });

  it("levels=1 ⇒ top-of-book; the touch half-spread is never below the warm floor", () => {
    const top = bootstrapLadder(0.5, 1, { ...cfg, levels: 1 });
    expect(top.length).toBe(1);
    expect((top[0]!.askPrice - top[0]!.bidPrice) / 2).toBeGreaterThanOrEqual(cfg.baseHalfSpread - 1e-12);
  });

  it("clamps levels at an extreme fair (a heavy favourite) without crossing", () => {
    const L = bootstrapLadder(0.985, 0, cfg);
    for (const lv of L) {
      expect(lv.bidPrice).toBeGreaterThan(0);
      expect(lv.askPrice).toBeLessThan(1);
      expect(lv.bidPrice).toBeLessThan(lv.askPrice);
    }
  });
});
