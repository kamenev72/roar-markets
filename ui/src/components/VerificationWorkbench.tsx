import { useEffect, useMemo, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { KICKOFF_ORACLE_PROGRAM_ID, OU_BOUND_RECEIPT_DISCRIMINATOR, ouReceiptPda } from "../../../src/onchain/receipt.js";
import { verifyOuReceiptForMarket, type OnchainAccount, type VerifiedOu } from "../../../src/onchain/settle_consumer.js";
import { REAL_FIXTURE_ID, REAL_LINE_Q, REAL_MARKET_ID_HEX, marketIdFromHex, verifyRealReceipt, type RealReceiptVerification } from "../../../src/onchain/real_receipt.js";
import { gateTraceLines } from "../evidence.js";
import { EVIDENCE_STATES, evidenceToneClass, stateForCrossCheck, type EvidenceState } from "../evidence_state.js";
import { EVIDENCE_CATALOG } from "../evidenceCatalog.js";

const PRIMARY_RPC = "https://api.devnet.solana.com";
const SECOND_RPCS = ["https://devnet.rpcpool.com"];
const RPC_TIMEOUT_MS = 8000;
const MARKET_ID = new Uint8Array(32).fill(0xc0);

type Side = "YES" | "NO";

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`RPC timeout after ${ms}ms — verify on the explorer instead`)), ms))]);
}

function synthOuReceipt(marketId: Uint8Array, fixtureId: bigint, lineQ: number, over: boolean): Uint8Array {
  const d = new Uint8Array(51);
  d.set(OU_BOUND_RECEIPT_DISCRIMINATOR, 0);
  d.set(marketId, 8);
  const dv = new DataView(d.buffer);
  dv.setBigInt64(40, fixtureId, true);
  dv.setInt16(48, lineQ, true);
  d[50] = over ? 1 : 0;
  return d;
}

function EvidenceBadge({ state }: { state: EvidenceState }) {
  return <span className={`evidence-badge ${evidenceToneClass(state)}`}>{state.label}</span>;
}

function GateTrace({ lines }: { lines: string[] }) {
  return <pre className="gate-trace">{lines.join("\n")}</pre>;
}

type RealState =
  | { status: "loading" }
  | { status: "ok"; v: RealReceiptVerification; trace: string[]; evidence: EvidenceState; note: string }
  | { status: "err"; msg: string; evidence: EvidenceState };

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
      const v = verifyRealReceipt(fetched);
      const verified = verifyOuReceiptForMarket({ pubkey: pda, owner: fetched!.owner, data: fetched!.data }, { marketId, fixtureId: REAL_FIXTURE_ID, lineQ: REAL_LINE_Q });
      const trace = gateTraceLines({ owner: fetched!.owner, pda, verified, lineBound: true });
      let secondary: { kind: "unavailable" } | { kind: "absent" } | { kind: "gate-fail" } | { kind: "verified"; agrees: boolean } = { kind: "unavailable" };
      for (const rpc of SECOND_RPCS) {
        try {
          const info2 = await withTimeout(new Connection(rpc, "confirmed").getAccountInfo(pda, slice), RPC_TIMEOUT_MS);
          if (info2 === null) { secondary = { kind: "absent" }; break; }
          try {
            const v2 = verifyOuReceiptForMarket({ pubkey: pda, owner: info2.owner, data: new Uint8Array(info2.data) }, { marketId, fixtureId: REAL_FIXTURE_ID, lineQ: REAL_LINE_Q });
            secondary = { kind: "verified", agrees: verified.over === v2.over && verified.fixtureId === v2.fixtureId && verified.lineQ === v2.lineQ };
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
        ? "cross-confirmed on 2 independent RPCs"
        : evidence.kind === "LIVE_RECEIPT_SINGLE_RPC"
          ? "single RPC passed; second provider unavailable"
          : "RPC divergence or invalid secondary account — verify manually";
      setState({ status: "ok", v, trace, evidence, note });
    } catch (e) {
      setState({ status: "err", msg: e instanceof Error ? e.message : String(e), evidence: EVIDENCE_STATES.RECEIPT_INVALID });
    }
  }

  useEffect(() => { void load(); }, []);

  const explorer = EVIDENCE_CATALOG[0].explorerUrl;
  return (
    <section className="card card-real" aria-labelledby="real-receipt-title">
      <div className="card-row">
        <div className="eyebrow">● REAL · on-chain · devnet</div>
        <EvidenceBadge state={state.status === "ok" || state.status === "err" ? state.evidence : EVIDENCE_STATES.RECEIPT_UNAVAILABLE} />
      </div>
      <h2 id="real-receipt-title">Re-verify a real kickoff receipt — in your browser, no key</h2>
      {state.status === "loading" && <p className="muted">fetching the on-chain receipt from devnet…</p>}
      {state.status === "err" && (
        <div className="callout warning">
          <p>⚠ live RPC observation unavailable or invalid: {state.msg}</p>
          <p><a href={explorer} target="_blank" rel="noreferrer">Open historical account on explorer ↗</a></p>
          <button onClick={() => void load()}>↻ retry</button>
        </div>
      )}
      {state.status === "ok" && (
        <>
          <p className="mono">
            ✓ fetched account {pda.toBase58().slice(0, 12)}… <a href={explorer} target="_blank" rel="noreferrer">(explorer)</a><br />
            ✓ owned by kickoff_oracle ({KICKOFF_ORACLE_PROGRAM_ID.toBase58().slice(0, 8)}…)<br />
            ✓ type + PDA + embedded market + fixture + line match<br />
            ✓ outcome: <b>{state.v.resolution === "YES" ? "another goal (YES)" : "no more goals (NO)"}</b> · fixture {String(state.v.fixtureId)}
          </p>
          <div className={`callout ${state.evidence.tone}`}>{state.note}</div>
          <GateTrace lines={state.trace} />
          <button onClick={() => void load()}>↻ re-verify</button>
        </>
      )}
      <LimitRail state={state.status === "ok" || state.status === "err" ? state.evidence : EVIDENCE_STATES.RECEIPT_UNAVAILABLE} />
    </section>
  );
}

function LimitRail({ state }: { state: EvidenceState }) {
  return (
    <ul className="limit-rail" aria-label="Not proven by this evidence">
      {state.limits.map((limit) => <li key={limit.kind}>{limit.text}</li>)}
    </ul>
  );
}

export function SimulatedReceiptVerifier({ pick, onResolved }: { pick: Side | null; onResolved: (result: { outcome: Side; won: boolean; shareReceiptRef: string }) => void }) {
  const receiptPda = useMemo(() => ouReceiptPda(MARKET_ID), []);
  function settle() {
    const data = synthOuReceipt(MARKET_ID, 17588395n, 6, true);
    const acct: OnchainAccount = { pubkey: receiptPda, owner: KICKOFF_ORACLE_PROGRAM_ID, data };
    const verified: VerifiedOu = verifyOuReceiptForMarket(acct, { marketId: MARKET_ID, fixtureId: 17588395n, lineQ: 6 });
    const outcome: Side = verified.over ? "YES" : "NO";
    onResolved({ outcome, won: pick === outcome, shareReceiptRef: receiptPda.toBase58() });
  }
  return (
    <div className="sim-verify">
      <p className="muted mono">receipt PDA {receiptPda.toBase58().slice(0, 16)}… · kickoff_oracle ["ou_bound", market_id]</p>
      <button onClick={settle} disabled={!pick}>🔊 Whistle: verify a synthetic bound receipt</button>
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
