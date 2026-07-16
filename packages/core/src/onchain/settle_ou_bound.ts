// The `settle_ou_bound` instruction-data layout — the ONE owner of it on this side of the wire.
//
// This is a hand-rolled encoder for a program we do not own (kickoff_oracle), so the only thing keeping it
// correct is that it is written down ONCE and pinned by a test. It used to live inline in
// `scripts/mint_real_receipt.ts`, where it silently drifted: kickoff added a TRAILING `min_final_ts: i64`,
// the script kept sending the old 6-field shape, and every mint died with Anchor error 102
// (InstructionDidNotDeserialize) — while the script's own header comment still described the OLD signature,
// actively misleading whoever went to fix it. The flagship "mint a REAL CPI-gated receipt" path was dead.
//
// Anchor's arg encoding is positional and order-sensitive, so a missing or reordered field is not a partial
// failure — the whole instruction fails to deserialize. Keep this in step with kickoff's own client
// (`app/src/program.ts`), which sends `.i64(minFinalTs)` last.
import { createHash } from "crypto";

/** Anchor global-instruction discriminator: first 8 bytes of sha256("global:<name>"). */
export const ixDiscriminator = (name: string): Buffer =>
  createHash("sha256").update("global:" + name).digest().subarray(0, 8);

export interface SettleOuBoundArgs {
  /** the caller-supplied 32-byte market/question id — also the receipt PDA seed. */
  marketId: Uint8Array;
  /** the fixture the proof attests. */
  fixtureId: bigint;
  /** the Over/Under line × 4 (quarter precision), e.g. 10 = the 2.5 line. */
  lineQ: number;
  /** true = Over, false = Under. */
  over: boolean;
  /** the raw `validate_stat` instruction bytes the CPI gate re-verifies. */
  validateStatIxData: Uint8Array;
  /**
   * The finality floor: the proof's attested window must be at or after it. `0n` is the documented
   * finality-UNBOUND sentinel (kept for the offline/demo mint); pass the fixture's expected full-time unix
   * seconds to bind finality for real.
   */
  minFinalTs?: bigint;
}

/**
 * `settle_ou_bound(market_id[32], fixture_id: i64, line_q: i16, over: bool, validate_stat_ix_data: Vec<u8>,
 * min_final_ts: i64)` — the exact wire order kickoff_oracle declares.
 */
export function settleOuBoundIxData(args: SettleOuBoundArgs): Buffer {
  if (args.marketId.length !== 32) throw new Error(`market_id must be 32 bytes, got ${args.marketId.length}`);
  const fixtureId = Buffer.alloc(8);
  fixtureId.writeBigInt64LE(args.fixtureId);
  const lineQ = Buffer.alloc(2);
  lineQ.writeInt16LE(args.lineQ);
  const vecLen = Buffer.alloc(4);
  vecLen.writeUInt32LE(args.validateStatIxData.length);
  const minFinalTs = Buffer.alloc(8);
  minFinalTs.writeBigInt64LE(args.minFinalTs ?? 0n);
  return Buffer.concat([
    ixDiscriminator("settle_ou_bound"),
    Buffer.from(args.marketId),
    fixtureId,
    lineQ,
    Buffer.from([args.over ? 1 : 0]),
    vecLen,
    Buffer.from(args.validateStatIxData),
    minFinalTs,
  ]);
}
