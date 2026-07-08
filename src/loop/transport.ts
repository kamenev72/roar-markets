// Vendored verbatim from the PitchMaker repo (Apache-2.0; public-knowledge market-making math + an IDL-free Solana venue client). See NOTICE.
// VenueTransport — the EXECUTION actor's chain boundary. The autonomous loop (loop.ts) speaks only
// this interface, so the same agent loop drives an in-process bankrun ledger (deterministic tests)
// and a live devnet RPC (the real round-trip) with zero loop changes — a chain-
// agnostic QuoteTransport seam. It owns the three signing identities a two-party venue
// needs: the venue `authority`, the `maker` (the agent), and the scripted counterparty `taker`.

import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import type { BanksClient, ProgramTestContext } from "solana-bankrun";
import { PitchmakerBookClient, SIDE_ASK, SIDE_BID, type OrderState, type PositionState, type VenueState } from "../venue/client.js";

export interface PostResult {
  orderId: bigint;
  sig: string;
}

export interface VenueTransport {
  readonly book: PitchmakerBookClient;
  readonly authority: PublicKey;
  readonly maker: PublicKey; // the agent's identity
  readonly taker: PublicKey; // the scripted counterparty

  initVenue(marketId: bigint): Promise<string>;
  /** post one order at the venue's current next_order_id (read on-chain); returns the id used. */
  postOrder(marketId: bigint, side: number, price: number, size: bigint): Promise<PostResult>;
  cancelOrder(marketId: bigint, orderId: bigint): Promise<string>;
  /** the scripted taker crosses the agent's resting order `orderId` for `size`. */
  take(marketId: bigint, orderId: bigint, size: bigint): Promise<string>;
  resolve(marketId: bigint, outcome: number): Promise<string>;
  claim(marketId: bigint, trader: Keypair): Promise<string>;

  readVenue(marketId: bigint): Promise<VenueState | null>;
  readOrder(marketId: bigint, orderId: bigint): Promise<OrderState | null>;
  readPosition(marketId: bigint, trader: PublicKey): Promise<PositionState | null>;
}

/** In-process transport backed by solana-bankrun (the deployed .so, deterministic, no validator). */
export class BankrunTransport implements VenueTransport {
  constructor(
    private readonly ctx: ProgramTestContext,
    private readonly client: BanksClient,
    readonly book: PitchmakerBookClient,
    private readonly authorityKp: Keypair,
    private readonly makerKp: Keypair,
    private readonly takerKp: Keypair,
  ) {}

  get authority(): PublicKey {
    return this.authorityKp.publicKey;
  }
  get maker(): PublicKey {
    return this.makerKp.publicKey;
  }
  get taker(): PublicKey {
    return this.takerKp.publicKey;
  }

  private async send(payer: Keypair, ix: Parameters<Transaction["add"]>[0]): Promise<string> {
    const tx = new Transaction();
    // Fetch a FRESH blockhash per tx: a long loop sends hundreds of txs and the bank advances past the
    // initial blockhash's validity window, so reusing ctx.lastBlockhash flakes under load. (null → fall
    // back to the genesis blockhash.)
    const latest = await this.client.getLatestBlockhash();
    tx.recentBlockhash = latest ? latest[0] : this.ctx.lastBlockhash;
    tx.feePayer = payer.publicKey;
    tx.add(ix);
    tx.sign(payer);
    await this.client.processTransaction(tx);
    return "bankrun"; // bankrun has no explorer; the loop only records sigs cosmetically here
  }

  initVenue(marketId: bigint): Promise<string> {
    return this.send(this.authorityKp, this.book.initVenue({ authority: this.authority, marketId }));
  }

  async postOrder(marketId: bigint, side: number, price: number, size: bigint): Promise<PostResult> {
    const venue = await this.readVenue(marketId);
    const orderId = venue ? venue.nextOrderId : 0n;
    const sig = await this.send(this.makerKp, this.book.postOrder({ maker: this.maker, marketId, orderId, side, price, size }));
    return { orderId, sig };
  }

  cancelOrder(marketId: bigint, orderId: bigint): Promise<string> {
    return this.send(this.makerKp, this.book.cancelOrder({ maker: this.maker, marketId, orderId }));
  }

  take(marketId: bigint, orderId: bigint, size: bigint): Promise<string> {
    return this.send(this.takerKp, this.book.takeOrder({ taker: this.taker, marketId, orderId, size, orderMaker: this.maker }));
  }

  resolve(marketId: bigint, outcome: number): Promise<string> {
    return this.send(this.authorityKp, this.book.resolve({ authority: this.authority, marketId, outcome }));
  }

  claim(marketId: bigint, trader: Keypair): Promise<string> {
    return this.send(trader, this.book.claim({ trader: trader.publicKey, marketId }));
  }

  async readVenue(marketId: bigint): Promise<VenueState | null> {
    const acc = await this.client.getAccount(this.book.venuePda(marketId));
    return acc ? this.book.decodeVenue(Buffer.from(acc.data)) : null;
  }
  async readOrder(marketId: bigint, orderId: bigint): Promise<OrderState | null> {
    const acc = await this.client.getAccount(this.book.orderPda(this.book.venuePda(marketId), orderId));
    return acc ? this.book.decodeOrder(Buffer.from(acc.data)) : null;
  }
  async readPosition(marketId: bigint, trader: PublicKey): Promise<PositionState | null> {
    const acc = await this.client.getAccount(this.book.positionPda(this.book.venuePda(marketId), trader));
    return acc ? this.book.decodePosition(Buffer.from(acc.data)) : null;
  }
}

export { SIDE_ASK, SIDE_BID };
