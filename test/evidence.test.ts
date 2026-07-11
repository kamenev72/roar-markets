// The cross-RPC honesty verdict logic (SEC-RPC-01) — pure, so it is unit-tested independent of any live RPC's
// uptime. A single-RPC re-verify is LIVE-with-a-caveat; agreement of 2 independent RPCs is the strong claim;
// disagreement is PARTIAL (do not trust the green tick).

import { describe, it, expect } from "vitest";
import { badgeLabelFor, crossCheckVerdict, isVerifiedLive, LABEL_LIVE, LABEL_PARTIAL } from "../ui/src/evidence.js";
import type { VerifiedOu } from "../src/onchain/settle_consumer.js";

const v = (over: boolean, fixtureId: bigint, lineQ: number): VerifiedOu => ({ over, fixtureId, lineQ });

describe("crossCheckVerdict (2nd-RPC honesty verdict)", () => {
  it("2nd RPC unavailable (null) → LIVE but flagged single-RPC", () => {
    const r = crossCheckVerdict(v(true, 17588395n, 10), null);
    expect(r.label.rail).toBe("LIVE");
    expect(r.note).toMatch(/single RPC/i);
  });

  it("both RPCs agree → LIVE, cross-confirmed", () => {
    const r = crossCheckVerdict(v(true, 17588395n, 10), v(true, 17588395n, 10));
    expect(r.label.rail).toBe("LIVE");
    expect(r.note).toMatch(/cross-confirmed/i);
  });

  it("disagree on the outcome → PARTIAL (do not trust)", () => {
    const r = crossCheckVerdict(v(true, 17588395n, 10), v(false, 17588395n, 10));
    expect(r.label.rail).toBe("PARTIAL");
    expect(r.note).toMatch(/disagree/i);
  });

  it("disagree on the bound line_q → PARTIAL", () => {
    expect(crossCheckVerdict(v(true, 17588395n, 10), v(true, 17588395n, 6)).label.rail).toBe("PARTIAL");
  });

  it("disagree on the fixtureId → PARTIAL", () => {
    expect(crossCheckVerdict(v(true, 17588395n, 10), v(true, 999n, 10)).label.rail).toBe("PARTIAL");
  });
});

describe("PC-UI-01: the badge never claims VERIFIED strength outside a confirmed 'ok' gate result", () => {
  it("loading / err ⇒ a neutral PENDING label — NOT a green verified tick", () => {
    for (const status of ["loading", "err"] as const) {
      const l = badgeLabelFor(status, LABEL_LIVE);
      expect(l.strength).toBe("PENDING");
      expect(isVerifiedLive(l)).toBe(false); // the badge renders amber, not the green VERIFIED tick
    }
  });
  it("ok ⇒ the gate's own verdict label passes through (the only state that can be VERIFIED-green)", () => {
    expect(badgeLabelFor("ok", LABEL_LIVE)).toBe(LABEL_LIVE);
    expect(isVerifiedLive(badgeLabelFor("ok", LABEL_LIVE))).toBe(true);
    // a PARTIAL verdict (RPC disagreement) even on 'ok' is NOT green
    expect(isVerifiedLive(badgeLabelFor("ok", LABEL_PARTIAL))).toBe(false);
  });
});

describe("PC-UI-02: the 2nd-RPC read is classified 3-way (a divergence is not a benign single-RPC)", () => {
  const p = v(true, 17588395n, 10);
  it("transport-unavailable → LIVE single-RPC caveat", () => {
    expect(crossCheckVerdict(p, { kind: "unavailable" }).label.rail).toBe("LIVE");
  });
  it("2nd RPC has NO account (absent) → PARTIAL divergence", () => {
    const r = crossCheckVerdict(p, { kind: "absent" });
    expect(r.label.rail).toBe("PARTIAL");
    expect(r.note).toMatch(/DIVERGENCE/);
  });
  it("2nd RPC returns a different/invalid account (gate-fail) → PARTIAL divergence", () => {
    expect(crossCheckVerdict(p, { kind: "gate-fail" }).label.rail).toBe("PARTIAL");
  });
  it("2nd RPC verified + agrees → LIVE cross-confirmed", () => {
    expect(crossCheckVerdict(p, { kind: "verified", v: v(true, 17588395n, 10) }).label.rail).toBe("LIVE");
  });
  it("2nd RPC verified + disagrees → PARTIAL", () => {
    expect(crossCheckVerdict(p, { kind: "verified", v: v(false, 17588395n, 10) }).label.rail).toBe("PARTIAL");
  });
});
