import { decode, encode, encodeWithSelfDescribedTag } from "@dfinity/cbor";
import { describe, expect, test } from "vitest";
import {
  CborPreflightError,
  preflightCbor,
} from "../lib/cbor_preflight.js";

describe("CBOR structural preflight", () => {
  test("rejects a tiny encoding that declares a huge array", () => {
    const declaredLength = Uint8Array.from([
      0x9b,
      0xff, 0xff, 0xff, 0xff,
      0xff, 0xff, 0xff, 0xff,
    ]);

    expect(() => preflightCbor(declaredLength, {
      maxBytes: 32,
      maxItems: 100,
      maxDepth: 8,
    })).toThrow("CBOR value exceeds 100 items");
  });

  test("stops deeply nested input without recursive parsing", () => {
    const depth = 10_000;
    const encoded = new Uint8Array(depth + 1);
    encoded.fill(0x81, 0, depth);
    encoded[depth] = 0xf6;

    expect(() => preflightCbor(encoded, {
      maxBytes: encoded.byteLength,
      maxItems: encoded.byteLength,
      maxDepth: 64,
    })).toThrow("CBOR value exceeds a nesting depth of 64");
  });

  test("accepts a representative self-described IC certificate", () => {
    const certificate = {
      tree: [
        1,
        [2, new TextEncoder().encode("time"), [3, Uint8Array.of(1)]],
        [
          2,
          new TextEncoder().encode("canister"),
          [3, Uint8Array.of(2, 3, 4)],
        ],
      ],
      signature: new Uint8Array(96).fill(7),
      delegation: {
        subnet_id: Uint8Array.of(5, 6),
        certificate: encode({ tree: [0], signature: Uint8Array.of(8) }),
      },
    };
    const encoded = encodeWithSelfDescribedTag(certificate);

    const stats = preflightCbor(encoded, {
      maxBytes: 4096,
      maxItems: 100,
      maxDepth: 16,
    });

    expect(stats.bytes).toBe(encoded.byteLength);
    expect(stats.items).toBeGreaterThan(20);
    expect(stats.depth).toBeLessThanOrEqual(16);
    expect(decode(encoded)).toEqual(certificate);
  });

  test("counts map keys and values against the item budget", () => {
    const encoded = encode({ one: 1, two: 2 });

    expect(preflightCbor(encoded, {
      maxBytes: 100,
      maxItems: 5,
      maxDepth: 2,
    })).toMatchObject({ items: 5, depth: 2 });
    expect(() => preflightCbor(encoded, {
      maxBytes: 100,
      maxItems: 4,
      maxDepth: 2,
    })).toThrow("CBOR value exceeds 4 items");
  });

  test("rejects prototype-mutating map keys recursively", () => {
    const protoKey = Uint8Array.of(
      0x81,
      0xa1,
      0x69,
      ...new TextEncoder().encode("__proto__"),
      0xf6,
    );

    expect(() => preflightCbor(protoKey))
      .toThrow("Unsafe CBOR map key __proto__");
  });

  test("rejects a byte limit, trailing values, and malformed indefinite maps", () => {
    const encoded = encode({ ok: true });
    expect(() => preflightCbor(encoded, {
      maxBytes: encoded.byteLength - 1,
    })).toThrow(`CBOR value exceeds ${encoded.byteLength - 1} bytes`);

    expect(() => preflightCbor(Uint8Array.of(0xf6, 0xf6)))
      .toThrow("Trailing data after the CBOR value");
    expect(() => preflightCbor(Uint8Array.of(0xbf, 0x61, 0x78, 0xff)))
      .toThrow("CBOR map is missing a value");
  });

  test("validates limits before scanning", () => {
    expect(() => preflightCbor(Uint8Array.of(0xf6), { maxDepth: 0 }))
      .toThrow(TypeError);
    expect(() => preflightCbor(Uint8Array.of(0xf6), { maxItems: 1.5 }))
      .toThrow("maxItems must be a positive safe integer");
  });

  test("uses no input-sized copy for ArrayBuffer views", () => {
    const storage = Uint8Array.of(99, 0x81, 0xf6, 99);
    const view = new DataView(storage.buffer, 1, 2);
    expect(preflightCbor(view)).toEqual({ bytes: 2, items: 2, depth: 2 });
  });

  test("reports its own error type", () => {
    expect(() => preflightCbor(new Uint8Array()))
      .toThrow(CborPreflightError);
  });
});
