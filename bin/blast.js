#!/usr/bin/env node

import pc from "picocolors";
import Ajv2020 from "ajv/dist/2020.js";
import { ic, hashIdentity, toState, explainMethodSchema } from "../lib/icb_node.js";

function usage() {
  const banner = `${pc.bold(pc.magenta("🛡️⚔️ Blast ⚔️🛡️"))}: ${pc.bold(pc.cyan("Explore the chain at terminal velocity."))}`;
  return `${banner}

Usage:
  blast scan <canister_id> ${pc.gray("[--host <url>] [--id <0-65535>]")}
  blast call <canister_id> <method> ${pc.gray("[args_json] [--host <url>] [--id <0-65535>]")}
  blast schema <canister_id> <method> ${pc.gray("[--host <url>] [--id <0-65535>]")}
  blast validate <canister_id> <method> ${pc.gray("[args_json] [--host <url>] [--id <0-65535>]")}
  blast principal ${pc.gray("[--id <0-65535>]")}
`;
}

function parseOptions(argv) {
  const opts = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--host" && i + 1 < argv.length) { opts.host = argv[++i]; continue; }
    if (a === "--id" && i + 1 < argv.length) { opts.id = argv[++i]; continue; }
    if (a === "--debug") { opts.debug = true; continue; }
    rest.push(a);
  }
  return { opts, rest };
}

function parseIdNumber(val) {
  if (val === undefined) return 0;
  const n = Number(val);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    throw new Error("--id must be an integer in [0,65535]");
  }
  return n;
}

async function getClient(host, idVal, debugFlag) {
  const idNum = parseIdNumber(idVal);
  const id = await hashIdentity(idNum);
  const debug = Boolean(process.env.BLAST_DEBUG) || Boolean(debugFlag);
  const getIC = await ic({ identity: id, host, idNum, debug });
  return getIC;
}

async function cmdList(canId, host, idSecret) {
  const getIC = await getClient(host, idSecret);
  const actor = await getIC(canId);
  if (!actor.$idlFactory) {
    console.error("No idlFactory found on actor");
    process.exit(2);
  }
  const service = actor.$idlFactory({ IDL: (await import("@dfinity/candid")).IDL });
  const methods = [...service._fields].map(([n, f]) => {
    const ann = (f && f.annotations) || [];
    let kind = "update";
    if (ann.includes("query") || ann.includes("composite_query")) kind = "query";
    else if (ann.includes("oneway")) kind = "oneway";
    return { name: n, kind };
  });
  for (const m of methods) {
    const nameCol = pc.bold(pc.cyan(m.name));
    const kindCol = m.kind === "query" ? pc.green("query") : m.kind === "oneway" ? pc.red("oneway") : pc.magenta("update");
    console.log(`${nameCol} ${kindCol}`);
  }
}

async function cmdCall(canId, method, argsJson, host, idSecret) {
  const getIC = await getClient(host, idSecret);
  const actor = await getIC(canId);
  const fn = actor[method];
  if (typeof fn !== "function") {
    console.error(`Method not found: ${method}`);
    process.exit(3);
  }
  let args = [];
  if (argsJson) {
    try { args = JSON.parse(argsJson); } catch (e) { console.error("Invalid JSON args:", e); process.exit(4); }
    if (!Array.isArray(args)) { console.error("args_json must be a JSON array"); process.exit(4); }
  }
  const out = await fn(...args);
  console.log(JSON.stringify(toState(out), null, 2));
}

async function cmdSchema(canId, method, host, idSecret) {
  const getIC = await getClient(host, idSecret);
  const actor = await getIC(canId);
  const schema = explainMethodSchema(actor, method);
  console.log(JSON.stringify(schema, null, 2));
}

async function cmdValidate(canId, method, argsJson, host, idSecret) {
  const getIC = await getClient(host, idSecret);
  const actor = await getIC(canId);
  const schema = explainMethodSchema(actor, method);
  const ajv = new Ajv2020({ allErrors: true, strict: false });

  let args = [];
  if (argsJson) {
    try { args = JSON.parse(argsJson); } catch (e) { console.error("Invalid JSON args:", e); process.exit(4); }
    if (!Array.isArray(args)) { console.error("args_json must be a JSON array"); process.exit(4); }
  }

  const vin = ajv.compile(schema.input);
  const inOk = vin(args);
  if (!inOk) { console.error("Input validation failed:", vin.errors); process.exit(5); }

  const fn = actor[method];
  if (typeof fn !== "function") { console.error(`Method not found: ${method}`); process.exit(3); }
  const out = await fn(...args);
  const outNorm = toState(out);

  const vout = ajv.compile(schema.output);
  const outOk = vout(outNorm);
  if (!outOk) { console.error("Output validation failed:", vout.errors); process.exit(6); }

  console.log(JSON.stringify({ ok: true, inputValid: true, outputValid: true }, null, 2));
}

async function main() {
  const { opts, rest } = parseOptions(process.argv.slice(2));
  const [cmd, ...params] = rest;
  try {
    switch (cmd) {
      case "help":
      case undefined:
        console.log(usage());
        break;
      case "principal": {
        const idNum = parseIdNumber(opts.id);
        const id = await hashIdentity(idNum);
        console.log(id.getPrincipal().toText());
        break;
      }
      case "scan":
        if (params.length < 1) { console.log(usage()); process.exit(1); }
        if (opts.debug) process.env.BLAST_DEBUG = "1";
        await cmdList(params[0], opts.host, opts.id);
        break;
      case "call":
        if (params.length < 2) { console.log(usage()); process.exit(1); }
        if (opts.debug) process.env.BLAST_DEBUG = "1";
        await cmdCall(params[0], params[1], params[2], opts.host, opts.id);
        break;
      case "schema":
        if (params.length < 2) { console.log(usage()); process.exit(1); }
        if (opts.debug) process.env.BLAST_DEBUG = "1";
        await cmdSchema(params[0], params[1], opts.host, opts.id);
        break;
      case "validate":
        if (params.length < 2) { console.log(usage()); process.exit(1); }
        if (opts.debug) process.env.BLAST_DEBUG = "1";
        await cmdValidate(params[0], params[1], params[2], opts.host, opts.id);
        break;
      default:
        console.log(usage());
        process.exit(1);
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

main();
