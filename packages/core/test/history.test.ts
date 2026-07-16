import { describe, expect, it } from "vitest";
import { accuracy, appendCall, EMPTY_HISTORY, HISTORY_LIMIT, loadHistory } from "../../../app/src/history.js";
const call = (id: string, won = true) => ({ id, question: "Another goal?", pick: "YES" as const, outcome: won ? "YES" as const : "NO" as const, won, receiptRef: "demo" });
describe("device-local call history", () => {
  it("is bounded, newest-first, and de-duplicates ids", () => {
    let history = EMPTY_HISTORY;
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) history = appendCall(history, call(String(i)));
    history = appendCall(history, call("10", false));
    expect(history.records).toHaveLength(HISTORY_LIMIT);
    expect(history.records[0]).toMatchObject({ id: "10", won: false });
    expect(history.records.filter((row) => row.id === "10")).toHaveLength(1);
  });
  it("computes accuracy and rejects malformed storage rows", () => {
    expect(accuracy(EMPTY_HISTORY)).toBeNull();
    expect(accuracy({ records: [call("1"), call("2", false)] })).toBe(50);
    const loaded = loadHistory({ getItem: () => JSON.stringify({ records: [call("ok"), { won: true }] }) });
    expect(loaded.records).toHaveLength(1);
  });
});
