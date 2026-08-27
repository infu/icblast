import { describe, expect, test, vi } from "vitest";
import { encode } from "@dfinity/cbor";
import { IDL, concat, lebEncode } from "@dfinity/candid";
import icblast from "../lib/browser.js";

class PolyfillResponse {
  constructor(body, init = {}) {
    this.bytes = body instanceof Uint8Array
      ? body
      : Uint8Array.from(body ?? []);
    const bytes = this.bytes;
    this.body = {
      async *[Symbol.asyncIterator]() {
        yield bytes.subarray(0, 2);
        yield bytes.subarray(2);
      },
    };
    this.headers = new Headers(init.headers);
    this.ok = (init.status ?? 200) < 400;
    this.redirected = false;
    this.status = init.status ?? 200;
    this.statusText = init.statusText ?? "";
    this.type = "default";
    this.url = init.url ?? "https://gateway.example/api";
  }

  async arrayBuffer() {
    const chunks = [];
    for await (const chunk of this.body) chunks.push(...chunk);
    return Uint8Array.from(chunks).buffer;
  }

  async text() {
    return new TextDecoder().decode(await this.arrayBuffer());
  }

  clone() {
    return new PolyfillResponse(this.bytes, this);
  }
}

describe("browser HTTP response limit", () => {
  test("rejects an oversized 202 update response on every agent retry", async () => {
    const cancel = vi.fn();
    const fetchImplementation = vi.fn(async () => {
      const chunks = [
        Uint8Array.from([1, 2, 3]),
        Uint8Array.from([4, 5, 6]),
      ];
      return new Response(
        new ReadableStream(
          {
            pull(controller) {
              const chunk = chunks.shift();
              if (chunk) controller.enqueue(chunk);
              else controller.close();
            },
            cancel,
          },
          { highWaterMark: 0 },
        ),
        { status: 202 },
      );
    });
    const getActor = await icblast.ic({
      agentOptions: {
        backoffStrategy: () => ({ next: () => 0 }),
        fetch: fetchImplementation,
        retryTimes: 1,
      },
      maxHttpResponseBytes: 4,
    });
    const actor = await getActor(
      "rrkah-fqaaa-aaaaa-aaaaq-cai",
      ({ IDL }) => IDL.Service({ ping: IDL.Func([], [], []) }),
    );

    await expect(actor.ping()).rejects.toThrow(
      "HTTP response exceeds 4 bytes",
    );
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  test("rebuilds an async-iterable polyfill response for agent clone", async () => {
    const responseBody = encode({
      error_code: "IC_TEST",
      reject_code: 4,
      reject_message: "blocked by test canister",
    });
    const fetchImplementation = vi.fn(async () =>
      new PolyfillResponse(responseBody, {
        status: 200,
        url: "https://gateway.example/api/v3/canister/test/call",
      }),
    );
    const getActor = await icblast.ic({
      agentOptions: {
        fetch: fetchImplementation,
        retryTimes: 0,
      },
      maxHttpResponseBytes: 1024,
    });
    const actor = await getActor(
      "rrkah-fqaaa-aaaaa-aaaaq-cai",
      ({ IDL }) => IDL.Service({ ping: IDL.Func([], [], []) }),
    );

    await expect(actor.ping()).rejects.toThrow("blocked by test canister");
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  test("rejects compact Candid expansion before the actor allocates it", async () => {
    const empty = IDL.encode([IDL.Vec(IDL.Null)], [[]]);
    const candidReply = concat(
      empty.subarray(0, -1),
      lebEncode(1_000_000),
    );
    expect(candidReply.byteLength).toBe(12);
    const fetchImplementation = vi.fn(async () =>
      new Response(encode({
        reply: { arg: candidReply },
        signatures: [],
        status: "replied",
      }), { status: 200 }),
    );
    const getActor = await icblast.ic({
      agentOptions: {
        fetch: fetchImplementation,
        retryTimes: 0,
        verifyQuerySignatures: false,
      },
      maxDecodedCandidItems: 100,
    });
    const actor = await getActor(
      "rrkah-fqaaa-aaaaa-aaaaq-cai",
      ({ IDL: candid }) => candid.Service({
        bomb: candid.Func([], [candid.Vec(candid.Null)], ["query"]),
      }),
    );

    await expect(actor.bomb()).rejects.toThrow(
      "Decoded Candid value exceeds 100 items",
    );
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });
});
