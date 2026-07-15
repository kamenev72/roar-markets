export type EvidenceStateKind =
  | "SIMULATED"
  | "LIVE_RECEIPT_DUAL_RPC"
  | "LIVE_RECEIPT_SINGLE_RPC"
  | "RPC_DIVERGENT"
  | "RECEIPT_UNAVAILABLE"
  | "RECEIPT_INVALID";

export interface EvidenceLimit {
  kind: "FINALITY_NOT_PROVEN" | "PAYOUT_NOT_PROVEN";
  text: string;
}

export interface EvidenceState {
  kind: EvidenceStateKind;
  tone: "success" | "warning" | "danger" | "neutral";
  label: string;
  short: string;
  limits: readonly EvidenceLimit[];
}

export const FINALITY_NOT_PROVEN: EvidenceLimit = {
  kind: "FINALITY_NOT_PROVEN",
  text: "Finality policy is not publicly proven by this receipt read.",
};

export const PAYOUT_NOT_PROVEN: EvidenceLimit = {
  kind: "PAYOUT_NOT_PROVEN",
  text: "Payout, refund, custody and public settlement timing are not proven.",
};

const LIVE_LIMITS = [FINALITY_NOT_PROVEN, PAYOUT_NOT_PROVEN] as const;

export const EVIDENCE_STATES: Readonly<Record<EvidenceStateKind, EvidenceState>> = Object.freeze({
  SIMULATED: {
    kind: "SIMULATED",
    tone: "warning",
    label: "SIMULATED · DEMONSTRATED",
    short: "walkthrough only",
    limits: LIVE_LIMITS,
  },
  LIVE_RECEIPT_DUAL_RPC: {
    kind: "LIVE_RECEIPT_DUAL_RPC",
    tone: "success",
    label: "LIVE RECEIPT · DUAL-RPC VERIFIED",
    short: "two RPCs agree on the same bound bytes",
    limits: LIVE_LIMITS,
  },
  LIVE_RECEIPT_SINGLE_RPC: {
    kind: "LIVE_RECEIPT_SINGLE_RPC",
    tone: "warning",
    label: "LIVE RECEIPT · SINGLE-RPC",
    short: "one RPC passed; cross-check unavailable",
    limits: LIVE_LIMITS,
  },
  RPC_DIVERGENT: {
    kind: "RPC_DIVERGENT",
    tone: "danger",
    label: "RPC DIVERGENCE · NOT VERIFIED",
    short: "providers disagreed or one returned invalid bytes",
    limits: LIVE_LIMITS,
  },
  RECEIPT_UNAVAILABLE: {
    kind: "RECEIPT_UNAVAILABLE",
    tone: "neutral",
    label: "RECEIPT UNAVAILABLE",
    short: "live observation unavailable",
    limits: LIVE_LIMITS,
  },
  RECEIPT_INVALID: {
    kind: "RECEIPT_INVALID",
    tone: "danger",
    label: "RECEIPT INVALID · FAIL-CLOSED",
    short: "primary receipt failed the binding gate",
    limits: LIVE_LIMITS,
  },
});

export type SecondaryEvidenceRead =
  | { kind: "unavailable" }
  | { kind: "absent" }
  | { kind: "gate-fail" }
  | { kind: "verified"; agrees: boolean };

export function stateForCrossCheck(primaryGatePassed: boolean, secondary: SecondaryEvidenceRead): EvidenceState {
  if (!primaryGatePassed) return EVIDENCE_STATES.RECEIPT_INVALID;
  switch (secondary.kind) {
    case "unavailable":
      return EVIDENCE_STATES.LIVE_RECEIPT_SINGLE_RPC;
    case "absent":
    case "gate-fail":
      return EVIDENCE_STATES.RPC_DIVERGENT;
    case "verified":
      return secondary.agrees ? EVIDENCE_STATES.LIVE_RECEIPT_DUAL_RPC : EVIDENCE_STATES.RPC_DIVERGENT;
  }
}

export function isGreenEvidence(state: EvidenceState): boolean {
  return state.kind === "LIVE_RECEIPT_DUAL_RPC";
}

export function evidenceToneClass(state: EvidenceState): string {
  return `evidence-${state.tone}`;
}
