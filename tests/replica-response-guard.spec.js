import { Actor, Cbor, HttpAgent, requestIdOf } from "@dfinity/agent";
import { concat, IDL, lebEncode } from "@dfinity/candid";
import { describe, expect, test, vi } from "vitest";
import {
  createReplicaResponseGuardFetch,
  inspectReplicaResponse,
} from "../lib/replica_response_guard.js";

const text = (value) => new TextEncoder().encode(value);

function protoMap(value) {
  return concat(
    Uint8Array.of(0xa1, 0x69),
    text("__proto__"),
    Cbor.encode(value),
  );
}

function callContent() {
  return {
    arg: IDL.encode([], []),
    canister_id: Uint8Array.of(1),
    ingress_expiry: 1n,
    method_name: "test",
    request_type: "call",
    sender: Uint8Array.of(4),
  };
}

function compactNullVectorBomb() {
  const empty = IDL.encode([IDL.Vec(IDL.Null)], [[]]);
  return concat(empty.subarray(0, -1), lebEncode(1_000_000));
}

function requestStatusCertificate(requestId, reply) {
  return Cbor.encode({
    tree: [
      2,
      text("request_status"),
      [
        2,
        requestId,
        [
          1,
          [2, text("reply"), [3, reply]],
          [2, text("status"), [3, text("replied")]],
        ],
      ],
    ],
    signature: new Uint8Array(96),
  });
}

function response(url, status = 200) {
  return { status, url };
}

describe("replica response guard", () => {
  test("validates a replied query before the Agent decodes it", () => {
    const reply = IDL.encode([IDL.Text], ["hello"]);
    const outer = Cbor.encode({
      reply: { arg: reply },
      signatures: [],
      status: "replied",
    });
    const validate = vi.fn((bytes) => Uint8Array.from(bytes));

    expect(inspectReplicaResponse(
      "https://ic.example/api/v2/canister/aaaaa-aa/query",
      response(""),
      outer,
      { validate },
    )).toEqual({ endpoint: "query", replies: 1 });
    expect(validate).toHaveBeenCalledOnce();
    expect(validate.mock.calls[0][0]).toEqual(reply);
  });

  test.each([
    ["v3 call", "/api/v3/canister/aaaaa-aa/call", "call"],
    ["202 read_state poll", "/api/v2/canister/aaaaa-aa/read_state", "read_state"],
  ])("validates a certified reply from a %s response", (_name, path, endpoint) => {
    const callContent = {
      arg: IDL.encode([], []),
      canister_id: Uint8Array.of(1),
      ingress_expiry: 1n,
      method_name: "test",
      request_type: "call",
      sender: Uint8Array.of(4),
    };
    const requestId = endpoint === "call"
      ? requestIdOf(callContent)
      : new Uint8Array(32).fill(11);
    const requestContent = endpoint === "call"
      ? callContent
      : {
          paths: [[text("request_status"), requestId]],
          request_type: "read_state",
        };
    const reply = IDL.encode([IDL.Nat], [42n]);
    const certificate = requestStatusCertificate(requestId, reply);
    const outer = Cbor.encode({ certificate });
    const validate = vi.fn((bytes) => Uint8Array.from(bytes));

    expect(inspectReplicaResponse(
      `https://ic.example${path}`,
      response(""),
      outer,
      {
        requestInit: { body: Cbor.encode({ content: requestContent }) },
        validate,
      },
    )).toEqual({ endpoint, replies: 1 });
    expect(validate).toHaveBeenCalledOnce();
    expect(validate.mock.calls[0][0]).toEqual(reply);
  });

  test("does not treat unrelated certificate leaves as Candid", () => {
    const certificate = Cbor.encode({
      tree: [
        2,
        text("canister"),
        [2, text("reply"), [3, Uint8Array.of(0xde, 0xad)]],
      ],
      signature: new Uint8Array(96),
    });
    const validate = vi.fn();

    expect(inspectReplicaResponse(
      "https://ic.example/api/v2/canister/aaaaa-aa/read_state",
      response(""),
      Cbor.encode({ certificate }),
      {
        requestInit: {
          body: Cbor.encode({
            content: {
              paths: [[text("request_status"), new Uint8Array(32).fill(7)]],
            },
          }),
        },
        validate,
      },
    )).toEqual({ endpoint: "read_state", replies: 0 });
    expect(validate).not.toHaveBeenCalled();
  });

  test("validates only the request ID present in the outbound read_state", () => {
    const unrelatedId = new Uint8Array(32).fill(1);
    const requestedId = new Uint8Array(32).fill(2);
    const requestedReply = IDL.encode([IDL.Bool], [true]);
    const certificate = Cbor.encode({
      tree: [
        2,
        text("request_status"),
        [
          1,
          [
            2,
            unrelatedId,
            [
              1,
              [2, text("reply"), [3, Uint8Array.of(0xde, 0xad)]],
              [2, text("status"), [3, text("replied")]],
            ],
          ],
          [
            2,
            requestedId,
            [
              1,
              [2, text("reply"), [3, requestedReply]],
              [2, text("status"), [3, text("replied")]],
            ],
          ],
        ],
      ],
      signature: new Uint8Array(96),
    });
    const validate = vi.fn((bytes) => Uint8Array.from(bytes));

    expect(inspectReplicaResponse(
      "https://ic.example/api/v2/canister/aaaaa-aa/read_state",
      response(""),
      Cbor.encode({ certificate }),
      {
        requestInit: {
          body: Cbor.encode({
            content: { paths: [[text("request_status"), requestedId]] },
          }),
        },
        validate,
      },
    )).toEqual({ endpoint: "read_state", replies: 1 });
    expect(validate).toHaveBeenCalledOnce();
    expect(validate.mock.calls[0][0]).toEqual(requestedReply);
  });

  test("rejects malicious outer CBOR before decoding it", () => {
    const hugeArray = Uint8Array.from([
      0x9b,
      0xff, 0xff, 0xff, 0xff,
      0xff, 0xff, 0xff, 0xff,
    ]);

    expect(() => inspectReplicaResponse(
      "https://ic.example/api/v2/canister/aaaaa-aa/query",
      response(""),
      hugeArray,
      { cborLimits: { maxBytes: 64, maxItems: 100, maxDepth: 8 } },
    )).toThrow("CBOR value exceeds 100 items");
  });

  test("rejects an inherited query reply before CBOR decode", () => {
    const outer = protoMap({
      reply: { arg: IDL.encode([], []) },
      status: "replied",
    });

    expect(() => inspectReplicaResponse(
      "https://ic.example/api/v2/canister/aaaaa-aa/query",
      response(""),
      outer,
    )).toThrow("Unsafe CBOR map key __proto__");
  });

  test("rejects an inherited outer certificate before CBOR decode", () => {
    const content = callContent();
    const requestId = requestIdOf(content);
    const outer = protoMap({
      certificate: requestStatusCertificate(requestId, IDL.encode([], [])),
    });

    expect(() => inspectReplicaResponse(
      "https://ic.example/api/v3/canister/aaaaa-aa/call",
      response(""),
      outer,
      { requestInit: { body: Cbor.encode({ content }) } },
    )).toThrow("Unsafe CBOR map key __proto__");
  });

  test("rejects an inherited delegation certificate before CBOR decode", () => {
    const content = callContent();
    const certificate = Cbor.encode({
      delegation: {
        certificate: protoMap({ tree: [0], signature: new Uint8Array(96) }),
        subnet_id: Uint8Array.of(1),
      },
      signature: new Uint8Array(96),
      tree: [0],
    });

    expect(() => inspectReplicaResponse(
      "https://ic.example/api/v3/canister/aaaaa-aa/call",
      response(""),
      Cbor.encode({ certificate }),
      { requestInit: { body: Cbor.encode({ content }) } },
    )).toThrow("Unsafe CBOR map key __proto__");
  });

  test("preflights a delegation certificate before the Agent decodes it", () => {
    const hugeArray = Uint8Array.from([
      0x9b,
      0xff, 0xff, 0xff, 0xff,
      0xff, 0xff, 0xff, 0xff,
    ]);
    const certificate = Cbor.encode({
      tree: [0],
      signature: new Uint8Array(96),
      delegation: {
        subnet_id: Uint8Array.of(1),
        certificate: hugeArray,
      },
    });

    expect(() => inspectReplicaResponse(
      "https://ic.example/api/v3/canister/aaaaa-aa/call",
      response(""),
      Cbor.encode({ certificate }),
      {
        cborLimits: { maxBytes: 1024, maxItems: 100, maxDepth: 16 },
        requestInit: {
          body: Cbor.encode({ content: { request_type: "call" } }),
        },
      },
    )).toThrow("CBOR value exceeds 100 items");
  });

  test("does not parse arbitrary non-replica resources", () => {
    expect(inspectReplicaResponse(
      "https://example.com/service.did",
      response("https://example.com/service.did"),
      Uint8Array.of(0xff),
    )).toBeUndefined();
    expect(inspectReplicaResponse(
      "https://ic.example/api/v3/canister/aaaaa-aa/query",
      response(""),
      Uint8Array.of(0xff),
    )).toBeUndefined();
  });

  test("the shared fetch wrapper preserves non-IC responses", async () => {
    const fetchImplementation = vi.fn(async () =>
      new Response("service : {}", { status: 200 }));
    const guardedFetch = createReplicaResponseGuardFetch(fetchImplementation, {
      maxBytes: 1024,
    });

    const guardedResponse = await guardedFetch("https://example.com/service.did");
    await expect(guardedResponse.text()).resolves.toBe("service : {}");
  });

  test.each([
    ["v3 call", "/api/v3/canister/aaaaa-aa/call", "call"],
    ["read_state", "/api/v2/canister/aaaaa-aa/read_state", "read_state"],
  ])("the fetch wrapper rejects a compact bomb in a %s certificate", async (
    _name,
    path,
    endpoint,
  ) => {
    const bomb = compactNullVectorBomb();
    const callContent = {
      arg: IDL.encode([], []),
      canister_id: Uint8Array.of(1),
      ingress_expiry: 1n,
      method_name: "test",
      request_type: "call",
      sender: Uint8Array.of(4),
    };
    const requestId = endpoint === "call"
      ? requestIdOf(callContent)
      : new Uint8Array(32).fill(12);
    const content = endpoint === "call"
      ? callContent
      : { paths: [[text("request_status"), requestId]] };
    const outer = Cbor.encode({
      certificate: requestStatusCertificate(requestId, bomb),
    });
    const guardedFetch = createReplicaResponseGuardFetch(
      vi.fn(async () => new Response(outer, { status: 200 })),
      {
        candidLimits: { maxDecodedCandidItems: 100 },
        maxBytes: 4096,
      },
    );

    await expect(guardedFetch(`https://ic.example${path}`, {
      body: Cbor.encode({ content }),
    })).rejects.toThrow("Decoded Candid value exceeds 100 items");
  });

  test("intercepts an immediate v3 certificate from a real Agent 3.4.3 call", async () => {
    const bomb = compactNullVectorBomb();
    const fetchImplementation = vi.fn(async (_url, init) => {
      const envelope = Cbor.decode(init.body);
      const requestId = requestIdOf(envelope.content);
      return new Response(Cbor.encode({
        certificate: requestStatusCertificate(requestId, bomb),
      }), { status: 200 });
    });
    const agent = new HttpAgent({
      fetch: createReplicaResponseGuardFetch(fetchImplementation, {
        candidLimits: { maxDecodedCandidItems: 100 },
        maxBytes: 4096,
      }),
      host: "https://ic.example",
      retryTimes: 0,
      verifyQuerySignatures: false,
    });
    const actor = Actor.createActor(
      ({ IDL: candid }) => candid.Service({
        bomb: candid.Func([], [candid.Vec(candid.Null)], []),
      }),
      { agent, canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai" },
    );

    await expect(actor.bomb())
      .rejects.toThrow("Decoded Candid value exceeds 100 items");
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  test("intercepts the read_state reply after a real Agent 3.4.3 202 call", async () => {
    const bomb = compactNullVectorBomb();
    const fetchImplementation = vi.fn(async (url, init) => {
      const pathname = new URL(url).pathname;
      if (pathname.endsWith("/call")) {
        return new Response(null, { status: 202 });
      }
      if (pathname.endsWith("/read_state")) {
        const envelope = Cbor.decode(init.body);
        const requestId = envelope.content.paths[0][1];
        return new Response(Cbor.encode({
          certificate: requestStatusCertificate(requestId, bomb),
        }), { status: 200 });
      }
      throw new Error(`Unexpected Agent endpoint: ${pathname}`);
    });
    const agent = new HttpAgent({
      fetch: createReplicaResponseGuardFetch(fetchImplementation, {
        candidLimits: { maxDecodedCandidItems: 100 },
        maxBytes: 4096,
      }),
      host: "https://ic.example",
      retryTimes: 0,
      verifyQuerySignatures: false,
    });
    const actor = Actor.createActor(
      ({ IDL: candid }) => candid.Service({
        bomb: candid.Func([], [candid.Vec(candid.Null)], []),
      }),
      { agent, canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai" },
    );

    await expect(actor.bomb())
      .rejects.toThrow("Decoded Candid value exceeds 100 items");
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });
});
