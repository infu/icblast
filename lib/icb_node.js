// Node.js IC client with minimal features (ported from Deno version)
// - Deterministic Ed25519 identity from passphrase
// - Discover DID (Candid) via canister metadata
// - Compile DID → JS via embedded wasm-bindgen glue (didc_rust)
// - Wrap actor methods for light I/O conversion and JSON Schema explanation

import { HttpAgent, Actor, CanisterStatus } from "@dfinity/agent";
import { IDL } from "@dfinity/candid";
import { Principal } from "@dfinity/principal";
import Ajv2020 from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import zlib from "node:zlib";
import { encodeIcrcAccount, decodeIcrcAccount } from "@dfinity/ledger-icrc";
import { hashIdentity } from "./identity.js";
import {
  decodedCandidLimits,
  DEFAULT_MAX_DECODED_CANDID_DEPTH,
  DEFAULT_MAX_DECODED_CANDID_ITEMS,
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
  createReplicaResponseGuardFetch,
  DEFAULT_MAX_HTTP_RESPONSE_BYTES,
} from "./replica_response_guard.js";
import {
  createCandidSchemaTraversal,
  finishCandidSchemaTraversal,
  withCandidSchemaType,
} from "./candid_schema.js";
import { attachPreparedCall } from "./prepared_call.js";
import { evalGeneratedIdlFactory } from "./generated_idl.js";

// ========== Identity from hash ==========
export { hashIdentity };

// ========== Minimal "actress" (input/output transforms) ==========
class xBase { constructor(val) { this.val = val; } static fromState(v) { return v; } }
class xBigInt { constructor(val) { this.val = val; } static fromState(v) { return typeof v === "string" ? BigInt(v) : v; } }
class xText extends xBase {}
class xVec extends xBase { fromState(v) { return v; } }
class xOpt extends xBase {}
class xVariant extends xBase {}
class xNull extends xBase {}
class xPrincipal extends xBase { static fromState(v) { return typeof v === "string" ? Principal.from(v) : v; } }
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
class xRec extends xBase { fill(newInstance) { Object.setPrototypeOf(this, newInstance.constructor.prototype); Object.assign(this, newInstance); } }

class IDLExplainer {
  Text = xText; Null = xNull; Principal = xPrincipal;
  Nat8 = xNat8; Nat16 = xNat16; Nat32 = xNat32; Nat64 = xNat64; Nat = xNat;
  Int8 = xInt8; Int16 = xInt16; Int32 = xInt32; Int64 = xInt64; Int = xInt;
  Float64 = xFloat; Bool = xBool; Time = xTime;
  Service(o) { return o; }
  Func(arg, ret) { return { input: arg, output: ret }; }
  Record(o) { return new xRecord(o); }
  Tuple(...o) { return new xTuple(o); }
  Rec() { return new xRec(); }
  Vec(o) { return new xVec(o); }
  Variant(o) { return new xVariant(o); }
  Opt(a) { return new xOpt(a); }
}
const IDLWalker = new IDLExplainer();
export const explainer = (idlFactory) => idlFactory({ IDL: IDLWalker });

function debugEnabled(ctx) {
  return Boolean(process.env.BLAST_DEBUG) || Boolean(ctx?.debug);
}
function dlog(ctx, ...args) {
  if (debugEnabled(ctx)) console.error("[blast:debug]", ...args);
}

function isVecNat8(t) { return t instanceof xVec && t.val === xNat8; }
function isOptVecNat8(t) { return t instanceof xOpt && isVecNat8(t.val); }
function isIcrcAccountDef(d) {
  if (!(d instanceof xRecord)) return false;
  const v = d.val || {};
  const fields = Object.keys(v);
  if (fields.length !== 2 || !hasOwn(v, "subaccount")) return false;
  const hasOwner = hasOwn(v, "owner") && v.owner === xPrincipal;
  if (!hasOwner) return false;
  const sa = v.subaccount;
  return isVecNat8(sa) || isOptVecNat8(sa);
}

function bigIntTo32Bytes(n) {
  let x = BigInt(n);
  if (x < 0n) throw new Error("subaccount must be non-negative");
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0 && x > 0n; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  if (x > 0n) throw new Error("subaccount exceeds 32 bytes");
  return out;
}

export async function convert(input, def, ctx) {
  dlog(ctx, "convert:start", { input, def: def?.map?.(t => t?.constructor?.name || String(t)) });
  async function rec(ekey, v, d) {
    try {
      if (d instanceof xOpt) {
        if (v === undefined || v === null) return [];
        const r = await rec("(opt)", v, d.val);
        dlog(ctx, "convert:opt", ekey, v, "->", r);
        return [r];
      } else if (d instanceof xVec) {
        if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return v;
        if (!Array.isArray(v)) throw "(array expected)";
        const arr = [];
        for (let idx = 0; idx < v.length; idx++) arr.push(await rec(String(idx), v[idx], d.val));
        dlog(ctx, "convert:vec", ekey, v, "->", arr);
        return arr;
      } else if (d instanceof xTuple) {
        if (!Array.isArray(v)) throw "(array expected)";
        const arr = [];
        for (let idx = 0; idx < v.length; idx++) arr.push(await rec(String(idx), v[idx], d.val[idx]));
        dlog(ctx, "convert:tuple", ekey, v, "->", arr);
        return arr;
      } else if (d instanceof xVariant) {
        const k = candidVariantKey(v, d.val);
        const rv = await rec(k, v[k], d.val[k]);
        const out = { [k]: rv };
        dlog(ctx, "convert:variant", ekey, v, "->", out);
        return out;
      } else if (d instanceof xRecord) {
        // Special-case: account record inputs may accept ICRC-1 string or shorthand "id[-sub]"
        if (isIcrcAccountDef(d)) {
          if (typeof v === "string") {
            const m = v.match(/^(\d+)(?:-(\d+))?$/);
            if (m) {
              if (ctx?.allowNumberedPrincipals === false) {
                throw "(numbered principals disabled)";
              }
              const idSel = Number(m[1]);
              if (!Number.isInteger(idSel) || idSel < 0 || idSel > 65535) throw "(invalid principal id)";
              const owner = await getPrincipalById(idSel);
              let sub;
              if (m[2] !== undefined) {
                try { sub = bigIntTo32Bytes(BigInt(m[2])); } catch (e) { throw `subaccount (invalid): ${e?.message || e}`; }
              }
              v = { owner, subaccount: sub };
              dlog(ctx, "convert:account:shorthand", v);
            } else {
              try {
                const acc = decodeIcrcAccount(v);
                v = { owner: acc.owner, subaccount: acc.subaccount };
                dlog(ctx, "convert:account:decode", v);
              } catch (e) {
                throw `icrc1_account (invalid): ${e?.message || e}`;
              }
            }
          }
        }
        const out = {};
        for (const k of Object.keys(d.val)) {
          const isOpt = d.val[k] instanceof xOpt;
          if (!hasOwn(v, k)) {
            if (!isOpt) throw `${k} (missing)`;
            defineDataProperty(
              out,
              k === CANDID_PROTO_FIELD ? CANDID_PROTO_FIELD_ALIAS : k,
              [],
            );
          } else {
            defineDataProperty(
              out,
              k === CANDID_PROTO_FIELD ? CANDID_PROTO_FIELD_ALIAS : k,
              await rec(k, v[k], d.val[k]),
            );
          }
        }
        dlog(ctx, "convert:record", ekey, v, "->", out);
        return out;
      } else {
        // Special-case principals: allow number shorthand (0=current id, n=principal for id n)
        if (d === xPrincipal && typeof v === "number") {
          if (ctx?.allowNumberedPrincipals === false) {
            throw "(numbered principals disabled)";
          }
          const tgt = v === 0 ? ctx?.idNum ?? 0 : v;
          if (!Number.isInteger(tgt) || tgt < 0 || tgt > 65535) throw "(invalid principal id)";
          const p = tgt === (ctx?.idNum ?? 0) && ctx?.selfPrincipal ? ctx.selfPrincipal : await getPrincipalById(tgt);
          dlog(ctx, "convert:principal:number", v, "->", p?.toText?.());
          return p;
        }
        if (typeof d === "function" && d.fromState) return d.fromState(v);
        return d.constructor.fromState(v);
      }
    } catch (e) { throw ekey + "." + e; }
  }
  const out = [];
  for (let idx = 0; idx < input.length; idx++) out.push(await rec("arg" + idx, input[idx], def[idx]));
  dlog(ctx, "convert:done", out);
  return out;
}

function convertBackValue(ekey, v, d, ctx) {
  try {
    if (d instanceof xOpt) {
      if (v === null) return null;
      if (Array.isArray(v) && v.length === 0) return undefined;
      return convertBackValue(
        "(opt)",
        Array.isArray(v) ? v[0] : v,
        d.val,
        ctx,
      );
    } else if (d instanceof xVec) {
      if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return v;
      if (!Array.isArray(v)) throw "(array expected)";
      return v.map((item) => convertBackValue("vec", item, d.val, ctx));
    } else if (d instanceof xTuple) {
      if (!Array.isArray(v)) throw "(array expected)";
      return v.map((item, idx) =>
        convertBackValue(String(idx), item, d.val[idx], ctx));
    } else if (d instanceof xVariant) {
      const k = candidVariantKey(v, d.val);
      return { [k]: convertBackValue(k, v[k], d.val[k], ctx) };
    } else if (d instanceof xRecord) {
      // Special-case: account record → ICRC-1 string
      if (isIcrcAccountDef(d)) {
        try {
          let sub = v?.subaccount;
          if (Array.isArray(sub)) {
            if (sub.length === 0) sub = undefined; // None
            else {
              const inner = sub[0];
              sub = ArrayBuffer.isView(inner)
                ? inner
                : Uint8Array.from(inner ?? []);
            }
          }
          if (sub && sub.length === 0) sub = undefined;
          const accStr = encodeIcrcAccount({ owner: v?.owner, subaccount: sub });
          dlog(ctx, "convertBack:account:encode", v, "->", accStr);
          return accStr;
        } catch (e) {
          // If encoding fails, fall back to generic mapping
        }
      }
      const out = {};
      for (const k of Object.keys(d.val)) {
        const isOpt = d.val[k] instanceof xOpt;
        const sourceKey = decodedRecordKey(v, k);
        if (sourceKey === undefined) {
          if (!isOpt) throw `${k} (missing)`;
        } else {
          const value = convertBackValue(k, v[sourceKey], d.val[k], ctx);
          if (value !== undefined) defineDataProperty(out, k, value);
        }
      }
      return out;
    }
    return v;
  } catch (e) {
    throw ekey + "." + e;
  }
}

function canonicalCandidValue(ekey, value, type) {
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
        return uint8ArrayToHexString(bytes);
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
    throw ekey + "." + error;
  }
}

function canonicalArgumentsJson(input, def) {
  if (!Array.isArray(input) || input.length !== def.length) {
    throw new Error(`Expected ${def.length} Candid arguments`);
  }
  return input.map((value, index) =>
    canonicalCandidValue(`arg${index}`, value, def[index]));
}

export function convertBack(input, def, ctx) {
  if (!def || def.length === 0) return null;
  if (def.length > 1) {
    if (!Array.isArray(input) || input.length !== def.length) {
      throw new Error(`Expected ${def.length} Candid return values`);
    }
    return toState(input.map((value, index) =>
      convertBackValue(`ret${index}`, value, def[index], ctx)));
  }
  const out = convertBackValue("ret", input, def[0], ctx);
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
  dlog(ctx, "convertBack:done", out);
  return toState(out);
}

export function toState(x) {
  if (x === undefined || x === null) return x;
  if (typeof x === "number" && !Number.isFinite(x)) {
    throw new TypeError("Non-finite numbers are not JSON-compatible");
  }
  if (typeof x === "bigint") return x.toString();
  if (x instanceof Uint8Array) return uint8ArrayToHexString(x);
  if (x instanceof Uint16Array || x instanceof Int16Array || x instanceof Uint32Array || x instanceof Int32Array) return Array.from(x);
  if (x instanceof BigInt64Array) return Array.from(x, (b) => b.toString());
  if (x instanceof BigUint64Array) return Array.from(x, (b) => b.toString());
  if (ArrayBuffer.isView(x) || x instanceof ArrayBuffer) return [...x];
  if (Array.isArray(x)) {
    return x.map((y) => {
      const converted = toState(y);
      return converted === undefined ? null : converted;
    });
  }
  if (typeof x === "object") {
    if (
      x instanceof Principal ||
      Object.getPrototypeOf(x)?.constructor?.name === "Principal"
    ) return x.toText();
    return Object.fromEntries(
      Object.keys(x)
        .map((k) => [k, toState(x[k])])
        .filter((entry) => entry[1] !== undefined)
    );
  }
  return x;
}
function uint8ArrayToHexString(uint8Array) { let s = ""; for (let i = 0; i < uint8Array.length; i++) s += uint8Array[i].toString(16).padStart(2, "0"); return s; }

async function getPrincipalById(idNum) {
  const id = await hashIdentity(idNum);
  return id.getPrincipal();
}

function wrapFunction(fn, key, func, xdl, ctx) {
  const method = async (...args) => {
    dlog(ctx, `call:${key}:args`, args);
    const processed = await convert(args, xdl[key].input, ctx);
    dlog(ctx, `call:${key}:processed`, processed);
    const result = await fn(...processed);
    dlog(ctx, `call:${key}:rawResult`, result);
    const back = convertBack(result, xdl[key].output, ctx);
    dlog(ctx, `call:${key}:convertedResult`, back);
    return back;
  };
  return attachPreparedCall(method, {
    argTypes: func.argTypes,
    convertArgs: (args) => convert(args, xdl[key].input, ctx),
    projectArgs: (args) => canonicalArgumentsJson(args, xdl[key].input),
    dispatch: (args) => {
      let result;
      try {
        result = fn(...args);
      } catch (error) {
        return Promise.reject(error);
      }
      return Promise.resolve(result).then((value) =>
        convertBack(value, xdl[key].output, ctx));
    },
  });
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

function wrapActor(obj, idlFactory, ctx) {
  const xdl = explainer(idlFactory);
  const wrapped = {};
  const methods = new Map();
  for (const [k, func] of ctx.candidService._fields) {
    if (!hasOwn(xdl, k)) {
      throw new Error(`Unable to explain Candid method: ${k}`);
    }
    const rawMethod = candidActorMethod(obj, k);
    if (typeof rawMethod !== "function") {
      throw new Error(`Actor method unavailable: ${k}`);
    }
    const method = wrapFunction(rawMethod, k, func, xdl, ctx);
    methods.set(k, method);
    if (k !== "then" && k !== "$methods") {
      defineActorProperty(wrapped, k, method);
    }
  }
  Object.defineProperty(wrapped, "$methods", {
    value: readonlyMethodTable(methods),
  });
  return wrapped;
}

// ========== JSON Schema ==========
function isResultVariant(t) {
  return (
    t instanceof xVariant &&
    t.val && typeof t.val === "object" &&
    Object.keys(t.val).length === 2 &&
    (hasOwn(t.val, "Ok") || hasOwn(t.val, "ok")) &&
    (hasOwn(t.val, "Err") || hasOwn(t.val, "err"))
  );
}

function schemaOfType(
  t,
  options = {},
  state = createCandidSchemaTraversal(options),
) {
  return withCandidSchemaType(state, t, () =>
    schemaOfTypeValue(t, options, state));
}

function schemaOfTypeValue(t, options, state) {
  if (t === xText) return { type: "string" };
  if (t === xBool) return { type: "boolean" };
  if (t === xFloat) return { type: "number" };
  if (t === xPrincipal) {
    if (options.allowNumberedPrincipals === false) {
      return { type: "string", description: "principal text" };
    }
    return { oneOf: [
      { type: "string", description: "principal text" },
      { type: "number", minimum: 0, maximum: 65535, description: "principal id" }
    ] };
  }
  if (t === xNat8 || t === xNat16 || t === xNat32 || t === xInt8 || t === xInt16 || t === xInt32) return { type: "number" };
  if (t === xNat64 || t === xInt64 || t === xNat || t === xInt || t === xTime) return { type: "string", description: "bigint as string" };
  if (t === xNull) return { type: "null" };
  if (t instanceof xVec) {
    if (t.val === xNat8) {
      return { oneOf: [ { type: "string", description: "hex-encoded bytes" }, { type: "array", items: { type: "number" }, description: "byte array" } ] };
    }
    return { type: "array", items: schemaOfType(t.val, options, state) };
  }
  if (t instanceof xTuple) {
    const items = t.val.map((item) => schemaOfType(item, options, state));
    return { type: "array", prefixItems: items, minItems: items.length, maxItems: items.length };
  }
  if (t instanceof xRecord) {
    // Represent ICRC account as a string in schemas
    if (isIcrcAccountDef(t)) {
      return options.allowNumberedPrincipals === false
        ? {
            type: "string",
            not: { pattern: "^[0-9]+(?:-[0-9]+)?$" },
            description: "icrc1 account text",
          }
        : {
            type: "string",
            description: "icrc1 account or 'id[-sub]' shorthand",
          };
    }
    const obj = { type: "object", properties: {}, additionalProperties: false };
    const required = [];
    for (const k of Object.keys(t.val)) {
      const inner = t.val[k]; const isOpt = inner instanceof xOpt;
      defineCandidSchemaProperty(
        obj,
        k,
        schemaOfType(isOpt ? inner.val : inner, options, state),
      );
      if (!isOpt) required.push(k);
    }
    if (required.length) obj.required = required;
    return obj;
  }
  if (t instanceof xOpt) {
    const inner = schemaOfType(t.val, options, state);
    return { anyOf: [inner, { type: "null" }] };
  }
  if (t instanceof xVariant) {
    const alts = [];
    for (const tag of Object.keys(t.val)) {
      const inner = schemaOfType(t.val[tag], options, state);
      const alternative = {
        type: "object",
        properties: {},
        required: [tag],
        additionalProperties: false,
      };
      defineCandidSchemaProperty(alternative, tag, inner);
      alts.push(alternative);
    }
    return { oneOf: alts };
  }
  if (t instanceof xRec) return { description: "recursive type", type: "object" };
  return {};
}

function idlFactoryFromSource(source) {
  const idlFactory = typeof source === "function" ? source : source.$idlFactory;
  if (!idlFactory) throw new Error("idlFactory not provided or actor missing $idlFactory");
  return idlFactory;
}

function schemaFromSignature(sig, options = {}) {
  const args = sig.input;
  const outs = sig.output;
  const inputState = createCandidSchemaTraversal(options);
  const inputPrefix = args.map((type) =>
    schemaOfType(type, options, inputState));
  let min = inputPrefix.length;
  for (let i = inputPrefix.length - 1; i >= 0; i--) {
    if (args[i] instanceof xOpt) min = i;
    else break;
  }
  let input;
  if (inputPrefix.length === 0) {
    input = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "array",
      minItems: 0,
      maxItems: 0,
    };
  } else {
    input = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "array",
      prefixItems: inputPrefix,
      minItems: min,
      maxItems: inputPrefix.length,
    };
  }
  finishCandidSchemaTraversal(inputState, input);

  let output;
  if (outs.length === 0) {
    output = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "null",
    };
  } else if (outs.length === 1) {
    const outputState = createCandidSchemaTraversal(options);
    const t = outs[0];
    output = isResultVariant(t)
      ? schemaOfType(t.val.Ok ?? t.val.ok, options, outputState)
      : schemaOfType(t, options, outputState);
    output.$schema = "https://json-schema.org/draft/2020-12/schema";
    finishCandidSchemaTraversal(outputState, output);
  } else {
    const outputState = createCandidSchemaTraversal(options);
    output = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "array",
      prefixItems: outs.map((type) =>
        schemaOfType(type, options, outputState)),
      minItems: outs.length,
      maxItems: outs.length,
    };
    finishCandidSchemaTraversal(outputState, output);
  }
  return { input, output };
}

export function explainMethodSchema(source, method, options = {}) {
  const xdl = explainer(idlFactoryFromSource(source));
  if (!hasOwn(xdl, method)) throw new Error(`method not found: ${method}`);
  const sig = xdl[method];
  return schemaFromSignature(sig, options);
}

export function explainServiceSchema(source, options = {}) {
  const xdl = explainer(idlFactoryFromSource(source));
  const schemas = {};
  for (const method of Object.keys(xdl)) {
    defineDataProperty(schemas, method, schemaFromSignature(xdl[method], options));
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

const MAX_CANDID_SOURCE_BYTES = 128 * 1024;
const MAX_GENERATED_JAVASCRIPT_BYTES = 2 * 1024 * 1024;

// ========== DID to JS via wasm-bindgen JS glue ==========
async function didToJsBindings(did) {
  if (typeof did !== "string" || !did.trim()) {
    throw new Error("Candid interface must be a non-empty string");
  }
  if (Buffer.byteLength(did, "utf8") > MAX_CANDID_SOURCE_BYTES) {
    throw new Error(
      `Candid interface exceeds ${MAX_CANDID_SOURCE_BYTES} UTF-8 bytes`,
    );
  }
  const modUrl = new URL("../didc_wasm_pkg/didc_rust.js", import.meta.url);
  const mod = await import(modUrl.href);
  const wasmPath = fileURLToPath(new URL("../didc_wasm_pkg/didc_rust_bg.bin", import.meta.url));
  const wasmBin = new Uint8Array(await readFile(wasmPath));
  mod.initSync({ module: wasmBin });
  const js = mod.generate(did);
  if (typeof js !== "string" || !js.trim()) {
    throw new Error("didc_rust generate returned empty");
  }
  if (Buffer.byteLength(js, "utf8") > MAX_GENERATED_JAVASCRIPT_BYTES) {
    throw new Error(
      `Generated Candid JavaScript exceeds ${MAX_GENERATED_JAVASCRIPT_BYTES} UTF-8 bytes`,
    );
  }
  return js;
}

function evalIdlFactory(js) {
  return evalGeneratedIdlFactory(js);
}

export async function idlFactoryFromCandid(did) {
  return evalIdlFactory(await didToJsBindings(did));
}

// ========== Client ==========
export async function ic({
  identity,
  host = "https://icp0.io",
  idNum = 0,
  debug = false,
  agentOptions = {},
  maxHttpResponseBytes = DEFAULT_MAX_HTTP_RESPONSE_BYTES,
  maxDecodedCandidItems = DEFAULT_MAX_DECODED_CANDID_ITEMS,
  maxDecodedCandidDepth = DEFAULT_MAX_DECODED_CANDID_DEPTH,
  maxCandidTypeItems = undefined,
  maxCandidTypeDepth = undefined,
  allowNumberedPrincipals = true,
} = {}) {
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
  const guardedFetch = createReplicaResponseGuardFetch(fetchImplementation, {
    maxBytes: maxHttpResponseBytes,
    candidLimits: decodedLimits,
  });
  const agentHost = agentOptions.host || host;
  const agent = new HttpAgent({
    ...remainingAgentOptions,
    host: agentHost,
    identity,
    fetch: guardedFetch,
  });
  const selfPrincipal = identity?.getPrincipal ? identity.getPrincipal() : undefined;

  // When pointing to a local replica (localhost/127.0.0.1/::1), fetch the root key.
  // This disables IC root certificate verification which is required for local dev.
  try {
    const u = new URL(agentHost);
    const hn = (u.hostname || "").toLowerCase();
    const isLocal = hn === "localhost" || hn === "127.0.0.1" || hn === "0.0.0.0" || hn === "[::1]" || hn === "::1";
    if (isLocal) {
      dlog({ debug }, "fetchRootKey:local", agentHost);
      await agent.fetchRootKey();
    }
  } catch (e) {
    // If host isn't a valid URL, ignore; this path should not crash client init.
    dlog({ debug }, "fetchRootKey:skip", agentHost, e?.message || e);
  }

  async function tryFetchCandidFromMetadata(canisterId) {
    try {
      const status1 = await CanisterStatus.request({ agent, canisterId, paths: ["candid"] });
      const candidText = status1.get("candid");
      if (typeof candidText === "string" && candidText.trim().length > 0) return candidText;
    } catch (_) { /* ignore */ }
    try {
      const status2 = await CanisterStatus.request({
        agent,
        canisterId,
        paths: [{ key: "candid_service_raw", path: "candid:service", decodeStrategy: "raw" }]
      });
      const raw = status2.get("candid_service_raw");
      if (raw && raw.byteLength) {
        try {
          const txt = new TextDecoder().decode(raw);
          if (txt && txt.includes("service")) return txt;
        } catch {}
        if (raw[0] === 0x1f && raw[1] === 0x8b) {
          try {
            const buf = zlib.gunzipSync(Buffer.from(raw), {
              maxOutputLength: MAX_CANDID_SOURCE_BYTES,
            });
            const txt = new TextDecoder().decode(buf);
            if (txt && txt.includes("service")) return txt;
          } catch {}
        }
      }
    } catch {}
    return null;
  }

  return async (canId) => {
    const principal = Principal.fromText(canId);
    let did = await tryFetchCandidFromMetadata(principal);
    if (!did) throw new Error("Candid metadata not found");

    const idlFactory = await idlFactoryFromCandid(did);
    const candidService = validateCandidService(
      withSafeCandidRecordFields(idlFactory)({ IDL }),
      decodedLimits,
    );
    const rawActor = Actor.createActor(() => candidService, {
      agent,
      canisterId: canId,
    });
    const wrapped = wrapActor(rawActor, idlFactory, {
      idNum,
      selfPrincipal,
      debug,
      allowNumberedPrincipals,
      candidService,
    });
    wrapped.$principal = principal; // canister principal
    wrapped.$selfPrincipal = selfPrincipal; // identity principal
    wrapped.$idlFactory = idlFactory;
    return wrapped;
  };
}
