import { IDL } from "@dfinity/candid";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test, vi } from "vitest";
import { idlFactoryFromCandid } from "../lib/browser.js";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

const wasmPath = fileURLToPath(
  new URL("../didc_wasm_pkg/didc_rust_bg.bin", import.meta.url)
);

describe("browser-local Candid conversion", () => {
  test("builds an IDL factory with packaged Wasm and no network conversion", async () => {
    const previousFetch = globalThis.fetch;
    const fetchSpy = vi.fn(async () => {
      throw new Error("browser Candid conversion must not use fetch");
    });
    globalThis.fetch = fetchSpy;
    try {
      const didcWasm = new Uint8Array(await readFile(wasmPath));
      const factory = await idlFactoryFromCandid(
        "service : { greet : (text) -> (text) query; save : (nat64) -> (); }",
        { didcWasm }
      );
      const service = factory({ IDL });
      const methods = new Map(service._fields);

      expect([...methods.keys()]).toEqual(["greet", "save"]);
      expect(methods.get("greet")?.annotations).toEqual(["query"]);
      expect(methods.get("save")?.annotations).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test("rejects invalid Candid locally", async () => {
    const didcWasm = new Uint8Array(await readFile(wasmPath));
    await expect(
      idlFactoryFromCandid("this is not candid", { didcWasm })
    ).rejects.toThrow();
  });

  test("initializes a fresh browser compiler from a bundler-style Wasm URL", async () => {
    const script = String.raw`
      import { readFile } from "node:fs/promises";
      import { IDL } from "@dfinity/candid";
      import { idlFactoryFromCandid } from "./lib/browser.js";
      const bytes = await readFile("./didc_wasm_pkg/didc_rust_bg.bin");
      const didcWasm = "data:application/wasm;base64," + bytes.toString("base64");
      const factory = await idlFactoryFromCandid(
        "service : { ping : () -> (text) query; }",
        { didcWasm },
      );
      const service = factory({ IDL });
      if (service._fields[0]?.[0] !== "ping") {
        throw new Error("Wasm URL produced the wrong interface");
      }
    `;
    await expect(
      execFileAsync(process.execPath, ["--input-type=module", "--eval", script], {
        cwd: repositoryRoot,
      }),
    ).resolves.toMatchObject({ stderr: "" });
  });
});
