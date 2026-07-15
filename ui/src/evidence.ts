// Fan-trust surface helpers — an honest EvidenceLabel + a RAW gate-trace formatter. Pure: it only FORMATS
// values the complete binding gate already decoded (it never re-verifies — the gate in src/onchain stays the single
// authority, no duplicate mechanism). The trace turns "the proof decides" into checkable bytes a fan can read.

import type { PublicKey } from "@solana/web3.js";
import { lineQToLine, OU_BOUND_RECEIPT_DISCRIMINATOR } from "../../src/onchain/receipt.js";
import type { VerifiedOu } from "../../src/onchain/settle_consumer.js";

/** rail: where the receipt came from; strength: how strongly the claim is shown. Honest labeling (see HONESTY.md). */
export interface EvidenceLabel {
  rail: "LIVE" | "PARTIAL" | "SIMULATED";
  strength: "VERIFIED" | "DEMONSTRATED" | "PENDING";
}

export const LABEL_LIVE: EvidenceLabel = { rail: "LIVE", strength: "VERIFIED" };
export const LABEL_SIMULATED: EvidenceLabel = { rail: "SIMULATED", strength: "DEMONSTRATED" };
export const LABEL_PARTIAL: EvidenceLabel = { rail: "PARTIAL", strength: "DEMONSTRATED" };
/** PC-UI-01: the neutral pre-result label — the receipt has not passed the complete binding gate. NEVER green. */
export const LABEL_PENDING: EvidenceLabel = { rail: "LIVE", strength: "PENDING" };

/** True only for a confirmed, verified LIVE read — the ONLY state that earns the green tick + a strength claim. */
export function isVerifiedLive(l: EvidenceLabel): boolean {
  return l.rail === "LIVE" && l.strength === "VERIFIED";
}

/**
 * PC-UI-01: the badge label to show for the REAL card given the fetch state. A VERIFIED-strength claim is shown
 * ONLY on a confirmed `ok` gate result; `loading`/`err` render a neutral PENDING label — never a green
 * "LIVE · VERIFIED" over an unverified or failed state.
 */
export function badgeLabelFor(status: "ok" | "loading" | "err", okLabel: EvidenceLabel): EvidenceLabel {
  return status === "ok" ? okLabel : LABEL_PENDING;
}

/** Render an EvidenceLabel as a compact badge string, e.g. "LIVE · VERIFIED". */
export function labelText(l: EvidenceLabel): string {
  return `${l.rail} · ${l.strength}`;
}

/**
 * Cross-RPC honesty verdict for the in-browser re-verify. A single RPC re-verify proves only that THAT RPC
 * reports the right owner/disc/PDA/outcome (SEC-RPC-01) — so we read the SAME receipt from a 2nd independent
 * devnet RPC and compare the DECODED fields:
 *  - secondary === null (2nd RPC unavailable) → LIVE but flagged single-RPC (cross-check on the explorer);
 *  - the two agree (over ∧ fixtureId ∧ lineQ) → LIVE, cross-confirmed on 2 independent RPCs (the strong claim);
 *  - they disagree → PARTIAL: do NOT trust the green tick, verify on the explorer (one RPC is lying/lagging).
 * Pure: no I/O — the caller does the two fetches+verifies and passes the decoded results.
 */
/**
 * The 2nd-RPC read, classified (PC-UI-02): a TRANSPORT failure is benign (single-RPC caveat), but a 2nd RPC
 * that responds with NO account, or a DIFFERENT/malformed account at the same PDA, is a real DIVERGENCE that
 * must NOT be swallowed into the benign single-RPC label.
 */
export type SecondaryRead =
  | { kind: "unavailable" } // transport error — the 2nd RPC could not be reached (benign: single-RPC caveat)
  | { kind: "absent" } // the 2nd RPC responded but has NO account at the PDA (divergence)
  | { kind: "gate-fail" } // the 2nd RPC returned a DIFFERENT / malformed account that fails the gate (divergence)
  | { kind: "verified"; v: VerifiedOu }; // the 2nd RPC agrees + gate-passed

export function crossCheckVerdict(primary: VerifiedOu, secondary: SecondaryRead | VerifiedOu | null): { label: EvidenceLabel; note: string } {
  // back-compat: a bare VerifiedOu | null is treated as the old verified|unavailable pair.
  const s: SecondaryRead =
    secondary === null ? { kind: "unavailable" } : "kind" in secondary ? secondary : { kind: "verified", v: secondary };
  switch (s.kind) {
    case "unavailable":
      return { label: LABEL_LIVE, note: "single RPC — the 2nd RPC was unreachable; cross-check on the explorer" };
    case "absent":
      return { label: LABEL_PARTIAL, note: "the 2nd RPC has NO account at this PDA — DIVERGENCE; verify on the explorer" };
    case "gate-fail":
      return { label: LABEL_PARTIAL, note: "the 2nd RPC returned a different/invalid account — DIVERGENCE; verify on the explorer" };
    case "verified": {
      const agree = primary.over === s.v.over && primary.fixtureId === s.v.fixtureId && primary.lineQ === s.v.lineQ;
      return agree
        ? { label: LABEL_LIVE, note: "cross-confirmed on 2 independent RPCs" }
        : { label: LABEL_PARTIAL, note: "RPCs DISAGREE — do not trust this read; verify on the explorer" };
    }
  }
}

const short = (s: string, n = 12): string => (s.length > n ? `${s.slice(0, n)}…` : s);
const hex = (b: Uint8Array): string => Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");

/**
 * The raw gate-trace: selected decoded values from the complete binding gate. `verified` is the gate's
 * own output (already-passed); `owner`/`pda` are the account fields the gate matched. `lineBound` true ⇒ this is
 * a line-bound total-goals market (show the line); false ⇒ "another goal".
 */
export function gateTraceLines(args: { owner: PublicKey; pda: PublicKey; verified: VerifiedOu; lineBound?: boolean }): string[] {
  const { owner, pda, verified, lineBound } = args;
  const lines = [
    `owner    ${short(owner.toBase58())}  (kickoff_oracle)`,
    `disc     ${hex(OU_BOUND_RECEIPT_DISCRIMINATOR)}  (OuBoundReceipt)`,
    `pda      ${short(pda.toBase58())}  (["ou_bound", market_id])`,
  ];
  if (lineBound) lines.push(`line_q   ${verified.lineQ}  → O/U ${lineQToLine(verified.lineQ)} total goals`);
  lines.push(`over@50  ${verified.over ? 1 : 0} → ${verified.over ? "Over (YES)" : "Under (NO)"}`);
  lines.push(`fixture  ${String(verified.fixtureId)} @40`);
  return lines;
}
