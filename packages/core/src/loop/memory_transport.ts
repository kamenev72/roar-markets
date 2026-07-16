// Vendored verbatim from the PitchMaker repo (Apache-2.0; public-knowledge market-making math + an IDL-free Solana venue client). See NOTICE.
// In-memory VenueTransport — the SAME interface the bankrun and devnet transports implement, backed
// by plain JS maps. It lets the TUI HUD (and fast demos/tests) drive the IDENTICAL autonomous loop
// with zero chain, modelling exactly the program's bookkeeping that the loop observes: monotonic
// next_order_id, order remainder, and signed YES positions. No escrow/lamports (the HUD shows quotes,
// fills, and inventory — not solvency, which the bankrun/LiteSVM suites already prove on-chain).

import { Keypair, PublicKey } from "@solana/web3.js";
import { PitchmakerBookClient, SIDE_BID, type OrderState, type PositionState, type VenueState } from "../venue/client.js";
import type { PostResult, VenueTransport } from "./transport.js";

interface MemVenue {
  fixtureId: bigint;
  lineQ: number;
  resolved: boolean;
  outcome: number;
  nextOrderId: bigint;
}
interface MemOrder {
  maker: string;
  side: number;
  price: number;
  remaining: bigint;
}
interface MemPosition {
  yes: bigint;
  yesBought: bigint;
  yesSold: bigint;
}

export class MemoryTransport implements VenueTransport {
  readonly book: PitchmakerBookClient;
  private readonly venues = new Map<string, MemVenue>();
  private readonly orders = new Map<string, MemOrder>(); // `${marketId}:${orderId}`
  private readonly positions = new Map<string, MemPosition>(); // `${marketId}:${trader}`
  private readonly authPk = Keypair.generate().publicKey;
  private readonly makerPk = Keypair.generate().publicKey;
  private readonly takerPk = Keypair.generate().publicKey;

  constructor(book: PitchmakerBookClient = new PitchmakerBookClient()) {
    this.book = book;
  }

  get authority(): PublicKey {
    return this.authPk;
  }
  get maker(): PublicKey {
    return this.makerPk;
  }
  get taker(): PublicKey {
    return this.takerPk;
  }

  async initVenue(marketId: bigint, fixtureId: bigint, lineQ: number): Promise<string> {
    // Exercise the same PDA + wire-domain validation as bankrun/devnet before mutating memory state.
    this.book.initVenue({ authority: this.authority, marketId, fixtureId, lineQ });
    this.venues.set(String(marketId), { fixtureId, lineQ, resolved: false, outcome: 0, nextOrderId: 0n });
    return "mem";
  }

  postOrder(marketId: bigint, side: number, price: number, size: bigint): Promise<PostResult> {
    const v = this.venues.get(String(marketId));
    if (!v) throw new Error("postOrder: venue not initialised");
    const orderId = v.nextOrderId;
    this.orders.set(`${marketId}:${orderId}`, { maker: this.makerPk.toBase58(), side, price, remaining: size });
    v.nextOrderId += 1n;
    return Promise.resolve({ orderId, sig: "mem" });
  }

  cancelOrder(marketId: bigint, orderId: bigint): Promise<string> {
    const o = this.orders.get(`${marketId}:${orderId}`);
    if (o) o.remaining = 0n;
    return Promise.resolve("mem");
  }

  take(marketId: bigint, orderId: bigint, size: bigint): Promise<string> {
    const o = this.orders.get(`${marketId}:${orderId}`);
    if (!o) throw new Error("take: no such order");
    const filled = size < o.remaining ? size : o.remaining;
    o.remaining -= filled;
    const makerDelta = o.side === SIDE_BID ? filled : -filled; // BID order: maker buys YES (+)
    this.addPos(marketId, this.makerPk, makerDelta);
    this.addPos(marketId, this.takerPk, -makerDelta);
    return Promise.resolve("mem");
  }

  resolve(marketId: bigint, outcome: number): Promise<string> {
    const v = this.venues.get(String(marketId));
    if (v) {
      v.resolved = true;
      v.outcome = outcome;
    }
    return Promise.resolve("mem");
  }

  claim(_marketId: bigint, _trader: Keypair): Promise<string> {
    return Promise.resolve("mem");
  }

  private addPos(marketId: bigint, trader: PublicKey, d: bigint): void {
    const key = `${marketId}:${trader.toBase58()}`;
    const previous = this.positions.get(key) ?? { yes: 0n, yesBought: 0n, yesSold: 0n };
    this.positions.set(key, {
      yes: previous.yes + d,
      yesBought: previous.yesBought + (d > 0n ? d : 0n),
      yesSold: previous.yesSold + (d < 0n ? -d : 0n),
    });
  }

  readVenue(marketId: bigint): Promise<VenueState | null> {
    const v = this.venues.get(String(marketId));
    return Promise.resolve(
      v ? { authority: this.authPk, marketId, fixtureId: v.fixtureId, lineQ: v.lineQ, resolved: v.resolved, outcome: v.outcome, nextOrderId: v.nextOrderId, bump: 255 } : null,
    );
  }
  readOrder(marketId: bigint, orderId: bigint): Promise<OrderState | null> {
    const o = this.orders.get(`${marketId}:${orderId}`);
    return Promise.resolve(
      o ? { venue: this.book.venuePda(marketId), maker: new PublicKey(o.maker), side: o.side, price: o.price, remaining: o.remaining, bump: 255 } : null,
    );
  }
  readPosition(marketId: bigint, trader: PublicKey): Promise<PositionState | null> {
    const position = this.positions.get(`${marketId}:${trader.toBase58()}`);
    return Promise.resolve(position ? { venue: this.book.venuePda(marketId), trader, ...position, claimed: false, bump: 255 } : null);
  }
}
