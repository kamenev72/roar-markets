import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Keypair, SystemProgram, Transaction, type AccountInfo } from "@solana/web3.js";
import { start, type BanksClient, type ProgramTestContext } from "solana-bankrun";
import { VENUE_SO_DIR, assertVenueSo } from "./_venue_so.js";
import { PitchmakerBookClient, PITCHMAKER_BOOK_PROGRAM_ID } from "../src/venue/client.js";
import { accountDiscriminator } from "../src/venue/discriminator.js";

const funded = (lamports: number): AccountInfo<Buffer> => ({
  lamports, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false, rentEpoch: 0,
});

describe("PitchmakerBookClient ↔ committed pitchmaker_book fixture", () => {
  const book = new PitchmakerBookClient(PITCHMAKER_BOOK_PROGRAM_ID);
  const authority = Keypair.generate();
  let ctx: ProgramTestContext;
  let client: BanksClient;
  const originalEnv = {
    RUST_LOG: process.env.RUST_LOG,
    SBF_OUT_DIR: process.env.SBF_OUT_DIR,
    BPF_OUT_DIR: process.env.BPF_OUT_DIR,
  };

  beforeAll(async () => {
    process.env.RUST_LOG ??= "off";
    assertVenueSo();
    process.env.SBF_OUT_DIR = VENUE_SO_DIR;
    process.env.BPF_OUT_DIR = VENUE_SO_DIR;
    ctx = await start([{ name: "pitchmaker_book", programId: PITCHMAKER_BOOK_PROGRAM_ID }], [{ address: authority.publicKey, info: funded(5_000_000_000) }]);
    client = ctx.banksClient;
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("initializes and decodes the immutable fixture and line from the current binary", async () => {
    const marketId = 1n;
    const tx = new Transaction();
    const latest = await client.getLatestBlockhash();
    tx.recentBlockhash = latest ? latest[0] : ctx.lastBlockhash;
    tx.feePayer = authority.publicKey;
    tx.add(book.initVenue({ authority: authority.publicKey, marketId, fixtureId: 17_588_395n, lineQ: 10 }));
    tx.sign(authority);
    await client.processTransaction(tx);
    const account = await client.getAccount(book.venuePda(marketId));
    expect(account).not.toBeNull();
    expect(account!.owner.equals(PITCHMAKER_BOOK_PROGRAM_ID)).toBe(true);
    const data = Buffer.from(account!.data);
    expect(data.length).toBe(69);
    expect(data.subarray(0, 8).equals(accountDiscriminator("Venue"))).toBe(true);
    const venue = book.decodeVenue(data);
    expect(venue.marketId).toBe(marketId);
    expect(venue.fixtureId).toBe(17_588_395n);
    expect(venue.lineQ).toBe(10);
  });
});
