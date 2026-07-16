// Engagement + replay libs are pure and OUTSIDE the trust core — locked here: streak math, the named
// share taxonomy, storage resilience, and the deterministic ?demo= schedule.

import { describe, it, expect } from "vitest";
import { FRESH, applyResult, multiplier, verdictName, shareText, loadStreak, saveStreak } from "../app/src/streak.js";
import { parseDemoParam, demoSchedule, DEMO_MIN_SECONDS, DEMO_MAX_SECONDS } from "../app/src/demo_schedule.js";

describe("streak", () => {
  it("increments on a win, resets on a loss, tracks best", () => {
    let s = FRESH;
    s = applyResult(s, true); s = applyResult(s, true); s = applyResult(s, true);
    expect(s).toEqual({ streak: 3, best: 3 });
    s = applyResult(s, false);
    expect(s).toEqual({ streak: 0, best: 3 });
  });

  it("multiplier is ×1.0 base, +0.2 per win, capped ×2.0", () => {
    expect(multiplier(0)).toBe(1.0);
    expect(multiplier(1)).toBe(1.2);
    expect(multiplier(5)).toBe(2.0);
    expect(multiplier(50)).toBe(2.0);
  });

  it("verdict names escalate with the run and a miss is honestly named", () => {
    expect(verdictName(true, 1)).toBe("CALLED IT");
    expect(verdictName(true, 3)).toBe("ON A ROAR");
    expect(verdictName(true, 5)).toBe("PERFECT ROAR");
    expect(verdictName(false, 0)).toBe("NEXT ONE");
  });

  it("shareText carries the verdict, the streak multiplier, and the receipt reference", () => {
    const t = shareText({ won: true, pick: "YES", question: "Another goal after 1–0?", streak: 3, receiptRef: "9xAb…" });
    expect(t).toContain("ON A ROAR");
    expect(t).toContain("×1.6");
    expect(t).toContain("9xAb…");
    expect(t).toContain("re-check");
    expect(t).toContain("#RoarMarkets");
  });

  it("loadStreak survives garbage storage (fail-open to FRESH, never throws)", () => {
    expect(loadStreak(null)).toEqual(FRESH);
    expect(loadStreak({ getItem: () => "not json" })).toEqual(FRESH);
    expect(loadStreak({ getItem: () => JSON.stringify({ streak: -5, best: "x" }) })).toEqual(FRESH);
    const good = { getItem: () => JSON.stringify({ streak: 2, best: 4 }) };
    expect(loadStreak(good)).toEqual({ streak: 2, best: 4 });
    // saveStreak never throws even on a broken storage
    saveStreak({ setItem: () => { throw new Error("quota"); } }, FRESH);
  });
});

describe("?demo= replay schedule", () => {
  it("parses and clamps the param", () => {
    expect(parseDemoParam("?demo=90")).toBe(90);
    expect(parseDemoParam("?demo=1")).toBe(DEMO_MIN_SECONDS);
    expect(parseDemoParam("?demo=99999")).toBe(DEMO_MAX_SECONDS);
    expect(parseDemoParam("?demo=abc")).toBeNull();
    expect(parseDemoParam("?other=1")).toBeNull();
  });

  it("derives the deterministic 3-step timeline (spawn -> pick -> settle)", () => {
    const steps = demoSchedule(60);
    expect(steps.map((s) => s.action)).toEqual(["spawn", "pick_yes", "settle"]);
    expect(steps.map((s) => s.atMs)).toEqual([10_000, 30_000, 50_000]);
    // strictly increasing — the component can fire them with plain timeouts
    expect(steps[0]!.atMs).toBeLessThan(steps[1]!.atMs);
    expect(steps[1]!.atMs).toBeLessThan(steps[2]!.atMs);
  });
});
