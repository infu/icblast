import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  explainMethodSchema as explainBrowserMethodSchema,
  idlFactoryFromCandid as browserFactoryFromCandid,
  validateMethodInputSchema as validateBrowserMethodInputSchema,
} from "../lib/browser.js";
import {
  explainMethodSchema as explainNodeMethodSchema,
  idlFactoryFromCandid as nodeFactoryFromCandid,
  validateMethodInputSchema as validateNodeMethodInputSchema,
} from "../lib/icb_node.js";

const recursiveCandid = `
  type Tree = variant {
    branch : record { left : Tree; right : Tree };
    leaf : nat;
  };
  service : { walk : (Tree) -> (Tree) query };
`;

const recursiveValue = [{
  branch: {
    left: { leaf: "1" },
    right: { branch: {
      left: { leaf: "2" },
      right: { leaf: "3" },
    } },
  },
}];

describe("generated recursive Candid schemas", () => {
  it("compiles, serializes, and validates identically in Node and browsers", async () => {
    const didcWasm = await readFile(
      new URL("../didc_wasm_pkg/didc_rust_bg.bin", import.meta.url),
    );
    const browserFactory = await browserFactoryFromCandid(recursiveCandid, {
      didcWasm,
    });
    const nodeFactory = await nodeFactoryFromCandid(recursiveCandid);
    const browserSchema = explainBrowserMethodSchema(browserFactory, "walk");
    const nodeSchema = explainNodeMethodSchema(nodeFactory, "walk");

    expect(browserSchema).toEqual(nodeSchema);
    expect(() => JSON.stringify(browserSchema)).not.toThrow();
    expect(
      validateBrowserMethodInputSchema(browserSchema, recursiveValue).ok,
    ).toBe(true);
    expect(
      validateNodeMethodInputSchema(nodeSchema, recursiveValue).ok,
    ).toBe(true);
  });
});
