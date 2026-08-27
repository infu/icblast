import { IDL } from "@dfinity/candid";
import { describe, expect, test } from "vitest";
import {
  CANDID_PROTO_FIELD_ALIAS,
  defineDataProperty,
  withSafeCandidRecordFields,
} from "../lib/candid_object.js";
import {
  explainMethodSchema as explainBrowserMethodSchema,
  validateMethodInput as validateBrowserMethodInput,
} from "../lib/browser.js";
import {
  explainMethodSchema as explainNodeMethodSchema,
  validateMethodInput as validateNodeMethodInput,
} from "../lib/icb_node.js";

function ownField(key, value) {
  return defineDataProperty({}, key, value);
}

describe("Candid object field safety", () => {
  test("uses an equivalent numeric record label to avoid stock decoder loss", () => {
    const publicType = IDL.Record(ownField("__proto__", IDL.Text));
    const publicValue = ownField("__proto__", "value");
    const wire = IDL.encode([publicType], [publicValue]);

    const [stockDecoded] = IDL.decode([publicType], wire);
    expect(Object.hasOwn(stockDecoded, "__proto__")).toBe(false);

    const safeFactory = withSafeCandidRecordFields(({ IDL: candid }) =>
      candid.Service({
        test: candid.Func(
          [candid.Record(ownField("__proto__", candid.Text))],
          [candid.Record(ownField("__proto__", candid.Text))],
          [],
        ),
      }),
    );
    const func = new Map(safeFactory({ IDL })._fields).get("test");
    const [safeDecoded] = IDL.decode(func.retTypes, wire);

    expect(func.retTypes[0]._fields[0][0]).toBe(CANDID_PROTO_FIELD_ALIAS);
    expect(func.argTypes[0]._fields[0][0]).toBe(CANDID_PROTO_FIELD_ALIAS);
    expect(Object.hasOwn(safeDecoded, CANDID_PROTO_FIELD_ALIAS)).toBe(true);
    expect(safeDecoded[CANDID_PROTO_FIELD_ALIAS]).toBe("value");
    expect(
      IDL.encode(func.retTypes, [
        ownField(CANDID_PROTO_FIELD_ALIAS, "value"),
      ]),
    ).toEqual(wire);
  });

  test("validates __proto__ as an own record and variant field", () => {
    const idlFactory = ({ IDL: candid }) => candid.Service({
      test: candid.Func(
        [candid.Record({
          ["__proto__"]: candid.Text,
          choice: candid.Variant({ ["__proto__"]: candid.Text }),
        })],
        [],
        [],
      ),
    });
    const value = JSON.parse(
      '{"__proto__":"record","choice":{"__proto__":"variant"}}',
    );

    for (const [explain, validate] of [
      [explainBrowserMethodSchema, validateBrowserMethodInput],
      [explainNodeMethodSchema, validateNodeMethodInput],
    ]) {
      const schema = explain(idlFactory, "test").input.prefixItems[0];
      expect(schema.patternProperties["^__proto__$"]).toEqual({
        type: "string",
      });
      expect(
        schema.properties.choice.oneOf[0]
          .patternProperties["^__proto__$"],
      ).toEqual({ type: "string" });
      expect(validate(idlFactory, "test", [value]).ok).toBe(true);

      const inheritedRecord = Object.create(value);
      defineDataProperty(inheritedRecord, "choice", value.choice);
      expect(validate(idlFactory, "test", [inheritedRecord]).ok).toBe(false);

      const inheritedVariant = JSON.parse(
        '{"__proto__":"record","choice":{}}',
      );
      Object.setPrototypeOf(inheritedVariant.choice, value.choice);
      expect(validate(idlFactory, "test", [inheritedVariant]).ok).toBe(false);
    }
  });
});
