// The cross-RPC honesty verdict logic (SEC-RPC-01) — pure, so it is unit-tested independent of any live RPC's
// uptime. A single-RPC re-verify is LIVE-with-a-caveat; agreement of 2 independent RPCs is the strong claim;
// disagreement is PARTIAL (do not trust the green tick).

import { describe, it, expect } from "vitest";
import { crossCheckVerdict } from "../ui/src/evidence.js";
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
