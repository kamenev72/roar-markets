// Fan-engagement streak + share taxonomy — pure, deterministic, and OUTSIDE the trust core (it consumes
// a result the complete binding gate already produced; it never touches verification). A streak rewards
// consecutive correct calls with a capped multiplier label; shares are demo artifacts, not receipt claims.

export interface StreakState {
  /** consecutive correct calls (0 when the last call missed). */
  streak: number;
  /** best streak this session/device. */
  best: number;
}

export const FRESH: StreakState = { streak: 0, best: 0 };

/** Capped multiplier: ×1.0 base, +0.2 per consecutive correct call, capped at ×2.0 (5+). Display-only. */
export function multiplier(streak: number): number {
  return Math.round((1 + 0.2 * Math.min(Math.max(streak, 0), 5)) * 10) / 10;
}

export function applyResult(s: StreakState, won: boolean): StreakState {
  const streak = won ? s.streak + 1 : 0;
  return { streak, best: Math.max(s.best, streak) };
}

/** The named verdict taxonomy — a win/loss gets a shareable NAME (clean-room, ours). */
export function verdictName(won: boolean, streak: number): string {
  if (!won) return "NEXT ONE"; // a miss resets — honest, not shameful
  if (streak >= 5) return "PERFECT ROAR";
  if (streak >= 3) return "ON A ROAR";
  return "CALLED IT";
}

/** A self-contained share string: the call, the named verdict, the streak, and the receipt reference. */
export function shareText(args: {
  won: boolean;
  pick: string;
  question: string;
  streak: number;
  receiptRef: string; // demo reference; not evidence that this result has a real receipt
}): string {
  const name = verdictName(args.won, args.streak);
  const mult = multiplier(args.streak);
  const head = args.won ? `✅ ${name}` : `❌ ${name}`;
  const run = args.won ? ` · streak ${args.streak} (×${mult.toFixed(1)})` : "";
  return `${head} — "${args.question}" → ${args.pick}${run}\nWalkthrough reference: ${args.receiptRef}. Open the historical proof in Roar Markets to re-check a real on-chain receipt.\n#RoarMarkets #WorldCup`;
}

/** localStorage persistence (device-local; no accounts, no backend — honest scope). */
export const STREAK_KEY = "propcast_streak_v1";
export function loadStreak(storage: Pick<Storage, "getItem"> | null): StreakState {
  try {
    const raw = storage?.getItem(STREAK_KEY);
    if (!raw) return FRESH;
    const p = JSON.parse(raw) as Partial<StreakState>;
    const streak = Number.isInteger(p.streak) && (p.streak as number) >= 0 ? (p.streak as number) : 0;
    const best = Number.isInteger(p.best) && (p.best as number) >= streak ? (p.best as number) : streak;
    return { streak, best };
  } catch {
    return FRESH;
  }
}
export function saveStreak(storage: Pick<Storage, "setItem"> | null, s: StreakState): void {
  try {
    storage?.setItem(STREAK_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode) — engagement is best-effort, never breaks the app */
  }
}
