// Vendored verbatim from the PitchMaker repo (Apache-2.0; public-knowledge market-making math + an IDL-free Solana venue client). See NOTICE.
/**
 * De-vig: turn a bookmaker's decimal-odds book into fair probabilities.
 *
 * Pure, deterministic, no I/O. Public-knowledge method (proportional overround removal):
 * implied prob qᵢ = 1/oᵢ; the book sums to the overround M = Σ qᵢ ≥ 1 (the vig); the fair
 * probability is pᵢ = qᵢ / M, which sums to exactly 1. This IS a vig removal (M ≥ 1) — NOT an assumption the
 * line is already vig-free. Proportional/uniform-overround is the simplest, most TRANSPARENT de-vig; it is
 * known to mildly OVER-WEIGHT favourites vs Shin / power-method de-vig (which model a non-uniform overround),
 * and is chosen deliberately for transparency (no Shin/power assumption baked in), not because it is the most
 * accurate. See `docs/MATH_MAP.md`.
 *
 * For a binary prediction market we then take the single selection's p (e.g. p_YES = "Over").
 */

export interface DevigResult {
  /** Fair probabilities, summing to 1. Same order as the input odds. */
  probs: number[];
  /** Booksum / overround M = Σ 1/oᵢ (≥ 1; the vig is M − 1). */
  overround: number;
}

/** Proportional de-vig of a decimal-odds book. Throws if any odd ≤ 1 or the book is empty. */
export function proportionalDevig(decimalOdds: number[]): DevigResult {
  if (decimalOdds.length === 0) {
    throw new Error("devig: empty odds book");
  }
  for (const o of decimalOdds) {
    if (!(o > 1) || !Number.isFinite(o)) {
      throw new Error(`devig: decimal odds must be finite and > 1, got ${o}`);
    }
  }
  const implied = decimalOdds.map((o) => 1 / o);
  const overround = implied.reduce((a, b) => a + b, 0);
  const probs = implied.map((q) => q / overround);
  return { probs, overround };
}

/** Fair probability of one selection (by index) after de-vig — the binary p for the maker kernel. */
export function binaryProb(decimalOdds: number[], yesIndex: number): number {
  const { probs } = proportionalDevig(decimalOdds);
  const p = probs[yesIndex];
  if (p === undefined) {
    throw new Error(`devig: yesIndex ${yesIndex} out of range for ${decimalOdds.length} selections`);
  }
  return p;
}
