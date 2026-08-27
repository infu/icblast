import { beforeEach, describe, expect, test, vi } from "vitest";
import { IDL } from "@dfinity/candid";

const agentMocks = vi.hoisted(() => ({
  createActor: vi.fn(),
  statusRequest: vi.fn(),
}));

vi.mock("@dfinity/agent", () => ({
  Actor: { createActor: agentMocks.createActor },
  CanisterStatus: { request: agentMocks.statusRequest },
  HttpAgent: class {
    fetchRootKey = vi.fn();
  },
}));

import {
  explainMethodSchema,
  explainServiceSchema,
  ic,
  validateMethodInput,
} from "../lib/icb_node.js";

describe("Node actor method names", () => {
  beforeEach(() => {
    const did = `service : {
      then : (text) -> (text) query;
      "$methods" : () -> (text) query;
      "__proto__" : () -> (text) query;
      constructor : () -> (text) query;
      "contains export const text" : () -> (text) query;
    }`;
    agentMocks.statusRequest.mockReset();
    agentMocks.statusRequest.mockResolvedValue(new Map([["candid", did]]));
    agentMocks.createActor.mockReset();
    agentMocks.createActor.mockImplementation((idlFactory) => {
      const rawActor = {};
      for (const [name] of idlFactory({ IDL })._fields) {
        rawActor[name] = vi.fn(async (value) =>
          name === "then" ? value : name
        );
      }
      return rawActor;
    });
  });

  test("keeps the actor and its read-only method table non-thenable", async () => {
    const getActor = await ic();
    const actor = await getActor("rrkah-fqaaa-aaaaa-aaaaq-cai");

    expect(await actor).toBe(actor);
    expect(await actor.$methods).toBe(actor.$methods);
    expect(Object.isFrozen(actor.$methods)).toBe(true);
    expect(actor.$methods.set).toBeUndefined();
    await expect(actor.$methods.get("then")("direct")).resolves.toBe("direct");
    await expect(actor.$methods.get("$methods")()).resolves.toBe("$methods");
    await expect(actor.$methods()).resolves.toBe("$methods");
    await expect(actor.$methods.get("__proto__")()).resolves.toBe("__proto__");
    await expect(actor.__proto__()).resolves.toBe("__proto__");
    await expect(actor.constructor()).resolves.toBe("constructor");
    await expect(
      actor.$methods.get("contains export const text")(),
    ).resolves.toBe("contains export const text");
    const serviceSchemas = explainServiceSchema(actor);
    expect(Object.hasOwn(serviceSchemas, "__proto__")).toBe(true);
    expect(serviceSchemas.__proto__).toHaveProperty("input");
  });

  test("round-trips nested __proto__ record and variant fields safely", async () => {
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
    agentMocks.statusRequest.mockResolvedValue(new Map([["candid", did]]));
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

    const getActor = await ic();
    const actor = await getActor("rrkah-fqaaa-aaaaa-aaaaq-cai");
    const result = await actor.echo(value);

    expect(result).toEqual(value);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, "__proto__")).toBe(true);
    expect(Object.hasOwn(result.choice, "__proto__")).toBe(true);
    expect(Object.hasOwn(result.choice.__proto__, "__proto__")).toBe(true);

    const schema = explainMethodSchema(actor, "echo");
    const recordSchema = schema.input.prefixItems[0];
    expect(recordSchema.patternProperties["^__proto__$"]).toBeDefined();
    const protoAlternative = recordSchema.properties.choice.oneOf.find(
      (alternative) => alternative.required[0] === "__proto__",
    );
    const variantRecord =
      protoAlternative.patternProperties["^__proto__$"];
    expect(variantRecord.patternProperties["^__proto__$"]).toBeDefined();
    expect(validateMethodInput(actor, "echo", [value]).ok).toBe(true);

    const inheritedOnly = Object.create(value);
    Object.defineProperty(inheritedOnly, "choice", {
      enumerable: true,
      value: value.choice,
    });
    expect(validateMethodInput(actor, "echo", [inheritedOnly]).ok).toBe(false);
    await expect(actor.echo(inheritedOnly)).rejects.toContain(
      "__proto__ (missing)",
    );

    const inheritedVariant = JSON.parse(
      '{"__proto__":{"value":"record"},"choice":{}}',
    );
    Object.setPrototypeOf(inheritedVariant.choice, value.choice);
    expect(
      validateMethodInput(actor, "echo", [inheritedVariant]).ok,
    ).toBe(false);
    await expect(actor.echo(inheritedVariant)).rejects.toContain(
      "variant expected",
    );
  });
});
