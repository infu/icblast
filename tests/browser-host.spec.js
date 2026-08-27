import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, test, vi } from "vitest";

const agentMocks = vi.hoisted(() => ({
  createdWith: [],
  createActor: vi.fn(),
  statusRequest: vi.fn(),
}));

vi.mock("@dfinity/agent", () => ({
  HttpAgent: {
    create: vi.fn(async (options) => {
      agentMocks.createdWith.push(options);
      return { options, fetchRootKey: vi.fn() };
    }),
  },
  CanisterStatus: {
    request: agentMocks.statusRequest,
  },
  Actor: {
    createActor: agentMocks.createActor,
  },
}));

import icblast from "../lib/browser.js";

const wasmPath = fileURLToPath(
  new URL("../didc_wasm_pkg/didc_rust_bg.bin", import.meta.url),
);

describe("browser gateway binding", () => {
  beforeEach(() => {
    agentMocks.createdWith.length = 0;
    agentMocks.statusRequest.mockReset();
    agentMocks.statusRequest.mockRejectedValue(new Error("status unavailable"));
    agentMocks.createActor.mockReset();
    agentMocks.createActor
      .mockReturnValueOnce({
        __get_candid_interface_tmp_hack: vi.fn(async () =>
          "service : { greet : (text) -> (text) query; }",
        ),
      })
      .mockReturnValueOnce({ greet: vi.fn(async (value) => value) });
  });

  test("uses the configured gateway for status, fallback discovery, and calls", async () => {
    const host = "https://gateway.example";
    const didcWasm = new Uint8Array(await readFile(wasmPath));
    const getActor = await icblast.ic({ host, didcWasm });
    const actor = await getActor("rrkah-fqaaa-aaaaa-aaaaq-cai");

    expect(typeof actor.greet).toBe("function");
    expect(agentMocks.createdWith).toHaveLength(1);
    expect(agentMocks.createdWith.map((options) => options.host)).toEqual([
      host,
    ]);
    expect(agentMocks.statusRequest).toHaveBeenCalledTimes(1);
    expect(agentMocks.createActor).toHaveBeenCalledTimes(2);
    expect(agentMocks.createActor.mock.calls[0][1].agent.options.host).toBe(host);
  });

  test("keeps agentOptions.host and fallback discovery on the same gateway", async () => {
    const host = "https://agent-options.example";
    const didcWasm = new Uint8Array(await readFile(wasmPath));
    const getActor = await icblast.ic({
      host: "https://ignored.example",
      agentOptions: { host },
      didcWasm,
    });
    await getActor("rrkah-fqaaa-aaaaa-aaaaq-cai");

    expect(agentMocks.createdWith.map((options) => options.host)).toEqual([host]);
  });
});
