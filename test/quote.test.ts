// Vendored verbatim from the PitchMaker repo (Apache-2.0; public-knowledge market-making math + an IDL-free Solana venue client). See NOTICE.
import { describe, it, expect } from "vitest";
import { quote, glftCoeffs, fairProb, type QuoteParams } from "../src/signal/quote.js";

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// Base params: γ=2, σ=0.05, A=1, k=20 → c1≈0.0477, c2≈0.00944, spread≈0.114. T = 90min.
const base = (over: Partial<QuoteParams> = {}): QuoteParams => ({
  q: 0, t: 0, T: 5400, gamma: 2, sigma: 0.05, A: 1, k: 20, ...over,
});
const OU = [1.9, 1.9]; // Over/Under, fair p = 0.5

describe("fairProb / de-vig anchor (property 1)", () => {
  it("binary H_VS_NOTWIN: p_yes + p_no = 1", () => {
    const p = fairProb([2.1, 3.4, 3.55], "H_VS_NOTWIN", 0);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
    expect(close(p, 0.4527, 2e-3)).toBe(true);
  });
  it("draw-void re-normalizes on the 2-way support", () => {
    const p = fairProb([2.1, 3.4, 3.55], "H_VS_A_DRAW_VOID", 0, 2); // home vs away, draw void
    const pH = 1 / 2.1, pA = 1 / 3.55;
    expect(close(p, pH / (pH + pA), 1e-12)).toBe(true);
  });
});

describe("glftCoeffs (property 10: c1/c2 sensitivity)", () => {
  it("c1 depends only on γ,k (not σ,A)", () => {
    const a = glftCoeffs(2, 0.05, 1, 20).c1;
    const b = glftCoeffs(2, 0.99, 50, 20).c1;
    expect(close(a, b)).toBe(true);
    expect(close(a, 0.5 * Math.log(1.1), 1e-9)).toBe(true);
  });
  it("c2 increases with σ and γ, decreases with A and k", () => {
    const c = glftCoeffs(2, 0.05, 1, 20).c2;
    expect(glftCoeffs(2, 0.10, 1, 20).c2).toBeGreaterThan(c); // σ↑
    expect(glftCoeffs(4, 0.05, 1, 20).c2).toBeGreaterThan(c); // γ↑
    expect(glftCoeffs(2, 0.05, 2, 20).c2).toBeLessThan(c);    // A↑
    expect(glftCoeffs(2, 0.05, 1, 40).c2).toBeLessThan(c);    // k↑
  });
  it("rejects non-positive params", () => {
    expect(() => glftCoeffs(0, 0.05, 1, 20)).toThrow();
    expect(() => glftCoeffs(2, -1, 1, 20)).toThrow();
  });
});

describe("quote (GLFT)", () => {
  it("property 2: q=0 symmetric about p; r==p", () => {
    const Q = quote(OU, base({ q: 0 }));
    expect(close(Q.reservation, Q.pFair, 1e-9)).toBe(true);
    expect(close(Q.ask - Q.pFair, Q.pFair - Q.bid, 1e-9)).toBe(true);
  });

  it("property 3: q>0 ⇒ ask tighter than bid (distance from reservation)", () => {
    const Q = quote(OU, base({ q: 1 }));
    const dA = Q.ask - Q.reservation;
    const dB = Q.reservation - Q.bid;
    expect(dA).toBeLessThan(dB);
    // mirror: q<0 ⇒ bid tighter
    const Q2 = quote(OU, base({ q: -1 }));
    expect(Q2.reservation - Q2.bid).toBeLessThan(Q2.ask - Q2.reservation);
  });

  it("property 4: reservation leans to sell when long", () => {
    expect(quote(OU, base({ q: 2 })).reservation).toBeLessThan(0.5);
    expect(quote(OU, base({ q: -2 })).reservation).toBeGreaterThan(0.5);
    expect(close(quote(OU, base({ q: 0 })).reservation, 0.5)).toBe(true);
  });

  it("property 5: spread = 2c1+2c2, q-invariant (no clamp)", () => {
    const { c1, c2 } = glftCoeffs(2, 0.05, 1, 20);
    const expected = 2 * c1 + 2 * c2;
    for (const q of [-2, -1, 0, 1, 2]) {
      const Q = quote(OU, base({ q }));
      expect(close(Q.ask - Q.bid, expected, 1e-7)).toBe(true);
    }
  });

  it("property 6: bid and ask both decrease as q increases", () => {
    let prevBid = Infinity, prevAsk = Infinity;
    for (const q of [-3, -2, -1, 0, 1, 2, 3]) {
      const Q = quote(OU, base({ q }));
      expect(Q.bid).toBeLessThan(prevBid);
      expect(Q.ask).toBeLessThan(prevAsk);
      prevBid = Q.bid; prevAsk = Q.ask;
    }
  });

  it("property 7: terminal flatten grows toward the whistle (anti-A-S)", () => {
    const lean = (t: number) => {
      const Q = quote(OU, base({ q: 1, t }));
      return Math.abs(Q.reservation - Q.pFair);
    };
    const l0 = lean(0), lMid = lean(2700), lEnd = lean(5400);
    expect(lMid).toBeGreaterThan(l0);
    expect(lEnd).toBeGreaterThan(lMid);
    // anti-A-S regression: the lean does NOT vanish at t→T (it grows). An A-S skew γσ²(T−t)q → 0.
    expect(lEnd).toBeGreaterThan(0);
    const asSkew = base().gamma * base().sigma ** 2 * (5400 - 5400) * 1; // = 0
    expect(lEnd).toBeGreaterThan(asSkew);
  });

  it("property 8: clamp holds at extreme p (non-cross re-assertion fires)", () => {
    const extreme = [1.002, 200]; // p_yes ≈ 0.995
    const Q = quote(extreme, base({ q: 0 }));
    expect(Q.pFair).toBeGreaterThan(0.99);
    expect(Q.bid).toBeGreaterThan(0);
    expect(Q.ask).toBeLessThan(1);
    expect(Q.bid).toBeLessThan(Q.ask);
    expect(Q.ask - Q.bid).toBeGreaterThanOrEqual(1e-3 - 1e-12);
  });

  it("property 9: deterministic / pure", () => {
    const a = quote(OU, base({ q: 1.5, t: 1234 }));
    const b = quote(OU, base({ q: 1.5, t: 1234 }));
    expect(a).toEqual(b);
  });

  it("always returns a valid non-crossed quote on [0,1]", () => {
    for (const odds of [OU, [2.1, 3.4, 3.55], [1.05, 12], [50, 1.02]]) {
      for (const q of [-5, 0, 5]) {
        for (const t of [0, 2700, 5400]) {
          const Q = quote(odds, base({ q, t }));
          expect(Q.bid).toBeGreaterThan(0);
          expect(Q.ask).toBeLessThan(1);
          expect(Q.bid).toBeLessThan(Q.ask);
        }
      }
    }
  });
});

describe("GLFT bounded terminal penalty (P-H4)", () => {
  const hFloor = 2 * 0.05 ** 2; // base γσ² = 0.005

  it("h is BOUNDED by η at every t (no divergence) — fixes the old γσ²/(T−t) blow-up", () => {
    const eta = 0.02;
    for (const t of [0, 1, 2700, 5399, 5400]) {
      const Q = quote(OU, base({ q: 1, t, eta }));
      expect(Q.h).toBeLessThanOrEqual(eta + 1e-12); // bounded — never diverges
      expect(Q.h).toBeGreaterThanOrEqual(hFloor - 1e-12); // ≥ the stationary floor
    }
  });

  it("the terminal lean grows toward the whistle and a higher η flattens harder", () => {
    const low = quote(OU, base({ q: 2, t: 5400, eta: 0.01 }));
    const high = quote(OU, base({ q: 2, t: 5400, eta: 0.05 }));
    expect(high.reservation).toBeLessThan(low.reservation); // stronger η ⇒ harder sell-lean at the whistle
    expect(high.h).toBeGreaterThan(low.h);
    // early (t=0) the lean is the stationary floor regardless of η
    expect(close(quote(OU, base({ q: 1, t: 0, eta: 0.05 })).h, hFloor)).toBe(true);
  });

  it("η below the stationary floor γσ² is clamped up to the floor", () => {
    expect(close(quote(OU, base({ q: 1, t: 5400, eta: 0 })).h, hFloor, 1e-9)).toBe(true);
  });

  it("κ shapes how late the flatten concentrates (higher κ ⇒ smaller mid-match lean)", () => {
    const k2 = quote(OU, base({ q: 2, t: 2700, eta: 0.05, kappa: 2 }));
    const k4 = quote(OU, base({ q: 2, t: 2700, eta: 0.05, kappa: 4 }));
    expect(k4.h).toBeLessThan(k2.h);
  });

  // Pins the DELIBERATE superposition the doc-string describes (§16 KERNEL-MATH-CLOSEOUT): inventory is
  // leaned by TWO stacking mechanisms — the A-S reservation lean h·q AND the GLFT distance skew 2·c2·q —
  // so the combined mid-skew slope is −(h+2·c2). At q=0 both vanish, which is why the slope is checked at q≠0.
  it("pins the two inventory mechanisms at q≠0: the A-S lean (h·q) + the GLFT distance skew (2·c2·q) stack", () => {
    const q = 2;
    const Q = quote(OU, base({ q })); // t=0 ⇒ h = h_floor = γσ² (the stationary lean rate)
    const mid = (Q.bid + Q.ask) / 2;
    // 1) the A-S reservation lean: r = pFair − h·q
    expect(close(Q.reservation, Q.pFair - Q.h * q)).toBe(true);
    // 2) the GLFT asymmetric-distance skew: mid − r = −2·c2·q
    expect(close(mid - Q.reservation, -2 * Q.c2 * q)).toBe(true);
    // 3) the COMBINED mid-skew slope: mid − pFair = −(h + 2·c2)·q (the two mechanisms stack — NOT the
    //    single-mechanism textbook GLFT, which carries the skew entirely in the distances)
    expect(close(mid - Q.pFair, -(Q.h + 2 * Q.c2) * q)).toBe(true);
    // 4) at q=0 both mechanisms vanish: mid = pFair, symmetric bid/ask distances
    const Q0 = quote(OU, base({ q: 0 }));
    expect(close((Q0.bid + Q0.ask) / 2, Q0.pFair)).toBe(true);
    expect(close(Q0.ask - Q0.reservation, Q0.reservation - Q0.bid)).toBe(true);
  });
});
