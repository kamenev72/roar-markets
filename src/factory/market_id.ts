// PROPCAST market_id contract — the single FROZEN seam threading spawn -> settle -> re-verify.
//
// One deterministic derivation produces BOTH forms a micro-market needs:
//   - bytes  : the 32-byte id = SHA-256(domain || fixtureId_le64 || kind_u8 || nonce_le32). This is the form
//              the trustless settle binds to (the kickoff bound-receipt PDA seed, used in phase 2) and the fan
//              re-verify key.
//   - u64    : the pitchmaker_book venue id = little-endian decode of bytes[0..8]. The venue PDA is
//              findProgramAddress(["venue", u64_le], program) — so bytes[0..8] == u64 bridges the two forms.
//
// A client/chain mismatch here silently breaks the settle gate (a wrong receipt PDA), so this contract is
// locked FIRST and cross-checked against the venue client's PDA derivation. Pure, deterministic, no I/O.

import { createHash } from "node:crypto";

export enum PrimitiveKind {
  /** "will there be another goal" (O/U-goals) — the v1 PRIMARY, trustlessly settleable via settle_ou_bound. */
  OuAnotherGoal = 0,
  /** a goal-total predicate (declare via create_stat_market) — also goal-key only. */
  GoalTotal = 1,
  /** next-goal which-side — a LABELED proxy ONLY; no trustless settle in v1 (no on-chain proof of goal order). */
  NextGoalProxy = 2,
  /** "both teams to score" — the SECONDARY goal-key primitive, trustlessly settleable via settle_btts_bound. */
  BttsYes = 3,
  /** O/U total-goals at an explicit half-line (1.5/2.5/3.5) — goal-key only, trustlessly settleable via the
   *  same settle_ou_bound rail; the market's line_q is bound at settle (see verifyOuReceiptForMarket). */
  OuTotalGoals = 4,
}

export interface MarketId {
  /** 32-byte id — the kickoff bound-receipt PDA seed form (settle, phase 2) + the fan re-verify key. */
  readonly bytes: Uint8Array;
  /** the pitchmaker_book venue marketId (u64) — little-endian decode of bytes[0..8]. */
  readonly u64: bigint;
}

const DOMAIN = "propcast:market:v1";
const U64_MAX = 1n << 64n;

/** Little-endian decode of the first 8 bytes — the venue PDA seed bridge. */
function leU64(b: Uint8Array): bigint {
  let acc = 0n;
  for (let i = 0; i < 8; i++) acc += BigInt(b[i] ?? 0) << BigInt(8 * i);
  return acc;
}

/**
 * Derive a market id from (fixtureId, primitiveKind, instanceNonce). Deterministic + collision-resistant
 * (SHA-256), with the `bytes[0..8] == u64` bridge to the pitchmaker_book venue PDA. `instanceNonce`
 * disambiguates repeated same-fixture/same-kind spawns (e.g. a second "another goal" market after a goal).
 */
export function deriveMarketId(fixtureId: bigint, kind: PrimitiveKind, instanceNonce: number): MarketId {
  if (fixtureId < 0n || fixtureId >= U64_MAX) throw new Error("market_id: fixtureId must fit an unsigned 64-bit int");
  if (!Number.isInteger(instanceNonce) || instanceNonce < 0 || instanceNonce > 0xffff_ffff) {
    throw new Error("market_id: instanceNonce must be a u32 (0..2^32-1)");
  }
  const pre = Buffer.alloc(8 + 1 + 4);
  pre.writeBigUInt64LE(fixtureId, 0);
  pre.writeUInt8(kind & 0xff, 8);
  pre.writeUInt32LE(instanceNonce, 9);
  const digest = createHash("sha256").update(DOMAIN).update(pre).digest();
  const bytes = new Uint8Array(digest);
  return { bytes, u64: leU64(bytes) };
}

/** Hex of the 32-byte id — the factory Map key + the explorer re-verify key. */
export function marketIdHex(id: MarketId): string {
  return Buffer.from(id.bytes).toString("hex");
}
