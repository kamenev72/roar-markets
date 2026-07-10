import { defineConfig } from "vitest/config";

// PROPCAST phase 1 is pure TypeScript + an in-process MemoryTransport spine — no native bankrun, no live cluster,
// no RPC. The suites finish in milliseconds and are deterministic in result. Serialise files anyway so a
// future live/devnet integration test (phase 2+) cannot contend on a shared native resource.
export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
