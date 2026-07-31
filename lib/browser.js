import { Actor, CanisterStatus, HttpAgent } from "@dfinity/agent";
import { AuthClient } from "@dfinity/auth-client";
import { IDL } from "@dfinity/candid";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { decodeIcrcAccount, encodeIcrcAccount } from "@dfinity/ledger-icrc";
import { Principal } from "@dfinity/principal";
import Ajv2020 from "ajv/dist/2020.js";

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
        const key = Object.keys(value)[0];
        return { [key]: await rec(key, value[key], type.val[key]) };
      }
      if (type instanceof xRecord) {
        if (isIcrcAccountDef(type)) {
          if (typeof value === "string") {
            const match = value.match(/^(\d+)(?:-(\d+))?$/);
            if (match) {
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
        for (const key in type.val) {
          const optional = type.val[key] instanceof xOpt;
          if (!Object.prototype.hasOwnProperty.call(value, key)) {
            if (!optional) throw `${key} (missing)`;
            out[key] = [];
          } else {
            out[key] = await rec(key, value[key], type.val[key]);
          }
        }
        return out;
      }
      if (type === xPrincipal && typeof value === "number") {
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

export function convertBack(input, def) {
  function rec(path, value, type) {
    try {
      if (type instanceof xOpt) {
        if (value === null) return null;
        if (Array.isArray(value) && value.length === 0) return undefined;
        return rec("(opt)", Array.isArray(value) ? value[0] : value, type.val);
      }
      if (type instanceof xVec) {
        if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
        if (!Array.isArray(value)) throw "(array expected)";
        return value.map((item, index) => rec(index, item, type.val));
      }
      if (type instanceof xTuple) {
        if (!Array.isArray(value)) throw "(array expected)";
        return value.map((item, index) => rec(index, item, type.val[index]));
      }
      if (type instanceof xVariant) {
        const key = Object.keys(value)[0];
        return { [key]: rec(key, value[key], type.val[key]) };
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
        for (const key in type.val) {
          const optional = type.val[key] instanceof xOpt;
          if (!Object.prototype.hasOwnProperty.call(value, key)) {
            if (!optional) throw `${key} (missing)`;
          } else {
            const converted = rec(key, value[key], type.val[key]);
            if (converted !== undefined) out[key] = converted;
          }
        }
        return out;
      }
      return value;
    } catch (error) {
      throw `${path}.${error}`;
    }
  }

  if (!def || def.length === 0) return null;
  if (def.length > 1) {
    if (!Array.isArray(input) || input.length !== def.length) {
      throw new Error(`Expected ${def.length} Candid return values`);
    }
    return toState(
      input.map((value, index) => rec(`ret${index}`, value, def[index]))
    );
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
    if (value instanceof Principal || value.constructor?.name === "Principal") {
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

function wrapActor(actor, idlFactory, ctx = {}) {
  const xdl = explainer(idlFactory);
  const wrapped = {};
  for (const key in actor) {
    if (typeof actor[key] === "function") {
      wrapped[key] = async (...args) => {
        const processed = await convert(args, xdl[key].input, ctx);
        const result = await actor[key](...processed);
        return convertBack(result, xdl[key].output, ctx);
      };
    } else {
      wrapped[key] = actor[key];
    }
  }
  addRawCandidHelpers(wrapped, idlFactory, xdl, ctx);
  return wrapped;
}

function addRawCandidHelpers(actor, idlFactory, xdl, ctx = {}) {
  const service = idlFactory({ IDL });
  for (const [method, func] of service._fields) {
    actor[`${method}$`] = async (...args) => [
      ...IDL.encode(func.argTypes, await convert(args, xdl[method].input, ctx)),
    ];
    actor[`$${method}`] = (bytes) =>
      convertBack(
        IDL.decode(func.retTypes, Uint8Array.from(bytes))[0],
        xdl[method].output,
        ctx
      );
  }
}

export const walletCall =
  (wallet, actor, method, cycles = 0) =>
  async (...args) => {
    const encoded = await actor[`${method}$`](...args);
    const response = await wallet.wallet_call({
      args: encoded,
      cycles,
      method_name: method,
      canister: actor.$principal,
    });
    return actor[`$${method}`](response.return);
  };

export const walletProxy = (wallet, actor, cycles = 0) => {
  const proxy = {};
  for (const key in actor) {
    proxy[key] =
      typeof actor[key] === "function" ? walletCall(wallet, actor, key, cycles) : actor[key];
  }
  return proxy;
};

function isResultVariant(type) {
  return (
    type instanceof xVariant &&
    type.val &&
    typeof type.val === "object" &&
    Object.keys(type.val).length === 2 &&
    (Object.prototype.hasOwnProperty.call(type.val, "Ok") ||
      Object.prototype.hasOwnProperty.call(type.val, "ok")) &&
    (Object.prototype.hasOwnProperty.call(type.val, "Err") ||
      Object.prototype.hasOwnProperty.call(type.val, "err"))
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
    !Object.prototype.hasOwnProperty.call(value, "subaccount")
  ) {
    return false;
  }
  const hasOwner =
    Object.prototype.hasOwnProperty.call(value, "owner") && value.owner === xPrincipal;
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
  return out;
}

function schemaOfType(type) {
  if (type === xText) return { type: "string" };
  if (type === xBool) return { type: "boolean" };
  if (type === xFloat) return { type: "number" };
  if (type === xPrincipal) {
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
    return { type: "array", items: schemaOfType(type.val) };
  }
  if (type instanceof xTuple) {
    const items = type.val.map(schemaOfType);
    return {
      type: "array",
      prefixItems: items,
      minItems: items.length,
      maxItems: items.length,
    };
  }
  if (type instanceof xRecord) {
    if (isIcrcAccountDef(type)) {
      return { type: "string", description: "ICRC-1 account text or id[-sub] shorthand" };
    }

    const properties = {};
    const required = [];
    for (const key of Object.keys(type.val)) {
      const inner = type.val[key];
      const optional = inner instanceof xOpt;
      properties[key] = schemaOfType(optional ? inner.val : inner);
      if (!optional) required.push(key);
    }
    const schema = { type: "object", properties, additionalProperties: false };
    if (required.length) schema.required = required;
    return schema;
  }
  if (type instanceof xOpt) {
    return { anyOf: [schemaOfType(type.val), { type: "null" }] };
  }
  if (type instanceof xVariant) {
    return {
      oneOf: Object.keys(type.val).map((key) => ({
        type: "object",
        properties: { [key]: schemaOfType(type.val[key]) },
        required: [key],
        additionalProperties: false,
      })),
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

function schemaFromSignature(signature) {
  const inputPrefix = signature.input.map(schemaOfType);
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

  let output;
  if (signature.output.length === 0) {
    output = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "null",
    };
  } else if (signature.output.length === 1) {
    const type = signature.output[0];
    const okType = type.val?.Ok ?? type.val?.ok;
    output = isResultVariant(type) ? schemaOfType(okType) : schemaOfType(type);
    output.$schema = "https://json-schema.org/draft/2020-12/schema";
  } else {
    output = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "array",
      prefixItems: signature.output.map(schemaOfType),
      minItems: signature.output.length,
      maxItems: signature.output.length,
    };
  }

  return { input, output };
}

export function explainMethodSchema(source, method) {
  const xdl = explainer(idlFactoryFromSource(source));
  const signature = xdl[method];
  if (!signature) throw new Error(`method not found: ${method}`);
  return schemaFromSignature(signature);
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

const idlPattern = /\({ IDL }\)\s*=>\s*{[\s\S]*?(?=export const|$)/;

function evalIdlFactory(js) {
  const match = js.match(idlPattern);
  if (!match) throw new Error("Unable to locate generated idlFactory");
  return eval(match[0]);
}

async function didToJs(did) {
  const agent = await HttpAgent.create({ host: "https://icp0.io" });
  const pg = Actor.createActor(pgIdlFactory, {
    agent,
    canisterId: "a4gq6-oaaaa-aaaab-qaa4q-cai",
  });
  const result = await pg.did_to_js(did);
  const js = Array.isArray(result) ? result[0] : result;
  if (!js) throw new Error("Unable to generate JS bindings from Candid");
  return js;
}

async function idlFromCandid(did) {
  return evalIdlFactory(await didToJs(did));
}

async function discoverCandid(agent, canisterId, host, local) {
  try {
    const status = await CanisterStatus.request({
      agent,
      canisterId: Principal.fromText(canisterId),
      paths: ["candid"],
    });
    const candid = status.get("candid");
    if (typeof candid === "string" && candid.trim()) return candid;
  } catch {}

  const ifhackAgent = await HttpAgent.create({ host });
  if (local) await ifhackAgent.fetchRootKey();
  const ifhack = Actor.createActor(ifhackIdlFactory, {
    agent: ifhackAgent,
    canisterId,
  });
  return ifhack.__get_candid_interface_tmp_hack();
}

export const icblast = ({
  local = false,
  local_host = false,
  identity = undefined,
  id = undefined,
  idNum = 0,
  debug = false,
  secret = undefined,
  agentOptions = {},
  actorOptions = {},
} = {}) => {
  const bindings = {};
  const host = local ? local_host || "http://localhost:4943/" : "https://icp0.io";
  const effectiveIdNum = id ?? idNum;
  const selfPrincipal = identity?.getPrincipal ? identity.getPrincipal() : undefined;
  const ctx = { idNum: effectiveIdNum, selfPrincipal, debug, secret };
  const agentReady = HttpAgent.create({
    host,
    identity,
    ...agentOptions,
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
        idlFactory = await idlFromCandid(await fetch(preset).then((res) => res.text()));
      } else if (typeof preset === "string" && preset.length > 30) {
        idlFactory = preset.includes("idlFactory")
          ? evalIdlFactory(preset)
          : await idlFromCandid(preset);
      } else {
        idlFactory = presetIdl(preset);
      }
    } else {
      const agent = await agentReady;
      idlFactory = await idlFromCandid(
        await discoverCandid(agent, canisterId, host, local)
      );
    }

    const agent = await agentReady;
    const actor = Actor.createActor(idlFactory, {
      agent,
      canisterId,
      ...actorOptions,
    });
    const wrapped = wrapActor(actor, idlFactory, ctx);
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
    local,
    local_host: host,
    identity: options.identity,
    id: options.id,
    idNum: options.idNum,
    debug: options.debug,
    secret: options.secret,
    agentOptions: options.agentOptions,
    actorOptions: options.actorOptions,
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
  return explainMethodSchema(await actorFor(canister, options), method);
}

export async function call(canister, method, args = [], options = {}) {
  const actor = await actorFor(canister, options);
  const fn = actor[method];
  if (typeof fn !== "function") throw new Error(`Method not found: ${method}`);
  return toState(await fn(...args));
}

export async function validate(canister, method, args = [], options = {}) {
  const actor = await actorFor(canister, options);
  const methodSchema = explainMethodSchema(actor, method);
  const ajv = new Ajv2020({ allErrors: true, strict: false });

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

  const fn = actor[method];
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
