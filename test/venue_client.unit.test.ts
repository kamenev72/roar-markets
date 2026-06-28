// Vendored verbatim from the PitchMaker repo (Apache-2.0; public-knowledge market-making math + an IDL-free Solana venue client). See NOTICE.
import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { ixDiscriminator, accountDiscriminator } from "../src/venue/discriminator.js";
import { PitchmakerBookClient, PITCHMAKER_BOOK_PROGRAM_ID, SIDE_BID } from "../src/venue/client.js";
import { BorshWriter } from "../src/venue/borsh.js";

// Independent encoder #1 of the "two encoders agree byte-for-byte" cross-check: these pinned
// discriminators ARE the Anchor sighashes the deployed program dispatches on. If a rename or a
// borsh-layout slip ever desynced the client from the program, these regression constants fail
// here long before the (heavier) bankrun round-trip would.

describe("anchor discriminators (regression-pinned to the deployed program)", () => {
  it("instruction discriminators match sha256('global:<ix>')[..8]", () => {
    expect(ixDiscriminator("init_venue").toString("hex")).toBe("182df4a54be4d926");
    expect(ixDiscriminator("post_order").toString("hex")).toBe("f1acfe8c4d48f684");
    expect(ixDiscriminator("take_order").toString("hex")).toBe("a3d014acdf41ffe4");
    expect(ixDiscriminator("cancel_order").toString("hex")).toBe("5f81edf00831df84");
    expect(ixDiscriminator("resolve").toString("hex")).toBe("f696ecce6c3f3a0a");
    expect(ixDiscriminator("claim").toString("hex")).toBe("3ec6d6c1d59f6cd2");
  });
  it("account discriminators match sha256('account:<Struct>')[..8]", () => {
    expect(accountDiscriminator("Venue").toString("hex")).toBe("089b55e2eaad2af2");
    expect(accountDiscriminator("Order").toString("hex")).toBe("86addfb94d561c33");
    expect(accountDiscriminator("Position").toString("hex")).toBe("aabc8fe47a40f7d0");
  });
});

describe("PitchmakerBookClient — PDA derivation", () => {
  const client = new PitchmakerBookClient();
  it("derives deterministic, market-distinct PDAs", () => {
    expect(client.venuePda(1n).equals(client.venuePda(1n))).toBe(true);
    expect(client.venuePda(2n).equals(client.venuePda(1n))).toBe(false);
    const venue = client.venuePda(1n);
    expect(client.orderPda(venue, 0n).equals(client.orderPda(venue, 1n))).toBe(false);
    expect(client.positionPda(venue, PublicKey.default).equals(client.positionPda(venue, PublicKey.default))).toBe(true);
  });
});

describe("PitchmakerBookClient — instruction borsh layout", () => {
  const client = new PitchmakerBookClient();

  it("encodes post_order as disc(8)+market_id(u64)+order_id(u64)+side(u8)+price(u32)+size(u64)", () => {
    const ix = client.postOrder({ maker: PublicKey.default, marketId: 1n, orderId: 0n, side: SIDE_BID, price: 600_000, size: 100n });
    expect(ix.programId.equals(PITCHMAKER_BOOK_PROGRAM_ID)).toBe(true);
    expect(ix.data.subarray(0, 8).toString("hex")).toBe("f1acfe8c4d48f684");
    expect(ix.data.length).toBe(8 + 8 + 8 + 1 + 4 + 8); // 37
    const args = ix.data.subarray(8);
    expect(args.readBigUInt64LE(0)).toBe(1n); // market_id
    expect(args.readBigUInt64LE(8)).toBe(0n); // order_id
    expect(args.readUInt8(16)).toBe(SIDE_BID); // side
    expect(args.readUInt32LE(17)).toBe(600_000); // price
    expect(args.readBigUInt64LE(21)).toBe(100n); // size
  });

  it("orders init_venue / post_order / take_order account metas exactly as the program's #[derive(Accounts)]", () => {
    const init = client.initVenue({ authority: PublicKey.default, marketId: 1n });
    expect(init.keys.map((k) => [k.isSigner, k.isWritable])).toEqual([
      [true, true], // authority (mut Signer)
      [false, true], // venue (init)
      [false, false], // system_program
    ]);

    const post = client.postOrder({ maker: PublicKey.default, marketId: 1n, orderId: 0n, side: SIDE_BID, price: 1, size: 1n });
    expect(post.keys.length).toBe(4);
    expect(post.keys[0]!.isSigner).toBe(true); // maker

    const take = client.takeOrder({
      taker: PublicKey.default,
      marketId: 1n,
      orderId: 0n,
      size: 1n,
      orderMaker: new PublicKey("11111111111111111111111111111112"),
    });
    expect(take.keys.length).toBe(6);
    expect(take.keys[0]!.isSigner).toBe(true); // taker
    expect(take.keys[3]!.pubkey.equals(take.keys[4]!.pubkey)).toBe(false); // maker_position ≠ taker_position
  });

  it("resolve marks the authority a non-writable signer (Signer, not mut)", () => {
    const ix = client.resolve({ authority: PublicKey.default, marketId: 1n, outcome: 1 });
    expect(ix.keys[0]!.isSigner).toBe(true);
    expect(ix.keys[0]!.isWritable).toBe(false);
    expect(ix.data.subarray(0, 8).toString("hex")).toBe("f696ecce6c3f3a0a");
    expect(ix.data.readUInt8(8 + 8)).toBe(1); // outcome after the u64 market_id
  });
});

describe("PitchmakerBookClient — account decoders", () => {
  const client = new PitchmakerBookClient();
  it("round-trips a Position buffer (signed i64 yes, bool claimed)", () => {
    const buf = new BorshWriter()
      .bytes(accountDiscriminator("Position"))
      .pubkey(PublicKey.default)
      .pubkey(PublicKey.default)
      .i64(-100n)
      .bool(true)
      .u8(254)
      .toBuffer();
    const pos = client.decodePosition(buf);
    expect(pos.yes).toBe(-100n);
    expect(pos.claimed).toBe(true);
    expect(pos.bump).toBe(254);
  });
  it("round-trips a Venue buffer", () => {
    const buf = new BorshWriter()
      .bytes(accountDiscriminator("Venue"))
      .pubkey(PublicKey.default)
      .u64(7n)
      .bool(true)
      .u8(2)
      .u64(5n)
      .u8(255)
      .toBuffer();
    const v = client.decodeVenue(buf);
    expect(v.marketId).toBe(7n);
    expect(v.resolved).toBe(true);
    expect(v.outcome).toBe(2);
    expect(v.nextOrderId).toBe(5n);
  });
});
