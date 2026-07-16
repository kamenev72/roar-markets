import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The board imports the parent repo's PURE browser-safe modules (src/signal/devig, src/onchain/*) by relative
// path; allow vite's dev server to read one level up. (market_id.ts uses node:crypto and is NOT imported here —
// the board uses a fixed demo market_id.)
export default defineConfig({
  plugins: [react()],
  build: { manifest: true },
  server: { fs: { allow: [".."] } },
});
