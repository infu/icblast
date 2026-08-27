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
  if (fields.length !== 2 || !Object.prototype.hasOwnProperty.call(v, "subaccount")) return false;
  const hasOwner = Object.prototype.hasOwnProperty.call(v, "owner") && v.owner === xPrincipal;
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
  return out;
}

async function convert(input, def, ctx) {
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
        const k = Object.keys(v)[0];
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
        for (const k in d.val) {
          const isOpt = d.val[k] instanceof xOpt;
          if (!(k in v)) {
            if (!isOpt) throw `${k} (missing)`;
            out[k] = [];
          } else out[k] = await rec(k, v[k], d.val[k]);
        }
        dlog(ctx, "convert:record", ekey, v, "->", out);
        return out;
      } else {
        // Special-case principals: allow number shorthand (0=current id, n=principal for id n)
        if (d === xPrincipal && typeof v === "number") {
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

export function convertBack(input, def, ctx) {
  function rec(ekey, v, d) {
    try {
      if (d instanceof xOpt) {
        if (v === null) return null;
        if (Array.isArray(v) && v.length === 0) return undefined;
        return rec("(opt)", Array.isArray(v) ? v[0] : v, d.val);
      } else if (d instanceof xVec) {
        if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return v;
        if (!Array.isArray(v)) throw "(array expected)";
        return v.map((item) => rec("vec", item, d.val));
      } else if (d instanceof xTuple) {
        if (!Array.isArray(v)) throw "(array expected)";
        return v.map((item, idx) => rec(String(idx), item, d.val[idx]));
      } else if (d instanceof xVariant) {
        const k = Object.keys(v)[0];
        return { [k]: rec(k, v[k], d.val[k]) };
      } else if (d instanceof xRecord) {
        // Special-case: account record → ICRC-1 string
        if (isIcrcAccountDef(d)) {
          try {
            let sub = v?.subaccount;
            if (Array.isArray(sub)) {
              if (sub.length === 0) sub = undefined; // None
              else {
                const inner = sub[0];
                sub = ArrayBuffer.isView(inner) ? inner : Uint8Array.from(inner ?? []);
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
        for (const k in d.val) {
          const isOpt = d.val[k] instanceof xOpt;
          if (!(k in v)) {
            if (!isOpt) throw `${k} (missing)`;
          } else {
            const value = rec(k, v[k], d.val[k]);
            if (value !== undefined) out[k] = value;
          }
        }
        return out;
      } else return v;
    } catch (e) { throw ekey + "." + e; }
  }
  if (!def || def.length === 0) return null;
  if (def.length > 1) {
    if (!Array.isArray(input) || input.length !== def.length) {
      throw new Error(`Expected ${def.length} Candid return values`);
    }
    return toState(input.map((value, index) => rec(`ret${index}`, value, def[index])));
  }
  const out = rec("ret", input, def[0]);
  if (out === undefined && def[0] instanceof xOpt) return null;
  if (
    def[0] instanceof xVariant &&
    Object.keys(def[0].val).length === 2 &&
    ("Ok" in def[0].val || "ok" in def[0].val) &&
    ("Err" in def[0].val || "err" in def[0].val)
  ) {
    if (out && typeof out === "object" && "Ok" in out) return toState(out.Ok);
    if (out && typeof out === "object" && "ok" in out) return toState(out.ok);
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
    if (x instanceof Principal || x?.constructor?.name === "Principal") return x.toText();
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

function wrapFunction(fn, key, xdl, ctx) {
  return async (...args) => {
    dlog(ctx, `call:${key}:args`, args);
    const processed = await convert(args, xdl[key].input, ctx);
    dlog(ctx, `call:${key}:processed`, processed);
    const result = await fn(...processed);
    dlog(ctx, `call:${key}:rawResult`, result);
    const back = convertBack(result, xdl[key].output, ctx);
    dlog(ctx, `call:${key}:convertedResult`, back);
    return back;
  };
}

function wrapActor(obj, idlFactory, ctx) {
  const xdl = explainer(idlFactory);
  const wrapped = {};
  for (const k in obj) wrapped[k] = typeof obj[k] === "function" ? wrapFunction(obj[k], k, xdl, ctx) : obj[k];
  return wrapped;
}

// ========== JSON Schema ==========
function isResultVariant(t) {
  return (
    t instanceof xVariant &&
    t.val && typeof t.val === "object" &&
    Object.keys(t.val).length === 2 &&
    (Object.prototype.hasOwnProperty.call(t.val, "Ok") ||
      Object.prototype.hasOwnProperty.call(t.val, "ok")) &&
    (Object.prototype.hasOwnProperty.call(t.val, "Err") ||
      Object.prototype.hasOwnProperty.call(t.val, "err"))
  );
}

function schemaOfType(t) {
  if (t === xText) return { type: "string" };
  if (t === xBool) return { type: "boolean" };
  if (t === xFloat) return { type: "number" };
  if (t === xPrincipal) {
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
    return { type: "array", items: schemaOfType(t.val) };
  }
  if (t instanceof xTuple) {
    const items = t.val.map(schemaOfType);
    return { type: "array", prefixItems: items, minItems: items.length, maxItems: items.length };
  }
  if (t instanceof xRecord) {
    // Represent ICRC account as a string in schemas
    if (isIcrcAccountDef(t)) {
      return { type: "string", description: "icrc1 account or 'id[-sub]' shorthand" };
    }
    const props = {}; const required = [];
    for (const k of Object.keys(t.val)) {
      const inner = t.val[k]; const isOpt = inner instanceof xOpt;
      props[k] = schemaOfType(isOpt ? inner.val : inner);
      if (!isOpt) required.push(k);
    }
    const obj = { type: "object", properties: props, additionalProperties: false };
    if (required.length) obj.required = required;
    return obj;
  }
  if (t instanceof xOpt) { const inner = schemaOfType(t.val); return { anyOf: [ inner, { type: "null" } ] }; }
  if (t instanceof xVariant) {
    const alts = [];
    for (const tag of Object.keys(t.val)) {
      const inner = schemaOfType(t.val[tag]);
      alts.push({ type: "object", properties: { [tag]: inner }, required: [tag], additionalProperties: false });
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

function schemaFromSignature(sig) {
  const args = sig.input; const outs = sig.output;
  const inputPrefix = args.map(schemaOfType);
  let min = inputPrefix.length;
  for (let i = inputPrefix.length - 1; i >= 0; i--) { if (args[i] instanceof xOpt) min = i; else break; }
  let input;
  if (inputPrefix.length === 0) input = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "array", minItems: 0, maxItems: 0 };
  else input = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "array", prefixItems: inputPrefix, minItems: min, maxItems: inputPrefix.length };
  let output;
  if (outs.length === 0) output = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "null" };
  else if (outs.length === 1) { const t = outs[0]; output = isResultVariant(t) ? schemaOfType(t.val.Ok ?? t.val.ok) : schemaOfType(t); output.$schema = "https://json-schema.org/draft/2020-12/schema"; }
  else output = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "array", prefixItems: outs.map(schemaOfType), minItems: outs.length, maxItems: outs.length };
  return { input, output };
}

export function explainMethodSchema(source, method) {
  const xdl = explainer(idlFactoryFromSource(source));
  const sig = xdl[method];
  if (!sig) throw new Error(`method not found: ${method}`);
  return schemaFromSignature(sig);
}

export function explainServiceSchema(source) {
  const xdl = explainer(idlFactoryFromSource(source));
  const schemas = {};
  for (const method of Object.keys(xdl)) {
    schemas[method] = schemaFromSignature(xdl[method]);
  }
  return schemas;
}

export function validateMethodInputSchema(methodSchema, args = []) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validateInput = ajv.compile(methodSchema.input);
  const ok = validateInput(args);
  return {
    ok,
    schema: methodSchema.input,
    errors: ok ? undefined : validateInput.errors,
  };
}

export function validateMethodInput(source, method, args = []) {
  return validateMethodInputSchema(explainMethodSchema(source, method), args);
}

// ========== DID to JS via wasm-bindgen JS glue ==========
async function didToJsBindings(did) {
  const modUrl = new URL("../didc_wasm_pkg/didc_rust.js", import.meta.url);
  const mod = await import(modUrl.href);
  const wasmPath = fileURLToPath(new URL("../didc_wasm_pkg/didc_rust_bg.bin", import.meta.url));
  const wasmBin = new Uint8Array(await readFile(wasmPath));
  mod.initSync({ module: wasmBin });
  const bindings = mod.generate(did);
  if (!bindings) throw new Error("didc_rust generate returned empty");
  try {
    return bindings.js;
  } finally {
    bindings.free();
  }
}

function evalIdlFactory(js) {
  const m = js.match(/\({ IDL }\)\s*=>\s*{[\s\S]*?(?=export const|$)/);
  if (!m) throw new Error("Failed to locate idlFactory body in JS");
  // eslint-disable-next-line no-eval
  const idlFactory = eval(m[0]);
  return idlFactory;
}

export async function idlFactoryFromCandid(did) {
  return evalIdlFactory(await didToJsBindings(did));
}

// ========== Client ==========
export async function ic({ identity, host = "https://icp0.io", idNum = 0, debug = false } = {}) {
  const agent = new HttpAgent({ host, identity });
  const selfPrincipal = identity?.getPrincipal ? identity.getPrincipal() : undefined;

  // When pointing to a local replica (localhost/127.0.0.1/::1), fetch the root key.
  // This disables IC root certificate verification which is required for local dev.
  try {
    const u = new URL(host);
    const hn = (u.hostname || "").toLowerCase();
    const isLocal = hn === "localhost" || hn === "127.0.0.1" || hn === "0.0.0.0" || hn === "[::1]" || hn === "::1";
    if (isLocal) {
      dlog({ debug }, "fetchRootKey:local", host);
      await agent.fetchRootKey();
    }
  } catch (e) {
    // If host isn't a valid URL, ignore; this path should not crash client init.
    dlog({ debug }, "fetchRootKey:skip", host, e?.message || e);
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
            const buf = zlib.gunzipSync(Buffer.from(raw));
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
    const rawActor = Actor.createActor(idlFactory, { agent, canisterId: canId });
    const wrapped = wrapActor(rawActor, idlFactory, { idNum, selfPrincipal, debug });
    wrapped.$principal = principal; // canister principal
    wrapped.$selfPrincipal = selfPrincipal; // identity principal
    wrapped.$idlFactory = idlFactory;
    return wrapped;
  };
}
