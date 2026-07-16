import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { binaryProb } from "../../src/signal/devig.js";
import { EVIDENCE_CATALOG } from "./evidenceCatalog.js";
import { EVIDENCE_STATES } from "./evidence_state.js";
import { applyResult, loadStreak, multiplier, saveStreak, shareText, verdictName } from "./streak.js";
import { demoSchedule, parseDemoParam } from "./demo_schedule.js";

const VerificationWorkbench = lazy(() => import("./components/VerificationWorkbench.js"));

const TOTAL_GOALS_LINES: { line: number; odds: [number, number] }[] = [
  { line: 1.5, odds: [1.35, 3.1] },
  { line: 2.5, odds: [1.95, 1.85] },
  { line: 3.5, odds: [3.2, 1.34] },
];

const DEMO_LINE: [number, number] = [1.85, 1.95];

type Phase = "kickoff" | "spawned" | "resolved";
type Side = "YES" | "NO";

function EvidenceBadge({ label }: { label: string }) {
  return <span className="evidence-badge evidence-warning">{label}</span>;
}

export function App() {
  const [phase, setPhase] = useState<Phase>("kickoff");
  const [pick, setPick] = useState<Side | null>(null);
  const [result, setResult] = useState<{ outcome: Side; won: boolean; shareReceiptRef: string } | null>(null);
  const [streak, setStreak] = useState(() => loadStreak(typeof localStorage === "undefined" ? null : localStorage));
  const [shared, setShared] = useState(false);
  const demoSecs = useMemo(() => parseDemoParam(typeof window === "undefined" ? "" : window.location.search), []);
  const fairYes = useMemo(() => binaryProb(DEMO_LINE, 0), []);
  const yesPct = Math.round(fairYes * 1000) / 10;

  function recordResult(next: { outcome: Side; won: boolean; shareReceiptRef: string }) {
    setResult(next);
    setStreak((s) => {
      const updated = applyResult(s, next.won);
      saveStreak(typeof localStorage === "undefined" ? null : localStorage, updated);
      return updated;
    });
    setShared(false);
    setPhase("resolved");
  }

  useEffect(() => {
    if (demoSecs === null) return;
    const timers = demoSchedule(demoSecs).map((step) =>
      setTimeout(() => {
        if (step.action === "spawn") setPhase("spawned");
        else if (step.action === "pick_yes") setPick("YES");
        else {
          setPick("YES");
        }
      }, step.atMs),
    );
    return () => timers.forEach(clearTimeout);
  }, [demoSecs]);

  function reset() {
    setPhase("kickoff");
    setPick(null);
    setResult(null);
  }

  return (
    <main className="app-shell">
      <div className="board">
        <section className="hero" aria-labelledby="propcast-title">
          <div className="eyebrow">Crowd90 · by PROPCAST</div>
          <h1 id="propcast-title">Crowd90 by PROPCAST — pick the next moment. Keep the proof attached.</h1>
          <p className="muted">
            A live-match fan board for fast YES/NO moments. Every result card stays bound to the exact market,
            fixture and line; finality, payout, refund and custody remain explicitly outside this prototype.
          </p>
          <div className="card-row">
            {demoSecs !== null && <span className="pill">● REPLAY {demoSecs}s</span>}
            {streak.streak > 0 && <span className="pill">🔥 streak {streak.streak} ×{multiplier(streak.streak).toFixed(1)}</span>}
          </div>
        </section>

        <Suspense fallback={<section className="card"><p className="muted">loading verifier workbench…</p></section>}>
          <VerificationWorkbench mode="real" />
        </Suspense>

        <section className="card" aria-labelledby="match-title">
          <div className="eyebrow">Simulated · World Cup walkthrough</div>
          <h2 id="match-title">Argentina 1–0 France · 23'</h2>
          <p className="muted">
            The walkthrough is device-local and simulated. The separate real card above is the historical receipt
            evidence from catalog `{EVIDENCE_CATALOG[0].id}`.
          </p>
          {phase === "kickoff" && (
            <button onClick={() => setPhase("spawned")}>⚽ Goal! → spawn the “another goal” market</button>
          )}
        </section>

        {phase !== "kickoff" && (
          <section className="card" aria-labelledby="micro-market-title">
            <div className="card-row">
              <div className="eyebrow">Micro-market · O/U goals</div>
              <span className="pill">auto-spawned</span>
            </div>
            <h2 id="micro-market-title">Another goal after 1–0?</h2>
            <p className="muted mono">seed YES {yesPct}% · fixture 17588395 · simulated line_q 6</p>
            {phase === "spawned" && (
              <>
                <div className="actions" role="group" aria-label="Choose side">
                  {(["YES", "NO"] as Side[]).map((side) => (
                    <button className="choice" data-active={pick === side} key={side} onClick={() => setPick(side)}>
                      {side === "YES" ? "YES — another goal" : "NO — no more goals"}
                    </button>
                  ))}
                </div>
                <Suspense fallback={<p className="muted">loading receipt verifier…</p>}>
                  <VerificationWorkbench mode="simulated" pick={pick} onResolved={recordResult} />
                </Suspense>
              </>
            )}
          </section>
        )}

        {phase === "resolved" && result && (
          <section className="card" aria-labelledby="resolved-title">
            <div className="card-row">
              <h2 id="resolved-title">Resolved: {result.outcome === "YES" ? "another goal ✓" : "no more goals"}</h2>
              <EvidenceBadge label={EVIDENCE_STATES.SIMULATED.label} />
            </div>
            <p className="muted">
              Simulated bytes passed the same lazy verifier boundary. This remains separate from the historical
              real receipt and does not prove finality, payout, refund, custody or public settlement timing.
            </p>
            <div className="card-row">
              <span className="pill">{verdictName(result.won, streak.streak)}</span>
              {result.won && <span className="muted">streak {streak.streak} · ×{multiplier(streak.streak).toFixed(1)} (best {streak.best})</span>}
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(shareText({ won: result.won, pick: pick ?? "YES", question: "Another goal after 1–0 (23')?", streak: streak.streak, receiptRef: result.shareReceiptRef }));
                  setShared(true);
                }}
              >
                {shared ? "✓ copied" : "📣 copy share-card"}
              </button>
            </div>
            <button onClick={reset}>↺ next goal</button>
          </section>
        )}

        <section className="grid" aria-label="Goal-grain market discovery">
          {TOTAL_GOALS_LINES.map(({ line, odds }) => (
            <article key={line} className="card">
              <h3>O/U {line} total goals</h3>
              <p className="muted mono">seed OVER {Math.round(binaryProb(odds, 0) * 1000) / 10}% · line_q {Math.round(line * 4)}</p>
              <EvidenceBadge label={EVIDENCE_STATES.SIMULATED.label} />
            </article>
          ))}
        </section>

        <section className="card" aria-labelledby="trust-title">
          <h2 id="trust-title">Trust boundary</h2>
          <ul className="limit-rail">
            <li>The receipt binding is re-verifiable: owner, type, PDA, embedded market, fixture, line and outcome.</li>
            <li>Dual-RPC agreement is the only green state. Single-RPC, unavailable, invalid and divergent states are visibly weaker.</li>
            <li>No public fund-holding venue, payout/refund path, finality policy or custody claim is demonstrated.</li>
            <li>Goal-grain only; no $-PnL.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
