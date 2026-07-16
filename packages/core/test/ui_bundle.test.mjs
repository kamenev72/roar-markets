import { describe, expect, it } from "vitest";
import { collectStaticImports } from "../../../scripts/check_ui_bundle.mjs";

describe("ui bundle manifest traversal", () => {
  it("recursively sums static imports, dedupes cycles, and excludes dynamic imports", () => {
    const manifest = {
      "src/main.tsx": { isEntry: true, file: "entry.js", imports: ["a.js"], dynamicImports: ["heavy.js"] },
      "a.js": { file: "a.js", imports: ["b.js"] },
      "b.js": { file: "b.js", imports: ["a.js"] },
      "heavy.js": { file: "heavy.js" },
    };
    expect(collectStaticImports(manifest, "src/main.tsx")).toEqual(["src/main.tsx", "a.js", "b.js"]);
  });

  it("fails on missing static import entries", () => {
    expect(() => collectStaticImports({ "src/main.tsx": { isEntry: true, file: "entry.js", imports: ["missing.js"] } }, "src/main.tsx")).toThrow(/missing/);
  });
});
