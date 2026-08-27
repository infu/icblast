import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { IDL } from "@dfinity/candid";
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

import icblast, { walletProxy } from "../lib/browser.js";

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

  test("does not allow actorOptions to replace the guarded agent", async () => {
    const didcWasm = new Uint8Array(await readFile(wasmPath));
    const bypassAgent = { query: vi.fn() };
    agentMocks.createActor.mockReset();
    agentMocks.createActor.mockReturnValue({ greet: vi.fn() });

    const getActor = await icblast.ic({
      actorOptions: { agent: bypassAgent },
      didcWasm,
    });
    await getActor(
      "rrkah-fqaaa-aaaaa-aaaaq-cai",
      "service : { greet : () -> () query; }",
    );

    const actorConfig = agentMocks.createActor.mock.calls[0][1];
    expect(actorConfig.agent).not.toBe(bypassAgent);
    expect(actorConfig.agent.options.fetch).toBeTypeOf("function");
  });

  test("forces the guarded agent after call and query transforms", async () => {
    const didcWasm = new Uint8Array(await readFile(wasmPath));
    const bypassAgent = { call: vi.fn(), query: vi.fn() };
    agentMocks.createActor.mockReset();
    agentMocks.createActor.mockReturnValue({ greet: vi.fn() });

    const getActor = await icblast.ic({
      actorOptions: {
        agent: bypassAgent,
        callTransform: () => ({ agent: bypassAgent, nonce: Uint8Array.of(1) }),
        queryTransform: () => ({ agent: bypassAgent, effectiveCanisterId: "aaaaa-aa" }),
      },
      didcWasm,
    });
    await getActor(
      "rrkah-fqaaa-aaaaa-aaaaq-cai",
      "service : { greet : () -> () query; }",
    );

    const actorConfig = agentMocks.createActor.mock.calls[0][1];
    expect(actorConfig.callTransform("greet", [], {}).agent)
      .toBe(actorConfig.agent);
    expect(actorConfig.queryTransform("greet", [], {}).agent)
      .toBe(actorConfig.agent);
    expect(actorConfig.callTransform("greet", [], {}).nonce)
      .toEqual(Uint8Array.of(1));
  });

  test("preserves a custom fetch's call-time receiver", async () => {
    const receiver = {
      fetch: vi.fn(function () {
        if (this !== receiver) throw new Error("lost receiver");
        return Promise.resolve(new Response("service : {}"));
      }),
    };
    await icblast.ic({ agentOptions: { fetch: receiver.fetch } });

    await expect(agentMocks.createdWith[0].fetch.call(
      receiver,
      "https://example.com/service.did",
    )).resolves.toBeInstanceOf(Response);
    expect(receiver.fetch).toHaveBeenCalledOnce();
  });

  test("preflights the expected service graph before actor construction", async () => {
    const didcWasm = new Uint8Array(await readFile(wasmPath));
    agentMocks.createActor.mockReset();
    const getActor = await icblast.ic({
      didcWasm,
      maxDecodedCandidDepth: 2,
    });
    const deepService = ({ IDL: candid }) => candid.Service({
      deep: candid.Func(
        [],
        [candid.Record({ one: candid.Record({ two: candid.Nat }) })],
        ["query"],
      ),
    });

    await expect(getActor(
      "rrkah-fqaaa-aaaaa-aaaaq-cai",
      deepService,
    )).rejects.toThrow("Candid type graph exceeds 2 depth");
    expect(agentMocks.createActor).not.toHaveBeenCalled();
  });

  test("threads and validates the public Candid type-item limit", async () => {
    const didcWasm = new Uint8Array(await readFile(wasmPath));
    agentMocks.createActor.mockReset();
    const getActor = await icblast.ic({
      didcWasm,
      maxCandidTypeItems: 1,
    });

    await expect(getActor(
      "rrkah-fqaaa-aaaaa-aaaaq-cai",
      ({ IDL: candid }) => candid.Service({
        ping: candid.Func([], [], ["query"]),
      }),
    )).rejects.toThrow("Candid type table exceeds 1 items");
    expect(agentMocks.createActor).not.toHaveBeenCalled();

    await expect(icblast.ic({ maxCandidTypeItems: 0 }))
      .rejects.toThrow("maxCandidTypeItems must be a positive safe integer");
    await expect(icblast.ic({ maxCandidTypeDepth: 0 }))
      .rejects.toThrow("maxCandidTypeDepth must be a positive safe integer");
  });

  test("accepts a trusted 65,536-method service with explicit type limits", async () => {
    const stop = new Error("actor construction reached");
    agentMocks.createActor.mockReset();
    agentMocks.createActor.mockImplementationOnce(() => {
      throw stop;
    });
    const getActor = await icblast.ic({
      maxCandidTypeDepth: Number.MAX_SAFE_INTEGER,
      maxCandidTypeItems: Number.MAX_SAFE_INTEGER,
    });
    const largeService = ({ IDL: candid }) => {
      const methods = Object.create(null);
      for (let index = 0; index < 65_536; index += 1) {
        methods[`method_${index}`] = candid.Func([], [], ["query"]);
      }
      return candid.Service(methods);
    };

    await expect(getActor(
      "rrkah-fqaaa-aaaaa-aaaaq-cai",
      largeService,
    )).rejects.toBe(stop);
    expect(agentMocks.createActor).toHaveBeenCalledOnce();
  }, 20_000);

  test("forwards compiler limits through the public browser factory", async () => {
    const didcWasm = new Uint8Array(await readFile(wasmPath));
    const source = `/*${"x".repeat(128 * 1024)}*/ service : { ping : () -> (); }`;
    const getActor = await icblast.ic({
      didcWasm,
      maxCandidSourceBytes: Buffer.byteLength(source, "utf8"),
      maxGeneratedJavaScriptBytes: 1,
    });

    await expect(
      getActor("rrkah-fqaaa-aaaaa-aaaaq-cai", source),
    ).rejects.toThrow("Generated Candid JavaScript exceeds 1 UTF-8 bytes");
  });

  test("keeps actors with a Candid then method non-thenable", async () => {
    const didcWasm = new Uint8Array(await readFile(wasmPath));
    const did = "service : { then : (text) -> (text) query; }";
    const thenMethod = vi.fn(async (value) => value);
    agentMocks.createActor.mockReset();
    agentMocks.createActor.mockReturnValue({ then: thenMethod });

    const getActor = await icblast.ic({ didcWasm });
    const actor = await getActor("rrkah-fqaaa-aaaaa-aaaaq-cai", did);
    expect(actor.then).toBeUndefined();
    expect(await actor.$methods).toBe(actor.$methods);
    expect(Object.isFrozen(actor.$methods)).toBe(true);
    expect(actor.$methods.set).toBeUndefined();
    await expect(actor.$methods.get("then")("direct")).resolves.toBe("direct");

    await expect(
      icblast.scan("rrkah-fqaaa-aaaaa-aaaaq-cai", { did, didcWasm }),
    ).resolves.toEqual([{ name: "then", kind: "query" }]);
    await expect(
      icblast.schema("rrkah-fqaaa-aaaaa-aaaaq-cai", "then", {
        did,
        didcWasm,
      }),
    ).resolves.toHaveProperty("input");
    await expect(
      icblast.call("rrkah-fqaaa-aaaaa-aaaaq-cai", "then", ["high-level"], {
        did,
        didcWasm,
      }),
    ).resolves.toBe("high-level");
  }, 10_000);

  test("keeps hidden method names available through wallet proxies", async () => {
    const didcWasm = new Uint8Array(await readFile(wasmPath));
    const did = "service : { then : (text) -> (text) query; }";
    agentMocks.createActor.mockReset();
    agentMocks.createActor.mockReturnValue({
      then: vi.fn(async (value) => value),
    });
    const getActor = await icblast.ic({ didcWasm });
    const actor = await getActor("rrkah-fqaaa-aaaaa-aaaaq-cai", did);
    const wallet = {
      wallet_call: vi.fn(async ({ method_name: method }) => ({
        return: [...IDL.encode([IDL.Text], [`wallet:${method}`])],
      })),
    };

    const proxy = walletProxy(wallet, actor);
    expect(await proxy).toBe(proxy);
    expect(await proxy.$methods).toBe(proxy.$methods);
    expect(proxy.then).toBeUndefined();
    await expect(proxy.$methods.get("then")("input")).resolves.toBe(
      "wallet:then",
    );
  }, 10_000);

  test("keeps method and raw-helper names collision-free", async () => {
    const didcWasm = new Uint8Array(await readFile(wasmPath));
    const names = [
      "foo",
      "foo$",
      "$foo",
      "methods",
      "$methods",
      "$principal",
      "$selfPrincipal",
      "$idlFactory",
      "__proto__",
      "constructor",
      "contains export const text",
    ];
    const did = `service : { ${names
      .map((name) => `${JSON.stringify(name)} : () -> (text) query;`)
      .join(" ")} }`;
    agentMocks.createActor.mockReset();
    agentMocks.createActor.mockImplementation((idlFactory) => {
      const rawActor = {};
      for (const [name] of idlFactory({ IDL })._fields) {
        rawActor[name] = vi.fn(async () => name);
      }
      return rawActor;
    });

    const getActor = await icblast.ic({ didcWasm });
    const actor = await getActor("rrkah-fqaaa-aaaaa-aaaaq-cai", did);

    await expect(actor.foo$()).resolves.toBe("foo$");
    await expect(actor.$foo()).resolves.toBe("$foo");
    await expect(actor.$methods.get("$principal")()).resolves.toBe("$principal");
    await expect(actor.$methods.get("$selfPrincipal")()).resolves.toBe(
      "$selfPrincipal",
    );
    await expect(actor.$methods.get("$idlFactory")()).resolves.toBe("$idlFactory");
    await expect(actor.$methods.get("__proto__")()).resolves.toBe("__proto__");
    await expect(actor.__proto__()).resolves.toBe("__proto__");
    await expect(actor.constructor()).resolves.toBe("constructor");
    await expect(
      actor.$methods.get("contains export const text")(),
    ).resolves.toBe("contains export const text");
    await expect(actor.$methods.get("$methods")()).resolves.toBe("$methods");
    await expect(actor.$methods()).resolves.toBe("$methods");
    await expect(actor.$methods.get("methods")()).resolves.toBe("methods");
    await expect(actor.$methods.get("foo").encodeArgs()).resolves.toEqual(
      expect.any(Array),
    );
    const serviceSchemas = icblast.explainServiceSchema(actor);
    expect(Object.hasOwn(serviceSchemas, "__proto__")).toBe(true);
    expect(serviceSchemas.__proto__).toHaveProperty("input");

    await expect(
      icblast.call("rrkah-fqaaa-aaaaa-aaaaq-cai", "foo$", [], {
        did,
        didcWasm,
      }),
    ).resolves.toBe("foo$");
  }, 10_000);

  test("round-trips nested __proto__ record and variant fields safely", async () => {
    const didcWasm = new Uint8Array(await readFile(wasmPath));
    const did = `service : {
      echo : (
        record {
          "__proto__" : record { value : text };
          choice : variant {
            "__proto__" : record { "__proto__" : text };
            none : null;
          };
        }
      ) -> (
        record {
          "__proto__" : record { value : text };
          choice : variant {
            "__proto__" : record { "__proto__" : text };
            none : null;
          };
        }
      ) query;
    }`;
    const value = JSON.parse(
      '{"__proto__":{"value":"record"},"choice":{"__proto__":{"__proto__":"variant"}}}',
    );
    const wireType = IDL.Record({
      ["__proto__"]: IDL.Record({ value: IDL.Text }),
      choice: IDL.Variant({
        ["__proto__"]: IDL.Record({ ["__proto__"]: IDL.Text }),
        none: IDL.Null,
      }),
    });
    const reply = IDL.encode([wireType], [value]);

    agentMocks.createActor.mockReset();
    agentMocks.createActor.mockImplementation((idlFactory) => {
      const func = new Map(idlFactory({ IDL })._fields).get("echo");
      return {
        echo: vi.fn(async (converted) => {
          expect(Object.hasOwn(converted, "__proto__")).toBe(false);
          expect(Object.hasOwn(converted, "_2111641832_")).toBe(true);
          expect([...IDL.encode(func.argTypes, [converted])]).toEqual([
            ...reply,
          ]);
          return IDL.decode(func.retTypes, reply)[0];
        }),
      };
    });

    const getActor = await icblast.ic({ didcWasm });
    const actor = await getActor("rrkah-fqaaa-aaaaa-aaaaq-cai", did);
    const result = await actor.echo(value);

    expect(result).toEqual(value);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, "__proto__")).toBe(true);
    expect(Object.hasOwn(result.choice, "__proto__")).toBe(true);
    expect(Object.hasOwn(result.choice.__proto__, "__proto__")).toBe(true);

    const schema = icblast.explainMethodSchema(actor, "echo");
    const recordSchema = schema.input.prefixItems[0];
    expect(recordSchema.patternProperties["^__proto__$"]).toBeDefined();
    const protoAlternative = recordSchema.properties.choice.oneOf.find(
      (alternative) => alternative.required[0] === "__proto__",
    );
    const variantRecord =
      protoAlternative.patternProperties["^__proto__$"];
    expect(variantRecord.patternProperties["^__proto__$"]).toBeDefined();
    expect(icblast.validateMethodInput(actor, "echo", [value]).ok).toBe(true);

    const inheritedOnly = Object.create(value);
    Object.defineProperty(inheritedOnly, "choice", {
      enumerable: true,
      value: value.choice,
    });
    expect(
      icblast.validateMethodInput(actor, "echo", [inheritedOnly]).ok,
    ).toBe(false);
    await expect(actor.echo(inheritedOnly)).rejects.toContain(
      "__proto__ (missing)",
    );

    const inheritedVariant = JSON.parse(
      '{"__proto__":{"value":"record"},"choice":{}}',
    );
    Object.setPrototypeOf(inheritedVariant.choice, value.choice);
    expect(
      icblast.validateMethodInput(actor, "echo", [inheritedVariant]).ok,
    ).toBe(false);
    await expect(actor.echo(inheritedVariant)).rejects.toContain(
      "variant expected",
    );

    expect(actor.echo.decodeResult([...reply])).toEqual(value);
    await expect(actor.echo.encodeArgs(value)).resolves.toEqual([...reply]);
  }, 10_000);

  test("bounds raw HTTP bodies before decode and preserves AbortSignal", async () => {
    const controller = new AbortController();
    const fetchImplementation = vi.fn(async () =>
      new Response(
        new ReadableStream({
          start(stream) {
            stream.enqueue(Uint8Array.from([1, 2, 3]));
            stream.enqueue(Uint8Array.from([4, 5, 6]));
            stream.close();
          },
        }),
        { status: 202 },
      ),
    );
    await icblast.ic({
      agentOptions: { fetch: fetchImplementation },
      maxHttpResponseBytes: 4,
    });
    const limitedFetch = agentMocks.createdWith[0].fetch;
    await expect(
      limitedFetch("https://gateway.example/api", {
        signal: controller.signal,
      }),
    ).rejects.toThrow(
      "HTTP response exceeds 4 bytes",
    );
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://gateway.example/api",
      { signal: controller.signal },
    );
    expect(controller.signal.aborted).toBe(false);
  });

  test("binds the default fetch implementation to the global object", async () => {
    const previousFetch = globalThis.fetch;
    const fetchImplementation = vi.fn(function () {
      if (this !== globalThis) throw new Error("detached fetch");
      return Promise.resolve(new Response(Uint8Array.from([1])));
    });
    globalThis.fetch = fetchImplementation;
    try {
      await icblast.ic({ maxHttpResponseBytes: 4 });
      await expect(
        agentMocks.createdWith[0].fetch("https://gateway.example/api"),
      ).resolves.toBeInstanceOf(Response);
      expect(fetchImplementation).toHaveBeenCalledOnce();
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test("rejects an oversized declared HTTP body before reading it", async () => {
    const cancel = vi.fn(() => new Promise(() => {}));
    const fetchImplementation = vi.fn(async () =>
      new Response(new ReadableStream({ cancel }), {
        headers: { "content-length": "5" },
      }),
    );
    await icblast.ic({
      agentOptions: { fetch: fetchImplementation },
      maxHttpResponseBytes: 4,
    });

    await expect(
      agentMocks.createdWith[0].fetch("https://gateway.example/api"),
    ).rejects.toThrow("HTTP response exceeds 4 bytes");
    expect(cancel).toHaveBeenCalledOnce();
  });

  test("rejects invalid raw HTTP response limits", async () => {
    await expect(
      icblast.ic({ maxHttpResponseBytes: 0 }),
    ).rejects.toThrow("maxHttpResponseBytes must be a positive safe integer");
  });
});
