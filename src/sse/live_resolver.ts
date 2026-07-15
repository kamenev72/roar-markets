// PROPCAST live-match auto-resolver — the clean, testable orchestration core for the no-human-in-the-loop
// demo: detect a goal → auto-spawn the micro-market → (at the settle trigger: the next goal or the whistle)
// mint the TxLINE-proven receipt → re-verify it through PROPCAST's complete market/fixture/line gate → record evidence.
//
// EVENT granularity (a goal / whistle), NEVER per-second. Idempotent (the factory dedups a re-delivered frame).
// NO secrets here: the live scores feed, the TxLINE proof build, the mint, and the RPC read are all INJECTED
// (the operator's private spike holds the X-Api-Token + proof builder + wallet) so this module stays clean-room.

import { PublicKey } from "@solana/web3.js";
import { PropMarketFactory, type SpawnedMarket } from "../factory/factory.js";
import { marketIdHex } from "../factory/market_id.js";
import type { ScoreEvent } from "../factory/primitives.js";
import { ouReceiptPda } from "../onchain/receipt.js";
import { ReceiptGateError, verifyOuReceiptForMarket, type OnchainAccount, type VerifiedResolution } from "../onchain/settle_consumer.js";

/** A goal/whistle frame from the live feed. */
export type GoalFrame = ScoreEvent;

/**
 * Builds the TxLINE proof + mints the receipt for a market's settle. Implemented in the operator's PRIVATE
 * spike (it holds the X-Api-Token + the proof builder + the wallet) and INJECTED — the public repo never
 * carries secrets or proof internals. Returns the mint tx signature, or `null` if not yet provably settleable.
 *
 * FINALITY CONTRACT (the injected spike MUST honor it): the settle path fires on the NEXT GOAL or the WHISTLE.
 * A goal proves the total regardless of match status, but a WHISTLE-driven ("no more goals" → NO) settle is
 * valid ONLY when the frame is a genuine full time — gate it on `isFinalised(frame)` (StatusId {9,10,13}),
 * fail-closed. Settling on a paused / half-time / interrupted in-play frame would mint a proof over an
 * unfinished total; for a World Cup KO fixture the final goal count is the post-ET total, never the 90' one.
 */
export interface SettleHook {
  mint(market: SpawnedMarket, settleEv: GoalFrame): Promise<string | null>;
}

/** Reads the on-chain OU receipt account at a PDA (a thin devnet `getAccountInfo` wrapper). Injected so the
 *  orchestrator is testable with no live RPC. `null` is a retry/no-receipt result; lifecycle expiry is owned
 *  by the factory sweep, and any future refund/VOID settlement is a separate venue concern. */
export interface ReceiptFetcher {
  fetchOu(pda: PublicKey): Promise<{ owner: PublicKey; data: Uint8Array } | null>;
}

export interface ResolvedMarket {
  readonly marketId: string;
  readonly fixtureId: bigint;
  readonly mintTx: string;
  readonly resolution: VerifiedResolution;
  readonly verifiedAtMs: number;
}

export interface LiveResolverOpts {
  now?: () => number;
}

export class LiveResolver {
  private readonly resolved: ResolvedMarket[] = [];

  constructor(
    private readonly factory: PropMarketFactory,
    private readonly hook: SettleHook,
    private readonly fetcher: ReceiptFetcher,
    private readonly opts: LiveResolverOpts = {},
  ) {}

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  /** A goal fired → auto-spawn (idempotent) the "another goal" micro-market. */
  async onGoal(ev: GoalFrame): Promise<SpawnedMarket> {
    return this.factory.onGoal(ev);
  }

  /**
   * A settle trigger (the next goal, or the whistle) proves `market`'s total: mint the TxLINE-anchored receipt
   * via the injected hook, re-verify it on-chain through PROPCAST's gate, record the evidence, mark it resolved.
   * Returns `null` if the hook reports the event is not yet provable (the daemon retries on the next frame).
   */
  async settle(market: SpawnedMarket, settleEv: GoalFrame): Promise<ResolvedMarket | null> {
    // PC-09: serialize per market so two concurrent triggers (next-goal + whistle delivered in one poll
    // batch / Promise.all) cannot both pass the idempotency check before either records — one mint, one row.
    const idHex = marketIdHex(market.id);
    return this.withMarketLock(idHex, async () => {
      // Never trust a structurally compatible caller object as the settlement binding. Recover the immutable
      // market registered by this factory and use it for every hook/PDA/receipt decision.
      const boundMarket = this.factory.get(idHex);
      if (boundMarket === undefined) throw new ReceiptGateError("BadData");
      if (market.fixtureId !== boundMarket.fixtureId) throw new ReceiptGateError("WrongFixture");
      if (market.lineQ !== boundMarket.lineQ) throw new ReceiptGateError("WrongLine");
      if (market.venueU64 !== boundMarket.venueU64) throw new ReceiptGateError("BadData");
      if (settleEv.fixtureId !== boundMarket.fixtureId) throw new ReceiptGateError("WrongFixture");

      // Idempotent: a market gets TWO settle triggers (the next goal, then the whistle) — settle only ONCE.
      const alreadyResolved = this.resolved.find((r) => r.marketId === idHex);
      if (alreadyResolved !== undefined) return alreadyResolved;

      const lease = this.factory.beginSettlement(idHex);
      if (lease === undefined || lease.market !== boundMarket) throw new ReceiptGateError("BadData");
      const leasedMarket = lease.market;
      let committed = false;
      try {
        const mintTx = await this.hook.mint(leasedMarket, settleEv);
        if (mintTx === null) return null; // not yet provable → the daemon retries next frame

        const pda = ouReceiptPda(leasedMarket.id.bytes);
        const fetched = await this.fetcher.fetchOu(pda);
        // PC-01: a mint SUCCEEDED (mintTx !== null) but the read lags (fetched === null) is a TRANSIENT RPC
        // sync race, NOT an abandoned market — return null (retry next frame), never a sticky VOID that the
        // idempotency check would then freeze forever while the real YES/NO receipt lands a moment later. VOID
        // for a genuinely abandoned match comes from the sweep-TTL path (no mint ever succeeds), not from here.
        if (fetched === null) return null;
        const acct: OnchainAccount = { pubkey: pda, owner: fetched.owner, data: fetched.data };

        if (leasedMarket.lineQ === undefined) throw new ReceiptGateError("BadData");
        const verified = verifyOuReceiptForMarket(acct, { marketId: leasedMarket.id.bytes, fixtureId: leasedMarket.fixtureId, lineQ: leasedMarket.lineQ });
        const resolution: VerifiedResolution = verified.over ? "YES" : "NO";
        // Construct every fallible field before committing factory state; no await occurs between commit + row.
        const r: ResolvedMarket = Object.freeze({ marketId: idHex, fixtureId: verified.fixtureId, mintTx, resolution, verifiedAtMs: this.now() });
        if (!this.factory.finishSettlement(idHex, lease.token)) throw new ReceiptGateError("BadData");
        committed = true;
        this.resolved.push(r);
        return r;
      } finally {
        if (!committed) this.factory.abortSettlement(idHex, lease.token);
      }
    });
  }

  // PC-09: per-market tail-lock (same shape as the factory's) — distinct markets settle concurrently, same-key
  // calls queue so the idempotency check + record are atomic.
  private readonly tails = new Map<string, Promise<unknown>>();
  private async withMarketLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    this.tails.set(key, mine);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.tails.get(key) === mine) this.tails.delete(key);
    }
  }

  /** The captured evidence (the demo's tx-sig + resolution log). */
  list(): ResolvedMarket[] {
    return [...this.resolved];
  }
}
