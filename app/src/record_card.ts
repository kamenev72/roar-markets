import { accuracy, normalizeHistory, type CallHistory, type CallRecord } from "./history.js";

export const RECORD_CARD_SCHEMA = "roar/record-card/v1" as const;
const CARD_HISTORY_LIMIT = 20;
const TEXT_LIMIT = 120;

export interface RecordCardV1 {
  readonly schema: typeof RECORD_CARD_SCHEMA;
  readonly history: readonly CallRecord[];
  readonly accuracy: number | null;
  readonly bestRun: number;
  readonly currentRecordId: string | null;
}

/** Removes XML-illegal controls and unpaired surrogates, then truncates by Unicode code point. */
export function safeCardText(value: unknown, limit = TEXT_LIMIT): string {
  const text = String(value ?? "").normalize("NFC");
  let clean = "";
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { clean += text.charAt(index) + text.charAt(index + 1); index += 1; }
    } else if ((code < 0xdc00 || code > 0xdfff) && (code === 9 || code === 10 || code === 13 || code >= 32) && code !== 0xfffe && code !== 0xffff) clean += text.charAt(index);
  }
  return Array.from(clean).slice(0, Math.max(0, limit)).join("");
}

export function createRecordCardModel(history: CallHistory, bestRun: number, currentRecordId: unknown): RecordCardV1 {
  const normalized = normalizeHistory(history);
  const candidate = safeCardText(currentRecordId, 80).trim();
  return {
    schema: RECORD_CARD_SCHEMA,
    history: normalized.records.slice(0, CARD_HISTORY_LIMIT),
    accuracy: accuracy(normalized),
    bestRun: Number.isFinite(bestRun) ? Math.min(CARD_HISTORY_LIMIT, Math.max(0, Math.trunc(bestRun))) : 0,
    currentRecordId: normalized.records.some((record) => record.id === candidate) ? candidate : null,
  };
}

function xml(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[char]!); }

/** Fixed SVG: only escaped text nodes vary, with no active content, raw markup, IDs, or timestamps. */
export function renderRecordCard(model: RecordCardV1): string {
  const normalized = createRecordCardModel({ records: model.history }, model.bestRun, model.currentRecordId);
  const current = normalized.history.find((record) => record.id === normalized.currentRecordId) ?? normalized.history[0];
  if (!current) throw new Error("record card requires one valid record");
  const verdict = current.pick === current.outcome ? "CALLED IT" : "MISS";
  const question = xml(safeCardText(current.question, 42));
  const summary = `${normalized.history.length} CALLS · ${normalized.accuracy === null ? "—" : `${normalized.accuracy}%`} ACCURACY · BEST RUN ${normalized.bestRun}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Roar Markets simulated walkthrough record card"><rect width="1200" height="630" fill="#06142e"/><rect x="48" y="48" width="1104" height="534" rx="28" fill="#0d2445" stroke="#65d8ff"/><text x="96" y="104" fill="#65d8ff" font-family="Arial, sans-serif" font-size="25" font-weight="700">ROAR MARKETS · SIMULATED WALKTHROUGH</text><text x="1080" y="104" text-anchor="end" fill="#b9cbe4" font-family="Arial, sans-serif" font-size="16">roar/record-card/v1</text><text x="96" y="174" fill="#b9cbe4" font-family="Arial, sans-serif" font-size="24">${xml(summary)}</text><text x="96" y="258" fill="#ffffff" font-family="Arial, sans-serif" font-size="46" font-weight="700">${question}</text><text x="96" y="356" fill="#b9cbe4" font-family="Arial, sans-serif" font-size="24">YOUR CALL</text><text x="96" y="416" fill="#ffffff" font-family="Arial, sans-serif" font-size="52" font-weight="700">${current.pick}</text><text x="500" y="356" fill="#b9cbe4" font-family="Arial, sans-serif" font-size="24">OUTCOME</text><text x="500" y="416" fill="#ffffff" font-family="Arial, sans-serif" font-size="52" font-weight="700">${current.outcome}</text><text x="900" y="416" fill="#79e9c2" font-family="Arial, sans-serif" font-size="34" font-weight="700">${verdict}</text><text x="96" y="510" fill="#b9cbe4" font-family="Arial, sans-serif" font-size="22">CURRENT CALL HIGHLIGHT · THIS BROWSER ONLY · NO PRIZE</text><text x="96" y="550" fill="#b9cbe4" font-family="Arial, sans-serif" font-size="19">No payout, rank, reward, leaderboard, or Prediction IQ</text></svg>`;
}

interface DownloadAnchor { href: string; download: string; click(): void; remove(): void }
export interface DownloadEnvironment {
  Blob: typeof Blob; createObjectURL(blob: Blob): string; revokeObjectURL(url: string): void;
  createAnchor(): DownloadAnchor; append(anchor: DownloadAnchor): void; defer(action: () => void): void;
}

function safely(action: () => void): void { try { action(); } catch { /* cleanup must never mask download outcome */ } }

export function downloadRecordCard(svg: string, env: DownloadEnvironment): boolean {
  let url: string | null = null; let anchor: DownloadAnchor | null = null; let started = false;
  try {
    url = env.createObjectURL(new env.Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    anchor = env.createAnchor(); anchor.href = url; anchor.download = "roar-record-card.svg";
    env.append(anchor); anchor.click(); started = true;
  } catch { started = false; }
  finally {
    if (anchor) safely(() => anchor!.remove());
    if (url) {
      if (started) {
        try { env.defer(() => safely(() => env.revokeObjectURL(url!))); }
        catch { safely(() => env.revokeObjectURL(url!)); }
      } else safely(() => env.revokeObjectURL(url!));
    }
  }
  return started;
}

export function browserDownload(svg: string): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined") return false;
  return downloadRecordCard(svg, { Blob, createObjectURL: URL.createObjectURL.bind(URL), revokeObjectURL: URL.revokeObjectURL.bind(URL), createAnchor: () => document.createElement("a"), append: (anchor) => document.body.append(anchor as HTMLAnchorElement), defer: (action) => window.setTimeout(action, 0) });
}
