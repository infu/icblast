// Node.js IC client with minimal features (ported from Deno version)
// - Deterministic Ed25519 identity from passphrase
// - Discover DID (Candid) via canister metadata
// - Compile DID → JS via embedded wasm-bindgen glue (didc_rust)
// - Wrap actor methods for light I/O conversion and JSON Schema explanation

import { HttpAgent, Actor, CanisterStatus } from "@dfinity/agent";
import { IDL } from "@dfinity/candid";
import { Principal } from "@dfinity/principal";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";

// ========== Identity from hash ==========
function resolveSecretPath() {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "blast", "secret");
  }
  if (process.platform === "win32") {
    const base = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(base, "blast", "secret");
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(xdg, "blast", "secret");
}

async function ensureSecretHex() {
  const secretPath = resolveSecretPath();
  try {
    const txt = await readFile(secretPath, "utf8");
    const cleaned = txt.trim().replace(/[^0-9a-f]/gi, "").toLowerCase();
    if (cleaned.length >= 64) return cleaned; // minimal length
  } catch (_) {
    // fall through to generate
  }
  // Generate ~1024 hex chars (512 bytes)
  const hex = randomBytes(512).toString("hex");
  await mkdir(path.dirname(secretPath), { recursive: true });
  await writeFile(secretPath, hex + "\n", { mode: 0o600 });
  return hex;
}

function deriveSeedFromSecret(secretHex, idNum) {
  const L = secretHex.length;
  const window = Math.min(128, L); // 64 bytes worth of hex
  const idx = L > 0 ? (idNum % L) : 0;
  const twice = secretHex + secretHex;
  const part = twice.substring(idx, idx + window);
  const material = part + String(idNum);
  return createHash("sha256").update(material).digest();
}

export async function hashIdentity(idNum = 0) {
  if (!Number.isInteger(idNum) || idNum < 0 || idNum > 65535) {
    throw new Error("--id must be an integer in [0,65535]");
  }
  const secretHex = await ensureSecretHex();
  const seed = deriveSeedFromSecret(secretHex, idNum);
  const id = Ed25519KeyIdentity.generate(new Uint8Array(seed));
  return id;
}

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
const explainer = (idlFactory) => idlFactory({ IDL: IDLWalker });

function convert(input, def) {
  function rec(ekey, v, d) {
    try {
      if (d instanceof xOpt) {
        if (v === undefined || v === null) return [];
        return [rec("(opt)", v, d.val)];
      } else if (d instanceof xVec) {
        if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return v;
        if (!Array.isArray(v)) throw "(array expected)";
        return v.map((item, idx) => rec(String(idx), item, d.val));
      } else if (d instanceof xTuple) {
        if (!Array.isArray(v)) throw "(array expected)";
        return v.map((item, idx) => rec(String(idx), item, d.val[idx]));
      } else if (d instanceof xVariant) {
        const k = Object.keys(v)[0];
        return { [k]: rec(k, v[k], d.val[k]) };
      } else if (d instanceof xRecord) {
        const out = {};
        for (const k in d.val) {
          const isOpt = d.val[k] instanceof xOpt;
          if (!(k in v)) {
            if (!isOpt) throw `${k} (missing)`;
            out[k] = [];
          } else out[k] = rec(k, v[k], d.val[k]);
        }
        return out;
      } else {
        if (typeof d === "function" && d.fromState) return d.fromState(v);
        return d.constructor.fromState(v);
      }
    } catch (e) { throw ekey + "." + e; }
  }
  return input.map((item, idx) => rec("arg" + idx, item, def[idx]));
}

function convertBack(input, def) {
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
        const out = {};
        for (const k in d.val) {
          const isOpt = d.val[k] instanceof xOpt;
          if (!(k in v)) {
            if (!isOpt) throw `${k} (missing)`;
          } else {
            const value = rec(k, v[k], d.val[k]);
            if (value !== null) out[k] = value;
          }
        }
        return out;
      } else return v;
    } catch (e) { throw ekey + "." + e; }
  }
  const out = rec("ret", input, def != null ? def[0] : true);
  if (def[0] instanceof xVariant && "Ok" in def[0].val && "Err" in def[0].val && Object.keys(def[0].val).length === 2) {
    if (out && typeof out === "object" && "Ok" in out) return out.Ok;
    throw (out && out.Err) ?? out;
  }
  return out;
}

export function toState(x) {
  if (x === undefined || x === null) return x;
  if (typeof x === "bigint") return x.toString();
  if (x instanceof Uint8Array) return uint8ArrayToHexString(x);
  if (x instanceof Uint16Array || x instanceof Int16Array || x instanceof Uint32Array || x instanceof Int32Array) return Array.from(x);
  if (x instanceof BigInt64Array) return Array.from(x, (b) => b.toString());
  if (x instanceof BigUint64Array) return Array.from(x, (b) => b.toString());
  if (ArrayBuffer.isView(x) || x instanceof ArrayBuffer) return [...x];
  if (Array.isArray(x)) return x.map((y) => toState(y));
  if (typeof x === "object") {
    if (x instanceof Principal || x?.constructor?.name === "Principal") return x.toText();
    return Object.fromEntries(Object.keys(x).map((k) => [k, toState(x[k])]));
  }
  return x;
}
function uint8ArrayToHexString(uint8Array) { let s = ""; for (let i = 0; i < uint8Array.length; i++) s += uint8Array[i].toString(16).padStart(2, "0"); return s; }

function wrapFunction(fn, key, xdl) {
  return async (...args) => {
    const processed = convert(args, xdl[key].input);
    const result = await fn(...processed);
    return convertBack(result, xdl[key].output);
  };
}

function wrapActor(obj, idlFactory) {
  const xdl = explainer(idlFactory);
  const wrapped = {};
  for (const k in obj) wrapped[k] = typeof obj[k] === "function" ? wrapFunction(obj[k], k, xdl) : obj[k];
  return wrapped;
}

// ========== JSON Schema ==========
function isResultVariant(t) {
  return (
    t instanceof xVariant &&
    t.val && typeof t.val === "object" &&
    Object.prototype.hasOwnProperty.call(t.val, "Ok") &&
    Object.prototype.hasOwnProperty.call(t.val, "Err") &&
    Object.keys(t.val).length === 2
  );
}

function schemaOfType(t) {
  if (t === xText) return { type: "string" };
  if (t === xBool) return { type: "boolean" };
  if (t === xFloat) return { type: "number" };
  if (t === xPrincipal) return { type: "string", description: "principal text" };
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

export function explainMethodSchema(source, method) {
  const idlFactory = typeof source === "function" ? source : source.$idlFactory;
  if (!idlFactory) throw new Error("idlFactory not provided or actor missing $idlFactory");
  const xdl = explainer(idlFactory);
  const sig = xdl[method];
  if (!sig) throw new Error(`method not found: ${method}`);
  const args = sig.input; const outs = sig.output;
  const inputPrefix = args.map(schemaOfType);
  let min = inputPrefix.length;
  for (let i = inputPrefix.length - 1; i >= 0; i--) { if (args[i] instanceof xOpt) min = i; else break; }
  let input;
  if (inputPrefix.length === 0) input = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "array", minItems: 0, maxItems: 0 };
  else input = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "array", prefixItems: inputPrefix, minItems: min, maxItems: inputPrefix.length };
  let output;
  if (outs.length === 0) output = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "null" };
  else if (outs.length === 1) { const t = outs[0]; output = isResultVariant(t) ? schemaOfType(t.val.Ok) : schemaOfType(t); output.$schema = "https://json-schema.org/draft/2020-12/schema"; }
  else output = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "array", prefixItems: outs.map(schemaOfType), minItems: outs.length, maxItems: outs.length };
  return { input, output };
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
  return bindings.js;
}

async function didToJs(_agent, did) { return await didToJsBindings(did); }

function evalIdlFactory(js) {
  const m = js.match(/\({ IDL }\)\s*=>\s*{[\s\S]*?(?=export const|$)/);
  if (!m) throw new Error("Failed to locate idlFactory body in JS");
  // eslint-disable-next-line no-eval
  const idlFactory = eval(m[0]);
  return idlFactory;
}

// ========== Client ==========
export async function ic({ identity, host = "https://icp0.io" } = {}) {
  const agent = new HttpAgent({ host, identity });

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

  async function tryFetchCandidFromTmpHack(canisterId) {
    try {
      const url = new URL(`/api/v2/canister/${canisterId.toText()}/metadata/candid:service`, host);
      const resp = await fetch(url.toString());
      if (resp.ok) {
        const buf = new Uint8Array(await resp.arrayBuffer());
        try {
          const txt = new TextDecoder().decode(buf);
          if (txt && txt.includes("service")) return txt;
        } catch {}
        if (buf[0] === 0x1f && buf[1] === 0x8b) {
          try {
            const out = zlib.gunzipSync(Buffer.from(buf));
            const txt = new TextDecoder().decode(out);
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
    if (!did) did = await tryFetchCandidFromTmpHack(principal);
    if (!did) throw new Error("Candid metadata not found");

    const js = await didToJs(agent, did);
    const idlFactory = evalIdlFactory(js);
    const rawActor = Actor.createActor(idlFactory, { agent, canisterId: canId });
    const wrapped = wrapActor(rawActor, idlFactory);
    wrapped.$principal = principal;
    wrapped.$idlFactory = idlFactory;
    return wrapped;
  };
}
