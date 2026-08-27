import { Actor, CanisterStatus, HttpAgent } from "@dfinity/agent";
import { AuthClient } from "@dfinity/auth-client";
import { IDL } from "@dfinity/candid";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { decodeIcrcAccount, encodeIcrcAccount } from "@dfinity/ledger-icrc";
import { Principal } from "@dfinity/principal";
import Ajv2020 from "ajv/dist/2020.js";
import {
  decodedCandidLimits,
  DEFAULT_MAX_DECODED_CANDID_DEPTH,
  DEFAULT_MAX_DECODED_CANDID_ITEMS,
  validateCandidMessage,
  validateCandidService,
} from "./candid_decode_budget.js";
import {
  CANDID_PROTO_FIELD,
  CANDID_PROTO_FIELD_ALIAS,
  candidActorMethod,
  candidVariantKey,
  decodedRecordKey,
  defineCandidSchemaProperty,
  defineDataProperty,
  hasOwn,
  withSafeCandidRecordFields,
} from "./candid_object.js";
import {
  evalGeneratedIdlFactory,
  isGeneratedIdlJavaScript,
} from "./generated_idl.js";
import {
  createReplicaResponseGuardFetch,
  DEFAULT_MAX_HTTP_RESPONSE_BYTES as MAX_HTTP_RESPONSE_BYTES,
} from "./replica_response_guard.js";
import {
  createCandidSchemaTraversal,
  finishCandidSchemaTraversal,
  withCandidSchemaType,
} from "./candid_schema.js";
import { attachPreparedCall } from "./prepared_call.js";
import initDidcWasm, {
  generate as generateDidcJavaScript,
} from "../didc_wasm_pkg/didc_rust.js";

class xBase {
  constructor(val) {
    this.val = val;
  }

  static fromState(value) {
    return value;
  }
}

class xBigInt {
  constructor(val) {
    this.val = val;
  }

  static fromState(value) {
    return typeof value === "string" ? BigInt(value) : value;
  }
}

class xText extends xBase {}
class xVec extends xBase {
  fromState(value) {
    if (this.val === xNat8 && typeof value === "string" && isHexString(value)) {
      return hexToUint8Array(value);
    }
    return value;
  }
}
class xOpt extends xBase {}
class xVariant extends xBase {}
class xNull extends xBase {}
class xPrincipal extends xBase {
  static fromState(value) {
    return typeof value === "string" ? Principal.from(value) : value;
  }
}
class xNat8 extends xBase {}
class xNat16 extends xBase {}
class xNat32 extends xBase {}
class xInt8 extends xBase {}
class xInt16 extends xBase {}
class xInt32 extends xBase {}
class xNat64 extends xBigInt {}
class xInt64 extends xBigInt {}
class xNat extends xBigInt {}
class xInt extends xBigInt {}
class xTime extends xBigInt {}
class xFloat extends xBase {}
class xBool extends xBase {}
class xRecord extends xBase {}
class xTuple extends xBase {}
class xRec extends xBase {
  fill(newInstance) {
    Object.setPrototypeOf(this, newInstance.constructor.prototype);
    Object.assign(this, newInstance);
  }
}

class IDLExplainer {
  Text = xText;
  Null = xNull;
  Principal = xPrincipal;
  Nat8 = xNat8;
  Nat16 = xNat16;
  Nat32 = xNat32;
  Nat64 = xNat64;
  Nat = xNat;
  Int8 = xInt8;
  Int16 = xInt16;
  Int32 = xInt32;
  Int64 = xInt64;
  Int = xInt;
  Float64 = xFloat;
  Bool = xBool;
  Time = xTime;

  Service(value) {
    return value;
  }

  Func(input, output) {
    return { input, output };
  }

  Record(value) {
    return new xRecord(value);
  }

  Tuple(...value) {
    return new xTuple(value);
  }

  Rec() {
    return new xRec();
  }

  Vec(value) {
    return new xVec(value);
  }

  Variant(value) {
    return new xVariant(value);
  }

  Opt(value) {
    return new xOpt(value);
  }
}

const IDLWalker = new IDLExplainer();

export const explainer = (idlFactory) => idlFactory({ IDL: IDLWalker });

export const actress = {
  convert,
  convertBack,
  explainer,
  toState,
};

export async function convert(input, def, ctx = {}) {
  async function rec(path, value, type) {
    try {
      if (type instanceof xOpt) {
        if (value === undefined || value === null) return [];
        return [await rec("(opt)", value, type.val)];
      }
      if (type instanceof xVec) {
        const nextValue = type.fromState(value);
        if (ArrayBuffer.isView(nextValue) || nextValue instanceof ArrayBuffer) {
          return nextValue;
        }
        if (!Array.isArray(nextValue)) throw "(array expected)";
        const out = [];
        for (let index = 0; index < nextValue.length; index++) {
          out.push(await rec(index, nextValue[index], type.val));
        }
        return out;
      }
      if (type instanceof xTuple) {
        if (!Array.isArray(value)) throw "(array expected)";
        const out = [];
        for (let index = 0; index < value.length; index++) {
          out.push(await rec(index, value[index], type.val[index]));
        }
        return out;
      }
      if (type instanceof xVariant) {
        const key = candidVariantKey(value, type.val);
        return { [key]: await rec(key, value[key], type.val[key]) };
      }
      if (type instanceof xRecord) {
        if (isIcrcAccountDef(type)) {
          if (typeof value === "string") {
            const match = value.match(/^(\d+)(?:-(\d+))?$/);
            if (match) {
              if (ctx?.allowNumberedPrincipals === false) {
                throw "(numbered principals disabled)";
              }
              const id = Number(match[1]);
              if (!Number.isInteger(id) || id < 0 || id > 65535) {
                throw "(invalid principal id)";
              }
              value = { owner: await getPrincipalById(id, ctx) };
              if (match[2] !== undefined) {
                try {
                  value.subaccount = bigIntTo32Bytes(BigInt(match[2]));
                } catch (error) {
                  throw `subaccount (invalid): ${error?.message || error}`;
                }
              }
            } else {
              try {
                const account = decodeIcrcAccount(value);
                value = { owner: account.owner, subaccount: account.subaccount };
              } catch (error) {
                throw `icrc1_account (invalid): ${error?.message || error}`;
              }
            }
          }
        }

        const out = {};
        for (const key of Object.keys(type.val)) {
          const optional = type.val[key] instanceof xOpt;
          if (!hasOwn(value, key)) {
            if (!optional) throw `${key} (missing)`;
            defineDataProperty(
              out,
              key === CANDID_PROTO_FIELD ? CANDID_PROTO_FIELD_ALIAS : key,
              [],
            );
          } else {
            defineDataProperty(
              out,
              key === CANDID_PROTO_FIELD ? CANDID_PROTO_FIELD_ALIAS : key,
              await rec(key, value[key], type.val[key]),
            );
          }
        }
        return out;
      }
      if (type === xPrincipal && typeof value === "number") {
        if (ctx?.allowNumberedPrincipals === false) {
          throw "(numbered principals disabled)";
        }
        const id = value === 0 ? ctx?.idNum ?? 0 : value;
        if (!Number.isInteger(id) || id < 0 || id > 65535) {
          throw "(invalid principal id)";
        }
        return id === (ctx?.idNum ?? 0) && ctx?.selfPrincipal
          ? ctx.selfPrincipal
          : await getPrincipalById(id, ctx);
      }
      if (typeof type === "function" && type.fromState) {
        return type.fromState(value);
      }
      return type.constructor.fromState(value);
    } catch (error) {
      throw `${path}.${error}`;
    }
  }

  const out = [];
  for (let index = 0; index < input.length; index++) {
    out.push(await rec(`arg${index}`, input[index], def[index]));
  }
  return out;
}

function convertBackValue(path, value, type) {
  try {
    if (type instanceof xOpt) {
      if (value === null) return null;
      if (Array.isArray(value) && value.length === 0) return undefined;
      return convertBackValue(
        "(opt)",
        Array.isArray(value) ? value[0] : value,
        type.val,
      );
    }
    if (type instanceof xVec) {
      if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
      if (!Array.isArray(value)) throw "(array expected)";
      return value.map((item, index) =>
        convertBackValue(index, item, type.val));
    }
    if (type instanceof xTuple) {
      if (!Array.isArray(value)) throw "(array expected)";
      return value.map((item, index) =>
        convertBackValue(index, item, type.val[index]));
    }
    if (type instanceof xVariant) {
      const key = candidVariantKey(value, type.val);
      return {
        [key]: convertBackValue(key, value[key], type.val[key]),
      };
    }
    if (type instanceof xRecord) {
      if (isIcrcAccountDef(type)) {
        try {
          let subaccount = value?.subaccount;
          if (Array.isArray(subaccount)) {
            subaccount = subaccount.length ? subaccount[0] : undefined;
          }
          if (subaccount && !ArrayBuffer.isView(subaccount)) {
            subaccount = Uint8Array.from(subaccount);
          }
          if (subaccount && subaccount.length === 0) subaccount = undefined;
          return encodeIcrcAccount({ owner: value?.owner, subaccount });
        } catch {
          // Fall through to generic record conversion if this is not a valid account.
        }
      }

      const out = {};
      for (const key of Object.keys(type.val)) {
        const optional = type.val[key] instanceof xOpt;
        const sourceKey = decodedRecordKey(value, key);
        if (sourceKey === undefined) {
          if (!optional) throw `${key} (missing)`;
        } else {
          const converted = convertBackValue(
            key,
            value[sourceKey],
            type.val[key],
          );
          if (converted !== undefined) {
            defineDataProperty(out, key, converted);
          }
        }
      }
      return out;
    }
    return value;
  } catch (error) {
    throw `${path}.${error}`;
  }
}

function canonicalCandidValue(path, value, type) {
  try {
    if (type instanceof xOpt) {
      if (!Array.isArray(value) || value.length > 1) {
        throw "(option array expected)";
      }
      return value.map((item) =>
        canonicalCandidValue("(opt)", item, type.val));
    }
    if (type instanceof xVec) {
      if (type.val === xNat8) {
        const bytes = value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : ArrayBuffer.isView(value)
            ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
            : Uint8Array.from(value);
        return uint8ArrayToHex(bytes);
      }
      if (!Array.isArray(value) && !ArrayBuffer.isView(value)) {
        throw "(array expected)";
      }
      return Array.from(value, (item, index) =>
        canonicalCandidValue(index, item, type.val));
    }
    if (type instanceof xTuple) {
      if (!Array.isArray(value) || value.length !== type.val.length) {
        throw "(tuple array expected)";
      }
      return value.map((item, index) =>
        canonicalCandidValue(index, item, type.val[index]));
    }
    if (type instanceof xVariant) {
      const key = candidVariantKey(value, type.val);
      return defineDataProperty(
        {},
        key,
        canonicalCandidValue(key, value[key], type.val[key]),
      );
    }
    if (type instanceof xRecord) {
      const out = {};
      for (const key of Object.keys(type.val)) {
        const sourceKey = decodedRecordKey(value, key);
        if (sourceKey === undefined) throw `${key} (missing)`;
        defineDataProperty(
          out,
          key,
          canonicalCandidValue(key, value[sourceKey], type.val[key]),
        );
      }
      return out;
    }
    if (
      type === xNat64 ||
      type === xInt64 ||
      type === xNat ||
      type === xInt ||
      type === xTime
    ) {
      return BigInt(value).toString(10);
    }
    if (type === xPrincipal) return value.toText();
    if (type === xNull) return null;
    return value;
  } catch (error) {
    throw `${path}.${error}`;
  }
}

function canonicalArgumentsJson(input, def) {
  if (!Array.isArray(input) || input.length !== def.length) {
    throw new Error(`Expected ${def.length} Candid arguments`);
  }
  return input.map((value, index) =>
    canonicalCandidValue(`arg${index}`, value, def[index]));
}

export function convertBack(input, def) {

  if (!def || def.length === 0) return null;
  if (def.length > 1) {
    if (!Array.isArray(input) || input.length !== def.length) {
      throw new Error(`Expected ${def.length} Candid return values`);
    }
    return toState(
      input.map((value, index) =>
        convertBackValue(`ret${index}`, value, def[index]))
    );
  }
  const out = convertBackValue("ret", input, def[0]);
  if (out === undefined && def[0] instanceof xOpt) return null;
  if (
    def[0] instanceof xVariant &&
    Object.keys(def[0].val).length === 2 &&
    (hasOwn(def[0].val, "Ok") || hasOwn(def[0].val, "ok")) &&
    (hasOwn(def[0].val, "Err") || hasOwn(def[0].val, "err"))
  ) {
    if (out && typeof out === "object" && hasOwn(out, "Ok")) return toState(out.Ok);
    if (out && typeof out === "object" && hasOwn(out, "ok")) return toState(out.ok);
    throw toState(out?.Err ?? out?.err ?? out);
  }
  return toState(out);
}

export function toState(value) {
  if (value === undefined || value === null) return value;
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("Non-finite numbers are not JSON-compatible");
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return uint8ArrayToHex(value);
  if (
    value instanceof Uint16Array ||
    value instanceof Int16Array ||
    value instanceof Uint32Array ||
    value instanceof Int32Array
  ) {
    return Array.from(value);
  }
  if (value instanceof BigInt64Array || value instanceof BigUint64Array) {
    return Array.from(value, (item) => item.toString());
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return [...value];
  if (Array.isArray(value)) {
    return value.map((item) => {
      const converted = toState(item);
      return converted === undefined ? null : converted;
    });
  }
  if (typeof value === "object") {
    if (
      value instanceof Principal ||
      Object.getPrototypeOf(value)?.constructor?.name === "Principal"
    ) {
      return value.toText();
    }
    return Object.fromEntries(
      Object.keys(value)
        .map((key) => [key, toState(value[key])])
        .filter((entry) => entry[1] !== undefined)
    );
  }
  return value;
}

function defineActorProperty(actor, key, value) {
  defineDataProperty(actor, key, value);
}

function readonlyMethodTable(methods) {
  const reservedMethod = methods.get("$methods");
  const table = reservedMethod
    ? (...args) => reservedMethod(...args)
    : Object.create(null);
  Object.defineProperties(table, {
    entries: { value: methods.entries.bind(methods) },
    get: { value: methods.get.bind(methods) },
    has: { value: methods.has.bind(methods) },
    keys: { value: methods.keys.bind(methods) },
    size: { get: () => methods.size },
    values: { value: methods.values.bind(methods) },
  });
  Object.defineProperty(table, Symbol.iterator, {
    value: methods[Symbol.iterator].bind(methods),
  });
  return Object.freeze(table);
}

function wrapActor(actor, idlFactory, ctx = {}) {
  const xdl = explainer(idlFactory);
  const wrapped = {};
  const methods = new Map();
  for (const [key, func] of ctx.candidService._fields) {
    if (!hasOwn(xdl, key)) {
      throw new Error(`Unable to explain Candid method: ${key}`);
    }
    const rawMethod = candidActorMethod(actor, key);
    if (typeof rawMethod !== "function") {
      throw new Error(`Actor method unavailable: ${key}`);
    }
    const method = async (...args) => {
      const processed = await convert(args, xdl[key].input, ctx);
      const result = await rawMethod(...processed);
      return convertBack(result, xdl[key].output, ctx);
    };
    attachPreparedCall(method, {
      argTypes: func.argTypes,
      convertArgs: (args) => convert(args, xdl[key].input, ctx),
      projectArgs: (args) => canonicalArgumentsJson(args, xdl[key].input),
      dispatch: (args) => {
        let result;
        try {
          result = rawMethod(...args);
        } catch (error) {
          return Promise.reject(error);
        }
        return Promise.resolve(result).then((value) =>
          convertBack(value, xdl[key].output, ctx));
      },
    });
    methods.set(key, method);
    if (key !== "then" && key !== "$methods") {
      defineActorProperty(wrapped, key, method);
    }
  }
  Object.defineProperty(wrapped, "$methods", {
    value: readonlyMethodTable(methods),
  });
  addRawCandidHelpers(wrapped, xdl, ctx);
  return wrapped;
}

function actorMethod(actor, method) {
  return actor.$methods?.get?.(method) ??
    (hasOwn(actor, method) ? actor[method] : undefined);
}

function addRawCandidHelpers(actor, xdl, ctx = {}) {
  for (const [method, func] of ctx.candidService._fields) {
    if (!hasOwn(xdl, method)) {
      throw new Error(`Unable to explain Candid method: ${method}`);
    }
    const encodeArgs = async (...args) => [
      ...IDL.encode(func.argTypes, await convert(args, xdl[method].input, ctx)),
    ];
    const decodeResult = (bytes) =>
      convertBack(
        IDL.decode(
          func.retTypes,
          validateCandidMessage(Uint8Array.from(bytes), ctx.candidLimits),
        )[0],
        xdl[method].output,
        ctx
      );
    const wrappedMethod = actor.$methods.get(method);
    if (typeof wrappedMethod === "function") {
      Object.defineProperties(wrappedMethod, {
        encodeArgs: { value: encodeArgs },
        decodeResult: { value: decodeResult },
      });
    }
    for (const [alias, helper] of [
      [`${method}$`, encodeArgs],
      [`$${method}`, decodeResult],
    ]) {
      if (!Object.prototype.hasOwnProperty.call(actor, alias)) {
        defineActorProperty(actor, alias, helper);
      }
    }
  }
}

export const walletCall =
  (wallet, actor, method, cycles = 0) =>
  async (...args) => {
    const wrappedMethod = actor.$methods?.get?.(method);
    const encodeArgs = wrappedMethod?.encodeArgs ?? actor[`${method}$`];
    const decodeResult = wrappedMethod?.decodeResult ?? actor[`$${method}`];
    const encoded = await encodeArgs(...args);
    const response = await wallet.wallet_call({
      args: encoded,
      cycles,
      method_name: method,
      canister: actor.$principal,
    });
    return decodeResult(response.return);
  };

export const walletProxy = (wallet, actor, cycles = 0) => {
  const proxy = {};
  const methods = new Map();
  for (const [method] of actor.$methods) {
    methods.set(method, walletCall(wallet, actor, method, cycles));
  }
  for (const key of Object.keys(actor)) {
    defineActorProperty(
      proxy,
      key,
      typeof actor[key] === "function" && actor.$methods.has(key)
        ? methods.get(key)
        : actor[key],
    );
  }
  Object.defineProperty(proxy, "$methods", {
    value: readonlyMethodTable(methods),
  });
  return proxy;
};

function isResultVariant(type) {
  return (
    type instanceof xVariant &&
    type.val &&
    typeof type.val === "object" &&
    Object.keys(type.val).length === 2 &&
    (hasOwn(type.val, "Ok") || hasOwn(type.val, "ok")) &&
    (hasOwn(type.val, "Err") || hasOwn(type.val, "err"))
  );
}

function isVecNat8(type) {
  return type instanceof xVec && type.val === xNat8;
}

function isOptVecNat8(type) {
  return type instanceof xOpt && isVecNat8(type.val);
}

function isIcrcAccountDef(type) {
  if (!(type instanceof xRecord)) return false;
  const value = type.val || {};
  const fields = Object.keys(value);
  if (
    fields.length !== 2 ||
    !hasOwn(value, "subaccount")
  ) {
    return false;
  }
  const hasOwner =
    hasOwn(value, "owner") && value.owner === xPrincipal;
  if (!hasOwner) return false;
  return isVecNat8(value.subaccount) || isOptVecNat8(value.subaccount);
}

function bigIntTo32Bytes(value) {
  let bigint = BigInt(value);
  if (bigint < 0n) throw new Error("subaccount must be non-negative");
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0 && bigint > 0n; i--) {
    out[i] = Number(bigint & 0xffn);
    bigint >>= 8n;
  }
  if (bigint > 0n) throw new Error("subaccount exceeds 32 bytes");
  return out;
}

function schemaOfType(
  type,
  options = {},
  state = createCandidSchemaTraversal(options),
) {
  return withCandidSchemaType(state, type, () =>
    schemaOfTypeValue(type, options, state));
}

function schemaOfTypeValue(type, options, state) {
  if (type === xText) return { type: "string" };
  if (type === xBool) return { type: "boolean" };
  if (type === xFloat) return { type: "number" };
  if (type === xPrincipal) {
    if (options.allowNumberedPrincipals === false) {
      return { type: "string", description: "principal text" };
    }
    return {
      oneOf: [
        { type: "string", description: "principal text" },
        { type: "number", minimum: 0, maximum: 65535, description: "principal id" },
      ],
    };
  }
  if (
    type === xNat8 ||
    type === xNat16 ||
    type === xNat32 ||
    type === xInt8 ||
    type === xInt16 ||
    type === xInt32
  ) {
    return { type: "number" };
  }
  if (
    type === xNat64 ||
    type === xInt64 ||
    type === xNat ||
    type === xInt ||
    type === xTime
  ) {
    return { type: "string", description: "bigint as string" };
  }
  if (type === xNull) return { type: "null" };
  if (type instanceof xVec) {
    if (type.val === xNat8) {
      return {
        oneOf: [
          { type: "string", description: "hex-encoded bytes" },
          { type: "array", items: { type: "number" }, description: "byte array" },
        ],
      };
    }
    return { type: "array", items: schemaOfType(type.val, options, state) };
  }
  if (type instanceof xTuple) {
    const items = type.val.map((item) => schemaOfType(item, options, state));
    return {
      type: "array",
      prefixItems: items,
      minItems: items.length,
      maxItems: items.length,
    };
  }
  if (type instanceof xRecord) {
    if (isIcrcAccountDef(type)) {
      return options.allowNumberedPrincipals === false
        ? {
            type: "string",
            not: { pattern: "^[0-9]+(?:-[0-9]+)?$" },
            description: "ICRC-1 account text",
          }
        : {
            type: "string",
            description: "ICRC-1 account text or id[-sub] shorthand",
          };
    }

    const schema = {
      type: "object",
      properties: {},
      additionalProperties: false,
    };
    const required = [];
    for (const key of Object.keys(type.val)) {
      const inner = type.val[key];
      const optional = inner instanceof xOpt;
      defineCandidSchemaProperty(
        schema,
        key,
        schemaOfType(optional ? inner.val : inner, options, state),
      );
      if (!optional) required.push(key);
    }
    if (required.length) schema.required = required;
    return schema;
  }
  if (type instanceof xOpt) {
    return {
      anyOf: [schemaOfType(type.val, options, state), { type: "null" }],
    };
  }
  if (type instanceof xVariant) {
    return {
      oneOf: Object.keys(type.val).map((key) => {
        const schema = {
          type: "object",
          properties: {},
          required: [key],
          additionalProperties: false,
        };
        defineCandidSchemaProperty(
          schema,
          key,
          schemaOfType(type.val[key], options, state),
        );
        return schema;
      }),
    };
  }
  if (type instanceof xRec) return { type: "object", description: "recursive type" };
  return {};
}

function idlFactoryFromSource(source) {
  const idlFactory = typeof source === "function" ? source : source.$idlFactory;
  if (!idlFactory) throw new Error("idlFactory not provided or actor missing $idlFactory");
  return idlFactory;
}

function schemaFromSignature(signature, options = {}) {
  const inputState = createCandidSchemaTraversal(options);
  const inputPrefix = signature.input.map((type) =>
    schemaOfType(type, options, inputState));
  let minItems = inputPrefix.length;
  for (let i = inputPrefix.length - 1; i >= 0; i--) {
    if (signature.input[i] instanceof xOpt) minItems = i;
    else break;
  }

  const input =
    inputPrefix.length === 0
      ? {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "array",
          minItems: 0,
          maxItems: 0,
        }
      : {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "array",
          prefixItems: inputPrefix,
          minItems,
          maxItems: inputPrefix.length,
        };
  finishCandidSchemaTraversal(inputState, input);

  let output;
  if (signature.output.length === 0) {
    output = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "null",
    };
  } else if (signature.output.length === 1) {
    const outputState = createCandidSchemaTraversal(options);
    const type = signature.output[0];
    const okType = type.val?.Ok ?? type.val?.ok;
    output = isResultVariant(type)
      ? schemaOfType(okType, options, outputState)
      : schemaOfType(type, options, outputState);
    output.$schema = "https://json-schema.org/draft/2020-12/schema";
    finishCandidSchemaTraversal(outputState, output);
  } else {
    const outputState = createCandidSchemaTraversal(options);
    output = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "array",
      prefixItems: signature.output.map((type) =>
        schemaOfType(type, options, outputState)),
      minItems: signature.output.length,
      maxItems: signature.output.length,
    };
    finishCandidSchemaTraversal(outputState, output);
  }

  return { input, output };
}

export function explainMethodSchema(source, method, options = {}) {
  const xdl = explainer(idlFactoryFromSource(source));
  if (!hasOwn(xdl, method)) throw new Error(`method not found: ${method}`);
  const signature = xdl[method];
  return schemaFromSignature(signature, options);
}

export function explainServiceSchema(source, options = {}) {
  const xdl = explainer(idlFactoryFromSource(source));
  const schemas = {};
  for (const method of Object.keys(xdl)) {
    defineDataProperty(
      schemas,
      method,
      schemaFromSignature(xdl[method], options),
    );
  }
  return schemas;
}

export function validateMethodInputSchema(methodSchema, args = []) {
  const ajv = new Ajv2020({ allErrors: true, ownProperties: true, strict: false });
  const validateInput = ajv.compile(methodSchema.input);
  const ok = validateInput(args);
  return {
    ok,
    schema: methodSchema.input,
    errors: ok ? undefined : validateInput.errors,
  };
}

export function validateMethodInput(source, method, args = [], options = {}) {
  return validateMethodInputSchema(
    explainMethodSchema(source, method, options),
    args,
  );
}

const pgIdlFactory = ({ IDL }) =>
  IDL.Service({
    binding: IDL.Func([IDL.Text, IDL.Text], [IDL.Opt(IDL.Text)], ["query"]),
    did_to_js: IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ["query"]),
    subtype: IDL.Func(
      [IDL.Text, IDL.Text],
      [IDL.Variant({ Ok: IDL.Null, Err: IDL.Text })],
      ["query"]
    ),
  });

const ifhackIdlFactory = ({ IDL }) =>
  IDL.Service({
    __get_candid_interface_tmp_hack: IDL.Func([], [IDL.Text], ["query"]),
  });

function presetIdl(name) {
  switch (name) {
    case "pg":
      return pgIdlFactory;
    default:
      throw new Error(`Unknown browser icblast preset: ${name}`);
  }
}

function evalIdlFactory(js) {
  return evalGeneratedIdlFactory(js);
}

const defaultDidcWasmSource = new URL(
  "../didc_wasm_pkg/didc_rust_bg.bin",
  import.meta.url
);
const MAX_CANDID_SOURCE_BYTES = 128 * 1024;
const MAX_GENERATED_JAVASCRIPT_BYTES = 2 * 1024 * 1024;
let didcWasmReady;

async function loadDidcWasmSource(source) {
  const isRequest = typeof Request === "function" && source instanceof Request;
  if (
    typeof source !== "string" &&
    !(source instanceof URL) &&
    !isRequest &&
    !(typeof Response === "function" && source instanceof Response)
  ) {
    return source;
  }
  const response =
    typeof Response === "function" && source instanceof Response
      ? source
      : await fetch(source);
  if (!response.ok) {
    throw new Error(`Unable to load Candid compiler Wasm (${response.status})`);
  }
  const contentType = response.headers
    .get("Content-Type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  return contentType === "application/wasm"
    ? response
    : await response.arrayBuffer();
}

async function ensureDidcWasm(source) {
  if (!didcWasmReady) {
    didcWasmReady = loadDidcWasmSource(source).then((module_or_path) =>
      initDidcWasm({ module_or_path })
    );
  }
  const ready = didcWasmReady;
  try {
    return await ready;
  } catch (error) {
    if (didcWasmReady === ready) didcWasmReady = undefined;
    throw error;
  }
}

function byteLimit(value, fallback, label) {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return limit;
}

async function didToJs(
  did,
  {
    didcWasm = defaultDidcWasmSource,
    maxCandidSourceBytes: configuredSourceLimit,
    maxGeneratedJavaScriptBytes: configuredJavaScriptLimit,
  } = {},
) {
  if (typeof did !== "string" || !did.trim()) {
    throw new Error("Candid interface must be a non-empty string");
  }
  const maxCandidSourceBytes = byteLimit(
    configuredSourceLimit,
    MAX_CANDID_SOURCE_BYTES,
    "maxCandidSourceBytes",
  );
  const maxGeneratedJavaScriptBytes = byteLimit(
    configuredJavaScriptLimit,
    MAX_GENERATED_JAVASCRIPT_BYTES,
    "maxGeneratedJavaScriptBytes",
  );
  const candidBytes = new TextEncoder().encode(did).byteLength;
  if (candidBytes > maxCandidSourceBytes) {
    throw new Error(
      `Candid interface exceeds ${maxCandidSourceBytes} UTF-8 bytes`,
    );
  }
  await ensureDidcWasm(didcWasm);
  const js = generateDidcJavaScript(did);
  if (typeof js !== "string" || !js.trim()) {
    throw new Error("Unable to generate JS bindings from Candid");
  }
  if (
    new TextEncoder().encode(js).byteLength > maxGeneratedJavaScriptBytes
  ) {
    throw new Error(
      `Generated Candid JavaScript exceeds ${maxGeneratedJavaScriptBytes} UTF-8 bytes`,
    );
  }
  return js;
}

export async function idlFactoryFromCandid(did, options = {}) {
  return evalIdlFactory(await didToJs(did, options));
}

async function discoverCandid(agent, canisterId) {
  try {
    const status = await CanisterStatus.request({
      agent,
      canisterId: Principal.fromText(canisterId),
      paths: ["candid"],
    });
    const candid = status.get("candid");
    if (typeof candid === "string" && candid.trim()) return candid;
  } catch {}

  const ifhack = Actor.createActor(ifhackIdlFactory, {
    agent,
    canisterId,
  });
  return ifhack.__get_candid_interface_tmp_hack();
}

function forceActorAgent(transform, agent) {
  return (methodName, args, callConfig) => ({
    ...(typeof transform === "function"
      ? transform(methodName, args, callConfig)
      : undefined),
    agent,
  });
}

export const icblast = ({
  host: configuredHost = undefined,
  local = false,
  local_host = false,
  identity = undefined,
  id = undefined,
  idNum = 0,
  debug = false,
  secret = undefined,
  agentOptions = {},
  actorOptions = {},
  didcWasm = defaultDidcWasmSource,
  maxCandidSourceBytes = MAX_CANDID_SOURCE_BYTES,
  maxGeneratedJavaScriptBytes = MAX_GENERATED_JAVASCRIPT_BYTES,
  maxHttpResponseBytes: configuredHttpResponseLimit = MAX_HTTP_RESPONSE_BYTES,
  maxDecodedCandidItems = DEFAULT_MAX_DECODED_CANDID_ITEMS,
  maxDecodedCandidDepth = DEFAULT_MAX_DECODED_CANDID_DEPTH,
  maxCandidTypeItems = undefined,
  maxCandidTypeDepth = undefined,
  allowNumberedPrincipals = true,
} = {}) => {
  const bindings = {};
  const host =
    agentOptions.host ||
    configuredHost ||
    (local ? local_host || "http://localhost:4943/" : "https://icp0.io");
  const effectiveIdNum = id ?? idNum;
  const maxHttpResponseBytes = byteLimit(
    configuredHttpResponseLimit,
    MAX_HTTP_RESPONSE_BYTES,
    "maxHttpResponseBytes",
  );
  const decodedLimits = decodedCandidLimits({
    maxDecodedCandidItems,
    maxDecodedCandidDepth,
    maxCandidTypeItems,
    maxCandidTypeDepth,
  });
  const {
    fetch: configuredFetch,
    ...remainingAgentOptions
  } = agentOptions;
  const fetchImplementation =
    configuredFetch ?? globalThis.fetch?.bind(globalThis);
  if (typeof fetchImplementation !== "function") {
    throw new TypeError("A browser fetch implementation is required");
  }
  const limitedFetch = createReplicaResponseGuardFetch(
    fetchImplementation,
    { maxBytes: maxHttpResponseBytes, candidLimits: decodedLimits },
  );
  const selfPrincipal = identity?.getPrincipal ? identity.getPrincipal() : undefined;
  const ctx = {
    idNum: effectiveIdNum,
    selfPrincipal,
    debug,
    secret,
    allowNumberedPrincipals,
    candidLimits: decodedLimits,
  };
  const agentReady = HttpAgent.create({
    host,
    identity,
    ...remainingAgentOptions,
    fetch: limitedFetch,
  }).then(async (agent) => {
    if (local) await agent.fetchRootKey();
    return agent;
  });

  return async (canister, preset = false) => {
    const canisterId = canister instanceof Principal ? canister.toText() : canister;
    if (bindings[canisterId]) return bindings[canisterId];

    let idlFactory;
    if (preset) {
      if (typeof preset === "function") {
        idlFactory = preset;
      } else if (typeof preset === "string" && preset.startsWith("http")) {
        idlFactory = await idlFactoryFromCandid(
          await limitedFetch(preset).then((res) => res.text()),
          { didcWasm, maxCandidSourceBytes, maxGeneratedJavaScriptBytes }
        );
      } else if (typeof preset === "string" && preset.length > 30) {
        idlFactory = isGeneratedIdlJavaScript(preset)
          ? evalIdlFactory(preset)
          : await idlFactoryFromCandid(preset, {
              didcWasm,
              maxCandidSourceBytes,
              maxGeneratedJavaScriptBytes,
            });
      } else {
        idlFactory = presetIdl(preset);
      }
    } else {
      const agent = await agentReady;
      idlFactory = await idlFactoryFromCandid(
        await discoverCandid(agent, canisterId),
        { didcWasm, maxCandidSourceBytes, maxGeneratedJavaScriptBytes }
      );
    }

    const agent = await agentReady;
    const candidService = validateCandidService(
      withSafeCandidRecordFields(idlFactory)({ IDL }),
      decodedLimits,
    );
    const actor = Actor.createActor(() => candidService, {
      ...actorOptions,
      agent,
      canisterId,
      callTransform: forceActorAgent(actorOptions.callTransform, agent),
      queryTransform: forceActorAgent(actorOptions.queryTransform, agent),
    });
    const wrapped = wrapActor(actor, idlFactory, {
      ...ctx,
      candidService,
    });
    wrapped.$principal = Principal.fromText(canisterId);
    wrapped.$selfPrincipal = selfPrincipal;
    wrapped.$idlFactory = idlFactory;
    bindings[canisterId] = wrapped;
    return wrapped;
  };
};

function factoryOptionsFromApiOptions(options = {}) {
  const host = options.host || options.local_host;
  const local = options.local ?? (host ? isLocalHost(host) : false);
  return {
    host,
    local,
    local_host: host,
    identity: options.identity,
    id: options.id,
    idNum: options.idNum,
    debug: options.debug,
    secret: options.secret,
    agentOptions: options.agentOptions,
    actorOptions: options.actorOptions,
    didcWasm: options.didcWasm,
    maxCandidSourceBytes: options.maxCandidSourceBytes,
    maxGeneratedJavaScriptBytes: options.maxGeneratedJavaScriptBytes,
    maxHttpResponseBytes: options.maxHttpResponseBytes,
    maxDecodedCandidItems: options.maxDecodedCandidItems,
    maxDecodedCandidDepth: options.maxDecodedCandidDepth,
    maxCandidTypeItems: options.maxCandidTypeItems,
    maxCandidTypeDepth: options.maxCandidTypeDepth,
    allowNumberedPrincipals: options.allowNumberedPrincipals,
  };
}

function isLocalHost(host) {
  try {
    const hostname = new URL(host).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

async function actorFor(canister, options = {}) {
  const getIC = icblast(factoryOptionsFromApiOptions(options));
  return getIC(canister, options.did || options.preset || false);
}

export async function scan(canister, options = {}) {
  const actor = await actorFor(canister, options);
  const service = actor.$idlFactory({ IDL });
  return [...service._fields].map(([name, func]) => {
    const annotations = func?.annotations || [];
    let kind = "update";
    if (annotations.includes("query") || annotations.includes("composite_query")) kind = "query";
    else if (annotations.includes("oneway")) kind = "oneway";
    return { name, kind };
  });
}

export async function schema(canister, method, options = {}) {
  return explainMethodSchema(await actorFor(canister, options), method, options);
}

export async function call(canister, method, args = [], options = {}) {
  const actor = await actorFor(canister, options);
  const fn = actorMethod(actor, method);
  if (typeof fn !== "function") throw new Error(`Method not found: ${method}`);
  return toState(await fn(...args));
}

export async function validate(canister, method, args = [], options = {}) {
  const actor = await actorFor(canister, options);
  const methodSchema = explainMethodSchema(actor, method, options);
  const ajv = new Ajv2020({ allErrors: true, ownProperties: true, strict: false });

  const validateInput = ajv.compile(methodSchema.input);
  const inputValid = validateInput(args);
  if (!inputValid) {
    return {
      ok: false,
      inputValid: false,
      outputValid: false,
      errors: validateInput.errors,
    };
  }

  const fn = actorMethod(actor, method);
  if (typeof fn !== "function") throw new Error(`Method not found: ${method}`);
  const output = toState(await fn(...args));

  const validateOutput = ajv.compile(methodSchema.output);
  const outputValid = validateOutput(output);
  return {
    ok: outputValid,
    inputValid: true,
    outputValid,
    result: output,
    errors: outputValid ? undefined : validateOutput.errors,
  };
}

icblast.ic = async (options = {}) => icblast(factoryOptionsFromApiOptions(options));
icblast.scan = scan;
icblast.schema = schema;
icblast.call = call;
icblast.validate = validate;
icblast.hashIdentity = hashIdentity;
icblast.toState = toState;
icblast.explainMethodSchema = explainMethodSchema;
icblast.explainServiceSchema = explainServiceSchema;
icblast.validateMethodInput = validateMethodInput;
icblast.validateMethodInputSchema = validateMethodInputSchema;

class PrefixedStorage {
  constructor(prefix) {
    this.prefix = prefix;
  }

  async get(key) {
    return window.localStorage.getItem(this.prefix + key);
  }

  async set(key, value) {
    window.localStorage.setItem(this.prefix + key, value);
  }

  async remove(key) {
    window.localStorage.removeItem(this.prefix + key);
  }
}

export const InternetIdentity = {
  client: null,

  async create(options = {}) {
    const { storagePrefix, idleOptions, ...authOptions } = options;
    this.client = await AuthClient.create({
      keyType: "Ed25519",
      storage: new PrefixedStorage(storagePrefix || "icblast:ii:ed25519:"),
      idleOptions: {
        disableIdle: true,
        ...idleOptions,
      },
      ...authOptions,
    });
    return this;
  },

  getIdentity() {
    return this.client.getIdentity();
  },

  getPrincipal() {
    return this.client.getIdentity()?.getPrincipal();
  },

  isAuthenticated() {
    return this.client.isAuthenticated();
  },

  logout(options) {
    return this.client.logout(options);
  },

  login(options = {}) {
    return new Promise((resolve, reject) => {
      this.client.login({
        maxTimeToLive: BigInt(90 * 24 * 60 * 60 * 1_000_000_000),
        ...options,
        onSuccess: resolve,
        onError: reject,
      });
    });
  },
};

export async function hashIdentity(idNum = 0, options = {}) {
  if (idNum instanceof Uint8Array) {
    return Ed25519KeyIdentity.generate(idNum.slice(0, 32));
  }

  if (typeof idNum !== "number") {
    const source = String(idNum ?? "");
    const bytes = new TextEncoder().encode(source.padEnd(32, "0").slice(0, 32));
    return Ed25519KeyIdentity.generate(bytes);
  }

  if (!Number.isInteger(idNum) || idNum < 0 || idNum > 65535) {
    throw new Error("id must be an integer in [0,65535]");
  }

  const secretSource = options.secret ?? browserSecret();
  const seed = await deriveSeedFromSecret(secretSource, idNum);
  return Ed25519KeyIdentity.generate(seed);
}

export const file = async (blob) => Array.from(new Uint8Array(await blob.arrayBuffer()));

async function getPrincipalById(idNum, ctx = {}) {
  const identity = await hashIdentity(idNum, { secret: ctx?.secret });
  return identity.getPrincipal();
}

function isHexString(value) {
  return /^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0;
}

function hexToUint8Array(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function uint8ArrayToHex(value) {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    out += value[i].toString(16).padStart(2, "0");
  }
  return out;
}

function browserSecret() {
  const key = "icblast:secret";
  try {
    const stored = globalThis.localStorage?.getItem(key);
    if (stored && stored.length >= 64) return stored;
  } catch {}

  const bytes = new Uint8Array(512);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const secret = uint8ArrayToHex(bytes);
  try {
    globalThis.localStorage?.setItem(key, secret);
  } catch {}
  return secret;
}

async function deriveSeedFromSecret(secret, idNum) {
  const source = String(secret);
  const length = source.length;
  const windowSize = Math.min(128, length);
  const index = length > 0 ? idNum % length : 0;
  const material = (source + source).substring(index, index + windowSize) + String(idNum);
  const encoded = new TextEncoder().encode(material);

  if (globalThis.crypto?.subtle) {
    return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", encoded));
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < encoded.length; i++) {
    out[i % 32] = (out[i % 32] + encoded[i] + i) & 0xff;
  }
  return out;
}

export default icblast;
