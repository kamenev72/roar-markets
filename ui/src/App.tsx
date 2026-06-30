import { useEffect, useMemo, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { binaryProb } from "../../src/signal/devig.js";
import { KICKOFF_ORACLE_PROGRAM_ID, OU_BOUND_RECEIPT_DISCRIMINATOR, ouReceiptPda } from "../../src/onchain/receipt.js";
import { resolveFromReceipt, verifyOuReceipt, type OnchainAccount, type VerifiedOu } from "../../src/onchain/settle_consumer.js";
import { REAL_MARKET_ID_HEX, marketIdFromHex, verifyRealReceipt, type RealReceiptVerification } from "../../src/onchain/real_receipt.js";
import { crossCheckVerdict, gateTraceLines, labelText, LABEL_LIVE, LABEL_SIMULATED, type EvidenceLabel } from "./evidence.js";

// A 2nd INDEPENDENT public devnet RPC for the cross-check (keyless; best-effort — the card degrades to
// single-RPC + explorer if it is unavailable). Independence is the point: agreement of two providers is a
// much stronger "the proof decides" than one provider's word.
const PRIMARY_RPC = "https://api.devnet.solana.com";
const SECOND_RPC = "https://rpc.ankr.com/solana_devnet";

// de-vigged OVER seeds for the breadth strip — the auto-spawned total-goals lines (SIMULATED display).
const TOTAL_GOALS_LINES: { line: number; odds: [number, number] }[] = [
  { line: 1.5, odds: [1.35, 3.1] },
  { line: 2.5, odds: [1.95, 1.85] },
  { line: 3.5, odds: [3.2, 1.34] },
];

const C = {
  bg: "#0b0f14", panel: "#121821", border: "#243040", text: "#dbe4ee", dim: "#7d8aa0",
  ok: "#1f9d55", bad: "#d23f3f", accent: "#3b82f6", warn: "#e0a800",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

// A fixed demo market id for the board (the real factory derives it via market_id.ts, which uses node:crypto
// and so is not imported into the browser bundle — the board uses a constant and the SAME 3-step settle gate).
const MARKET_ID = new Uint8Array(32).fill(0xc0);
// Demo consensus odds for "will there be another goal" [YES, NO] → the de-vigged fair YES seed.
const DEMO_LINE: [number, number] = [1.85, 1.95];

/** Build a shape-exact OuBoundReceipt: disc(8)+market(32)@8+fixture(i64 LE)@40+line_q(i16 LE)@48+over@50. */
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

const hex = (b: Uint8Array, n = 6): string => Array.from(b.subarray(0, n)).map((x) => x.toString(16).padStart(2, "0")).join("");

type Phase = "kickoff" | "spawned" | "resolved";
type Side = "YES" | "NO";

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return <span style={{ background: color, color: "#fff", padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>{children}</span>;
}

/** Honest evidence badge: green for the LIVE on-chain card, amber for a SIMULATED walkthrough card. */
function EvidenceBadge({ label }: { label: EvidenceLabel }) {
  const live = label.rail === "LIVE";
  return (
    <span style={{ border: `1px solid ${live ? C.ok : C.warn}`, color: live ? C.ok : C.warn, padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, fontFamily: C.mono }}>
      {labelText(label)}
    </span>
  );
}

/** The RAW gate-trace — the decoded receipt bytes the 3-step gate matched, shown so a fan can read them. */
function GateTrace({ lines }: { lines: string[] }) {
  return (
    <pre style={{ marginTop: 10, marginBottom: 0, background: "#0a0f15", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 11.5, color: C.dim, fontFamily: C.mono, lineHeight: 1.7, overflowX: "auto", whiteSpace: "pre" }}>
      {lines.join("\n")}
    </pre>
  );
}

type RealState =
  | { status: "loading" }
  | { status: "ok"; v: RealReceiptVerification; trace: string[]; verdict: { label: EvidenceLabel; note: string } }
  | { status: "err"; msg: string };

/**
 * The demo CLIMAX — a REAL kickoff_oracle OuBoundReceipt minted on devnet, fetched read-only and re-verified
 * in THIS browser through the SAME 3-step gate, with no API key and no wallet. Distinct REAL styling vs the
 * SIMULATED interactive cards below.
 */
function RealReceiptCard() {
  const pda = useMemo(() => ouReceiptPda(marketIdFromHex(REAL_MARKET_ID_HEX)), []);
  const [state, setState] = useState<RealState>({ status: "loading" });

  async function load() {
    setState({ status: "loading" });
    try {
      const marketId = marketIdFromHex(REAL_MARKET_ID_HEX);
      const slice = { commitment: "confirmed" as const, dataSlice: { offset: 0, length: 51 } };
      // dataSlice bounds the read to the 51-byte receipt (gate max read = over@50) — a hostile RPC can't make
      // the tab download/copy a huge blob; owner is returned regardless of the slice.
      const info = await new Connection(PRIMARY_RPC, "confirmed").getAccountInfo(pda, slice);
      const fetched = info ? { owner: info.owner, data: new Uint8Array(info.data) } : null;
      const v = verifyRealReceipt(fetched); // throws if pruned / fail-closed
      // re-read the decoded fields via the SAME authoritative gate (no second verifier) for the raw trace
      const verified = verifyOuReceipt({ pubkey: pda, owner: fetched!.owner, data: fetched!.data }, marketId);
      const trace = gateTraceLines({ owner: fetched!.owner, pda, verified });
      // SEC-RPC-01: cross-read the SAME receipt from a 2nd INDEPENDENT RPC and compare the decoded fields.
      // Best-effort: any error / not-found / verify-fail ⇒ secondary=null ⇒ honest single-RPC label (no false green).
      let secondary = null as ReturnType<typeof verifyOuReceipt> | null;
      try {
        const info2 = await new Connection(SECOND_RPC, "confirmed").getAccountInfo(pda, slice);
        secondary = info2 ? verifyOuReceipt({ pubkey: pda, owner: info2.owner, data: new Uint8Array(info2.data) }, marketId) : null;
      } catch { secondary = null; }
      const verdict = crossCheckVerdict(verified, secondary);
      setState({ status: "ok", v, trace, verdict });
    } catch (e) {
      setState({ status: "err", msg: e instanceof Error ? e.message : String(e) });
    }
  }
  useEffect(() => { void load(); }, []);

  const explorer = `https://explorer.solana.com/address/${pda.toBase58()}?cluster=devnet`;
  return (
    <div style={{ marginTop: 16, background: "#0e1f17", border: `1px solid ${C.ok}`, borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: C.ok, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>● REAL · on-chain · devnet</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}><EvidenceBadge label={state.status === "ok" ? state.verdict.label : LABEL_LIVE} /><Pill color={C.ok}>not a mock</Pill></div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>Re-verify a REAL kickoff receipt — in your browser, no key</div>
      {state.status === "loading" && <div style={{ marginTop: 10, color: C.dim, fontSize: 13 }}>fetching the on-chain receipt from devnet…</div>}
      {state.status === "err" && (
        <div style={{ marginTop: 10, color: C.warn, fontSize: 12, fontFamily: C.mono }}>
          ⚠ {state.msg}
          <button onClick={() => void load()} style={{ marginLeft: 10, background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>↻ retry</button>
        </div>
      )}
      {state.status === "ok" && (
        <>
          <div style={{ marginTop: 10, fontSize: 12, color: C.dim, fontFamily: C.mono, lineHeight: 1.7 }}>
            ✓ fetched account {pda.toBase58().slice(0, 12)}… <a href={explorer} target="_blank" rel="noreferrer" style={{ color: C.accent }}>(explorer)</a><br />
            ✓ owned by kickoff_oracle ({KICKOFF_ORACLE_PROGRAM_ID.toBase58().slice(0, 8)}…)<br />
            ✓ OuBoundReceipt discriminator + ["ou_bound", market_id] PDA match<br />
            ✓ outcome (over@50): <b style={{ color: C.text }}>{state.v.resolution === "YES" ? "another goal (YES)" : "no more goals (NO)"}</b> · fixture {String(state.v.fixtureId)}
          </div>
          <div style={{ marginTop: 10, color: state.verdict.label.rail === "PARTIAL" ? C.warn : C.ok, fontWeight: 700, fontSize: 13 }}>
            {state.verdict.label.rail === "PARTIAL" ? "⚠ cross-check FAILED" : "✓ verified, no key"} — {state.verdict.note}
          </div>
          <div style={{ marginTop: 4, color: C.dim, fontSize: 11 }}>owner · discriminator · PDA · outcome are re-derived in your browser from the RPC's bytes; an RPC could lie, so we cross-read a 2nd independent RPC (above) and you can re-check on the <a href={explorer} target="_blank" rel="noreferrer" style={{ color: C.accent }}>explorer</a>.</div>
          <div style={{ marginTop: 10, fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>raw gate-trace (the decoded receipt bytes)</div>
          <GateTrace lines={state.trace} />
          <button onClick={() => void load()} style={{ marginTop: 10, background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>↻ re-verify</button>
        </>
      )}
    </div>
  );
}

export function App() {
  const [phase, setPhase] = useState<Phase>("kickoff");
  const [pick, setPick] = useState<Side | null>(null);
  const [result, setResult] = useState<{ outcome: Side; verified: VerifiedOu; won: boolean } | null>(null);

  const fairYes = useMemo(() => binaryProb(DEMO_LINE, 0), []);
  const receiptPda = useMemo(() => ouReceiptPda(MARKET_ID), []);
  const yesPct = Math.round(fairYes * 1000) / 10;

  function settle() {
    // Demo: a second goal IS scored → the OuBoundReceipt attests `over` (another goal). SYNTHETIC for the
    // demo; the live mint of this exact receipt is rail/proof-gated. The board runs the SAME 3-step gate.
    const data = synthOuReceipt(MARKET_ID, 17588395n, 10, true);
    const acct: OnchainAccount = { pubkey: receiptPda, owner: KICKOFF_ORACLE_PROGRAM_ID, data };
    const outcome = resolveFromReceipt(acct, MARKET_ID); // throws if the gate fails
    const verified = verifyOuReceipt(acct, MARKET_ID);
    setResult({ outcome, verified, won: pick === outcome });
    setPhase("resolved");
  }

  function reset() {
    setPhase("kickoff");
    setPick(null);
    setResult(null);
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>PROPCAST <span style={{ color: C.dim, fontWeight: 400 }}>— live goal-grain micro-markets</span></h1>
        <p style={{ color: C.dim, marginTop: 6, fontSize: 14 }}>
          The in-match micro-market that <b>cannot exist on Polymarket</b> — auto-spawned from an objective
          goal, auto-settled trustlessly from TxODDS's Merkle-anchored score, re-verifiable in your browser.
        </p>

        {/* the REAL on-chain re-verify (the climax — not a mock) */}
        <RealReceiptCard />

        {/* the SIMULATED interactive walkthrough below */}
        <div style={{ marginTop: 18, color: C.dim, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>↓ interactive walkthrough (SIMULATED)</div>

        {/* the live match */}
        <div style={{ marginTop: 14, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
          <div style={{ color: C.dim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>Live · World Cup</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>Argentina 1–0 France <span style={{ color: C.dim, fontSize: 14 }}>· 23'</span></div>

          {phase === "kickoff" && (
            <button onClick={() => setPhase("spawned")} style={{ marginTop: 14, background: C.accent, color: "#fff", border: 0, padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 15 }}>
              ⚽ Goal! → spawn the “another goal” market
            </button>
          )}
        </div>

        {/* the spawned micro-market */}
        {phase !== "kickoff" && (
          <div style={{ marginTop: 16, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: C.dim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>Micro-market · O/U goals</div>
              <Pill color="#1d3b2a">auto-spawned</Pill>
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, marginTop: 8 }}>Another goal after 1–0 (23')?</div>
            <div style={{ marginTop: 8, fontSize: 13, color: C.dim, fontFamily: C.mono }}>
              seed (de-vigged consensus): YES <b style={{ color: C.text }}>{yesPct}%</b> · market_id <span style={{ color: C.text }}>0x{hex(MARKET_ID)}…</span>
              <br />receipt PDA <span style={{ color: C.text }}>{receiptPda.toBase58().slice(0, 16)}…</span> (kickoff_oracle ["ou_bound", market_id])
            </div>

            {phase === "spawned" && (
              <>
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  {(["YES", "NO"] as Side[]).map((s) => (
                    <button key={s} onClick={() => setPick(s)} style={{ flex: 1, padding: "12px 0", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 16, border: `2px solid ${pick === s ? (s === "YES" ? C.ok : C.bad) : C.border}`, background: pick === s ? (s === "YES" ? "#0e2a18" : "#2a0e0e") : "transparent", color: C.text }}>
                      {s === "YES" ? "YES — another goal" : "NO — no more goals"}
                    </button>
                  ))}
                </div>
                <button onClick={settle} disabled={!pick} style={{ marginTop: 12, width: "100%", background: pick ? C.warn : C.border, color: pick ? "#000" : C.dim, border: 0, padding: "10px 0", borderRadius: 8, cursor: pick ? "pointer" : "default", fontWeight: 700 }}>
                  🔊 Whistle: settle from the kickoff Merkle proof
                </button>
              </>
            )}
          </div>
        )}

        {/* the trustless resolution */}
        {phase === "resolved" && result && (
          <div style={{ marginTop: 16, background: C.panel, border: `1px solid ${result.won ? C.ok : C.border}`, borderRadius: 10, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Resolved: {result.outcome === "YES" ? "another goal ✓ (YES)" : "no more goals (NO)"}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}><EvidenceBadge label={LABEL_SIMULATED} /><Pill color={result.won ? C.ok : C.bad}>{result.won ? `your ${pick} won` : `your ${pick} lost`}</Pill></div>
            </div>
            <div style={{ marginTop: 12, background: "#0e2a18", border: `1px solid ${C.ok}`, borderRadius: 8, padding: 12 }}>
              <div style={{ color: C.ok, fontWeight: 700 }}>✓ trustless verify — the proof decides, not an authority</div>
              <div style={{ marginTop: 8, fontSize: 12, color: C.dim, lineHeight: 1.7 }}>
                ✓ receipt owned by kickoff_oracle ({KICKOFF_ORACLE_PROGRAM_ID.toBase58().slice(0, 8)}…)<br />
                ✓ OuBoundReceipt discriminator matches<br />
                ✓ account == ["ou_bound", market_id] PDA<br />
                ✓ outcome read at byte 50 (over), fixture_id {String(result.verified.fixtureId)} @40
              </div>
              <GateTrace lines={gateTraceLines({ owner: KICKOFF_ORACLE_PROGRAM_ID, pda: receiptPda, verified: result.verified })} />
            </div>
            <p style={{ color: C.dim, fontSize: 11, marginTop: 12 }}>
              This card is <b>SIMULATED</b> for the walkthrough (the live mint of a real OuBoundReceipt for THIS
              market is rail/proof-gated) — it runs the identical 3-step gate (<code>verifyOuReceipt</code>). The
              <b> REAL on-chain instance is the green card at the top</b>. Venue close (claim/payout) is labeled
              <b> trusted-now, proof-gated-target</b> — the trustless datum is the kickoff receipt shown here.
              No $-PnL — PROPCAST measures market coverage + the trustless receipt, not profit.
            </p>
            <button onClick={reset} style={{ marginTop: 6, background: C.panel, color: C.text, border: `1px solid ${C.border}`, padding: "8px 14px", borderRadius: 6, cursor: "pointer" }}>↺ next goal</button>
          </div>
        )}

        {/* breadth: the auto-spawned total-goals line markets (each line-bound + trustlessly settleable) */}
        <div style={{ marginTop: 18, color: C.dim, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>more goal-grain markets · auto-spawned · O/U total goals (SIMULATED)</div>
        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          {TOTAL_GOALS_LINES.map(({ line, odds }) => (
            <div key={line} style={{ flex: "1 1 160px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>O/U {line} total goals</div>
              <div style={{ marginTop: 6, fontSize: 12, color: C.dim, fontFamily: C.mono }}>
                seed OVER <b style={{ color: C.text }}>{Math.round(binaryProb(odds, 0) * 1000) / 10}%</b><br />line_q {Math.round(line * 4)} · settle-bound
              </div>
            </div>
          ))}
        </div>

        {/* how we keep this honest — the trust assumptions, fan-readable (mirrors SECURITY.md §3) */}
        <details style={{ marginTop: 18, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 13 }}>🛡️ how we keep this honest</summary>
          <ul style={{ marginTop: 10, marginBottom: 0, paddingLeft: 18, color: C.dim, fontSize: 12, lineHeight: 1.8 }}>
            <li><b>The trustless datum is the on-chain receipt</b> — anyone re-verifies it (owner · discriminator · PDA · outcome). The green tick above is a 2-RPC cross-check, not our word.</li>
            <li><b>The receipt is minted only behind a Merkle-proven score</b> (the oracle's <code>cpi_gated</code> path); a fabricated "trustless" mint is impossible while it is on.</li>
            <li><b>The venue payout is trusted-now, proof-gated-target</b> — labeled, not hidden; the trustless datum is the receipt, the close is a future proof-gated upgrade.</li>
            <li><b>Goal-grain only · event-granularity (~60s) · NO $-PnL</b> — we report market coverage + the trustless receipt, never profit; never "per-second".</li>
            <li>Full threat model: <code>SECURITY.md</code>.</li>
          </ul>
        </details>

        <p style={{ color: C.dim, fontSize: 11, marginTop: 18 }}>
          goal-grain only (v1) · event-granularity settle (not per-second) · novelty = grain + objective Merkle
          settle (on-chain parlays + live in-game markets already exist) · clean-room.
        </p>
      </div>
    </div>
  );
}
