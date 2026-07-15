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

  it("encodes init_venue as discriminator + u64 market + i64 fixture + i16 line", () => {
    const ix = client.initVenue({ authority: PublicKey.default, marketId: 1n, fixtureId: 17_588_395n, lineQ: 10 });
    expect(ix.data.subarray(0, 8).toString("hex")).toBe("182df4a54be4d926");
    expect(ix.data.length).toBe(26);
    expect(ix.data.readBigUInt64LE(8)).toBe(1n);
    expect(ix.data.readBigInt64LE(16)).toBe(17_588_395n);
    expect(ix.data.readInt16LE(24)).toBe(10);
  });

  it("orders init_venue / post_order / take_order account metas exactly as the program's #[derive(Accounts)]", () => {
    const init = client.initVenue({ authority: PublicKey.default, marketId: 1n, fixtureId: 17_588_395n, lineQ: 10 });
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

describe("BorshWriter — signed integer domains", () => {
  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 32_768, -32_769])("rejects invalid i16 value %s", (value) => {
    expect(() => new BorshWriter().i16(value)).toThrow(/i16/);
  });

  it.each([Number.MAX_SAFE_INTEGER + 1, 1.5, (1n << 63n), -(1n << 63n) - 1n])("rejects invalid i64 value %s", (value) => {
    expect(() => new BorshWriter().i64(value)).toThrow(/i64/);
  });
});

describe("PitchmakerBookClient — account decoders", () => {
  const client = new PitchmakerBookClient();

  const expectRejectedVariants = (
    accountName: string,
    valid: Buffer,
    wrongDiscriminator: Buffer,
    decode: (data: Buffer) => unknown,
  ): void => {
    expect(() => decode(valid.subarray(0, valid.length - 1))).toThrow(`invalid ${accountName} account`);
    expect(() => decode(wrongDiscriminator)).toThrow(`invalid ${accountName} account`);
    expect(() => decode(Buffer.concat([valid, Buffer.from([0])]))).toThrow(`invalid ${accountName} account`);
  };

  it("rejects truncated, wrong-type, and trailing Venue accounts", () => {
    const valid = new BorshWriter().bytes(accountDiscriminator("Venue")).pubkey(PublicKey.default).u64(7n).i64(17_588_395n).i16(10).bool(false).u8(0).u64(0n).u8(255).toBuffer();
    const wrongType = Buffer.from(valid);
    accountDiscriminator("Order").copy(wrongType, 0);
    expectRejectedVariants("Venue", valid, wrongType, (data) => client.decodeVenue(data));
  });

  it("rejects truncated, wrong-type, and trailing Order accounts", () => {
    const valid = new BorshWriter().bytes(accountDiscriminator("Order")).pubkey(PublicKey.default).pubkey(PublicKey.default).u8(0).u32(600_000).u64(100n).u8(255).toBuffer();
    const wrongType = Buffer.from(valid);
    accountDiscriminator("Position").copy(wrongType, 0);
    expectRejectedVariants("Order", valid, wrongType, (data) => client.decodeOrder(data));
  });

  it("rejects truncated, wrong-type, and trailing Position accounts", () => {
    const valid = new BorshWriter().bytes(accountDiscriminator("Position")).pubkey(PublicKey.default).pubkey(PublicKey.default).i64(-100n).u64(40n).u64(140n).bool(false).u8(254).toBuffer();
    const wrongType = Buffer.from(valid);
    accountDiscriminator("Venue").copy(wrongType, 0);
    expectRejectedVariants("Position", valid, wrongType, (data) => client.decodePosition(data));
  });

  it("round-trips a Position buffer (net and gross YES lots)", () => {
    const buf = new BorshWriter()
      .bytes(accountDiscriminator("Position"))
      .pubkey(PublicKey.default)
      .pubkey(PublicKey.default)
      .i64(-100n)
      .u64(40n)
      .u64(140n)
      .bool(true)
      .u8(254)
      .toBuffer();
    const pos = client.decodePosition(buf);
    expect(pos.yes).toBe(-100n);
    expect(pos.yesBought).toBe(40n);
    expect(pos.yesSold).toBe(140n);
    expect(pos.claimed).toBe(true);
    expect(pos.bump).toBe(254);
  });

  it("decodes the current fixed Venue, Position, and unchanged Order layouts", () => {
    const venue = new BorshWriter().bytes(accountDiscriminator("Venue")).pubkey(PublicKey.default).u64(7n).i64(17_588_395n).i16(10).bool(true).u8(2).u64(5n).u8(255).toBuffer();
    expect(venue.length).toBe(69);
    expect(venue.readBigInt64LE(48)).toBe(17_588_395n);
    expect(venue.readInt16LE(56)).toBe(10);
    expect(client.decodeVenue(venue)).toMatchObject({ fixtureId: 17_588_395n, lineQ: 10 });

    const position = new BorshWriter().bytes(accountDiscriminator("Position")).pubkey(PublicKey.default).pubkey(PublicKey.default).i64(-100n).u64(40n).u64(140n).bool(true).u8(254).toBuffer();
    expect(position.length).toBe(98);
    expect(position.readBigUInt64LE(80)).toBe(40n);
    expect(position.readBigUInt64LE(88)).toBe(140n);
    expect(position.readUInt8(96)).toBe(1);
    expect(client.decodePosition(position)).toMatchObject({ yesBought: 40n, yesSold: 140n, claimed: true });

    const order = new BorshWriter().bytes(accountDiscriminator("Order")).pubkey(PublicKey.default).pubkey(PublicKey.default).u8(0).u32(600_000).u64(100n).u8(255).toBuffer();
    expect(order.length).toBe(86);
    expect(order.readUInt8(72)).toBe(0);
    expect(order.readUInt32LE(73)).toBe(600_000);
    expect(order.readBigUInt64LE(77)).toBe(100n);
    expect(client.decodeOrder(order)).toMatchObject({ side: 0, price: 600_000, remaining: 100n });
  });
  it("round-trips a Venue buffer", () => {
    const buf = new BorshWriter()
      .bytes(accountDiscriminator("Venue"))
      .pubkey(PublicKey.default)
      .u64(7n)
      .i64(17_588_395n)
      .i16(10)
      .bool(true)
      .u8(2)
      .u64(5n)
      .u8(255)
      .toBuffer();
    const v = client.decodeVenue(buf);
    expect(v.marketId).toBe(7n);
    expect(v.fixtureId).toBe(17_588_395n);
    expect(v.lineQ).toBe(10);
    expect(v.resolved).toBe(true);
    expect(v.outcome).toBe(2);
    expect(v.nextOrderId).toBe(5n);
  });
});
