import { Actor } from "@dfinity/agent";
import { IDL } from "@dfinity/candid";
import { describe, expect, test } from "vitest";
import {
  candidActorMethod,
  defineDataProperty,
} from "../lib/candid_object.js";

describe("real @dfinity Actor method names", () => {
  test("retrieves then, $methods, __proto__, and constructor authoritatively", async () => {
    const names = ["then", "$methods", "__proto__", "constructor"];
    const idlFactory = ({ IDL: candid }) => {
      const methods = {};
      for (const name of names) {
        defineDataProperty(
          methods,
          name,
          candid.Func([], [candid.Text], ["query"]),
        );
      }
      return candid.Service(methods);
    };
    const agent = {
      query: async (_canisterId, { methodName }) => ({
        status: "replied",
        reply: { arg: IDL.encode([IDL.Text], [methodName]) },
      }),
    };
    const actor = Actor.createActor(idlFactory, {
      agent,
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    });

    expect(Object.hasOwn(actor, "then")).toBe(true);
    expect(Object.hasOwn(actor, "$methods")).toBe(true);
    expect(Object.hasOwn(actor, "constructor")).toBe(true);
    expect(Object.hasOwn(actor, "__proto__")).toBe(false);
    expect(typeof Object.getPrototypeOf(actor)).toBe("function");

    for (const name of names) {
      const method = candidActorMethod(actor, name);
      expect(typeof method).toBe("function");
      await expect(method()).resolves.toBe(name);
    }
  });
});
