import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const COMMITTED = resolve(here, "../fixtures/pitchmaker_book.so");

export const VENUE_SO = COMMITTED;
export const VENUE_SO_DIR = dirname(VENUE_SO);

/** Fail before bankrun's native loader can hang on a missing binary fixture. */
export function assertVenueSo(): void {
  if (!existsSync(VENUE_SO)) {
    throw new Error(`venue .so missing at ${COMMITTED}; restore fixtures/pitchmaker_book.so.`);
  }
}
