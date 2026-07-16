#!/usr/bin/env node
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function collectStaticImports(manifest, entryKey) {
  const seen = new Set();
  const out = [];
  function visit(key) {
    if (seen.has(key)) return;
    const node = manifest[key];
    if (!node) throw new Error(`manifest entry not found: ${key}`);
    seen.add(key);
    out.push(key);
    for (const imp of node.imports ?? []) visit(imp);
  }
  visit(entryKey);
  return out;
}

export function entryBudgetReport({ manifest, distDir, rawLimit, gzipLimit }) {
  const entryKey = Object.keys(manifest).find((k) => manifest[k]?.isEntry);
  if (!entryKey) throw new Error("no Vite entry found in manifest");
  const keys = collectStaticImports(manifest, entryKey);
  let raw = 0;
  let gzip = 0;
  const files = [];
  for (const key of keys) {
    const file = manifest[key].file;
    const bytes = readFileSync(join(distDir, file));
    raw += bytes.byteLength;
    gzip += gzipSync(bytes).byteLength;
    files.push({ key, file, raw: bytes.byteLength });
  }
  const dynamic = Object.values(manifest).flatMap((node) => node.dynamicImports ?? []);
  return {
    entryKey,
    raw,
    gzip,
    files,
    dynamic,
    ok: raw <= rawLimit && gzip <= gzipLimit,
    rawLimit,
    gzipLimit,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const distDir = new URL("../app/dist/", import.meta.url).pathname;
  const manifest = JSON.parse(readFileSync(join(distDir, ".vite/manifest.json"), "utf8"));
  const report = entryBudgetReport({ manifest, distDir, rawLimit: 200000, gzipLimit: 65000 });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    console.error(`❌ initial UI bundle exceeds budget: raw ${report.raw}/${report.rawLimit}, gzip ${report.gzip}/${report.gzipLimit}`);
    process.exit(1);
  }
  console.log(`✅ initial UI bundle within budget: raw ${report.raw}/${report.rawLimit}, gzip ${report.gzip}/${report.gzipLimit}`);
}
