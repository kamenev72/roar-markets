import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { binaryProb } from "../../packages/core/src/signal/devig.js";
import { EVIDENCE_CATALOG } from "./evidenceCatalog.js";
import { applyResult, loadStreak, multiplier, saveStreak, shareText } from "./streak.js";
import { demoSchedule, parseDemoParam } from "./demo_schedule.js";
import { accuracy, appendCall, loadHistory, saveHistory } from "./history.js";
import { browserDownload, createRecordCardModel, renderRecordCard, type RecordCardV1 } from "./record_card.js";
import { clearPrivateStorage } from "./clear_record.js";

const VerificationWorkbench = lazy(() => import("./components/VerificationWorkbench.js"));

const TOTAL_GOALS_LINES: { line: number; odds: [number, number] }[] = [
  { line: 1.5, odds: [1.35, 3.1] },
  { line: 2.5, odds: [1.95, 1.85] },
  { line: 3.5, odds: [3.2, 1.34] },
];

const DEMO_LINE: [number, number] = [1.85, 1.95];
const SIMULATED_RECEIPT = "9vV6Lw3oF7GJ3uQe6eXr9Aq3kWf2Jm8B";
const EVIDENCE_DATE = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(
  new Date(`${EVIDENCE_CATALOG[0].date}T00:00:00Z`),
);

type Phase = "kickoff" | "spawned" | "resolved";
type Side = "YES" | "NO";

function BrandMark() {
  return (
    <a className="brand" href="#top" aria-label="Roar Markets home">
      <img src="/roar-mark.svg" width="44" height="44" alt="" aria-hidden="true" />
      <span translate="no">Roar Markets</span>
    </a>
  );
}

function ArrowIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function MatchPulse() {
  return (
    <div className="match-pulse" aria-hidden="true">
      <span className="pulse-label">Match pulse</span>
      <svg viewBox="0 0 400 44" preserveAspectRatio="none">
        <path d="M0 25h98l13-9 16 18 18-28 19 30 15-11H260l12-8 17 14 16-19 20 13h75" />
      </svg>
      <span className="pulse-dot" />
    </div>
  );
}

function MatchScore() {
  return (
    <div className="scoreboard" aria-label="Argentina 1, France 0, 23 minutes played">
      <div className="team team-home"><span className="flag flag-arg" aria-hidden="true" /><strong>Argentina</strong></div>
      <div className="score"><span>1</span><b>:</b><span>0</span></div>
      <div className="team team-away"><strong>France</strong><span className="flag flag-fra" aria-hidden="true" /></div>
      <div className="match-minute"><span className="live-dot" aria-hidden="true" />23:14</div>
    </div>
  );
}

function ResultTicket({
  pick,
  outcome,
  streak,
  receiptRef,
  onShare,
  shareStatus,
  onDownload,
  downloadStatus,
  card,
  onReset,
}: {
  pick: Side;
  outcome: Side;
  streak: number;
  receiptRef: string;
  onShare: () => void;
  shareStatus: "idle" | "copied" | "failed";
  onDownload: () => void;
  downloadStatus: "idle" | "started" | "failed";
  card: RecordCardV1;
  onReset: () => void;
}) {
  const won = pick === outcome;
  return (
    <section className="result-ticket" aria-labelledby="result-title">
      <div className="ticket-stub">
        <span className="ticket-kicker">Full-time</span>
        <span className="ticket-verdict">{won ? "You called it" : "Next call’s yours"}</span>
        <span className="ticket-score">ARG 2–1 FRA</span>
      </div>
      <div className="ticket-body">
        <div className="ticket-heading">
          <div>
            <span className="ticket-kicker">Moment proof attached</span>
            <h2 id="result-title">Another goal: {outcome}</h2>
          </div>
          <span className="proof-chip"><CheckIcon /> Bound</span>
        </div>

        <dl className="proof-facts">
          <div><dt>Match</dt><dd>Argentina vs France</dd></div>
          <div><dt>Line</dt><dd>Another goal after 23′</dd></div>
          <div><dt>Your call</dt><dd>{pick}</dd></div>
          <div><dt>Outcome</dt><dd>{outcome}</dd></div>
        </dl>

        {won ? <p className="streak-line">Run: {streak} correct · {multiplier(streak).toFixed(1)}× roar</p> : null}

        <details className="proof-details">
          <summary>Inspect this walkthrough proof</summary>
          <p>
            This device-local result ran through the same fixture-and-line binding check as the historical receipt.
            It is a simulation, not evidence of a live payout or final whistle.
          </p>
          <code>receipt {receiptRef}</code>
        </details>

        <div className="ticket-actions">
          <button className="button button-primary" type="button" onClick={onShare}>
            {shareStatus === "copied" ? "Result copied" : shareStatus === "failed" ? "Copy failed" : "Copy my call"}
          </button>
          <button className="button button-quiet" type="button" onClick={onDownload}>Download record card</button>
          <button className="button button-quiet" type="button" onClick={onReset}>Play again</button>
        </div>
        <p className="sr-status" aria-live="polite">{shareStatus === "copied" ? "Result copied to clipboard." : shareStatus === "failed" ? "Clipboard unavailable. Select and copy the result manually." : downloadStatus === "started" ? "Download started." : downloadStatus === "failed" ? "Download could not be started." : ""}</p>
        <RecordCardPreview card={card} />
      </div>
    </section>
  );
}

function RecordCardPreview({ card }: { card: RecordCardV1 }) {
  const current = card.history.find((record) => record.id === card.currentRecordId) ?? card.history[0];
  if (!current) return null;
  return (
    <figure className="record-card-preview" aria-labelledby="record-card-preview-title">
      <figcaption><span>Simulated walkthrough · this browser only · no prize</span><h3 id="record-card-preview-title">Your private record card</h3></figcaption>
      <div className="record-card-stats">
        <span><b>{card.history.length}</b> calls</span><span><b>{card.accuracy === null ? "—" : `${card.accuracy}%`}</b> accuracy</span><span><b>{card.bestRun}</b> best run</span>
      </div>
      <article className="record-card-current" aria-current="true" aria-label="Current call highlight">
        <span>Current call</span><strong>{current.question}</strong><small>{current.pick} · outcome {current.outcome} · {current.won ? "Called it" : "Missed"}</small>
      </article>
      <p>No payout, rank, reward, leaderboard, Prediction IQ, or prize.</p>
    </figure>
  );
}

export function App() {
  const [phase, setPhase] = useState<Phase>("kickoff");
  const [pick, setPick] = useState<Side | null>(null);
  const [result, setResult] = useState<{ outcome: Side; won: boolean; shareReceiptRef: string } | null>(null);
  const [streak, setStreak] = useState(() => loadStreak(typeof localStorage === "undefined" ? null : localStorage));
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "started" | "failed">("idle");
  const [historyStatus, setHistoryStatus] = useState("");
  const [history, setHistory] = useState(() => loadHistory(typeof localStorage === "undefined" ? null : localStorage));
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const demoSecs = useMemo(() => parseDemoParam(typeof window === "undefined" ? "" : window.location.search), []);
  const fairYes = useMemo(() => binaryProb(DEMO_LINE, 0), []);
  const yesPct = Math.round(fairYes * 100);
  const recordCard = useMemo(() => result ? createRecordCardModel(history, streak.best, currentRecordId) : null, [currentRecordId, history, result, streak.best]);

  function recordResult(next: { outcome: Side; won: boolean; shareReceiptRef: string }) {
    const recordId = `${Date.now()}:${pick ?? "YES"}:${next.outcome}`;
    setResult(next);
    setCurrentRecordId(recordId);
    setStreak((current) => {
      const updated = applyResult(current, next.won);
      saveStreak(typeof localStorage === "undefined" ? null : localStorage, updated);
      return updated;
    });
    setHistory((current) => {
      const updated = appendCall(current, {
        id: recordId,
        question: "Another goal after 1–0 (23′)?",
        pick: pick ?? "YES",
        outcome: next.outcome,
        won: next.won,
        receiptRef: next.shareReceiptRef,
      });
      saveHistory(typeof localStorage === "undefined" ? null : localStorage, updated);
      return updated;
    });
    setShareStatus("idle");
    setDownloadStatus("idle");
    setPhase("resolved");
  }

  useEffect(() => {
    if (demoSecs === null) return;
    const timers = demoSchedule(demoSecs).map((step) =>
      window.setTimeout(() => {
        if (step.action === "spawn") setPhase("spawned");
        if (step.action === "pick_yes") setPick("YES");
        if (step.action === "settle") {
          setPick("YES");
          recordResult({ outcome: "YES", won: true, shareReceiptRef: SIMULATED_RECEIPT });
        }
      }, step.atMs),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [demoSecs]);

  function reset() {
    setPhase("kickoff");
    setPick(null);
    setResult(null);
    setCurrentRecordId(null);
    setShareStatus("idle");
    setDownloadStatus("idle");
  }

  async function copyResult() {
    if (!result) return;
    const text = shareText({
        won: result.won,
        pick: pick ?? "YES",
        question: "Another goal after 1–0 (23′)?",
        streak: streak.streak,
        receiptRef: result.shareReceiptRef,
      });
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setShareStatus("copied");
    } catch { setShareStatus("failed"); }
  }

  function downloadResultCard() {
    if (!recordCard) return;
    try { setDownloadStatus(browserDownload(renderRecordCard(recordCard)) ? "started" : "failed"); }
    catch { setDownloadStatus("failed"); }
  }

  function clearPrivateRecord() {
    try {
      if (typeof window === "undefined" || !window.confirm("Clear your saved calls and best run from this device?")) {
        setHistoryStatus("Your private record was not cleared.");
        return;
      }
      const storage = window.localStorage;
      const cleared = clearPrivateStorage(storage);
      if (cleared.kind === "cleared") {
        setHistory({ records: [] }); setStreak({ streak: 0, best: 0 }); setHistoryStatus("Your saved calls and best run were cleared from this device.");
      } else if (cleared.kind === "restored" || cleared.kind === "partial") {
        setHistory(loadHistory({ getItem: () => cleared.history })); setStreak(loadStreak({ getItem: () => cleared.streak }));
        setHistoryStatus(cleared.kind === "restored" ? "Could not clear your private record. The previous device record was restored." : "Could not fully clear your private record. Device storage now contains a partial state.");
      } else {
        setHistory(loadHistory(storage)); setStreak(loadStreak(storage)); setHistoryStatus("Could not verify whether your private record was cleared. Device storage may have changed.");
      }
    } catch {
      setHistoryStatus("Could not verify whether your private record was cleared. Device storage may have changed.");
    } finally {
      window.setTimeout(() => clearButtonRef.current?.focus(), 0);
    }
  }

  return (
    <div id="top" className="site-shell">
      <a className="skip-link" href="#main-content">Skip to match</a>

      <header className="site-header">
        <BrandMark />
        <nav aria-label="Primary navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#proof">See the proof</a>
          <a className="nav-cta" href="#play">Make a call</a>
        </nav>
      </header>

      <main id="main-content">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="live-label"><span className="live-dot" aria-hidden="true" /> World Cup match lab</div>
            <h1 id="hero-title">Call the next <em>moment.</em></h1>
            <p className="hero-lede">
              Pick yes or no while the match moves. When the answer lands, the exact fixture and line stay attached
              to your result.
            </p>
            <a className="button button-primary hero-cta" href="#play">Play the 20-second match <ArrowIcon /></a>
            <p className="scope-note"><strong>The binding is real.</strong> Payout, finality, and custody are outside this prototype.</p>
          </div>

          <div id="play" className="match-stage">
            <div className="stadium-lights" aria-hidden="true"><span /><span /><span /><span /></div>
            <div className="match-card">
              <div className="match-card-topline">
                <span>Group final · Lusail</span>
                {demoSecs !== null ? <span>Replay · {demoSecs}s</span> : <span>Interactive demo</span>}
              </div>
              <MatchScore />
              <MatchPulse />

              {phase === "kickoff" ? (
                <div className="moment-intro">
                  <span className="moment-number">The crowd is still roaring.</span>
                  <h2>A goal just landed. What happens next?</h2>
                  <button className="button button-primary button-wide" type="button" onClick={() => setPhase("spawned")}>Open the next call <ArrowIcon /></button>
                </div>
              ) : null}

              {phase === "spawned" ? (
                <div className="market-panel" aria-labelledby="market-question">
                  <div className="market-meta"><span>Next moment</span><span>{yesPct}% fan seed</span></div>
                  <h2 id="market-question">Will there be another goal?</h2>
                  <p>After Argentina took a 1–0 lead in the 23rd minute.</p>
                  <div className="pick-grid" role="group" aria-label="Choose your call">
                    {(["YES", "NO"] as Side[]).map((side) => (
                      <button
                        className="pick-button"
                        aria-pressed={pick === side}
                        key={side}
                        type="button"
                        onClick={() => setPick(side)}
                      >
                        <span>{side}</span>
                        <small>{side === "YES" ? "Another goal lands" : "The score holds"}</small>
                      </button>
                    ))}
                  </div>
                  <Suspense fallback={<p className="loading-copy" aria-live="polite">Preparing the result…</p>}>
                    <VerificationWorkbench mode="simulated" pick={pick} onResolved={recordResult} />
                  </Suspense>
                </div>
              ) : null}

              {phase === "resolved" && result && pick && recordCard ? (
                <ResultTicket
                  pick={pick}
                  outcome={result.outcome}
                  streak={streak.streak}
                  receiptRef={result.shareReceiptRef}
                  onShare={copyResult}
                  shareStatus={shareStatus}
                  onDownload={downloadResultCard}
                  downloadStatus={downloadStatus}
                  card={recordCard}
                  onReset={reset}
                />
              ) : null}
            </div>
          </div>
        </section>

        <section className="promise-strip" aria-label="Product promise">
          <p>One tap to call it.</p><span aria-hidden="true" />
          <p>One result you can follow.</p><span aria-hidden="true" />
          <p>One proof that stays with the moment.</p>
        </section>

        <section className="section history-section" aria-labelledby="history-title">
          <div className="section-heading">
            <span className="section-kicker">Your device · your calls</span>
            <h2 id="history-title">A small record of your match instinct.</h2>
            <p>Stored only in this browser. No account, public leaderboard, wallet, or payout claim.</p>
          </div>
          <div className="history-summary">
            <div><strong>{history.records.length}</strong><span>calls saved</span></div>
            <div><strong>{accuracy(history) === null ? "—" : `${accuracy(history)}%`}</strong><span>accuracy</span></div>
            <div><strong>{streak.best}</strong><span>best run</span></div>
          </div>
          {history.records.length ? <ol className="history-list">
            {history.records.slice(0, 5).map((call) => <li key={call.id}>
              <span className={call.won ? "history-win" : "history-miss"}>{call.won ? "Called it" : "Missed"}</span>
              <strong>{call.pick}</strong><small>Outcome {call.outcome}</small>
            </li>)}
          </ol> : <p className="history-empty">Make the first call to start a private match-day record.</p>}
          <button ref={clearButtonRef} className="button button-quiet" type="button" onClick={clearPrivateRecord}>Clear private record</button>
          <p className="sr-status" aria-live="polite">{historyStatus}</p>
        </section>

        <section id="how-it-works" className="section how-section" aria-labelledby="how-title">
          <div className="section-heading">
            <span className="section-kicker">Built for the 90 minutes</span>
            <h2 id="how-title">A market that moves like the match.</h2>
            <p>No dashboards to decode. Roar Markets turns a live score into a clear fan call, then keeps the answer and its context together.</p>
          </div>

          <ol className="steps">
            <li><span>01</span><div><h3>See the moment</h3><p>A goal changes the match and opens a focused yes-or-no question.</p></div></li>
            <li><span>02</span><div><h3>Make your call</h3><p>Choose a side while the line, teams, score, and match minute are visible.</p></div></li>
            <li><span>03</span><div><h3>Keep the proof</h3><p>The result arrives with the same fixture and line attached—not a detached verdict.</p></div></li>
          </ol>
        </section>

        <section className="section market-section" aria-labelledby="markets-title">
          <div className="market-heading">
            <span className="section-kicker">More ways to read the game</span>
            <h2 id="markets-title">From the next goal to the final total.</h2>
          </div>
          <div className="market-cards">
            {TOTAL_GOALS_LINES.map(({ line, odds }) => (
              <article key={line} className="line-card">
                <span className="line-label">Total goals</span>
                <h3>Over or under {line}?</h3>
                <div className="line-split">
                  <span><b>{Math.round(binaryProb(odds, 0) * 100)}%</b> over</span>
                  <span><b>{100 - Math.round(binaryProb(odds, 0) * 100)}%</b> under</span>
                </div>
                <span className="demo-tag">Walkthrough market</span>
              </article>
            ))}
          </div>
        </section>

        <section id="proof" className="section proof-section" aria-labelledby="proof-title">
          <div className="proof-intro">
            <span className="section-kicker">The result keeps its context</span>
            <h2 id="proof-title">Real proof binding, shown progressively.</h2>
            <p>
              The historical devnet example below can be read again in your browser. Roar Markets checks that the
              receipt belongs to the expected program and still matches the exact market, fixture, line, and outcome.
            </p>
          </div>

          <div className="boundary-grid">
            <article className="boundary-card boundary-real">
              <span className="boundary-label"><CheckIcon /> Demonstrated here</span>
              <h3>The result cannot quietly swap matches or lines.</h3>
              <p>The browser rejects a receipt if its owner, type, market, fixture, line, or answer does not match.</p>
            </article>
            <article className="boundary-card boundary-outside">
              <span className="boundary-label">Outside the prototype</span>
              <h3>Money movement and the final whistle.</h3>
              <p>No public payout, refund, custody, dispute, or finality policy is demonstrated.</p>
            </article>
          </div>

          <details
            className="proof-disclosure"
            onToggle={(event) => setProofOpen(event.currentTarget.open)}
          >
            <summary>
              <span><strong>Open the historical match proof</strong><small>Under 2.5 goals · Solana devnet · <time dateTime={EVIDENCE_CATALOG[0].date}>{EVIDENCE_DATE}</time></small></span>
              <span className="summary-action">Verify in browser <ArrowIcon /></span>
            </summary>
            {proofOpen ? (
              <Suspense fallback={<div className="verifier-loading" aria-live="polite">Loading the proof checker…</div>}>
                <VerificationWorkbench mode="real" />
              </Suspense>
            ) : null}
          </details>
        </section>

        <section className="closing-cta" aria-labelledby="closing-title">
          <span className="section-kicker">Your next call is waiting</span>
          <h2 id="closing-title">Feel the match. Call the moment. Keep the proof.</h2>
          <a className="button button-primary" href="#play">Play the match <ArrowIcon /></a>
        </section>
      </main>

      <footer>
        <BrandMark />
        <p>Fan-first match moments with fixture-and-line proof attached.</p>
        <div className="footer-links">
          <a href="https://github.com/kamenev72/roar-markets" target="_blank" rel="noreferrer">Source code</a>
          <a href="https://explorer.solana.com/address/39vT6hs7hmqcQ3oaQ3AgCMJrdX2dz5973hhoffVQiX6n?cluster=devnet" target="_blank" rel="noreferrer">Historical receipt</a>
          <span>Apache-2.0</span>
        </div>
      </footer>
    </div>
  );
}
