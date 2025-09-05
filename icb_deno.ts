// Single-file Deno IC client with minimal features:
// - Identity from hash (deterministic Ed25519)
// - Fetch DID from canister metadata (candid)
// - Compile DID to idlFactory via Motoko Playground (did_to_js)
// - Minimal input/output transformation (no [] for Opt on output; classes→strings)
// - Test: call icrc55_get_pylon_meta on togwv-zqaaa-aaaal-qr7aa-cai

// External deps via esm.sh only
import { HttpAgent, Actor, CanisterStatus } from "https://esm.sh/@dfinity/agent@3.2.3";
import { IDL } from "https://esm.sh/@dfinity/candid@3.2.3";
import { Principal } from "https://esm.sh/@dfinity/principal@3.2.3";
import { Ed25519KeyIdentity } from "https://esm.sh/@dfinity/identity@3.2.3";

// ========== Identity from hash ==========
export async function hashIdentity(pass: string) {
  const enc = new TextEncoder();
  const bytes = enc.encode(pass);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  // Deterministic Ed25519 from entropy (same API shape as Node variant)
  const id = Ed25519KeyIdentity.generate(digest as unknown as Uint8Array);
  return id;
}

// ========== Minimal "actress" (input/output transforms) ==========
// We reuse a trimmed version of the conversion utilities to wrap Actor methods.

class xBase<T = unknown> { constructor(public val: T) {} static fromState(v: any) { return v; } }
class xBigInt<T = unknown> { constructor(public val: T) {} static fromState(v: any) { return typeof v === "string" ? BigInt(v) : v; } }
class xText extends xBase<string> {}
class xVec<T = unknown> extends xBase<T> { fromState(v: any) { return v; } }
class xOpt<T = unknown> extends xBase<T> {}
class xVariant<T = unknown> extends xBase<T> {}
class xNull extends xBase<null> {}
class xPrincipal extends xBase<string> { static fromState(v: any) { return typeof v === "string" ? Principal.from(v) : v; } }
class xNat8 extends xBase<number> {}
class xNat16 extends xBase<number> {}
class xNat32 extends xBase<number> {}
class xInt8 extends xBase<number> {}
class xInt16 extends xBase<number> {}
class xInt32 extends xBase<number> {}
class xNat64 extends xBigInt<bigint> {}
class xInt64 extends xBigInt<bigint> {}
class xNat extends xBigInt<bigint> {}
class xInt extends xBigInt<bigint> {}
class xTime extends xBigInt<bigint> {}
class xFloat extends xBase<number> {}
class xBool extends xBase<boolean> {}
class xRecord<T = any> extends xBase<T> {}
class xTuple<T = any> extends xBase<T> {}
class xRec<T = any> extends xBase<T> { fill(newInstance: any) { Object.setPrototypeOf(this, newInstance.constructor.prototype); Object.assign(this, newInstance); } }

class IDLExplainer {
  Text = xText; Null = xNull; Principal = xPrincipal;
  Nat8 = xNat8; Nat16 = xNat16; Nat32 = xNat32; Nat64 = xNat64; Nat = xNat;
  Int8 = xInt8; Int16 = xInt16; Int32 = xInt32; Int64 = xInt64; Int = xInt;
  Float64 = xFloat; Bool = xBool; Time = xTime;
  Service(o: any) { return o; }
  Func(arg: any, ret: any) { return { input: arg, output: ret }; }
  Record(o: any) { return new xRecord(o); }
  Tuple(...o: any[]) { return new xTuple(o); }
  Rec() { return new xRec(); }
  Vec(o: any) { return new xVec(o); }
  Variant(o: any) { return new xVariant(o); }
  Opt(a: any) { return new xOpt(a); }
}
const IDLWalker = new IDLExplainer();
const explainer = (idlFactory: any) => idlFactory({ IDL: IDLWalker });

function convert(input: any[], def: any[]): any[] {
  function rec(ekey: string, v: any, d: any): any {
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
        const out: any = {};
        for (const k in d.val) {
          const isOpt = d.val[k] instanceof xOpt;
          if (!(k in v)) {
            if (!isOpt) throw `${k} (missing)`;
            out[k] = [];
          } else out[k] = rec(k, v[k], d.val[k]);
        }
        return out;
      } else {
        if (typeof d === "function" && (d as any).fromState) return (d as any).fromState(v);
        return (d.constructor as any).fromState(v);
      }
    } catch (e) { throw ekey + "." + e; }
  }
  return input.map((item, idx) => rec("arg" + idx, item, def[idx]));
}

function convertBack(input: any, def: any[]): any {
  function rec(ekey: string, v: any, d: any): any {
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
        const out: any = {};
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
  let out = rec("ret", input, def != null ? def[0] : true);
  // Auto-unwrap Result { Ok, Err }
  if (def[0] instanceof xVariant && "Ok" in def[0].val && "Err" in def[0].val && Object.keys(def[0].val).length === 2) {
    if (out && typeof out === "object" && "Ok" in out) return out.Ok;
    throw (out && out.Err) ?? out;
  }
  return out;
}

export function toState(x: any): any {
  if (x === undefined || x === null) return x;
  if (typeof x === "bigint") return x.toString();
  if (x instanceof Uint8Array) return uint8ArrayToHexString(x);
  if (x instanceof Uint16Array || x instanceof Int16Array || x instanceof Uint32Array || x instanceof Int32Array) return Array.from(x as any);
  if (x instanceof BigInt64Array) return Array.from(x, (b) => b.toString());
  if (x instanceof BigUint64Array) return Array.from(x, (b) => b.toString());
  if (ArrayBuffer.isView(x) || x instanceof ArrayBuffer) return [...(x as any)];
  if (Array.isArray(x)) return x.map((y) => toState(y));
  if (typeof x === "object") {
    if (x instanceof Principal || (x as any).constructor?.name === "Principal") return (x as Principal).toText();
    return Object.fromEntries(Object.keys(x).map((k) => [k, toState(x[k])]));
  }
  return x;
}
function uint8ArrayToHexString(uint8Array: Uint8Array) { let s = ""; for (let i = 0; i < uint8Array.length; i++) s += uint8Array[i].toString(16).padStart(2, "0"); return s; }

function wrapFunction(fn: Function, key: string, xdl: any) {
  return async (...args: any[]) => {
    const processed = convert(args, xdl[key].input);
    const result = await fn(...processed);
    return convertBack(result, xdl[key].output);
  };
}

function wrapActor(obj: any, idlFactory: any) {
  const xdl = explainer(idlFactory);
  const wrapped: any = {};
  for (const k in obj) wrapped[k] = typeof obj[k] === "function" ? wrapFunction(obj[k], k, xdl) : obj[k];
  return wrapped;
}

// ========== JSON Schema (our conventions) ==========
type JSONSchema = Record<string, unknown>;

function isResultVariant(t: any): boolean {
  return (
    t instanceof xVariant &&
    t.val && typeof t.val === "object" &&
    Object.prototype.hasOwnProperty.call(t.val, "Ok") &&
    Object.prototype.hasOwnProperty.call(t.val, "Err") &&
    Object.keys(t.val).length === 2
  );
}

function schemaOfType(t: any): JSONSchema {
  // Base types are provided as class references (not instances)
  if (t === xText) return { type: "string" };
  if (t === xBool) return { type: "boolean" };
  if (t === xFloat) return { type: "number" };
  if (t === xPrincipal) return { type: "string", description: "principal text" };

  if (t === xNat8 || t === xNat16 || t === xNat32 ||
      t === xInt8 || t === xInt16 || t === xInt32) {
    return { type: "number" };
  }
  if (t === xNat64 || t === xInt64 || t === xNat || t === xInt || t === xTime) {
    return { type: "string", description: "bigint as string" };
  }
  if (t === xNull) return { type: "null" };

  if (t instanceof xVec) {
    if (t.val === xNat8) {
      return {
        oneOf: [
          { type: "string", description: "hex-encoded bytes" },
          { type: "array", items: { type: "number" }, description: "byte array" }
        ]
      };
    }
    return { type: "array", items: schemaOfType(t.val) };
  }
  if (t instanceof xTuple) {
    const items = (t.val as any[]).map(schemaOfType);
    return { type: "array", prefixItems: items, minItems: items.length, maxItems: items.length };
  }
  if (t instanceof xRecord) {
    const props: Record<string, JSONSchema> = {};
    const required: string[] = [];
    for (const k of Object.keys(t.val)) {
      const inner = t.val[k];
      const isOpt = inner instanceof xOpt;
      props[k] = schemaOfType(isOpt ? inner.val : inner);
      if (!isOpt) required.push(k);
    }
    const obj: JSONSchema = { type: "object", properties: props, additionalProperties: false };
    if (required.length) (obj as any).required = required;
    return obj;
  }
  if (t instanceof xOpt) {
    // Optional in our format: property may be omitted. For standalone schema, allow null too.
    const inner = schemaOfType(t.val);
    return { anyOf: [ inner, { type: "null" } ] };
  }
  if (t instanceof xVariant) {
    const alts: JSONSchema[] = [];
    for (const tag of Object.keys(t.val)) {
      const inner = schemaOfType(t.val[tag]);
      alts.push({
        type: "object",
        properties: { [tag]: inner },
        required: [tag],
        additionalProperties: false,
      });
    }
    return { oneOf: alts };
  }
  if (t instanceof xRec) {
    return { description: "recursive type", type: "object" };
  }
  return { }; // fallback
}

export function explainMethodSchema(source: any, method: string): { input: JSONSchema; output: JSONSchema } {
  const idlFactory = typeof source === "function" ? source : source.$idlFactory;
  if (!idlFactory) throw new Error("idlFactory not provided or actor missing $idlFactory");
  const xdl = explainer(idlFactory);
  const sig = xdl[method];
  if (!sig) throw new Error(`method not found: ${method}`);

  const args = sig.input as any[];
  const outs = sig.output as any[];

  const inputPrefix = args.map(schemaOfType);
  // Required args = count of leading non-optional arguments
  let min = inputPrefix.length;
  for (let i = inputPrefix.length - 1; i >= 0; i--) {
    if (args[i] instanceof xOpt) min = i; else break;
  }
  let input: JSONSchema;
  if (inputPrefix.length === 0) {
    input = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "array", minItems: 0, maxItems: 0 };
  } else {
    input = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "array",
      prefixItems: inputPrefix,
      minItems: min,
      maxItems: inputPrefix.length,
    };
  }

  let output: JSONSchema;
  if (outs.length === 0) {
    output = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "null" };
  } else if (outs.length === 1) {
    const t = outs[0];
    if (isResultVariant(t)) {
      // Our convertBack unwraps Result to Ok/throws Err → describe Ok
      output = schemaOfType(t.val.Ok);
    } else {
      output = schemaOfType(t);
    }
    (output as any).$schema = "https://json-schema.org/draft/2020-12/schema";
  } else {
    output = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "array",
      prefixItems: outs.map(schemaOfType),
      minItems: outs.length,
      maxItems: outs.length,
    };
  }
  return { input, output };
}

// ========== DID to JS via wasm-bindgen JS glue (works with deno compile) ==========
async function didToJsBindings(did: string): Promise<string> {
  const mod = await import(new URL("./didc_wasm_pkg/didc_rust.js", import.meta.url).toString());
  // initialize from embedded bytes (no network fetch)
  const wasmBin = await Deno.readFile(new URL("./didc_wasm_pkg/didc_rust_bg.bin", import.meta.url));
  // Avoid deprecation warning by passing a single object
  mod.initSync({ module: wasmBin });
  const bindings = mod.generate(did);
  if (!bindings) throw new Error("didc_rust generate returned empty");
  return bindings.js;
}

async function didToJs(_agent: HttpAgent, did: string): Promise<string> {
    return await didToJsBindings(did);
}

function evalIdlFactory(js: string): any {
  const m = js.match(/\({ IDL }\)\s*=>\s*{[\s\S]*?(?=export const|$)/);
  if (!m) throw new Error("Failed to locate idlFactory body in JS");
  // This returns a function ( { IDL } ) => { ... }
  // deno-lint-ignore no-eval
  const idlFactory = eval(m[0]);
  return idlFactory;
}

// ========== Client: discover DID via metadata, compile, create wrapped actor ==========
export async function ic({ identity, host = "https://icp0.io" }: { identity?: any; host?: string } = {}) {
  const agent = new HttpAgent({ host, identity });

  async function tryFetchCandidFromMetadata(canisterId: Principal): Promise<string | null> {
    // First, request only the common "candid" metadata to avoid warnings for missing paths
    try {
      const status1 = await CanisterStatus.request({ agent, canisterId, paths: ["candid"] });
      const candidText = status1.get("candid");
      if (typeof candidText === "string" && candidText.trim().length > 0) return candidText;
    } catch (_e) { /* ignore and try fallback */ }

    // Fallback: try raw bytes from "candid:service" only if needed
    try {
      const status2 = await CanisterStatus.request({
        agent,
        canisterId,
        paths: [{ key: "candid_service_raw", path: "candid:service", decodeStrategy: "raw" }] as any,
      });
      const raw = status2.get("candid_service_raw") as Uint8Array | null | undefined;
      if (raw && raw.byteLength) {
        try {
          const txt = new TextDecoder().decode(raw);
          if (txt && txt.includes("service")) return txt;
        } catch { /* ignore */ }
        if (raw[0] === 0x1f && raw[1] === 0x8b) {
          try {
            const ds = new DecompressionStream("gzip");
            const stream = new Blob([raw]).stream().pipeThrough(ds);
            const buf = new Uint8Array(await new Response(stream).arrayBuffer());
            const txt = new TextDecoder().decode(buf);
            if (txt && txt.includes("service")) return txt;
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
    return null;
  }

  async function tryFetchCandidFromTmpHack(canisterId: Principal): Promise<string | null> {
    try {
      // Minimal Candid empty arg: DIDL\x00\x00
      const empty = new Uint8Array([0x44, 0x49, 0x44, 0x4c, 0x00, 0x00]);
      const res = await agent.query(canisterId, { methodName: "__get_candid_interface_tmp_hack", arg: empty });
      // Response is CBOR with either replied/rejected; use internal polling util to parse quickly is complex.
      // However agent.query returns a QueryResponse with certificate-less body parsing handled upstream in agent.
      // The agent returns an object: { ok, status, responseBodyBytes }. We cannot rely on types here in Deno compiled.
      // Instead, try to decode candid as text using candid IDL decode utilities is overkill. The method returns text, so
      // we can decode raw reply bytes as Candid: it's a candid single Text -> reply arg bytes contain UTF-8 string.
      // The reply bytes are exposed via res.reply.arg in some internals, but here we get a raw envelope. Simpler approach:
      // Use pollForResponse/gt strategy would require request id. Keep it simple: use call via read_state polling helpers
      // would complicate. So instead, try HTTP metadata endpoint as last resort.
    } catch (_e) { /* ignore */ }
    // Last resort: boundary node metadata HTTP (may be unavailable)
    try {
      const url = new URL(`/api/v2/canister/${canisterId.toText()}/metadata/candid:service`, host);
      const resp = await fetch(url.toString());
      if (resp.ok) {
        const buf = new Uint8Array(await resp.arrayBuffer());
        try {
          const txt = new TextDecoder().decode(buf);
          if (txt && txt.includes("service")) return txt;
        } catch (_e) { /* ignore */ }
        if (buf[0] === 0x1f && buf[1] === 0x8b) {
          try {
            const ds = new DecompressionStream("gzip");
            const stream = new Blob([buf]).stream().pipeThrough(ds);
            const gunz = new Uint8Array(await new Response(stream).arrayBuffer());
            const txt = new TextDecoder().decode(gunz);
            if (txt && txt.includes("service")) return txt;
          } catch (_e) { /* ignore */ }
        }
      }
    } catch (_e) { /* ignore */ }
    return null;
  }

  return async (canId: string) => {
    const principal = Principal.fromText(canId);
    let did: string | null = await tryFetchCandidFromMetadata(principal);
    if (!did) did = await tryFetchCandidFromTmpHack(principal);
    if (!did) throw new Error("Candid metadata not found");

    const js = await didToJs(agent, did);
    const idlFactory = evalIdlFactory(js);
    const rawActor = Actor.createActor(idlFactory, { agent, canisterId: canId });
    const wrapped = wrapActor(rawActor, idlFactory);
    (wrapped as any).$principal = principal;
    (wrapped as any).$idlFactory = idlFactory;
    return wrapped;
  };
}

// (no self-test; this file is a library module)
