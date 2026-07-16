export type CallSide = "YES" | "NO";
export interface CallRecord { readonly id: string; readonly question: string; readonly pick: CallSide; readonly outcome: CallSide; readonly won: boolean; readonly receiptRef: string }
export interface CallHistory { readonly records: readonly CallRecord[] }
export const HISTORY_LIMIT = 20;
export const EMPTY_HISTORY: CallHistory = { records: [] };
export const HISTORY_KEY = "roar_call_history_v1";
const MAX_ID = 80, MAX_QUESTION = 160, MAX_RECEIPT = 160;

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.normalize("NFC"); let result = "";
  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && normalized.charCodeAt(i + 1) >= 0xdc00 && normalized.charCodeAt(i + 1) <= 0xdfff) { result += normalized.charAt(i) + normalized.charAt(i + 1); i += 1; }
    else if (code < 0xd800 || code > 0xdfff) { if ((code === 9 || code === 10 || code === 13 || code >= 32) && code !== 0xfffe && code !== 0xffff) result += normalized[i]; }
  }
  return Array.from(result.trim()).slice(0, max).join("");
}
function side(value: unknown): CallSide | null { return value === "YES" || value === "NO" ? value : null; }

export function normalizeRecord(value: unknown): CallRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<CallRecord>;
  const pick = side(row.pick), outcome = side(row.outcome);
  const id = cleanText(row.id, MAX_ID), question = cleanText(row.question, MAX_QUESTION), receiptRef = cleanText(row.receiptRef, MAX_RECEIPT);
  return id && question && receiptRef && pick && outcome ? { id, question, pick, outcome, won: pick === outcome, receiptRef } : null;
}
export function normalizeHistory(value: unknown): CallHistory {
  if (!value || typeof value !== "object" || !Array.isArray((value as { records?: unknown }).records)) return EMPTY_HISTORY;
  const seen = new Set<string>();
  const records = ((value as { records: unknown[] }).records).map(normalizeRecord)
    .filter((record): record is CallRecord => record !== null)
    .filter((record) => !seen.has(record.id) && (seen.add(record.id), true)).slice(0, HISTORY_LIMIT);
  return { records };
}
export function appendCall(history: CallHistory, record: CallRecord): CallHistory {
  const normalized = normalizeRecord(record);
  return normalized ? { records: [normalized, ...history.records.filter((row) => row.id !== normalized.id)].slice(0, HISTORY_LIMIT) } : history;
}
export function accuracy(history: CallHistory): number | null {
  return history.records.length ? Math.round(100 * history.records.filter((row) => row.won).length / history.records.length) : null;
}
export function loadHistory(storage: Pick<Storage, "getItem"> | null): CallHistory {
  try {
    const parsed = JSON.parse(storage?.getItem(HISTORY_KEY) ?? "null") as { records?: unknown } | null;
    return normalizeHistory(parsed);
  } catch { return EMPTY_HISTORY; }
}
export function saveHistory(storage: Pick<Storage, "setItem"> | null, history: CallHistory): void {
  try { storage?.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* best-effort device storage */ }
}
