import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isFinalised, isInPlay, scoreEventFromLiveFrame, STATUS_FULL_TIME, type LiveScoreFrame } from "../src/factory/primitives.js";

// the REAL TxLINE in-play frame captured live by the launchd daemon (2026-06-29) — pins the schema.
const fixture = JSON.parse(readFileSync(new URL("../artifacts/fixtures/live_scores_frame.json", import.meta.url), "utf8")) as {
  frame: LiveScoreFrame;
};
const frame = fixture.frame;

describe("pinned live TxLINE in-play scores schema", () => {
  it("the captured frame is an in-play frame carrying the which-side field", () => {
    expect(isInPlay(frame)).toBe(true);
    expect(typeof frame.Participant1IsHome).toBe("boolean");
    expect(frame.FixtureId).toBeGreaterThan(0);
    expect(frame.Stats).toBeDefined();
  });

  it("scoreEventFromLiveFrame resolves home/away via Participant1IsHome + the per-participant Stats", () => {
    const ev = scoreEventFromLiveFrame(frame, [1.85, 1.95]);
    expect(ev.fixtureId).toBe(BigInt(frame.FixtureId));
    const p1 = frame.Stats?.["1"] ?? 0;
    const p2 = frame.Stats?.["2"] ?? 0;
    expect(ev.homeScore).toBe(frame.Participant1IsHome ? p1 : p2);
    expect(ev.awayScore).toBe(frame.Participant1IsHome ? p2 : p1);
    expect(ev.minute).toBe(Math.floor((frame.Clock?.Seconds ?? 0) / 60));
  });

  it("the which-side mapping flips when Participant1 is the away team", () => {
    const awayFrame: LiveScoreFrame = { ...frame, Participant1IsHome: false, Stats: { "1": 2, "2": 1 } };
    const ev = scoreEventFromLiveFrame(awayFrame, [1.85, 1.95]);
    expect(ev.homeScore).toBe(1); // Participant2 (the home team) goals
    expect(ev.awayScore).toBe(2); // Participant1 (the away team) goals
  });

  it("a non-in-play frame (StatusId != 2) is rejected by isInPlay", () => {
    expect(isInPlay({ ...frame, StatusId: 9 })).toBe(false); // full-time
  });
});

describe("whistle-driven finality (isFinalised)", () => {
  it("recognizes regulation (9), extra-time (10) and penalties (13) as full time", () => {
    for (const id of [9, 10, 13]) expect(isFinalised({ ...frame, StatusId: id })).toBe(true);
    expect([...STATUS_FULL_TIME].sort((a, b) => a - b)).toEqual([9, 10, 13]);
  });

  it("does NOT treat an in-play or interrupted frame as full time (fail-closed whistle)", () => {
    // a whistle settle keyed off any of these would mint a proof over an unfinished total.
    for (const id of [2, 5, 7, 8, 14, 15, 16, 18]) expect(isFinalised({ ...frame, StatusId: id })).toBe(false);
    expect(isFinalised(frame)).toBe(false); // the captured live frame is in-play, not final
  });

  it("stays in lock-step with the kickoff resolver finality set (no ET/penalties drift)", () => {
    // If the kickoff full-time set ever changes, this mirror must change with it — a proof minted for a
    // status the kickoff rail would refuse cannot settle a propcast total.
    expect(STATUS_FULL_TIME.has(10)).toBe(true); // Ended-after-ET (KO)
    expect(STATUS_FULL_TIME.has(13)).toBe(true); // Ended-after-penalties (KO)
  });

  it("PC-10: a malformed Stats value fails closed (never spawns a garbage market from unvalidated JSON)", () => {
    const bad: LiveScoreFrame = { FixtureId: 1, Participant1IsHome: true, Participant1Id: 1, Participant2Id: 2, StatusId: 2, Stats: { "1": "x" as unknown as number, "2": 0 } };
    expect(() => scoreEventFromLiveFrame(bad, [1.9, 1.9])).toThrow(/invalid goal count/);
    const negative: LiveScoreFrame = { ...bad, Stats: { "1": -1, "2": 0 } };
    expect(() => scoreEventFromLiveFrame(negative, [1.9, 1.9])).toThrow(/invalid goal count/);
  });
});
