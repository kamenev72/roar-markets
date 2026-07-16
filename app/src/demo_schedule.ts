// Deterministic shareable replay — `?demo=<seconds>` compresses the whole walkthrough (spawn → pick →
// settle → share) into a fixed schedule a judge can self-serve from one link, no narration, no live match
// needed. Pure schedule derivation (testable); the component only executes the returned timeline. The UI
// shows an explicit "● REPLAY" badge while active — the honest dual-mode signal (never passed off as live).

export type DemoAction = "spawn" | "pick_yes" | "settle";

export interface DemoStep {
  /** milliseconds from replay start. */
  atMs: number;
  action: DemoAction;
}

export const DEMO_MIN_SECONDS = 6;
export const DEMO_MAX_SECONDS = 300;

/** Parse `?demo=<seconds>` (null when absent/invalid). Clamped to [6s, 300s]. */
export function parseDemoParam(search: string): number | null {
  const v = new URLSearchParams(search).get("demo");
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.max(Math.round(n), DEMO_MIN_SECONDS), DEMO_MAX_SECONDS);
}

/** The fixed proportional timeline: spawn at 1/6, pick at 3/6, settle at 5/6 of the window. */
export function demoSchedule(totalSeconds: number): DemoStep[] {
  const t = totalSeconds * 1000;
  return [
    { atMs: Math.round(t / 6), action: "spawn" },
    { atMs: Math.round(t / 2), action: "pick_yes" },
    { atMs: Math.round((5 * t) / 6), action: "settle" },
  ];
}
