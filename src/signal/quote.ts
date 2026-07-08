// Vendored verbatim from the PitchMaker repo (Apache-2.0; public-knowledge market-making math + an IDL-free Solana venue client). See NOTICE.
/**
 * GLFT market-making quote kernel — pure, deterministic, price ∈ [0,1] (a probability).
 *
 * Closed form: Guéant, Lehalle & Fernández-Tapia (2013) "Dealing with the Inventory Risk"
 * (arXiv:1105.3115), Thm 1–2 + Prop 3. Finite-horizon terminal flatten: Cartea-Jaimungal-Penalva,
 * "Algorithmic and High-Frequency Trading" (2015) Ch.10. De-vig anchor:./devig.
 *
 * Two inventory mechanisms, both leaning to offload a long position (q>0) — a DELIBERATE superposition
 * that is a bounded HEURISTIC design choice, NOT a jointly-derived closed-form optimum (each TERM is
 * textbook; their SUM is our design, motivated by — not derived from — the two sources below):
 * - GLFT *stationary* skew via the asymmetric distances δ^a/δ^b (the c2·2q term) — horizon-FREE.
 * - Finite-horizon A-S *reservation lean* r = p − h(t)·q keyed to the whistle (Cartea-Jaimungal 2015
 * Ch.10), with a BOUNDED rate h(t) = h_floor + (η − h_floor)·(1−(T−t)/T)^κ that interpolates the
 * stationary GLFT floor h_floor=γσ² (early) → the terminal flatten rate η (last minutes). A match
 * resolves hard (no post-T liquidity), so inventory urgency GROWS toward T — but BOUNDED by η, not the
 * divergent γσ²/(T−t) it replaces (which blew up + clamped to ε near the whistle). NB: η is the terminal
 * LEAN-RATE (the reservation shifts by η·q at the whistle), i.e. an equivalent value-function penalty
 * −(η/2)·q² — NOT −η·q² (whose marginal would be 2η·q).
 *
 * Combined, the mid-quote skews as mid = (bid+ask)/2 = pFair − (h + 2·c2)·q: the A-S lean h AND the GLFT
 * distance skew 2·c2 stack (both offload a long position) — again, the STACK is a design choice, not a
 * proven joint optimum. At q=0 they vanish (mid = pFair, symmetric
 * distances), which is why the skew slope must be checked at q≠0 (see test/quote.test.ts). σ is the
 * per-EVENT realized vol of the probability path at the feed cadence — h_floor=γσ² and c2∝σ are calibrated
 * to that cadence (a different feed cadence rescales σ, hence the spread).
 *
 * Pure: identical args ⇒ identical output; no clock/RNG/global reads (t, T are arguments).
 */

import { proportionalDevig } from "./devig.js";

export type BinaryMode = "H_VS_NOTWIN" | "H_VS_A_DRAW_VOID";

export interface QuoteParams {
  /** signed net inventory; long > 0. */
  q: number;
  /** now / whistle, same time unit; 0 ≤ t ≤ T. */
  t: number;
  T: number;
  /** CARA risk aversion (> 0). */
  gamma: number;
  /** stdev of the de-vigged probability (arithmetic vol, > 0). NOT a variance. */
  sigma: number;
  /** fill intensity at touch (> 0) — λ(δ)=A·e^{−kδ}. A,k are CITED-LITERATURE PRIORS (Guéant/Lehalle/
   * Fernández-Tapia, arXiv:1105.3115), NOT calibrated from own fills (circular). The default A=8,k=60 is a
   * representative point in a robust region — `npm run sweep:ak` (src/sim/ak_sweep.ts) proves the kernel's
   * qualitative behaviour (bounded spread, inventory-skew sign, terminal flatten) holds across a plausible range. */
  A: number;
  /** fill-intensity decay (> 0) — see `A`; a cited-literature prior, validated by the A,k sweep. */
  k: number;
  /** venue tick (default 1e-3). */
  tick?: number;
  /** boundary epsilon (default 1e-9). */
  eps?: number;
  /** terminal inventory LEAN-RATE keyed to the whistle : the BOUNDED reservation-flatten rate the
   * lean grows toward at t→T (the reservation shifts by η·q at the whistle; equiv. penalty −(η/2)·q²).
   * Default 0.02; clamped up to the stationary floor γσ². */
  eta?: number;
  /** flatten ramp exponent (> 0): how late the terminal flatten concentrates. Default 2 (last ~30%). */
  kappa?: number;
  /** how the 3-way book collapses to YES/NO (default H_VS_NOTWIN: p = p[yesIndex]). */
  binaryMode?: BinaryMode;
  /** index of the YES selection in `odds` (default 0). */
  yesIndex?: number;
  /** index of the NO selection (only H_VS_A_DRAW_VOID; default last). */
  noIndex?: number;
}

export interface Quote {
  bid: number;
  ask: number;
  /** reservation price (inventory-leaned fair value). */
  reservation: number;
  /** de-vigged fair probability anchor. */
  pFair: number;
  c1: number;
  c2: number;
  /** terminal-flatten coefficient at this t. */
  h: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

/** GLFT spread coefficients. c1 = half-spread floor (γ,k only); c2 = inventory-skew slope. */
export function glftCoeffs(gamma: number, sigma: number, A: number, k: number): { c1: number; c2: number } {
  if (!(gamma > 0 && sigma > 0 && A > 0 && k > 0) || ![gamma, sigma, A, k].every(Number.isFinite)) {
    throw new Error("glftCoeffs: gamma, sigma, A, k must be finite and > 0");
  }
  const c1 = (1 / gamma) * Math.log(1 + gamma / k);
  const inner = ((sigma * sigma * gamma) / (2 * k * A)) * Math.pow(1 + gamma / k, 1 + k / gamma);
  const c2 = 0.5 * Math.sqrt(inner);
  return { c1, c2 };
}

/** De-vigged fair probability of the YES selection per the binary mode. */
export function fairProb(odds: number[], mode: BinaryMode, yesIndex: number, noIndex?: number): number {
  const { probs } = proportionalDevig(odds);
  const pYes = probs[yesIndex];
  if (pYes === undefined) throw new Error(`fairProb: yesIndex ${yesIndex} out of range`);
  if (mode === "H_VS_A_DRAW_VOID") {
    const ni = noIndex ?? odds.length - 1;
    const pNo = probs[ni];
    if (pNo === undefined || ni === yesIndex) throw new Error("fairProb: invalid noIndex for draw-void mode");
    return pYes / (pYes + pNo); // re-normalize on the 2-way support; draw voids
  }
  return pYes; // H_VS_NOTWIN: p_NO = 1 − p_YES
}

/** Compute a two-sided GLFT quote on a binary [0,1] market. */
export function quote(odds: number[], p: QuoteParams): Quote {
  const { q, t, T, gamma, sigma, A, k } = p;
  const tick = p.tick ?? 1e-3;
  const eps = p.eps ?? 1e-9;
  const mode = p.binaryMode ?? "H_VS_NOTWIN";
  const yesIndex = p.yesIndex ?? 0;
  if (!(T > 0) || !(t >= 0) || t > T || !Number.isFinite(t) || !Number.isFinite(T)) {
    throw new Error("quote: require finite 0 ≤ t ≤ T, T > 0");
  }
  if (!Number.isFinite(q)) throw new Error("quote: q must be finite");

  const pFair = fairProb(odds, mode, yesIndex, p.noIndex);
  const { c1, c2 } = glftCoeffs(gamma, sigma, A, k);

  // Finite-horizon terminal inventory lean (rate η; equiv. penalty −(η/2)·q²) keyed to the whistle
  // (Cartea-Jaimungal 2015 Ch.10).
  // The inventory-skew rate h(t) is BOUNDED and interpolates the stationary GLFT floor early →
  // the terminal flatten η in the last minutes — NO blow-up (the old γσ²/(T−t) diverged at t→T).
  const eta = p.eta ?? 0.02;
  const kappa = p.kappa ?? 2;
  const hFloor = gamma * sigma * sigma; // stationary A-S inventory-risk rate (the early skew baseline)
  const etaEff = Math.max(eta, hFloor); // the terminal penalty never undershoots the stationary floor
  const tau = Math.min(1, Math.max(0, (T - t) / T)); // fraction of the match remaining ∈ [0,1]
  const w = Math.pow(1 - tau, kappa); // terminal weight: 0 early (tau≈1) → 1 at the whistle (tau≈0)
  const h = hFloor + (etaEff - hFloor) * w; // bounded ∈ [hFloor, etaEff]
  const r = pFair - h * q;

  // GLFT asymmetric distances from the reservation.
  const deltaB = c1 + c2 * (2 * q + 1); // bid distance below r
  const deltaA = c1 + c2 * (1 - 2 * q); // ask distance above r
  let bid = r - deltaB;
  let ask = r + deltaA;

  // [0,1] clamp + non-cross re-assertion (clamping at extreme p can collapse the spread).
  bid = clamp(bid, eps, 1 - eps);
  ask = clamp(ask, eps, 1 - eps);
  if (ask - bid < tick) {
    const mid = clamp(r, eps + tick / 2, 1 - eps - tick / 2);
    bid = mid - tick / 2;
    ask = mid + tick / 2;
  }
  return { bid, ask, reservation: r, pFair, c1, c2, h };
}
