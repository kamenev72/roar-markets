// Vendored verbatim from the PitchMaker repo (Apache-2.0; public-knowledge market-making math + an IDL-free Solana venue client). See NOTICE.
// Anchor account/instruction/event discriminators.
//
// Anchor prefixes every instruction's data with the first 8 bytes of sha256("global:<ix_name>"),
// every account's data with sha256("account:<StructName>")[..8], and every emitted event with
// sha256("event:<EventName>")[..8]. Recomputing them here (node:crypto, zero deps) is how the
// hand-rolled client stays in lockstep with the on-chain program without an IDL or codegen step.

import { createHash } from "node:crypto";

const disc = (preimage: string): Buffer => createHash("sha256").update(preimage).digest().subarray(0, 8);

/** 8-byte instruction discriminator: sha256("global:<name>")[..8]. */
export const ixDiscriminator = (name: string): Buffer => disc(`global:${name}`);

/** 8-byte account discriminator: sha256("account:<StructName>")[..8]. */
export const accountDiscriminator = (name: string): Buffer => disc(`account:${name}`);

/** 8-byte event discriminator: sha256("event:<EventName>")[..8]. */
export const eventDiscriminator = (name: string): Buffer => disc(`event:${name}`);
