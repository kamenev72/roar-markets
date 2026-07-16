import { useEffect, useMemo, useState } from "react";
import { Connection } from "@solana/web3.js";
import { KICKOFF_ORACLE_PROGRAM_ID, OU_BOUND_RECEIPT_DISCRIMINATOR, ouReceiptPda } from "../../../packages/core/src/onchain/receipt.js";
import { verifyOuReceiptForMarket, type OnchainAccount, type VerifiedOu } from "../../../packages/core/src/onchain/settle_consumer.js";
import { REAL_FIXTURE_ID, REAL_LINE_Q, REAL_MARKET_ID_HEX, marketIdFromHex, verifyRealReceipt, type RealReceiptVerification } from "../../../packages/core/src/onchain/real_receipt.js";
import { gateTraceLines } from "../evidence.js";
import { EVIDENCE_STATES, evidenceToneClass, stateForCrossCheck, type EvidenceState } from "../evidence_state.js";
import { EVIDENCE_CATALOG } from "../evidenceCatalog.js";

const PRIMARY_RPC = "https://api.devnet.solana.com";
const SECOND_RPCS = ["https://devnet.rpcpool.com"];
const RPC_TIMEOUT_MS = 8000;
const MARKET_ID = new Uint8Array(32).fill(0xc0);

type Side = "YES" | "NO";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error("The receipt check timed out. Try again or open the explorer.")), ms))]);
}

function synthOuReceipt(marketId: Uint8Array, fixtureId: bigint, lineQ: number, over: boolean): Uint8Array {
  const data = new Uint8Array(51);
  data.set(OU_BOUND_RECEIPT_DISCRIMINATOR, 0);
  data.set(marketId, 8);
  const view = new DataView(data.buffer);
  view.setBigInt64(40, fixtureId, true);
  view.setInt16(48, lineQ, true);
  data[50] = over ? 1 : 0;
  return data;
}

const EVIDENCE_NAMES: Record<EvidenceState["kind"], string> = {
  SIMULATED: "Walkthrough only",
  LIVE_RECEIPT_DUAL_RPC: "2 sources agree",
  LIVE_RECEIPT_SINGLE_RPC: "1 source checked",
  RPC_DIVERGENT: "Sources disagree",
  RECEIPT_UNAVAILABLE: "Waiting for receipt",
  RECEIPT_INVALID: "Check did not pass",
};

function EvidenceBadge({ state }: { state: EvidenceState }) {
  return <span className={`evidence-badge ${evidenceToneClass(state)}`}>{EVIDENCE_NAMES[state.kind]}</span>;
}

function GateTrace({ lines }: { lines: string[] }) {
  return <pre className="gate-trace">{lines.join("\n")}</pre>;
}

type RealState =
  | { status: "loading" }
  | { status: "ok"; verification: RealReceiptVerification; trace: string[]; evidence: EvidenceState; note: string }
  | { status: "err"; message: string; evidence: EvidenceState };

export function RealReceiptCard() {
  const pda = useMemo(() => ouReceiptPda(marketIdFromHex(REAL_MARKET_ID_HEX)), []);
  const [state, setState] = useState<RealState>({ status: "loading" });

  async function load() {
    setState({ status: "loading" });
    try {
      const marketId = marketIdFromHex(REAL_MARKET_ID_HEX);
      const slice = { commitment: "confirmed" as const, dataSlice: { offset: 0, length: 51 } };
      const info = await withTimeout(new Connection(PRIMARY_RPC, "confirmed").getAccountInfo(pda, slice), RPC_TIMEOUT_MS);
      const fetched = info ? { owner: info.owner, data: new Uint8Array(info.data) } : null;
      const verification = verifyRealReceipt(fetched);
      const verified = verifyOuReceiptForMarket({ pubkey: pda, owner: fetched!.owner, data: fetched!.data }, { marketId, fixtureId: REAL_FIXTURE_ID, lineQ: REAL_LINE_Q });
      const trace = gateTraceLines({ owner: fetched!.owner, pda, verified, lineBound: true });
      let secondary: { kind: "unavailable" } | { kind: "absent" } | { kind: "gate-fail" } | { kind: "verified"; agrees: boolean } = { kind: "unavailable" };

      for (const rpc of SECOND_RPCS) {
        try {
          const secondInfo = await withTimeout(new Connection(rpc, "confirmed").getAccountInfo(pda, slice), RPC_TIMEOUT_MS);
          if (secondInfo === null) {
            secondary = { kind: "absent" };
            break;
          }
          try {
            const second = verifyOuReceiptForMarket({ pubkey: pda, owner: secondInfo.owner, data: new Uint8Array(secondInfo.data) }, { marketId, fixtureId: REAL_FIXTURE_ID, lineQ: REAL_LINE_Q });
            secondary = { kind: "verified", agrees: verified.over === second.over && verified.fixtureId === second.fixtureId && verified.lineQ === second.lineQ };
          } catch {
            secondary = { kind: "gate-fail" };
          }
          break;
        } catch {
          secondary = { kind: "unavailable" };
        }
      }

      const evidence = stateForCrossCheck(true, secondary);
      const note = evidence.kind === "LIVE_RECEIPT_DUAL_RPC"
        ? "Two independent devnet providers returned the same bound match, line, and answer."
        : evidence.kind === "LIVE_RECEIPT_SINGLE_RPC"
          ? "One devnet provider passed every check; the second provider could not be reached."
          : "The providers did not return the same valid receipt. Use the explorer before relying on this read.";
      setState({ status: "ok", verification, trace, evidence, note });
    } catch (error) {
      setState({
        status: "err",
        message: error instanceof Error ? error.message : String(error),
        evidence: EVIDENCE_STATES.RECEIPT_INVALID,
      });
    }
  }

  useEffect(() => { void load(); }, []);

  const explorer = EVIDENCE_CATALOG[0].explorerUrl;
  return (
    <article className="receipt-card" aria-labelledby="real-receipt-title">
      <div className="receipt-topline">
        <span className="receipt-eyebrow">Historical on-chain example · Solana devnet</span>
        <EvidenceBadge state={state.status === "ok" || state.status === "err" ? state.evidence : EVIDENCE_STATES.RECEIPT_UNAVAILABLE} />
      </div>
      <h3 id="real-receipt-title">Does the saved answer still belong to this match?</h3>
      <p className="receipt-subtitle">The browser reads the saved account and checks the complete binding locally. No wallet or API key is required.</p>

      {state.status === "loading" ? (
        <div className="receipt-loading" aria-live="polite" aria-label="Checking the historical receipt">
          <span className="skeleton-line" /><span className="skeleton-line" />
          <span>Checking the receipt…</span>
        </div>
      ) : null}

      {state.status === "err" ? (
        <div className="status-callout warning" aria-live="polite">
          <p><strong>The live read did not pass.</strong> {state.message}</p>
          <div className="receipt-actions">
            <button className="button button-primary" type="button" onClick={() => void load()}>Try the check again</button>
            <a href={explorer} target="_blank" rel="noreferrer">Open the devnet account</a>
          </div>
        </div>
      ) : null}

      {state.status === "ok" ? (
        <>
          <dl className="receipt-facts">
            <div><dt>Fixture</dt><dd>{String(state.verification.fixtureId)}</dd></div>
            <div><dt>Bound line</dt><dd>Under 2.5 goals</dd></div>
            <div><dt>Saved outcome</dt><dd>{state.verification.resolution === "YES" ? "Over · YES" : "Under · NO"}</dd></div>
          </dl>
          <div className={`status-callout ${state.evidence.tone}`} aria-live="polite"><p>{state.note}</p></div>
          <div className="receipt-actions">
            <button className="button button-primary" type="button" onClick={() => void load()}>Check it again</button>
            <a href={explorer} target="_blank" rel="noreferrer">Compare on Solana Explorer</a>
          </div>
          <details className="technical-disclosure">
            <summary>Inspect the exact binding checks</summary>
            <span className="tech-label">{state.evidence.label}</span>
            <GateTrace lines={state.trace} />
          </details>
        </>
      ) : null}

      <LimitRail state={state.status === "ok" || state.status === "err" ? state.evidence : EVIDENCE_STATES.RECEIPT_UNAVAILABLE} />
    </article>
  );
}

function LimitRail({ state }: { state: EvidenceState }) {
  return (
    <ul className="limit-rail" aria-label="What this check does not prove">
      {state.limits.map((limit) => <li key={limit.kind}>{limit.text}</li>)}
    </ul>
  );
}

export function SimulatedReceiptVerifier({ pick, onResolved }: { pick: Side | null; onResolved: (result: { outcome: Side; won: boolean; shareReceiptRef: string }) => void }) {
  const receiptPda = useMemo(() => ouReceiptPda(MARKET_ID), []);

  function settle() {
    const data = synthOuReceipt(MARKET_ID, 17588395n, 6, true);
    const account: OnchainAccount = { pubkey: receiptPda, owner: KICKOFF_ORACLE_PROGRAM_ID, data };
    const verified: VerifiedOu = verifyOuReceiptForMarket(account, { marketId: MARKET_ID, fixtureId: 17588395n, lineQ: 6 });
    const outcome: Side = verified.over ? "YES" : "NO";
    onResolved({ outcome, won: pick === outcome, shareReceiptRef: receiptPda.toBase58() });
  }

  return (
    <div className="sim-verify">
      <button className="resolve-button" type="button" onClick={settle} disabled={!pick}>
        <span>{pick ? "Reveal the match result" : "Choose your call first"}</span>
        <small>Device-local walkthrough</small>
      </button>
    </div>
  );
}

export default function VerificationWorkbench(props:
  | { mode: "real" }
  | { mode: "simulated"; pick: Side | null; onResolved: (result: { outcome: Side; won: boolean; shareReceiptRef: string }) => void }
) {
  if (props.mode === "real") return <RealReceiptCard />;
  return <SimulatedReceiptVerifier pick={props.pick} onResolved={props.onResolved} />;
}
