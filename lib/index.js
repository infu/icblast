import { ic, hashIdentity, toState, explainMethodSchema } from './icb_node.js';
import { loadSchemaCache, saveSchemaCache } from './cache.js';
import Ajv2020 from 'ajv/dist/2020.js';

async function getActor(canister, { host, id = 0, debug = false } = {}) {
  const iden = await hashIdentity(id);
  const getIC = await ic({ identity: iden, host, idNum: id, debug });
  return await getIC(canister);
}

async function principal(id = 0) {
  const iden = await hashIdentity(id);
  return iden.getPrincipal().toText();
}

async function scan(canister, opts = {}) {
  const actor = await getActor(canister, opts);
  const { IDL } = await import('@dfinity/candid');
  const service = actor.$idlFactory({ IDL });
  const methods = [...service._fields].map(([n, f]) => {
    const ann = (f && f.annotations) || [];
    let kind = 'update';
    if (ann.includes('query') || ann.includes('composite_query')) kind = 'query';
    else if (ann.includes('oneway')) kind = 'oneway';
    return { name: n, kind };
  });
  // refresh schema cache best-effort
  try {
    const schemaMap = {};
    for (const m of methods) {
      try { schemaMap[m.name] = explainMethodSchema(actor, m.name); } catch {}
    }
    await saveSchemaCache(canister, { canister, updatedAt: new Date().toISOString(), methods: schemaMap });
  } catch {}
  return methods;
}

async function schema(canister, method, opts = {}) {
  const cache = await loadSchemaCache(canister);
  if (cache?.methods?.[method]) return cache.methods[method];
  const actor = await getActor(canister, opts);
  return explainMethodSchema(actor, method);
}

async function call(canister, method, args = [], opts = {}) {
  const actor = await getActor(canister, opts);
  const fn = actor[method];
  if (typeof fn !== 'function') throw new Error(`Method not found: ${method}`);
  const out = await fn(...args);
  return toState(out);
}

async function validate(canister, method, args = [], opts = {}) {
  const actor = await getActor(canister, opts);
  const cache = await loadSchemaCache(canister);
  const sch = cache?.methods?.[method] ?? explainMethodSchema(actor, method);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const vin = ajv.compile(sch.input);
  const inOk = vin(args);
  if (!inOk) return { ok: false, inputValid: false, outputValid: false, errors: vin.errors };
  const fn = actor[method];
  if (typeof fn !== 'function') throw new Error(`Method not found: ${method}`);
  const out = await fn(...args);
  const outNorm = toState(out);
  const vout = ajv.compile(sch.output);
  const outOk = vout(outNorm);
  return { ok: outOk, inputValid: true, outputValid: outOk, errors: outOk ? undefined : vout.errors };
}

const api = {
  principal,
  scan,
  schema,
  call,
  validate,
  ic: async (opts = {}) => {
    const iden = await hashIdentity(opts.id ?? 0);
    return ic({ identity: iden, host: opts.host, idNum: opts.id ?? 0, debug: opts.debug });
  },
  // re-export useful utilities
  hashIdentity,
  toState,
  explainMethodSchema,
};

export default api;

