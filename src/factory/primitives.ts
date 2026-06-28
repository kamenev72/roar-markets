// PROPCAST goal-primitive trigger map. A scoring event yields the v1 PRIMARY prop: "will there be another
// goal" (an O/U-goals binary), seeded from the de-vigged consensus line. This is the only primitive that is
// trustlessly settleable in v1 (goal-total via the kickoff settle_ou_bound rail). "next-goal which-side" is
// emitted ONLY as a labeled proxy (no on-chain proof attests goal ORDER), never as a trustless market in v1.

import { binaryProb } from "../signal/devig.js";
import { PrimitiveKind } from "./market_id.js";

/**
 * A synthetic in-play scoring event. W1 replays these from a fixture / MemoryTransport; the LIVE TxLINE
 * in-play scores schema (+ the Participant which-side field) is pinned in W2 against a real scoring frame.
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

export interface PropPrimitive {
  kind: PrimitiveKind;
  /** human-readable market question (fan UI label). */
  question: string;
  /** de-vigged fair YES probability — the seed centre. */
  fairYes: number;
  /** true => trustlessly settleable in v1 (goal-total via settle_ou_bound); false => labeled proxy only. */
  trustlessSettleV1: boolean;
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
