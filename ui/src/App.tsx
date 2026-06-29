import { useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { binaryProb } from "../../src/signal/devig.js";
import { KICKOFF_ORACLE_PROGRAM_ID, OU_BOUND_RECEIPT_DISCRIMINATOR, ouReceiptPda } from "../../src/onchain/receipt.js";
import { resolveFromReceipt, verifyOuReceipt, type OnchainAccount, type VerifiedOu } from "../../src/onchain/settle_consumer.js";

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
              <Pill color={result.won ? C.ok : C.bad}>{result.won ? `your ${pick} won` : `your ${pick} lost`}</Pill>
            </div>
            <div style={{ marginTop: 12, background: "#0e2a18", border: `1px solid ${C.ok}`, borderRadius: 8, padding: 12 }}>
              <div style={{ color: C.ok, fontWeight: 700 }}>✓ trustless verify — the proof decides, not an authority</div>
              <div style={{ marginTop: 8, fontSize: 12, color: C.dim, lineHeight: 1.7 }}>
                ✓ receipt owned by kickoff_oracle ({KICKOFF_ORACLE_PROGRAM_ID.toBase58().slice(0, 8)}…)<br />
                ✓ OuBoundReceipt discriminator matches<br />
                ✓ account == ["ou_bound", market_id] PDA<br />
                ✓ outcome read at byte 50 (over), fixture_id {String(result.verified.fixtureId)} @40
              </div>
            </div>
            <p style={{ color: C.dim, fontSize: 11, marginTop: 12 }}>
              The receipt here is <b>SYNTHETIC</b> for the demo (the live mint of a real OuBoundReceipt for this
              market is rail/proof-gated); the board runs the identical 3-step settle gate (`verifyOuReceipt`).
              No $-PnL — PROPCAST measures market coverage + the trustless receipt, not profit.
            </p>
            <button onClick={reset} style={{ marginTop: 6, background: C.panel, color: C.text, border: `1px solid ${C.border}`, padding: "8px 14px", borderRadius: 6, cursor: "pointer" }}>↺ next goal</button>
          </div>
        )}

        <p style={{ color: C.dim, fontSize: 11, marginTop: 18 }}>
          goal-grain only (v1) · event-granularity settle (not per-second) · novelty = grain + objective Merkle
          settle (on-chain parlays + live in-game markets already exist) · clean-room.
        </p>
      </div>
    </div>
  );
}
