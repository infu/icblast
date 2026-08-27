import {
  IDL,
  concat,
  lebEncode,
  slebEncode,
} from "@dfinity/candid";
import { Principal } from "@dfinity/principal";
import { describe, expect, test } from "vitest";
import {
  decodeCandidWithBudget,
  decodedCandidLimits,
  preflightCandid,
  preflightCandidService,
  validateCandidMessage,
  validateCandidService,
} from "../lib/candid_decode_budget.js";

function fromHex(hex) {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function nullVectorWire(length) {
  const empty = IDL.encode([IDL.Vec(IDL.Null)], [[]]);
  return concat(empty.subarray(0, -1), lebEncode(length));
}

function optionalTypeChain(length, present = false) {
  const parts = [new TextEncoder().encode("DIDL"), lebEncode(length)];
  for (let index = 0; index < length; index++) {
    parts.push(
      slebEncode(-18),
      slebEncode(index === length - 1 ? -1 : index + 1),
    );
  }
  parts.push(lebEncode(1), slebEncode(0));
  parts.push(present ? new Uint8Array(length).fill(1) : Uint8Array.of(0));
  return concat(...parts);
}

describe("raw Candid decode preflight", () => {
  test("rejects a tiny-wire zero-width vector before allocating its items", () => {
    const wire = nullVectorWire(1_000_000);
    expect(wire.byteLength).toBe(12);
    expect(() =>
      preflightCandid(wire, { maxDecodedCandidItems: 100 }),
    ).toThrow("Decoded Candid value exceeds 100 items");

    expect(
      preflightCandid(nullVectorWire(10), {
        maxDecodedCandidItems: 11,
      }).decodedItems,
    ).toBe(11);
    expect(() =>
      preflightCandid(nullVectorWire(10), {
        maxDecodedCandidItems: 10,
      }),
    ).toThrow("Decoded Candid value exceeds 10 items");
  });

  test("scans surplus top-level values that stock decode discards", () => {
    const bomb = fromHex("4449444c016d7f027f00c0843d");
    expect(bomb.byteLength).toBe(13);
    expect(() =>
      preflightCandid(bomb, { maxDecodedCandidItems: 100 }),
    ).toThrow("Decoded Candid value exceeds 100 items");

    const small = fromHex("4449444c016d7f027f0003");
    expect(preflightCandid(small, { maxDecodedCandidItems: 5 }).decodedItems).toBe(5);
    expect(IDL.decode([IDL.Null], validateCandidMessage(small))).toEqual([null]);
  });

  test("rejects fixed-width vector truncation that stock nat8 decode accepts", () => {
    const truncated = fromHex("4449444c016d7b010005aa");
    expect(IDL.decode([IDL.Vec(IDL.Nat8)], truncated)[0]).toEqual(
      Uint8Array.of(0xaa),
    );
    expect(() => preflightCandid(truncated)).toThrow(
      "Invalid Candid message: truncated fixed-width vector",
    );

    const type = IDL.Vec(IDL.Nat64);
    const complete = IDL.encode(
      [type],
      [BigUint64Array.from([1n, 2n])],
    );
    expect(preflightCandid(complete, { maxDecodedCandidItems: 3 }).decodedItems).toBe(3);
    expect(() => preflightCandid(complete.subarray(0, -1))).toThrow(
      "Invalid Candid message: truncated fixed-width vector",
    );
  });

  test("charges vec nat8 elements unless the caller raises the item envelope", () => {
    const length = 1024 * 1024;
    const wire = concat(
      fromHex("4449444c016d7b0100"),
      lebEncode(length),
      new Uint8Array(length),
    );
    expect(() =>
      preflightCandid(wire, { maxDecodedCandidItems: 1 }),
    ).toThrow("Decoded Candid value exceeds 1 items");

    const stats = preflightCandid(wire, {
      maxDecodedCandidItems: length + 1,
    });

    expect(stats.decodedItems).toBe(length + 1);
    expect(
      decodeCandidWithBudget([IDL.Vec(IDL.Nat8)], wire, {
        maxDecodedCandidItems: length + 1,
      })[0],
    ).toHaveLength(length);

    const coercible = fromHex(
      "4449444c016d7b01000a00000000000000000000",
    );
    expect(IDL.decode([IDL.Vec(IDL.Reserved)], coercible)[0]).toHaveLength(10);
    expect(IDL.decode([IDL.Vec(IDL.Opt(IDL.Nat8))], coercible)[0]).toHaveLength(10);
    expect(() =>
      decodeCandidWithBudget([IDL.Vec(IDL.Reserved)], coercible, {
        maxDecodedCandidItems: 1,
      }),
    ).toThrow("Decoded Candid value exceeds 1 items");
  });

  test("bounds zero-byte recursive values without rejecting terminating cycles", () => {
    const recursiveRecord = fromHex("4449444c016c0100000100");
    expect(() =>
      preflightCandid(recursiveRecord, {
        maxDecodedCandidDepth: 32,
        maxCandidTypeDepth: 32,
      }),
    ).toThrow("Decoded Candid value exceeds 32 depth");

    const recursiveOptionNone = fromHex("4449444c016e00010000");
    expect(
      preflightCandid(recursiveOptionNone, {
        maxDecodedCandidDepth: 1,
        maxCandidTypeDepth: 1,
      }).maxDepth,
    ).toBe(1);
  });

  test("bounds type-graph and value depth with iterative stacks", () => {
    expect(preflightCandid(optionalTypeChain(32), {
      maxCandidTypeDepth: 32,
      maxDecodedCandidDepth: 1,
      maxCandidSlebCopyBytes: Number.MAX_SAFE_INTEGER,
    }).typeDepth).toBe(32);
    expect(() =>
      preflightCandid(optionalTypeChain(33), {
        maxCandidTypeDepth: 32,
        maxCandidSlebCopyBytes: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow("Candid type graph exceeds 32 depth");
    expect(() =>
      preflightCandid(optionalTypeChain(32, true), {
        maxCandidTypeDepth: 64,
        maxDecodedCandidDepth: 16,
        maxCandidSlebCopyBytes: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow("Decoded Candid value exceeds 16 depth");
  });

  test("separates bounded control LEBs from arbitrary-precision scalar LEBs", () => {
    const hugeNat = concat(
      fromHex("4449444c00017d"),
      new Uint8Array(10).fill(0x80),
      Uint8Array.of(1),
    );
    expect(preflightCandid(hugeNat).decodedItems).toBe(1);
    expect(() =>
      preflightCandid(hugeNat, { maxCandidLebBytes: 10 }),
    ).toThrow("Candid nat exceeds 10 LEB128 bytes");

    const overlongControl = concat(
      fromHex("4449444c"),
      new Uint8Array(10).fill(0x80),
      Uint8Array.of(0),
    );
    expect(() => preflightCandid(overlongControl)).toThrow(
      "type table length LEB128 exceeds 10 bytes",
    );

    for (const annotation of [0, 4]) {
      const unknownAnnotation = concat(
        fromHex("4449444c016a000001"),
        lebEncode(annotation),
        fromHex("0100"),
      );
      expect(() => preflightCandid(unknownAnnotation)).toThrow(
        "Invalid Candid message: unknown function annotation",
      );
    }

    const twoAnnotations = fromHex(
      "4449444c016a0000020101010001010000",
    );
    expect(() => preflightCandid(twoAnnotations)).toThrow(
      "Invalid Candid message: function annotation count exceeds 1",
    );

    const overlongAnnotationCount = fromHex(
      "4449444c016a0000800001010000",
    );
    expect(() => preflightCandid(overlongAnnotationCount)).toThrow(
      "Invalid Candid message: function annotation count exceeds 1",
    );

    const overlongAnnotation = fromHex(
      "4449444c016a0000018100010001010000",
    );
    expect(() => preflightCandid(overlongAnnotation)).toThrow(
      "Invalid Candid message: unknown function annotation",
    );

    const onewayResult = fromHex(
      "4449444c016a00017f0102010001010000",
    );
    expect(() => preflightCandid(onewayResult)).toThrow(
      "Invalid Candid message: oneway function must not have result types",
    );
  });

  test("meters stock decoder's quadratic signed-LEB copying", () => {
    const length = 200;
    const vectorOfInts = concat(
      fromHex("4449444c016d7c0100"),
      lebEncode(length),
      new Uint8Array(length),
    );
    expect(() =>
      preflightCandid(vectorOfInts, {
        maxDecodedCandidItems: length + 1,
        maxCandidSlebCopyBytes: 10_000,
      }),
    ).toThrow("Candid decode exceeds 10000 signed-LEB work bytes");
  });

  test("charges both signed-LEB copies and one valid optional replay", () => {
    expect(preflightCandid(IDL.encode([IDL.Int], [-1n])).slebCopyBytes).toBe(10);
    expect(preflightCandid(IDL.encode([IDL.Int], [0n])).slebCopyBytes).toBe(8);
  });

  test("normalizes a nonzero-offset view and reports stable stats", () => {
    const wire = IDL.encode([IDL.Text], ["hello"]);
    const envelope = new Uint8Array(wire.byteLength + 2).fill(0xee);
    envelope.set(wire, 1);
    const stats = preflightCandid(envelope.subarray(1, -1));

    expect(stats.bytes).toEqual(wire);
    expect(stats.bytes.byteOffset).toBe(0);
    expect(stats.bytes).not.toBe(envelope.subarray(1, -1));
    expect(stats).toMatchObject({
      byteLength: wire.byteLength,
      decodedItems: 1,
      maxDepth: 1,
      typeDepth: 0,
    });
  });

  test("preserves representative full-grammar decode semantics", () => {
    const principal = Principal.fromText("aaaaa-aa");
    const functionType = IDL.Func([IDL.Nat], [IDL.Text], ["query"]);
    const serviceType = IDL.Service({ lookup: functionType });
    const type = IDL.Record({
      blob: IDL.Vec(IDL.Nat8),
      bool: IDL.Bool,
      emptyRecord: IDL.Record({}),
      float32: IDL.Float32,
      float64: IDL.Float64,
      functionRef: functionType,
      int: IDL.Int,
      nat: IDL.Nat,
      nullValue: IDL.Null,
      option: IDL.Opt(IDL.Text),
      principal: IDL.Principal,
      reserved: IDL.Reserved,
      serviceRef: serviceType,
      text: IDL.Text,
      variant: IDL.Variant({ impossible: IDL.Empty, ok: IDL.Null }),
      vector: IDL.Vec(IDL.Null),
    });
    const value = {
      blob: Uint8Array.of(1, 2, 3),
      bool: true,
      emptyRecord: {},
      float32: 1.5,
      float64: -2.25,
      functionRef: [principal, "lookup"],
      int: -(1n << 80n),
      nat: 1n << 80n,
      nullValue: null,
      option: ["hello"],
      principal,
      reserved: null,
      serviceRef: principal,
      text: "snowman ☃",
      variant: { ok: null },
      vector: [null, null],
    };
    const wire = IDL.encode([type], [value]);

    expect(decodeCandidWithBudget([type], wire)).toEqual(IDL.decode([type], wire));
  });

  test("requires canonical UTF-8 sorted service method names", () => {
    const invalidUtf8 = fromHex("4449444c026a000000690101ff0000");
    expect(() => preflightCandid(invalidUtf8)).toThrow(
      "Invalid Candid message: service method name is not valid UTF-8",
    );

    for (const wire of [
      fromHex("4449444c026a000000690201620001610000"),
      fromHex("4449444c026a000000690201610001610000"),
    ]) {
      expect(() => preflightCandid(wire)).toThrow(
        "Invalid Candid message: service method names must be strictly increasing",
      );
    }
  });

  test("preflights deeply nested expected service types iteratively", () => {
    let result = IDL.Null;
    for (let index = 0; index < 64; index++) result = IDL.Opt(result);
    const service = IDL.Service({
      deep: IDL.Func([], [result], ["query"]),
    });

    expect(() =>
      preflightCandidService(service, { maxCandidTypeDepth: 32 }),
    ).toThrow("Candid type graph exceeds 32 depth");
  });

  test("rejects unsafe expected type cycles and annotations precisely", () => {
    const directCycle = IDL.Record({});
    directCycle._fields.push(["self", directCycle]);
    expect(() =>
      preflightCandidService(
        IDL.Service({ cycle: IDL.Func([], [directCycle], ["query"]) }),
        { maxCandidTypeDepth: 7 },
      ),
    ).toThrow("Candid type graph exceeds 7 depth");

    expect(() =>
      preflightCandidService(
        IDL.Service({ invalid: IDL.Func([], [], ["future"]) }),
      ),
    ).toThrow("Invalid expected Candid function annotation");

    expect(() =>
      preflightCandidService(
        IDL.Service({ invalid: IDL.Func([], [], ["query", "oneway"]) }),
      ),
    ).toThrow("Expected Candid function must have at most one annotation");

    expect(() =>
      preflightCandidService(
        IDL.Service({ invalid: IDL.Func([], [IDL.Null], ["oneway"]) }),
      ),
    ).toThrow("Expected oneway Candid function must not have result types");
  });

  test("accepts a configured wide, flat expected service", () => {
    const methodType = IDL.Func([], [], ["query"]);
    const methods = Object.create(null);
    for (let index = 0; index < 65_536; index++) {
      methods[`m${index.toString().padStart(5, "0")}`] = methodType;
    }
    const stats = preflightCandidService(IDL.Service(methods), {
      maxCandidTypeItems: 70_000,
      maxCandidTypeDepth: 4,
    });

    expect(stats).toMatchObject({
      typeNodes: 2,
      typeEdges: 65_536,
      typeDepth: 2,
    });
  });

  test("meters omitted expected record fields for every vector element", () => {
    const optionalNull = IDL.Opt(IDL.Null);
    const fields = Object.fromEntries(
      Array.from({ length: 50 }, (_, index) => [`f${index}`, optionalNull]),
    );
    const expectedRecord = IDL.Record(fields);
    const service = IDL.Service({
      read: IDL.Func([], [IDL.Vec(expectedRecord)], ["query"]),
    });
    const wireType = IDL.Vec(IDL.Record({}));
    const wire = IDL.encode(
      [wireType],
      [Array.from({ length: 10 }, () => ({}))],
    );

    expect(preflightCandid(wire, { maxDecodedCandidItems: 100 }).decodedItems)
      .toBe(11);
    expect(IDL.decode([IDL.Vec(expectedRecord)], wire)[0]).toHaveLength(10);

    const bounded = validateCandidService(service, {
      maxDecodedCandidItems: 100,
    });
    expect(bounded).not.toBe(service);
    expect(() =>
      IDL.decode(
        bounded._fields[0][1].retTypes,
        validateCandidMessage(wire, { maxDecodedCandidItems: 100 }),
      ),
    ).toThrow("Decoded Candid value exceeds 100 items");

    const permitted = validateCandidService(service, {
      maxDecodedCandidItems: 600,
    });
    expect(IDL.decode(permitted._fields[0][1].retTypes, wire)[0])
      .toHaveLength(10);
  });

  test("meters reused service subtype names on every returned reference", () => {
    const methodType = IDL.Func([], [], ["query"]);
    const methods = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        `m${index.toString().padStart(2, "0")}`,
        methodType,
      ]),
    );
    const referencedService = IDL.Service(methods);
    const service = IDL.Service({
      read: IDL.Func([], [IDL.Vec(referencedService)], ["query"]),
    });
    const values = Array(5).fill(Principal.fromText("aaaaa-aa"));
    const wire = IDL.encode([IDL.Vec(referencedService)], [values]);

    expect(preflightCandid(wire).decodedItems).toBe(6);
    const bounded = validateCandidService(service, {
      maxDecodedCandidItems: 215,
    });
    expect(() => IDL.decode(bounded._fields[0][1].retTypes, wire)).toThrow(
      "Decoded Candid value exceeds 215 items",
    );

    const permitted = validateCandidService(service, {
      maxDecodedCandidItems: 216,
    });
    expect(IDL.decode(permitted._fields[0][1].retTypes, wire)[0])
      .toHaveLength(5);
  });

  test("meters a wider wire service name on every returned reference", () => {
    const methodType = IDL.Func([], [], ["query"]);
    const wideMethods = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        `m${index.toString().padStart(2, "0")}`,
        methodType,
      ]),
    );
    const wireService = IDL.Service(wideMethods);
    const expectedService = IDL.Service({ m00: methodType });
    const service = IDL.Service({
      read: IDL.Func([], [IDL.Vec(expectedService)], ["query"]),
    });
    const values = Array(5).fill(Principal.fromText("aaaaa-aa"));
    const wire = IDL.encode([IDL.Vec(wireService)], [values]);

    expect(IDL.decode([IDL.Vec(expectedService)], wire)[0]).toHaveLength(5);
    const bounded = validateCandidService(service, {
      maxDecodedCandidItems: 120,
    });
    expect(() => IDL.decode(bounded._fields[0][1].retTypes, wire)).toThrow(
      "Decoded Candid value exceeds 120 items",
    );

    const permitted = validateCandidService(service, {
      maxDecodedCandidItems: 121,
    });
    expect(IDL.decode(permitted._fields[0][1].retTypes, wire)[0])
      .toHaveLength(5);
  });

  test("meters the expected variant scan for every vector element", () => {
    const alternatives = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        `v${index.toString().padStart(2, "0")}`,
        IDL.Null,
      ]),
    );
    const variant = IDL.Variant(alternatives);
    const service = IDL.Service({
      read: IDL.Func([], [IDL.Vec(variant)], ["query"]),
    });
    const values = Array.from({ length: 5 }, () => ({ v19: null }));
    const wire = IDL.encode([IDL.Vec(variant)], [values]);

    expect(preflightCandid(wire).decodedItems).toBe(11);
    const bounded = validateCandidService(service, {
      maxDecodedCandidItems: 110,
    });
    expect(() => IDL.decode(bounded._fields[0][1].retTypes, wire)).toThrow(
      "Decoded Candid value exceeds 110 items",
    );

    const permitted = validateCandidService(service, {
      maxDecodedCandidItems: 111,
    });
    expect(IDL.decode(permitted._fields[0][1].retTypes, wire)[0])
      .toHaveLength(5);
  });

  test("does not let optional coercion swallow a nested vector limit", () => {
    const resultType = IDL.Opt(IDL.Vec(IDL.Nat8));
    const service = IDL.Service({
      read: IDL.Func([], [resultType], ["query"]),
    });
    const wire = IDL.encode(
      [resultType],
      [[new Uint8Array(100)]],
    );
    const bounded = validateCandidService(service, {
      maxDecodedCandidItems: 10,
    });

    expect(() => IDL.decode(bounded._fields[0][1].retTypes, wire)).toThrow(
      "Decoded Candid value exceeds 10 items",
    );
  });

  test("clones recursive services and meters their actual decode stack", () => {
    const list = IDL.Rec();
    list.fill(IDL.Opt(IDL.Record({ next: list })));
    const value = [{ next: [{ next: [] }] }];
    const wire = IDL.encode([list], [value]);
    const service = IDL.Service({
      read: IDL.Func([], [list], ["query"]),
    });

    const shallow = validateCandidService(service, {
      maxCandidTypeDepth: 16,
      maxDecodedCandidDepth: 4,
    });
    expect(() => IDL.decode(shallow._fields[0][1].retTypes, wire)).toThrow(
      "Decoded Candid value exceeds 4 depth",
    );

    const permitted = validateCandidService(service, {
      maxCandidTypeDepth: 16,
      maxDecodedCandidDepth: 16,
    });
    expect(IDL.decode(permitted._fields[0][1].retTypes, wire)).toEqual([value]);
  });

  test("rejects exponentially expanded expected type names", () => {
    let result = IDL.Null;
    for (let index = 0; index < 20; index++) {
      result = IDL.Record({ left: result, right: result });
    }
    const service = IDL.Service({
      expand: IDL.Func([], [result], ["query"]),
    });

    expect(() =>
      preflightCandidService(service, {
        maxCandidTypeItems: 100_000,
        maxCandidTypeDepth: 64,
      }),
    ).toThrow("Candid type table exceeds 100000 items");
  });

  test("validates every public limit", () => {
    for (const option of [
      "maxDecodedCandidItems",
      "maxDecodedCandidDepth",
      "maxCandidMessageBytes",
      "maxCandidTypeItems",
      "maxCandidTypeDepth",
      "maxCandidLebBytes",
      "maxCandidSlebCopyBytes",
    ]) {
      expect(() => decodedCandidLimits({ [option]: 0 })).toThrow(
        `${option} must be a positive safe integer`,
      );
    }
  });
});
