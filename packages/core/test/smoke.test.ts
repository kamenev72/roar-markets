import { describe, it, expect } from "vitest";
import { PROPCAST } from "../src/index.js";

describe("Roar Markets scaffold smoke", () => {
  it("the package builds and exports its marker", () => {
    expect(PROPCAST).toBe("propcast");
  });
});
