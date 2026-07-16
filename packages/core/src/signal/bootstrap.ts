// Vendored verbatim from the PitchMaker repo (Apache-2.0; public-knowledge market-making math + an IDL-free Solana venue client). See NOTICE.
// Cold-start liquidity ladder. A day-1 WC market has no history and no
// liquidity → no traders → no liquidity (the cold-start tax). PitchMaker SEEDS it: a depth ladder of
// two-sided liquidity centred on the de-vigged consensus fair, with a CONSERVATIVE spread when the market
// is cold (no flow ⇒ more uncertainty) that TIGHTENS to the warm GLFT spread as the market is traded.
// This is the product a VENUE deploys (the buyer facing the cold-start tax), not a trader chasing alpha.
// Pure; quality/depth seeded, NEVER a $-PnL.

const clamp01 = (x: number, eps = 1e-9): number => Math.min(Math.max(x, eps), 1 - eps);

export interface BootstrapConfig {
  /** depth levels per side. */
  levels: number;
  /** the WARM half-spread (confidence=1), e.g. the GLFT c1. */
  baseHalfSpread: number;
  /** price step between adjacent depth levels. */
  levelStep: number;
  /** liquidity (shares) seeded per level. */
  sizePerLevel: number;
  /** extra spread multiplier at confidence=0 (cold). e.g. 2 ⇒ 3× the warm spread on day-1. */
  coldExtra: number;
}

export interface LadderLevel {
  level: number;
  bidPrice: number;
  askPrice: number;
  size: number;
}

/** Cold→warm spread multiplier: confidence 0 ⇒ 1+coldExtra (conservative), confidence 1 ⇒ 1 (warm). */
export function coldStartMultiplier(confidence: number, coldExtra: number): number {
  if (!(coldExtra >= 0)) throw new Error("coldStartMultiplier: coldExtra must be ≥ 0");
  return 1 + coldExtra * (1 - clamp01Conf(confidence));
}

const clamp01Conf = (c: number): number => Math.min(1, Math.max(0, c));

/** Seed a coherent two-sided depth ladder around the consensus `fair`, conservative when cold. */
export function bootstrapLadder(fair: number, confidence: number, cfg: BootstrapConfig): LadderLevel[] {
  if (!(cfg.levels >= 1)) throw new Error("bootstrapLadder: levels must be ≥ 1");
  if (!(cfg.baseHalfSpread > 0 && cfg.levelStep >= 0 && cfg.sizePerLevel > 0)) {
    throw new Error("bootstrapLadder: baseHalfSpread > 0, levelStep ≥ 0, sizePerLevel > 0 required");
  }
  const half = cfg.baseHalfSpread * coldStartMultiplier(confidence, cfg.coldExtra);
  const ladder: LadderLevel[] = [];
  for (let l = 0; l < cfg.levels; l++) {
    const d = half + l * cfg.levelStep;
    ladder.push({ level: l, bidPrice: clamp01(fair - d), askPrice: clamp01(fair + d), size: cfg.sizePerLevel });
  }
  return ladder;
}
