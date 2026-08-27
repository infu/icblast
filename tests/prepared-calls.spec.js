import { Cbor } from "@dfinity/agent";
import { IDL } from "@dfinity/candid";
import { describe, expect, test, vi } from "vitest";
import { icblast } from "../lib/browser.js";
import {
  defineDataProperty,
  withSafeCandidRecordFields,
} from "../lib/candid_object.js";

const CANISTER_ID = "rrkah-fqaaa-aaaaa-aaaaq-cai";

function preparedService({ IDL: candid }) {
  const payloadFields = {
    bytes: candid.Vec(candid.Nat8),
    count: candid.Nat64,
    nested: candid.Record({
      labels: candid.Vec(candid.Text),
      optional: candid.Opt(candid.Text),
    }),
  };
  defineDataProperty(payloadFields, "__proto__", candid.Text);
  const payload = candid.Record(payloadFields);
  const account = candid.Record({
    owner: candid.Principal,
    subaccount: candid.Opt(candid.Vec(candid.Nat8)),
  });
  const methods = {};
  defineDataProperty(
    methods,
    "echo",
    candid.Func([payload], [payload], ["query"]),
  );
  defineDataProperty(
    methods,
    "account",
    candid.Func([account], [candid.Text], ["query"]),
  );
  for (const name of [
    "then",
    "$methods",
    "__proto__",
    "constructor",
    "prepare",
    "invoke",
    "args",
  ]) {
    defineDataProperty(
      methods,
      name,
      candid.Func([candid.Text], [candid.Text], ["query"]),
    );
  }
  return candid.Service(methods);
}

describe("prepared calls", () => {
  test("binds deeply frozen review args to one real Actor dispatch", async () => {
    const service = withSafeCandidRecordFields(preparedService)({ IDL });
    const funcs = new Map(service._fields);
    const dispatched = [];
    let releaseEcho;
    const echoGate = new Promise((resolve) => {
      releaseEcho = resolve;
    });
    const fetchImplementation = vi.fn(async (_url, init) => {
      const envelope = Cbor.decode(init.body);
      const { arg, method_name: methodName } = envelope.content;
      const func = funcs.get(methodName);
      const decoded = IDL.decode(func.argTypes, arg);
      dispatched.push({ args: decoded, methodName });
      if (methodName === "echo") await echoGate;
      const reply = methodName === "account" ? ["account"] : decoded;
      return new Response(Cbor.encode({
        reply: { arg: IDL.encode(func.retTypes, reply) },
        signatures: [],
        status: "replied",
      }), { status: 200 });
    });
    const getActor = icblast({
      agentOptions: {
        fetch: fetchImplementation,
        retryTimes: 0,
        verifyQuerySignatures: false,
      },
      host: "https://ic.example",
    });
    const actor = await getActor(CANISTER_ID, preparedService);
    const original = JSON.parse(
      '{"__proto__":"safe","count":"0x2a",' +
      '"nested":{"labels":["before"],"optional":"kept"}}',
    );
    original.bytes = Uint8Array.of(0, 1, 2, 255);

    const prepared = await actor.$methods.get("echo").prepare(original);
    const expectedReview = JSON.parse(
      '{"__proto__":"safe","bytes":"000102ff","count":"42",' +
      '"nested":{"labels":["before"],"optional":["kept"]}}',
    );
    expect(prepared).toEqual({
      args: [expectedReview],
      invoke: expect.any(Function),
    });
    expect(Object.keys(prepared)).toEqual(["args", "invoke"]);
    expect(Object.hasOwn(prepared.args[0], "__proto__")).toBe(true);
    expect(prepared.args[0].__proto__).toBe("safe");
    expect(prepared.invoke.length).toBe(0);
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.args)).toBe(true);
    expect(Object.isFrozen(prepared.args[0])).toBe(true);
    expect(Object.isFrozen(prepared.args[0].nested)).toBe(true);
    expect(Object.isFrozen(prepared.args[0].nested.labels)).toBe(true);

    original.bytes.fill(255);
    original.count = "99";
    original.__proto__ = "changed";
    original.nested.labels[0] = "after";
    original.nested.optional = "changed";
    expect(() => {
      prepared.args[0].nested.labels[0] = "mutated";
    }).toThrow(TypeError);
    expect(() => {
      prepared.args[0].__proto__ = "mutated";
    }).toThrow(TypeError);
    expect(() => {
      prepared.args.push(null);
    }).toThrow(TypeError);

    expect(() => prepared.invoke("replacement")).toThrow(
      "Prepared call invoke does not accept arguments",
    );
    const first = prepared.invoke();
    expect(() => prepared.invoke()).toThrow(
      "Prepared call has already been invoked",
    );
    await expect(Promise.resolve().then(() => prepared.invoke())).rejects
      .toThrow("Prepared call has already been invoked");
    releaseEcho();
    const expectedResult = JSON.parse(
      '{"__proto__":"safe","bytes":"000102ff","count":"42",' +
      '"nested":{"labels":["before"],"optional":"kept"}}',
    );
    await expect(first).resolves.toEqual(expectedResult);

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].methodName).toBe("echo");
    expect(dispatched[0].args[0].count).toBe(42n);
    expect(dispatched[0].args[0]._2111641832_).toBe("safe");
    expect([...dispatched[0].args[0].bytes]).toEqual([0, 1, 2, 255]);
    expect(dispatched[0].args[0].nested.labels).toEqual(["before"]);
    expect(dispatched[0].args[0].nested.optional).toEqual(["kept"]);

    const account = await actor.$methods.get("account").prepare({
      owner: "aaaaa-aa",
      subaccount: "0001ff",
    });
    expect(account.args).toEqual([{
      owner: "aaaaa-aa",
      subaccount: ["0001ff"],
    }]);
    await expect(account.invoke()).resolves.toBe("account");
    const noSubaccount = await actor.$methods.get("account").prepare({
      owner: "aaaaa-aa",
      subaccount: null,
    });
    expect(noSubaccount.args).toEqual([{
      owner: "aaaaa-aa",
      subaccount: [],
    }]);
  });

  test("keeps prepare additive for collision-named methods", async () => {
    const service = withSafeCandidRecordFields(preparedService)({ IDL });
    const funcs = new Map(service._fields);
    const fetchImplementation = vi.fn(async (_url, init) => {
      const envelope = Cbor.decode(init.body);
      const { arg, method_name: methodName } = envelope.content;
      const func = funcs.get(methodName);
      const decoded = IDL.decode(func.argTypes, arg);
      return new Response(Cbor.encode({
        reply: { arg: IDL.encode(func.retTypes, decoded) },
        signatures: [],
        status: "replied",
      }), { status: 200 });
    });
    const actor = await icblast({
      agentOptions: {
        fetch: fetchImplementation,
        retryTimes: 0,
        verifyQuerySignatures: false,
      },
      host: "https://ic.example",
    })(CANISTER_ID, preparedService);
    const names = [
      "then",
      "$methods",
      "__proto__",
      "constructor",
      "prepare",
      "invoke",
      "args",
    ];

    for (const name of names) {
      const method = actor.$methods.get(name);
      expect(method).toBeTypeOf("function");
      expect(method.prepare).toBeTypeOf("function");
      const prepared = await method.prepare(`prepared:${name}`);
      expect(prepared.args).toEqual([`prepared:${name}`]);
      await expect(prepared.invoke()).resolves.toBe(`prepared:${name}`);
    }

    await expect(actor.$methods.get("constructor")("legacy"))
      .resolves.toBe("legacy");
    expect(fetchImplementation).toHaveBeenCalledTimes(names.length + 1);
  });
});
