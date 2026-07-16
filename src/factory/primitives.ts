// PROPCAST goal-primitive trigger map. A scoring event yields the v1 PRIMARY prop: "will there be another
// goal" (an O/U-goals binary), seeded from the de-vigged consensus line. It has a kickoff bound-receipt rail.
// "next-goal which-side" is emitted only as a labeled proxy because no on-chain proof attests goal order.

import { binaryProb } from "../signal/devig.js";
import { lineToLineQ } from "../onchain/receipt.js";
import { PrimitiveKind } from "./market_id.js";

/**
 * The factory's normalized scoring event. phase 1 replays these from a fixture / MemoryTransport; a REAL live
 * TxLINE frame is bridged into one by `scoreEventFromLiveFrame` (the in-play schema is now PINNED from a live
 * capture — see `LiveScoreFrame` + `artifacts/fixtures/live_scores_frame.json`).
 */
export interface ScoreEvent {
  fixtureId: bigint;
  /** match minute of the goal. */
  minute: number;
  homeScore: number;
  awayScore: number;
  /** decimal odds [YES, NO] for "will there be another goal" — de-vigged to the seed fair. */
  anotherGoalOdds: [number, number];
}

// ---------- the REAL TxLINE in-play scores schema (PINNED from a live capture, 2026-06-29) ----------
//
// Pinned against a real Brazil-Japan in-play frame captured live by the launchd daemon (the #1 cross-project
// unknown — the which-side / Participant field — is now KNOWN): `artifacts/fixtures/live_scores_frame.json`.

/** Goal stat keys in the TxLINE in-play `Stats` map: "1" = Participant1 goals, "2" = Participant2 goals. */
export const STAT_KEY_P1 = "1";
export const STAT_KEY_P2 = "2";
/** TxLINE `StatusId` 2 = in-play (live). */
export const STATUS_IN_PLAY = 2;

/**
 * Soccer full-time StatusIds — the ONLY statuses that authorize a whistle-driven ("no more goals") settle.
 *   9  Ended                 — regulation full time (our captured live stream's value).
 *   10 Ended-after-ET        — a KNOCKOUT match decided in extra time.
 *   13 Ended-after-penalties — a KNOCKOUT match decided on penalties.
 * A goal-total prop over a World Cup KO fixture must NOT settle at 90' if the match continues into ET; the
 * final goal count is the post-ET total (the shootout tally is never part of goal-total). This set MUST stay
 * in lock-step with the kickoff resolver's finality set (a proof minted for a non-final frame would settle
 * an unfinished total). Anything not listed is fail-closed: an in-play frame settles ONLY via the next goal.
 */
export const STATUS_FULL_TIME: ReadonlySet<number> = new Set([9, 10, 13]);

/**
 * A REAL TxLINE in-play scores frame (the captured schema). The which-side is `Participant1IsHome`; goals are
 * `Stats["1"]`/`["2"]` (per-participant, NOT home/away — `Participant1IsHome` disambiguates); `Clock.Seconds`
 * is match time; `StatusId === 2` is in-play. Captured fields beyond these (Action, Possession, …) are extra.
 */
export interface LiveScoreFrame {
  FixtureId: number;
  Participant1IsHome: boolean;
  Participant1Id: number;
  Participant2Id: number;
  StatusId: number;
  Clock?: { Running: boolean; Seconds: number };
  Stats?: Record<string, number>;
  Seq?: number;
}

/** True iff the frame is a live in-play frame (only then does the factory spawn / re-quote). */
export function isInPlay(f: LiveScoreFrame): boolean {
  return f.StatusId === STATUS_IN_PLAY;
}

/**
 * True iff the frame is a genuine full-time (incl. ET / penalties) end-of-match — the fail-closed predicate a
 * whistle-driven settle MUST honor. An "another goal" prop resolves NO ("no more goals") only when the match
 * has truly ENDED; keying the whistle off anything else (a paused/HT/interrupted in-play frame) would settle
 * an unfinished total. The next-goal settle path is unaffected (a goal proves the total regardless of status).
 */
export function isFinalised(f: LiveScoreFrame): boolean {
  return STATUS_FULL_TIME.has(f.StatusId);
}

/**
 * Bridge a REAL live frame → the factory's `ScoreEvent`, resolving home/away from `Participant1IsHome` + the
 * per-participant goal stats (`Stats["1"]`/`["2"]`). This is the pinned which-side mapping (risk #1 closed).
 */
export function scoreEventFromLiveFrame(f: LiveScoreFrame, anotherGoalOdds: [number, number]): ScoreEvent {
  // PC-10: a live TxLINE frame is UNVALIDATED JSON at the trust boundary — coerce + fail-closed on a
  // non-integer / negative / absurd goal count so a garbage Stats value can't poison the dedup signature,
  // the market label, or `line`/`lineQ` (which must fit i16 on-chain). A malformed frame throws; the daemon's
  // per-frame guard skips it rather than spawning a garbage market.
  const coerce = (v: unknown): number => {
    const n = Number(v ?? 0);
    if (!Number.isInteger(n) || n < 0 || n > 50) throw new Error(`invalid goal count in live frame: ${String(v)}`);
    return n;
  };
  const p1 = coerce(f.Stats?.[STAT_KEY_P1]);
  const p2 = coerce(f.Stats?.[STAT_KEY_P2]);
  return {
    fixtureId: BigInt(f.FixtureId),
    minute: Math.floor((f.Clock?.Seconds ?? 0) / 60),
    homeScore: f.Participant1IsHome ? p1 : p2,
    awayScore: f.Participant1IsHome ? p2 : p1,
    anotherGoalOdds,
  };
}

export interface PropPrimitive {
  kind: PrimitiveKind;
  /** human-readable market question (fan UI label). */
  question: string;
  /** de-vigged fair YES probability — the seed centre. */
  fairYes: number;
  /** True when v1 has a complete market/fixture(/line) bound-receipt verifier for this primitive. */
  receiptBindableV1: boolean;
  /** O/U total-goals half-line (e.g. 2.5) — set for the OuTotalGoals variant only (UI display). */
  line?: number;
  /** the on-chain `line_q` integer bound at settle (`lineToLineQ(line)`) — OuTotalGoals only. */
  lineQ?: number;
}

/**
 * v1 PRIMARY primitive from a goal event: "will there be another goal" (O/U), de-vigged seed.
 *
 * "Another goal after H-A" IS an O/U-total market at the line `(H+A)+0.5`: one more goal makes the total
 * exceed the current total by a half-goal. So it is BOUND to that line (`lineQ = lineToLineQ(line)`) exactly
 * like `totalGoalsPrimitive` — the settle-consumer then fail-closes a receipt minted at any OTHER line
 * (`verifyOuReceiptForMarket`, `WrongLine`), instead of the old line-UNBOUND path that read only the `over`
 * byte and would accept a receipt for a different total. The injected mint MUST attest THIS line_q.
 */
export function anotherGoalPrimitive(ev: ScoreEvent): PropPrimitive {
  const fairYes = binaryProb(ev.anotherGoalOdds, 0); // index 0 = YES (another goal)
  const line = ev.homeScore + ev.awayScore + 0.5; // "another goal after H-A" ⇔ total Over (H+A)+0.5
  return {
    kind: PrimitiveKind.OuAnotherGoal,
    question: `Another goal after ${ev.homeScore}-${ev.awayScore} (${ev.minute}')?`,
    fairYes,
    receiptBindableV1: true,
    line,
    lineQ: lineToLineQ(line),
  };
}

/**
 * SECONDARY primitive: "both teams to score?" — a fixture-level BTTS binary with a complete bound-receipt
 * verifier over the `settle_btts_bound` layout. It is goal-key only.
 */
export function bttsPrimitive(bttsOdds: [number, number]): PropPrimitive {
  const fairYes = binaryProb(bttsOdds, 0); // index 0 = YES (both teams score)
  return {
    kind: PrimitiveKind.BttsYes,
    question: "Both teams to score?",
    fairYes,
    receiptBindableV1: true,
  };
}

/**
 * BREADTH primitive: an O/U total-goals market at an explicit half-line (1.5 / 2.5 / 3.5). Goal-key only (the
 * same goal-total stat the rail validates) using the SAME `settle_ou_bound` receipt layout as "another goal",
 * but BOUND to its line: the market carries
 * `lineQ = lineToLineQ(line)` so the settle-consumer (`verifyOuReceiptForMarket`) fail-closes a wrong-line
 * receipt. `odds` are [OVER, UNDER] decimals → de-vigged to the seed fair YES (Over).
 */
export function totalGoalsPrimitive(line: number, odds: [number, number]): PropPrimitive {
  const fairYes = binaryProb(odds, 0); // index 0 = OVER the line
  return {
    kind: PrimitiveKind.OuTotalGoals,
    question: `Over/Under ${line} total goals?`,
    fairYes,
    receiptBindableV1: true,
    line,
    lineQ: lineToLineQ(line),
  };
}
