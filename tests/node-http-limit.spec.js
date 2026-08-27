import { afterEach, describe, expect, test, vi } from "vitest";

const agentMocks = vi.hoisted(() => ({ createdWith: [] }));

vi.mock("@dfinity/agent", () => ({
  Actor: { createActor: vi.fn() },
  CanisterStatus: { request: vi.fn() },
  HttpAgent: class {
    constructor(options) {
      agentMocks.createdWith.push(options);
    }
  },
}));

import { ic } from "../lib/icb_node.js";

describe("Node replica response guard", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    agentMocks.createdWith.length = 0;
  });

  test("installs the shared byte-limited fetch on HttpAgent", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(Uint8Array.of(1, 2, 3, 4, 5)));

    await ic({ maxHttpResponseBytes: 4 });
    const guardedFetch = agentMocks.createdWith[0].fetch;

    await expect(guardedFetch("https://example.com/service.did"))
      .rejects.toThrow("HTTP response exceeds 4 bytes");
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  test("rejects an invalid Node response limit before creating an agent", async () => {
    await expect(ic({ maxHttpResponseBytes: 0 }))
      .rejects.toThrow("maxHttpResponseBytes must be a positive safe integer");
    expect(agentMocks.createdWith).toHaveLength(0);
  });

  test("preserves a custom Node fetch's call-time receiver", async () => {
    const receiver = {
      fetch: vi.fn(function () {
        if (this !== receiver) throw new Error("lost receiver");
        return Promise.resolve(new Response("service : {}"));
      }),
    };
    await ic({ agentOptions: { fetch: receiver.fetch } });

    await expect(agentMocks.createdWith[0].fetch.call(
      receiver,
      "https://example.com/service.did",
    )).resolves.toBeInstanceOf(Response);
    expect(receiver.fetch).toHaveBeenCalledOnce();
  });
});
