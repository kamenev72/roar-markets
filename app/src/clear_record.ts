import { HISTORY_KEY } from "./history.js";
import { STREAK_KEY } from "./streak.js";

type ClearStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type ClearResult =
  | { readonly kind: "cleared" }
  | { readonly kind: "restored"; readonly history: string | null; readonly streak: string | null }
  | { readonly kind: "partial"; readonly history: string | null; readonly streak: string | null }
  | { readonly kind: "failed-unknown" };

/** Clears both private-record keys as one best-effort unit and rolls back partial failure. */
export function clearPrivateStorage(storage: ClearStorage): ClearResult {
  let history: string | null;
  let streak: string | null;
  try { history = storage.getItem(HISTORY_KEY); streak = storage.getItem(STREAK_KEY); } catch { return { kind: "failed-unknown" }; }
  try {
    storage.removeItem(HISTORY_KEY);
    storage.removeItem(STREAK_KEY);
    if (storage.getItem(HISTORY_KEY) !== null || storage.getItem(STREAK_KEY) !== null) throw new Error("storage keys remain");
    return { kind: "cleared" };
  } catch {
    try {
      if (history === null) storage.removeItem(HISTORY_KEY); else storage.setItem(HISTORY_KEY, history);
      if (streak === null) storage.removeItem(STREAK_KEY); else storage.setItem(STREAK_KEY, streak);
    } catch { /* readback below determines the truthful result */ }
    try {
      const actualHistory = storage.getItem(HISTORY_KEY), actualStreak = storage.getItem(STREAK_KEY);
      return actualHistory === history && actualStreak === streak
        ? { kind: "restored", history: actualHistory, streak: actualStreak }
        : { kind: "partial", history: actualHistory, streak: actualStreak };
    } catch { return { kind: "failed-unknown" }; }
  }
}
