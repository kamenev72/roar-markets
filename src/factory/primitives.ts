// PROPCAST goal-primitive trigger map. A scoring event yields the v1 PRIMARY prop: "will there be another
// goal" (an O/U-goals binary), seeded from the de-vigged consensus line. This is the only primitive that is
// trustlessly settleable in v1 (goal-total via the kickoff settle_ou_bound rail). "next-goal which-side" is
// emitted ONLY as a labeled proxy (no on-chain proof attests goal ORDER), never as a trustless market in v1.

import { binaryProb } from "../signal/devig.js";
import { lineToLineQ } from "../onchain/receipt.js";
import { PrimitiveKind } from "./market_id.js";

/**
 * The factory's normalized scoring event. W1 replays these from a fixture / MemoryTransport; a REAL live
 * TxLINE frame is bridged into one by `scoreEventFromLiveFrame` (the in-play schema is now PINNED from a live
 * capture — see `LiveScoreFrame` + `fixtures/live_scores_frame.json`).
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
// unknown — the which-side / Participant field — is now KNOWN): `fixtures/live_scores_frame.json`.

/** Goal stat keys in the TxLINE in-play `Stats` map: "1" = Participant1 goals, "2" = Participant2 goals. */
export const STAT_KEY_P1 = "1";
export const STAT_KEY_P2 = "2";
/** TxLINE `StatusId` 2 = in-play (live). */
export const STATUS_IN_PLAY = 2;

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
 * Bridge a REAL live frame → the factory's `ScoreEvent`, resolving home/away from `Participant1IsHome` + the
 * per-participant goal stats (`Stats["1"]`/`["2"]`). This is the pinned which-side mapping (risk #1 closed).
 */
export function scoreEventFromLiveFrame(f: LiveScoreFrame, anotherGoalOdds: [number, number]): ScoreEvent {
  const p1 = f.Stats?.[STAT_KEY_P1] ?? 0;
  const p2 = f.Stats?.[STAT_KEY_P2] ?? 0;
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
  /** true => trustlessly settleable in v1 (goal-total via settle_ou_bound); false => labeled proxy only. */
  trustlessSettleV1: boolean;
  /** O/U total-goals half-line (e.g. 2.5) — set for the OuTotalGoals variant only (UI display). */
  line?: number;
  /** the on-chain `line_q` integer bound at settle (`lineToLineQ(line)`) — OuTotalGoals only. */
  lineQ?: number;
}

/** v1 PRIMARY primitive from a goal event: "will there be another goal" (O/U), de-vigged seed. */
export function anotherGoalPrimitive(ev: ScoreEvent): PropPrimitive {
  const fairYes = binaryProb(ev.anotherGoalOdds, 0); // index 0 = YES (another goal)
  return {
    kind: PrimitiveKind.OuAnotherGoal,
    question: `Another goal after ${ev.homeScore}-${ev.awayScore} (${ev.minute}')?`,
    fairYes,
    trustlessSettleV1: true,
  };
}

/**
 * SECONDARY primitive: "both teams to score?" — a fixture-level BTTS binary, de-vigged seed, trustlessly
 * settleable via `settle_btts_bound` (two-proof: P1>0 AND P2>0 for `yes`). It is goal-key only (the same
 * objective stat the rail validates), so it does not widen the honesty surface past goal grain.
 */
export function bttsPrimitive(bttsOdds: [number, number]): PropPrimitive {
  const fairYes = binaryProb(bttsOdds, 0); // index 0 = YES (both teams score)
  return {
    kind: PrimitiveKind.BttsYes,
    question: "Both teams to score?",
    fairYes,
    trustlessSettleV1: true,
  };
}

/**
 * BREADTH primitive: an O/U total-goals market at an explicit half-line (1.5 / 2.5 / 3.5). Goal-key only (the
 * same objective stat the rail validates — it does NOT widen the honesty surface past goal grain), trustlessly
 * settleable via the SAME `settle_ou_bound` rail as "another goal", but BOUND to its line: the market carries
 * `lineQ = lineToLineQ(line)` so the settle-consumer (`verifyOuReceiptForLine`) fail-closes a wrong-line
 * receipt. `odds` are [OVER, UNDER] decimals → de-vigged to the seed fair YES (Over).
 */
export function totalGoalsPrimitive(line: number, odds: [number, number]): PropPrimitive {
  const fairYes = binaryProb(odds, 0); // index 0 = OVER the line
  return {
    kind: PrimitiveKind.OuTotalGoals,
    question: `Over/Under ${line} total goals?`,
    fairYes,
    trustlessSettleV1: true,
    line,
    lineQ: lineToLineQ(line),
  };
}
