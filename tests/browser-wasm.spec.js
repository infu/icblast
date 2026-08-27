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

  test("does not truncate a quoted method containing export const", async () => {
    const didcWasm = new Uint8Array(await readFile(wasmPath));
    const factory = await idlFactoryFromCandid(
      'service : { "contains export const text" : () -> (text) query; }',
      { didcWasm },
    );

    expect(factory({ IDL })._fields.map(([name]) => name)).toEqual([
      "contains export const text",
    ]);
  });

  test("rejects invalid Candid locally", async () => {
    const didcWasm = new Uint8Array(await readFile(wasmPath));
    await expect(
      idlFactoryFromCandid("this is not candid", { didcWasm })
    ).rejects.toThrow();
  });

  test("rejects oversized Candid before initializing Wasm", async () => {
    const oversized = `service : { ${"x : () -> ();".repeat(11_000)} }`;
    await expect(
      idlFactoryFromCandid(oversized, {
        didcWasm: "data:application/wasm;base64,AA==",
      }),
    ).rejects.toThrow("Candid interface exceeds 131072 UTF-8 bytes");
  });

  test("accepts the exact Candid byte boundary and rejects one byte more", async () => {
    const didcWasm = new Uint8Array(await readFile(wasmPath));
    const limit = 128 * 1024;
    const suffix = "*/ service : {}";
    const exact = `/*${"x".repeat(
      limit - Buffer.byteLength(`/*${suffix}`, "utf8"),
    )}${suffix}`;

    expect(Buffer.byteLength(exact, "utf8")).toBe(limit);
    await expect(
      idlFactoryFromCandid(exact, { didcWasm }),
    ).resolves.toBeTypeOf("function");
    await expect(
      idlFactoryFromCandid(`${exact} `, { didcWasm }),
    ).rejects.toThrow("Candid interface exceeds 131072 UTF-8 bytes");
  });

  test("allows callers to raise both local compiler byte limits explicitly", async () => {
    const didcWasm = new Uint8Array(await readFile(wasmPath));
    const source = `/*${"x".repeat(128 * 1024)}*/ service : {};`;
    const sourceBytes = Buffer.byteLength(source, "utf8");

    await expect(
      idlFactoryFromCandid(source, {
        didcWasm,
        maxCandidSourceBytes: sourceBytes,
      }),
    ).resolves.toBeTypeOf("function");
    await expect(
      idlFactoryFromCandid("service : {};", {
        didcWasm,
        maxGeneratedJavaScriptBytes: 1,
      }),
    ).rejects.toThrow("Generated Candid JavaScript exceeds 1 UTF-8 bytes");
  });

  test("compiles the full 65,536-method service without poisoning the Wasm instance", async () => {
    const didcWasm = new Uint8Array(await readFile(wasmPath));
    const source = `service : { ${Array.from(
      { length: 65_536 },
      (_, index) =>
        index === 32_768
          ? `"__proto__" : () -> ();`
          : `m${index} : () -> ();`,
    ).join(" ")} }`;

    await expect(
      idlFactoryFromCandid(source, {
        didcWasm,
        maxCandidSourceBytes: Number.MAX_SAFE_INTEGER,
      }),
    ).rejects.toThrow(
      "Generated Candid JavaScript exceeds 2097152 UTF-8 bytes",
    );

    const factory = await idlFactoryFromCandid(source, {
      didcWasm,
      maxCandidSourceBytes: Number.MAX_SAFE_INTEGER,
      maxGeneratedJavaScriptBytes: Number.MAX_SAFE_INTEGER,
    });
    const methods = new Set(factory({ IDL })._fields.map(([name]) => name));
    expect(methods.size).toBe(65_536);
    expect(methods.has("m0")).toBe(true);
    expect(methods.has("__proto__")).toBe(true);
    expect(methods.has("m65535")).toBe(true);
  }, 30_000);

  test("rejects invalid local compiler byte limits", async () => {
    await expect(
      idlFactoryFromCandid("service : {};", {
        maxCandidSourceBytes: 0,
      }),
    ).rejects.toThrow("maxCandidSourceBytes must be a positive safe integer");
    await expect(
      idlFactoryFromCandid("service : {};", {
        maxGeneratedJavaScriptBytes: Number.POSITIVE_INFINITY,
      }),
    ).rejects.toThrow(
      "maxGeneratedJavaScriptBytes must be a positive safe integer",
    );
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

  test("loads a bundler Wasm URL with a generic MIME type without a streaming warning", async () => {
    const script = String.raw`
      import { readFile } from "node:fs/promises";
      import { IDL } from "@dfinity/candid";
      import { idlFactoryFromCandid } from "./lib/browser.js";
      const bytes = await readFile("./didc_wasm_pkg/didc_rust_bg.bin");
      const didcWasm = "data:application/octet-stream;base64," + bytes.toString("base64");
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
