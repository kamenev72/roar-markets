// Vendored verbatim from the PitchMaker repo (Apache-2.0; public-knowledge market-making math + an IDL-free Solana venue client). See NOTICE.
// pitchmaker_book venue client — hand-rolled borsh instruction builders + account decoders for the
// deployed binary escrow-cross venue (programs/pitchmaker_book, program id JBK6od…). It is the missing piece that
// turns "venue deployed but never traded" into a live on-chain trade: the agent's QUOTE → post_order,
// RE-QUOTE → cancel_order, FILL → take_order, RESOLVE/PAYOUT → resolve/claim.
//
// Mirrors the kickoff-oracle resolver's approach: no @coral-xyz/anchor, no IDL — just the 8-byte
// Anchor discriminator (./discriminator) + packed little-endian borsh (./borsh). The instruction
// account ordering and (isSigner,isWritable) flags below are a 1:1 transcription of the program's
// #[derive(Accounts)] structs; the bankrun cross-check test proves they drive the real .so correctly.

import { PublicKey, SystemProgram, TransactionInstruction, type AccountMeta } from "@solana/web3.js";
import { BorshReader, BorshWriter } from "./borsh.js";
import { accountDiscriminator, ixDiscriminator } from "./discriminator.js";

/** Deployed program id (Anchor.toml [programs.devnet], declare_id! in lib.rs). */
export const PITCHMAKER_BOOK_PROGRAM_ID = new PublicKey("JBK6odPfCTuHp1cb3Yr76PPTdnhpGgQwrZ9oszhSjh3R");

/** Lamport payout per winning share (program constant SCALE). price ∈ [1, SCALE). */
export const SCALE = 1_000_000n;
export const SIDE_BID = 0; // buy YES
export const SIDE_ASK = 1; // sell YES

const u64le = (v: bigint | number): Buffer => new BorshWriter().u64(v).toBuffer();
const meta = (pubkey: PublicKey, isSigner: boolean, isWritable: boolean): AccountMeta => ({ pubkey, isSigner, isWritable });

function accountReader(data: Buffer | Uint8Array, accountName: "Venue" | "Order" | "Position", expectedLength: number): BorshReader {
  const bytes = Buffer.from(data);
  const expectedDiscriminator = accountDiscriminator(accountName);
  if (bytes.length !== expectedLength || !bytes.subarray(0, 8).equals(expectedDiscriminator)) {
    throw new Error(`invalid ${accountName} account: expected ${expectedLength} bytes and matching discriminator`);
  }
  return new BorshReader(bytes).skip(8);
}

export interface VenueState {
  authority: PublicKey;
  marketId: bigint;
  fixtureId: bigint;
  lineQ: number;
  resolved: boolean;
  outcome: number;
  nextOrderId: bigint;
  bump: number;
}
export interface OrderState {
  venue: PublicKey;
  maker: PublicKey;
  side: number;
  price: number;
  remaining: bigint;
  bump: number;
}
export interface PositionState {
  venue: PublicKey;
  trader: PublicKey;
  /** signed net YES shares: + long YES, − short YES (= long NO). */
  yes: bigint;
  yesBought: bigint;
  yesSold: bigint;
  claimed: boolean;
  bump: number;
}

export class PitchmakerBookClient {
  readonly programId: PublicKey;

  constructor(programId: PublicKey = PITCHMAKER_BOOK_PROGRAM_ID) {
    this.programId = programId;
  }

  // ---------- PDA derivation (seeds mirror the program's #[account(seeds = …)]) ----------

  venuePda(marketId: bigint | number): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from("venue"), u64le(marketId)], this.programId)[0];
  }
  orderPda(venue: PublicKey, orderId: bigint | number): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from("order"), venue.toBuffer(), u64le(orderId)], this.programId)[0];
  }
  positionPda(venue: PublicKey, trader: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from("position"), venue.toBuffer(), trader.toBuffer()], this.programId)[0];
  }

  // ---------- instruction builders ----------

  initVenue(args: { authority: PublicKey; marketId: bigint | number; fixtureId: bigint | number; lineQ: number }): TransactionInstruction {
    const venue = this.venuePda(args.marketId);
    const data = Buffer.concat([ixDiscriminator("init_venue"), new BorshWriter().u64(args.marketId).i64(args.fixtureId).i16(args.lineQ).toBuffer()]);
    return new TransactionInstruction({
      programId: this.programId,
      keys: [meta(args.authority, true, true), meta(venue, false, true), meta(SystemProgram.programId, false, false)],
      data,
    });
  }

  postOrder(args: {
    maker: PublicKey;
    marketId: bigint | number;
    orderId: bigint | number;
    side: number;
    price: number;
    size: bigint | number;
  }): TransactionInstruction {
    const venue = this.venuePda(args.marketId);
    const order = this.orderPda(venue, args.orderId);
    const data = Buffer.concat([
      ixDiscriminator("post_order"),
      new BorshWriter().u64(args.marketId).u64(args.orderId).u8(args.side).u32(args.price).u64(args.size).toBuffer(),
    ]);
    return new TransactionInstruction({
      programId: this.programId,
      keys: [meta(args.maker, true, true), meta(venue, false, true), meta(order, false, true), meta(SystemProgram.programId, false, false)],
      data,
    });
  }

  /** `orderMaker` is the resting order's maker (read from chain) — its position PDA is updated too. */
  takeOrder(args: {
    taker: PublicKey;
    marketId: bigint | number;
    orderId: bigint | number;
    size: bigint | number;
    orderMaker: PublicKey;
  }): TransactionInstruction {
    const venue = this.venuePda(args.marketId);
    const order = this.orderPda(venue, args.orderId);
    const makerPosition = this.positionPda(venue, args.orderMaker);
    const takerPosition = this.positionPda(venue, args.taker);
    const data = Buffer.concat([
      ixDiscriminator("take_order"),
      new BorshWriter().u64(args.marketId).u64(args.orderId).u64(args.size).toBuffer(),
    ]);
    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        meta(args.taker, true, true),
        meta(venue, false, true),
        meta(order, false, true),
        meta(makerPosition, false, true),
        meta(takerPosition, false, true),
        meta(SystemProgram.programId, false, false),
      ],
      data,
    });
  }

  cancelOrder(args: { maker: PublicKey; marketId: bigint | number; orderId: bigint | number }): TransactionInstruction {
    const venue = this.venuePda(args.marketId);
    const order = this.orderPda(venue, args.orderId);
    const data = Buffer.concat([
      ixDiscriminator("cancel_order"),
      new BorshWriter().u64(args.marketId).u64(args.orderId).toBuffer(),
    ]);
    return new TransactionInstruction({
      programId: this.programId,
      keys: [meta(args.maker, true, true), meta(venue, false, true), meta(order, false, true)],
      data,
    });
  }

  resolve(args: { authority: PublicKey; marketId: bigint | number; outcome: number }): TransactionInstruction {
    const venue = this.venuePda(args.marketId);
    const data = Buffer.concat([ixDiscriminator("resolve"), new BorshWriter().u64(args.marketId).u8(args.outcome).toBuffer()]);
    return new TransactionInstruction({
      programId: this.programId,
      // Resolve struct: `authority: Signer` (NOT mut), `venue` mut.
      keys: [meta(args.authority, true, false), meta(venue, false, true)],
      data,
    });
  }

  claim(args: { trader: PublicKey; marketId: bigint | number }): TransactionInstruction {
    const venue = this.venuePda(args.marketId);
    const position = this.positionPda(venue, args.trader);
    const data = Buffer.concat([ixDiscriminator("claim"), new BorshWriter().u64(args.marketId).toBuffer()]);
    return new TransactionInstruction({
      programId: this.programId,
      keys: [meta(args.trader, true, true), meta(venue, false, true), meta(position, false, true)],
      data,
    });
  }

  // ---------- account decoders (skip the 8-byte Anchor discriminator, then packed borsh) ----------

  decodeVenue(data: Buffer | Uint8Array): VenueState {
    const r = accountReader(data, "Venue", 69);
    return { authority: r.pubkey(), marketId: r.u64(), fixtureId: r.i64(), lineQ: r.i16(), resolved: r.bool(), outcome: r.u8(), nextOrderId: r.u64(), bump: r.u8() };
  }
  decodeOrder(data: Buffer | Uint8Array): OrderState {
    const r = accountReader(data, "Order", 86);
    return { venue: r.pubkey(), maker: r.pubkey(), side: r.u8(), price: r.u32(), remaining: r.u64(), bump: r.u8() };
  }
  decodePosition(data: Buffer | Uint8Array): PositionState {
    const r = accountReader(data, "Position", 98);
    return { venue: r.pubkey(), trader: r.pubkey(), yes: r.i64(), yesBought: r.u64(), yesSold: r.u64(), claimed: r.bool(), bump: r.u8() };
  }
}
