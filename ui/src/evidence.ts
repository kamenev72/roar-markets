// Fan-trust surface helpers — an honest EvidenceLabel + a RAW gate-trace formatter. Pure: it only FORMATS
// values the 3-step gate already decoded (it never re-verifies — the gate in src/onchain stays the single
// authority, no duplicate mechanism). The trace turns "the proof decides" into checkable bytes a fan can read.

import type { PublicKey } from "@solana/web3.js";
import { lineQToLine, OU_BOUND_RECEIPT_DISCRIMINATOR } from "../../src/onchain/receipt.js";
import type { VerifiedOu } from "../../src/onchain/settle_consumer.js";

/** rail: where the receipt came from; strength: how strongly the claim is shown. Honest labeling (HONESTY §9). */
export interface EvidenceLabel {
  rail: "LIVE" | "PARTIAL" | "SIMULATED";
  strength: "VERIFIED" | "DEMONSTRATED";
}

export const LABEL_LIVE: EvidenceLabel = { rail: "LIVE", strength: "VERIFIED" };
export const LABEL_SIMULATED: EvidenceLabel = { rail: "SIMULATED", strength: "DEMONSTRATED" };

/** Render an EvidenceLabel as a compact badge string, e.g. "LIVE · VERIFIED". */
export function labelText(l: EvidenceLabel): string {
  return `${l.rail} · ${l.strength}`;
}

const short = (s: string, n = 12): string => (s.length > n ? `${s.slice(0, n)}…` : s);
const hex = (b: Uint8Array): string => Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");

/**
 * The raw gate-trace: one line per check the 3-step gate ran, with the DECODED bytes. `verified` is the gate's
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
