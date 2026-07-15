// Historical on-chain receipt check: read the REAL OuBoundReceipt minted via kickoff's settle_ou_bound CPI
// path and run PROPCAST's complete market/fixture/line binding gate. This proves the account bytes and their
// immutable binding, not the private hook's mint-time finality policy or venue payout.
import { Connection, PublicKey } from "@solana/web3.js";
import { deriveMarketId, marketIdHex, PrimitiveKind } from "../src/factory/market_id.js";
import { ouReceiptPda, KICKOFF_ORACLE_PROGRAM_ID } from "../src/onchain/receipt.js";
import { verifyOuReceiptForMarket } from "../src/onchain/settle_consumer.js";
import { REAL_FIXTURE_ID, REAL_LINE_Q } from "../src/onchain/real_receipt.js";

const id = deriveMarketId(17588395n, PrimitiveKind.OuAnotherGoal, 0);
const pda = ouReceiptPda(id.bytes);
console.log("market_id:", marketIdHex(id));
console.log("receipt PDA:", pda.toBase58());
const conn = new Connection("https://api.devnet.solana.com", "confirmed");
// dataSlice bounds the read to the 51-byte receipt (gate's max read is over@50) so a hostile/over-large
// account can't make us download a huge blob; owner is returned regardless of the slice.
const ai = await conn.getAccountInfo(pda, { commitment: "confirmed", dataSlice: { offset: 0, length: 51 } });
if (!ai) { console.error("❌ receipt not found on devnet"); process.exit(1); }
const acct = { pubkey: pda, owner: ai.owner, data: new Uint8Array(ai.data) };
const v = verifyOuReceiptForMarket(acct, { marketId: id.bytes, fixtureId: REAL_FIXTURE_ID, lineQ: REAL_LINE_Q });
const res = v.over ? "YES" : "NO";
console.log(`owner == kickoff_oracle: ${ai.owner.equals(KICKOFF_ORACLE_PROGRAM_ID)}`);
console.log(`✅ REAL on-chain receipt binding verified: over=${v.over} fixtureId=${v.fixtureId} -> encoded outcome ${res} (Under 2.5 -> NO "another goal")`);
