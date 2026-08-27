import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Cbor } from "@dfinity/agent";
import { IDL } from "@dfinity/candid";
import { beforeEach, describe, expect, test, vi } from "vitest";

const agentMocks = vi.hoisted(() => ({
  statusRequest: vi.fn(),
}));

vi.mock("@dfinity/agent", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    CanisterStatus: {
      ...original.CanisterStatus,
      request: agentMocks.statusRequest,
    },
  };
});

import {
  icblast as createBrowserClient,
  idlFactoryFromCandid as browserIdlFactoryFromCandid,
} from "../lib/browser.js";
import {
  ic as createNodeClient,
  idlFactoryFromCandid as nodeIdlFactoryFromCandid,
} from "../lib/icb_node.js";
import { withSafeCandidRecordFields } from "../lib/candid_object.js";

const CANISTER_ID = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const COLLISION_NAMES = [
  "then",
  "$methods",
  "prepare",
  "__proto__",
  "constructor",
];
const DID = `
  type collision = record {
    "then" : text;
    "$methods" : text;
    "prepare" : text;
    "__proto__" : text;
    "constructor" : text;
    choice : variant {
      "then" : text;
      "$methods" : text;
      "prepare" : text;
      "__proto__" : text;
      "constructor" : text;
    };
  };
  service : {
    "then" : (text) -> (text) query;
    "$methods" : (text) -> (text) query;
    "prepare" : (text) -> (text) query;
    "__proto__" : (text) -> (text) query;
    "constructor" : (text) -> (text) query;
    echo : (collision) -> (collision) query;
  };
`;
const wasmPath = fileURLToPath(
  new URL("../didc_wasm_pkg/didc_rust_bg.bin", import.meta.url),
);

function collisionValue(variantName) {
  return Object.fromEntries([
    ...COLLISION_NAMES.map((name) => [name, `record:${name}`]),
    ["choice", Object.fromEntries([[variantName, `variant:${variantName}`]])],
  ]);
}

async function createReplicaFetch() {
  const idlFactory = await nodeIdlFactoryFromCandid(DID);
  const service = withSafeCandidRecordFields(idlFactory)({ IDL });
  const methods = new Map(service._fields);

  return vi.fn(async (_url, init) => {
    const envelope = Cbor.decode(init.body);
    const methodName = envelope.content.method_name;
    const method = methods.get(methodName);
    if (!method) throw new Error(`Unexpected method: ${methodName}`);
    const args = IDL.decode(method.argTypes, envelope.content.arg);
    return new Response(Cbor.encode({
      reply: { arg: IDL.encode(method.retTypes, args) },
      signatures: [],
      status: "replied",
    }), { status: 200 });
  });
}

function expectSafeGeneratedFields(idlFactory) {
  const aggregates = [];
  const inspect = (kind, fields) => {
    aggregates.push({ fields, kind });
    return { fields, kind };
  };
  const inspectionIdl = {
    Text: { kind: "text" },
    Func: (args, results, annotations) => ({ annotations, args, results }),
    Record: (fields) => inspect("record", fields),
    Service: (fields) => inspect("service", fields),
    Variant: (fields) => inspect("variant", fields),
  };

  idlFactory({ IDL: inspectionIdl });
  expect(aggregates.map(({ kind }) => kind).sort()).toEqual([
    "record",
    "service",
    "variant",
  ]);
  for (const { fields } of aggregates) {
    expect(Object.getPrototypeOf(fields)).toBe(Object.prototype);
    for (const name of COLLISION_NAMES) {
      expect(Object.hasOwn(fields, name)).toBe(true);
    }
  }
}

async function exerciseActor(actor) {
  expect(await actor).toBe(actor);
  expect(await actor.$methods).toBe(actor.$methods);
  expect(Object.isFrozen(actor.$methods)).toBe(true);
  expect(actor.$methods.set).toBeUndefined();
  expect(actor.$methods.delete).toBeUndefined();
  expect(actor.$methods.clear).toBeUndefined();
  expect(Reflect.set(actor.$methods, "set", () => {})).toBe(false);
  expect(new Set(actor.$methods.keys())).toEqual(
    new Set([...COLLISION_NAMES, "echo"]),
  );

  expect(actor.then).toBeUndefined();
  for (const name of COLLISION_NAMES) {
    const method = actor.$methods.get(name);
    expect(method).toBeTypeOf("function");
    await expect(method(`registry:${name}`)).resolves.toBe(`registry:${name}`);
  }

  await expect(actor.$methods("direct:$methods")).resolves.toBe(
    "direct:$methods",
  );
  await expect(actor.prepare("direct:prepare")).resolves.toBe(
    "direct:prepare",
  );
  await expect(actor.__proto__("direct:__proto__")).resolves.toBe(
    "direct:__proto__",
  );
  await expect(actor.constructor("direct:constructor")).resolves.toBe(
    "direct:constructor",
  );

  const prepared = await actor.$methods.get("prepare").prepare(
    "prepared:prepare",
  );
  expect(prepared.args).toEqual(["prepared:prepare"]);
  await expect(prepared.invoke()).resolves.toBe("prepared:prepare");

  for (const variantName of COLLISION_NAMES) {
    const value = collisionValue(variantName);
    const result = await actor.$methods.get("echo")(value);
    expect(result).toEqual(value);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.choice)).toBe(Object.prototype);
    for (const name of COLLISION_NAMES) {
      expect(Object.hasOwn(result, name)).toBe(true);
    }
    expect(Object.hasOwn(result.choice, variantName)).toBe(true);
  }
}

describe("generated Candid collision safety", () => {
  beforeEach(() => {
    agentMocks.statusRequest.mockReset();
    agentMocks.statusRequest.mockResolvedValue(new Map([["candid", DID]]));
  });

  test("browser-generated fields are own properties without prototype mutation", async () => {
    const didcWasm = new Uint8Array(await readFile(wasmPath));
    expectSafeGeneratedFields(
      await browserIdlFactoryFromCandid(DID, { didcWasm }),
    );
  });

  test("Node-generated fields are own properties without prototype mutation", async () => {
    expectSafeGeneratedFields(await nodeIdlFactoryFromCandid(DID));
  });

  test("browser client uses a closed registry around a real Actor", async () => {
    const didcWasm = new Uint8Array(await readFile(wasmPath));
    const fetch = await createReplicaFetch();
    const actor = await createBrowserClient({
      agentOptions: {
        fetch,
        retryTimes: 0,
        verifyQuerySignatures: false,
      },
      didcWasm,
      host: "https://ic.example",
    })(CANISTER_ID, DID);

    await exerciseActor(actor);
    expect(fetch).toHaveBeenCalled();
  });

  test("Node client uses a closed registry around a real Actor", async () => {
    const fetch = await createReplicaFetch();
    const actor = await (await createNodeClient({
      agentOptions: {
        fetch,
        retryTimes: 0,
        verifyQuerySignatures: false,
      },
      host: "https://ic.example",
    }))(CANISTER_ID);

    await exerciseActor(actor);
    expect(fetch).toHaveBeenCalled();
  });
});
