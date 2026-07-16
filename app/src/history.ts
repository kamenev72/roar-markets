export type CallSide = "YES" | "NO";
export interface CallRecord { readonly id: string; readonly question: string; readonly pick: CallSide; readonly outcome: CallSide; readonly won: boolean; readonly receiptRef: string }
export interface CallHistory { readonly records: readonly CallRecord[] }
export const HISTORY_LIMIT = 20;
export const EMPTY_HISTORY: CallHistory = { records: [] };
const KEY = "roar_call_history_v1";

function validRecord(value: unknown): value is CallRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<CallRecord>;
  return typeof row.id === "string" && typeof row.question === "string"
    && (row.pick === "YES" || row.pick === "NO") && (row.outcome === "YES" || row.outcome === "NO")
    && typeof row.won === "boolean" && typeof row.receiptRef === "string";
}
export function appendCall(history: CallHistory, record: CallRecord): CallHistory {
  return { records: [record, ...history.records.filter((row) => row.id !== record.id)].slice(0, HISTORY_LIMIT) };
}
export function accuracy(history: CallHistory): number | null {
  return history.records.length ? Math.round(100 * history.records.filter((row) => row.won).length / history.records.length) : null;
}
export function loadHistory(storage: Pick<Storage, "getItem"> | null): CallHistory {
  try {
    const parsed = JSON.parse(storage?.getItem(KEY) ?? "null") as { records?: unknown } | null;
    if (!parsed || !Array.isArray(parsed.records)) return EMPTY_HISTORY;
    return { records: parsed.records.filter(validRecord).slice(0, HISTORY_LIMIT) };
  } catch { return EMPTY_HISTORY; }
}
export function saveHistory(storage: Pick<Storage, "setItem"> | null, history: CallHistory): void {
  try { storage?.setItem(KEY, JSON.stringify(history)); } catch { /* best-effort device storage */ }
}
