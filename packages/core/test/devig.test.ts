// Vendored verbatim from the PitchMaker repo (Apache-2.0; public-knowledge market-making math + an IDL-free Solana venue client). See NOTICE.
import { describe, it, expect } from "vitest";
import { proportionalDevig, binaryProb } from "../src/signal/devig.js";

const close = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) < eps;

describe("proportionalDevig", () => {
  it("3-way book de-vigs to probabilities summing to 1", () => {
    const { probs, overround } = proportionalDevig([2.1, 3.4, 3.55]);
    expect(close(probs.reduce((a, b) => a + b, 0), 1)).toBe(true);
    expect(overround).toBeGreaterThan(1); // there is a vig
    expect(close(probs[0]!, 0.4527, 2e-3)).toBe(true);
    expect(close(probs[1]!, 0.2796, 2e-3)).toBe(true);
    expect(close(probs[2]!, 0.2677, 2e-3)).toBe(true);
  });

  it("fair 2-way book → 0.5 / 0.5", () => {
    const { probs, overround } = proportionalDevig([2.0, 2.0]);
    expect(close(probs[0]!, 0.5)).toBe(true);
    expect(close(probs[1]!, 0.5)).toBe(true);
    expect(close(overround, 1.0)).toBe(true); // no vig at 2.0/2.0
  });

  it("higher overround → larger vig, still sums to 1", () => {
    const { probs, overround } = proportionalDevig([1.8, 1.8]); // implied 0.555*2 = 1.111
    expect(close(overround, 1.1111, 1e-3)).toBe(true);
    expect(close(probs[0]! + probs[1]!, 1)).toBe(true);
    expect(close(probs[0]!, 0.5)).toBe(true);
  });

  it("rejects invalid odds", () => {
    expect(() => proportionalDevig([])).toThrow();
    expect(() => proportionalDevig([1.0, 2.0])).toThrow(); // odds must be > 1
    expect(() => proportionalDevig([2.0, Infinity])).toThrow();
  });
});

describe("binaryProb", () => {
  it("extracts one selection's fair prob", () => {
    expect(close(binaryProb([2.1, 3.4, 3.55], 0), 0.4527, 2e-3)).toBe(true);
    // Over/Under example: Over 1.9, Under 1.9 → 0.5
    expect(close(binaryProb([1.9, 1.9], 0), 0.5)).toBe(true);
  });
  it("rejects out-of-range index", () => {
    expect(() => binaryProb([1.9, 1.9], 5)).toThrow();
  });
});
