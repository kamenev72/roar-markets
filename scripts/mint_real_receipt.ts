// Mint a REAL kickoff_oracle OuBoundReceipt for a PROPCAST market_id, gated by the txoracle's validate_stat
// CPI over a TxLINE Merkle total-proof. This is the producer side of PROPCAST's historical receipt evidence
// chain (the consumer is src/onchain/settle_consumer.ts); mint-time finality remains caller policy.
//
// Inputs (runtime-only, NEVER committed):
//   VSD_TOTAL_PATH  — a fresh composite (P1+P2 Add) validate_stat proof JSON {validateStatDataHex,
//                     txoracleProgram, scoresRootsPda}, produced by the TxLINE proof-build step (fetch
//                     /api/scores/stat-validation for an ANCHORED fixture, then build the validateStat ix).
//   the signer keypair at ~/.config/solana/wc_devnet3.json.
//
// IMPORTANT (the load-bearing layout fix): the current settle_ou_bound signature is
//   (market_id[32], fixture_id:i64, line_q:i16, over:bool, validate_stat_ix_data:Vec<u8>, min_final_ts:i64)
// Every field is REQUIRED and ORDER-SENSITIVE. Dropping `fixture_id` shifts the proof bytes and the txoracle
// Merkle verify fails (0x66); dropping the TRAILING `min_final_ts` makes Anchor reject the whole instruction
// (error 102, InstructionDidNotDeserialize) — this mint silently carried that bug until 2026-07-12. Keep this
// in step with kickoff's own client (`app/src/program.ts`, `.i64(minFinalTs)` last).
// `min_final_ts = 0` is the documented finality-UNBOUND sentinel; set MIN_FINAL_TS to the fixture's expected
// full-time unix seconds to also bind finality (the proof's attested window must then be at or after it).
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram, SystemProgram, sendAndConfirmTransaction } from "@solana/web3.js";
import * as fs from "fs";
import { settleOuBoundIxData } from "../src/onchain/settle_ou_bound.js";
import { createHash } from "crypto";
import { deriveMarketId, marketIdHex, PrimitiveKind } from "../src/factory/market_id.js";

const KICKOFF_ORACLE_PROGRAM_ID = new PublicKey("34FXjUuikioZy4fcUKSoP9NVW7WWKQnpJUZQcRDTNLtw");
const ixDisc = (name: string) => createHash("sha256").update("global:" + name).digest().subarray(0, 8);

const FIXTURE = BigInt(process.env.FIXTURE_ID ?? "17588395");
const LINE_Q = Number(process.env.LINE_Q ?? "10"); // 2.5 × 4
const OVER = (process.env.OVER ?? "false") === "true"; // the proof is Under 2.5 (total < 3)

const id = deriveMarketId(FIXTURE, PrimitiveKind.OuAnotherGoal, 0);
const marketId = Buffer.from(id.bytes);
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/wc_devnet3.json", "utf8"))));
const conn = new Connection(process.env.RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], KICKOFF_ORACLE_PROGRAM_ID);
const [receipt] = PublicKey.findProgramAddressSync([Buffer.from("ou_bound"), marketId], KICKOFF_ORACLE_PROGRAM_ID);

// SEC-DAEMON-02: idempotency PRE-CHECK — if the receipt already exists at the kickoff_oracle owner this market
// is already settled; skip (print the PDA so the daemon still marks it fired) — NO re-send, NO "account already
// in use" hard error, NO devnet SOL burn. Runs BEFORE reading the proof so the skip needs no fresh VSD.
const existing = await conn.getAccountInfo(receipt, { commitment: "confirmed", dataSlice: { offset: 0, length: 51 } });
if (existing && existing.owner.equals(KICKOFF_ORACLE_PROGRAM_ID)) {
  console.log("market_id:", marketIdHex(id));
  console.log("receipt PDA:", receipt.toBase58());
  console.log("✅ already minted (idempotent skip) — receipt exists at the kickoff_oracle owner, no re-send");
  process.exit(0);
}

const VSD = JSON.parse(fs.readFileSync(process.env.VSD_TOTAL_PATH as string, "utf8"));
const vsd = Buffer.from(VSD.validateStatDataHex, "hex");

// The ix-data layout has ONE owner (src/onchain/settle_ou_bound.ts), pinned by a test — inlining it here is
// exactly how it drifted out of step with kickoff and broke every mint.
const data = settleOuBoundIxData({
  marketId,
  fixtureId: FIXTURE,
  lineQ: LINE_Q,
  over: OVER,
  validateStatIxData: vsd,
  minFinalTs: BigInt(process.env.MIN_FINAL_TS ?? "0"),
});
const meta = (pk: PublicKey, s = false, w = false) => ({ pubkey: pk, isSigner: s, isWritable: w });
const ix = new TransactionInstruction({
  programId: KICKOFF_ORACLE_PROGRAM_ID,
  keys: [
    meta(admin.publicKey, true, true), meta(config, false, false), meta(receipt, false, true),
    meta(new PublicKey(VSD.txoracleProgram), false, false), meta(new PublicKey(VSD.scoresRootsPda), false, false), meta(SystemProgram.programId, false, false),
  ],
  data,
});
const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })).add(ix);
// SEC-DAEMON-02: bound send/confirm by lastValidBlockHeight — once the blockhash expires the tx is dropped, NOT
// silently rebroadcast, so a flaked confirm cannot become a second settle (the daemon retries idempotently above).
const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
tx.recentBlockhash = blockhash;
tx.lastValidBlockHeight = lastValidBlockHeight;
tx.feePayer = admin.publicKey;
const sig = await sendAndConfirmTransaction(conn, tx, [admin], { commitment: "confirmed" });
console.log("market_id:", marketIdHex(id));
console.log("receipt PDA:", receipt.toBase58());
console.log("✅ REAL OuBoundReceipt minted (CPI-gated validate_stat):", sig);
