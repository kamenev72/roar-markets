import { EVIDENCE_STATES, type EvidenceStateKind } from "./evidence_state.js";

export interface EvidenceCatalogEntry {
  readonly id: string;
  readonly provenanceCommit: string;
  readonly receiptPda: string;
  readonly programId: string;
  readonly owner: string;
  readonly marketIdHex: string;
  readonly fixtureId: string;
  readonly lineQ: number;
  readonly explorerUrl: string;
  readonly state: EvidenceStateKind;
  readonly date: string;
  readonly limitations: readonly string[];
}

export const EVIDENCE_CATALOG = Object.freeze([
  {
    id: "real-ou-17588395-line10",
    provenanceCommit: "e5d05d6f15781848a3ffeab7a780a5058653024f",
    receiptPda: "39vT6hs7hmqcQ3oaQ3AgCMJrdX2dz5973hhoffVQiX6n",
    programId: "34FXjUuikioZy4fcUKSoP9NVW7WWKQnpJUZQcRDTNLtw",
    owner: "kickoff_oracle",
    marketIdHex: "532843d51b34f1140e08daf6570ee49204e65c670abf9b043bb37c7b5b452dc1",
    fixtureId: "17588395",
    lineQ: 10,
    explorerUrl: "https://explorer.solana.com/address/39vT6hs7hmqcQ3oaQ3AgCMJrdX2dz5973hhoffVQiX6n?cluster=devnet",
    state: "LIVE_RECEIPT_SINGLE_RPC",
    date: "2026-07-15",
    limitations: [
      "Finality policy is not publicly proven by this receipt read.",
      "Payout, refund, custody and public settlement timing are not proven.",
      "This catalog is static evidence metadata, not a live market ledger.",
    ],
  },
] as const satisfies readonly EvidenceCatalogEntry[]);

export function validateCatalogEntry(entry: EvidenceCatalogEntry): void {
  if (!/^[a-z0-9][a-z0-9-]{3,80}$/.test(entry.id)) throw new Error(`invalid catalog id: ${entry.id}`);
  if (!/^[0-9a-f]{40}$/.test(entry.provenanceCommit)) throw new Error(`invalid provenanceCommit for ${entry.id}`);
  if (!/^[0-9a-f]{64}$/.test(entry.marketIdHex)) throw new Error(`invalid marketIdHex for ${entry.id}`);
  if (!/^\d+$/.test(entry.fixtureId)) throw new Error(`invalid fixtureId for ${entry.id}`);
  if (!Number.isInteger(entry.lineQ)) throw new Error(`invalid lineQ for ${entry.id}`);
  const url = new URL(entry.explorerUrl);
  if (url.origin !== "https://explorer.solana.com" || url.searchParams.get("cluster") !== "devnet") {
    throw new Error(`non-devnet explorer URL for ${entry.id}`);
  }
  if (!entry.limitations.some((x) => /finality/i.test(x))) throw new Error(`missing finality limitation for ${entry.id}`);
  if (!entry.limitations.some((x) => /payout|refund|custody/i.test(x))) throw new Error(`missing payout limitation for ${entry.id}`);
  if (!(entry.state in EVIDENCE_STATES)) throw new Error(`invalid evidence state for ${entry.id}`);
}

export function validateEvidenceCatalog(entries = EVIDENCE_CATALOG): void {
  for (const entry of entries) validateCatalogEntry(entry);
  if (!Object.isFrozen(entries)) throw new Error("catalog must be frozen");
}
