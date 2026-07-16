import { describe, expect, it, vi } from "vitest";
import { createRecordCardModel, downloadRecordCard, renderRecordCard, safeCardText } from "../../../app/src/record_card.js";

const record = (id = "current", question = "Another goal?") => ({ id, question, pick: "YES" as const, outcome: "YES" as const, won: false, receiptRef: "walkthrough" });

describe("roar/record-card/v1", () => {
  it("builds a normalized bounded model with recomputed summary and current highlight", () => {
    const records = Array.from({ length: 21 }, (_, index) => record(String(index), index === 0 ? "Cafe\u0301" : "Another goal?"));
    const model = createRecordCardModel({ records }, 99, "0");
    expect(model.schema).toBe("roar/record-card/v1");
    expect(model.history).toHaveLength(20);
    expect(model.history[0]).toMatchObject({ question: "Café", won: true });
    expect(model.accuracy).toBe(100);
    expect(model.bestRun).toBe(20);
    expect(model.currentRecordId).toBe("0");
  });

  it("rejects runtime-invalid sides and does not split emoji at field boundaries", () => {
    const invalid = { ...record(), pick: "yes" } as unknown as ReturnType<typeof record>;
    const model = createRecordCardModel({ records: [invalid, record("emoji", `${"a".repeat(159)}😀tail`)] }, 1, "emoji");
    expect(model.history).toHaveLength(1);
    expect(model.history[0]?.question.endsWith("😀")).toBe(true);
    expect(safeCardText(`${"a".repeat(119)}😀tail`, 120).endsWith("😀")).toBe(true);
    expect(() => renderRecordCard({ schema: "roar/record-card/v1", history: [invalid], accuracy: 100, bestRun: 1, currentRecordId: "current" })).toThrow(/valid record/);
  });

  it("renders deterministic parseable SVG with hostile text inert", () => {
    const corpus = `<script>alert(1)</script><foreignObject/><style>@import url(x)</style><a href="javascript:x">x</a>\u0000\ud800\ufffe\uffff`;
    const model = createRecordCardModel({ records: [record("current", corpus)] }, 1, "current");
    const first = renderRecordCard(model);
    expect(first).toBe(renderRecordCard(model));
    expect(first).toContain("&lt;script&gt;");
    expect(first).toContain("SIMULATED WALKTHROUGH");
    expect(first).toContain("THIS BROWSER ONLY");
    expect(first).toContain("NO PRIZE");
    expect(first).not.toMatch(/<(?:style|foreignObject|script|a)\b|<[^>]+\shref=|\u0000|\ud800|\ufffe|\uffff/i);
  });

  it("downloads with the exact MIME and deferred cleanup", () => {
    const revoke = vi.fn(); const click = vi.fn(); const remove = vi.fn();
    let blob: Blob | undefined; let deferred: (() => void) | undefined;
    const ok = downloadRecordCard("<svg/>", { Blob, createObjectURL: (value) => { blob = value; return "blob:record"; }, revokeObjectURL: revoke, createAnchor: () => ({ href: "", download: "", click, remove }), append: vi.fn(), defer: (fn) => { deferred = fn; } });
    expect(ok).toBe(true);
    expect(blob?.type).toBe("image/svg+xml;charset=utf-8");
    expect(remove).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    deferred?.();
    expect(revoke).toHaveBeenCalledWith("blob:record");
  });

  it.each(["createAnchor", "append", "click"] as const)("cleans up when %s fails", (failure) => {
    const revoke = vi.fn(); const remove = vi.fn();
    const fail = () => { throw new Error(failure); };
    const ok = downloadRecordCard("<svg/>", { Blob, createObjectURL: () => "blob:record", revokeObjectURL: revoke,
      createAnchor: failure === "createAnchor" ? fail : () => ({ href: "", download: "", click: failure === "click" ? fail : () => {}, remove }),
      append: failure === "append" ? fail : () => {}, defer: () => {} });
    expect(ok).toBe(false);
    expect(revoke).toHaveBeenCalledWith("blob:record");
    if (failure !== "createAnchor") expect(remove).toHaveBeenCalledOnce();
  });

  it("survives remove, deferred scheduling, and deferred revoke failures", () => {
    const revoke = vi.fn(() => { throw new Error("revoke"); });
    expect(downloadRecordCard("<svg/>", { Blob, createObjectURL: () => "blob:x", revokeObjectURL: revoke, createAnchor: () => ({ href: "", download: "", click: () => {}, remove: () => { throw new Error("remove"); } }), append: () => {}, defer: () => { throw new Error("defer"); } })).toBe(true);
    expect(revoke).toHaveBeenCalledWith("blob:x");
  });
});
