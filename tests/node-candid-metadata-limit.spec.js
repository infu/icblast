import { gzipSync } from "node:zlib";
import { describe, expect, test, vi } from "vitest";

const agentMocks = vi.hoisted(() => ({ statusRequest: vi.fn() }));

vi.mock("@dfinity/agent", () => ({
  Actor: { createActor: vi.fn() },
  CanisterStatus: { request: agentMocks.statusRequest },
  HttpAgent: class {},
}));

import { ic } from "../lib/icb_node.js";

describe("Node Candid metadata decompression", () => {
  test("caps gzip output before materializing oversized Candid", async () => {
    const oversizedCandid = `service : {} /*${"x".repeat(128 * 1024)}*/`;
    const compressed = gzipSync(Buffer.from(oversizedCandid));
    agentMocks.statusRequest
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map([["candid_service_raw", compressed]]));

    const getActor = await ic();
    await expect(getActor("rrkah-fqaaa-aaaaa-aaaaq-cai"))
      .rejects.toThrow("Candid metadata not found");
    expect(agentMocks.statusRequest).toHaveBeenCalledTimes(2);
  });
});
