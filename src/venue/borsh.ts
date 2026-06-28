// Vendored verbatim from the PitchMaker repo (Apache-2.0; public-knowledge market-making math + an IDL-free Solana venue client). See NOTICE.
// Hand-rolled little-endian borsh primitives for the pitchmaker_book venue client.
//
// We deliberately do NOT depend on `@coral-xyz/anchor` or the `borsh` package: the venue's wire
// format is a tiny fixed set of scalars (u8/u32/u64/i64/bool/Pubkey), and encoding them by hand
// keeps the client version-drift-proof (an Anchor minor bump can change generated-client codegen,
// never this). Anchor lays out instruction args and account fields as packed little-endian borsh
// after an 8-byte discriminator — exactly what these reader/writer pairs produce and consume.

import { PublicKey } from "@solana/web3.js";

/** Append-only little-endian borsh encoder. */
export class BorshWriter {
  private readonly chunks: Buffer[] = [];

  u8(v: number): this {
    const b = Buffer.alloc(1);
    b.writeUInt8(v & 0xff, 0);
    this.chunks.push(b);
    return this;
  }
  u32(v: number): this {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v >>> 0, 0);
    this.chunks.push(b);
    return this;
  }
  u64(v: bigint | number): this {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(BigInt(v), 0);
    this.chunks.push(b);
    return this;
  }
  i64(v: bigint | number): this {
    const b = Buffer.alloc(8);
    b.writeBigInt64LE(BigInt(v), 0);
    this.chunks.push(b);
    return this;
  }
  bool(v: boolean): this {
    return this.u8(v ? 1 : 0);
  }
  pubkey(p: PublicKey): this {
    this.chunks.push(Buffer.from(p.toBytes()));
    return this;
  }
  bytes(b: Buffer | Uint8Array): this {
    this.chunks.push(Buffer.from(b));
    return this;
  }
  toBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

/** Sequential little-endian borsh decoder. */
export class BorshReader {
  private off = 0;
  private readonly buf: Buffer;

  constructor(buf: Buffer | Uint8Array) {
    this.buf = Buffer.from(buf);
  }
  skip(n: number): this {
    this.off += n;
    return this;
  }
  u8(): number {
    const v = this.buf.readUInt8(this.off);
    this.off += 1;
    return v;
  }
  u32(): number {
    const v = this.buf.readUInt32LE(this.off);
    this.off += 4;
    return v;
  }
  u64(): bigint {
    const v = this.buf.readBigUInt64LE(this.off);
    this.off += 8;
    return v;
  }
  i64(): bigint {
    const v = this.buf.readBigInt64LE(this.off);
    this.off += 8;
    return v;
  }
  bool(): boolean {
    return this.u8() !== 0;
  }
  pubkey(): PublicKey {
    const p = new PublicKey(this.buf.subarray(this.off, this.off + 32));
    this.off += 32;
    return p;
  }
  get offset(): number {
    return this.off;
  }
}
