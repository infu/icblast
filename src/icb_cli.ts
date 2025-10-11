// Simple CLI for the icb library
// Build: deno task build:blast
// Run examples:
//   ./blast scan togwv-zqaaa-aaaal-qr7aa-cai
//   ./blast call togwv-zqaaa-aaaal-qr7aa-cai icrc55_get_pylon_meta
//   ./blast call <canister> <method> '[arg1, {"k":"v"}]' --id "my-secret"

import { ic, hashIdentity, toState, explainMethodSchema } from "./icb_deno.ts";
import { bold, cyan, magenta, green, red, gray } from "https://deno.land/std@0.224.0/fmt/colors.ts";
import Ajv2020 from "https://esm.sh/ajv@8.12.0/dist/2020?target=deno";
import { IDL } from "https://esm.sh/@dfinity/candid@3.2.3";

function usage(): string {
  const banner = `${bold(magenta("🛡️⚔️ Blast ⚔️🛡️"))}: ${bold(cyan("Explore the chain at terminal velocity."))}`;
  return `${banner}

Usage:
  blast scan <canister_id> ${gray("[--host <url>] [--id <secret>]")}
  blast call <canister_id> <method> ${gray("[args_json] [--host <url>] [--id <secret>]")}
  blast schema <canister_id> <method> ${gray("[--host <url>] [--id <secret>]")}
  blast validate <canister_id> <method> ${gray("[args_json] [--host <url>] [--id <secret>]")}

Examples:
${gray("  blast scan togwv-zqaaa-aaaal-qr7aa-cai\n  blast call togwv-zqaaa-aaaal-qr7aa-cai icrc55_get_pylon_meta\n  blast call r7inp-6aaaa-aaaaa-aaabq-cai config_get\n  blast call r7... some_method '[{\"foo\":1}, 2, \"bar\"]'\n  blast schema togwv-zqaaa-aaaal-qr7aa-cai icrc55_get_pylon_meta\n  blast validate togwv-zqaaa-aaaal-qr7aa-cai icrc55_get_pylon_meta")}
`;
}

function parseOptions(argv: string[]) {
  const opts: Record<string, string | boolean> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--host" && i + 1 < argv.length) { opts.host = argv[++i]; continue; }
    if (a === "--id" && i + 1 < argv.length) { (opts as any).id = argv[++i]; continue; }
    // no extra flags
        rest.push(a);
  }
  return { opts, rest } as const;
}

async function getClient(host?: string, idSecret?: string) {
  const pass = idSecret ?? Deno.env.get("ICB_ID") ?? Deno.env.get("HASH_SEED") ?? "demo-pass";
  const id = await hashIdentity(pass);
  const getIC = await ic({ identity: id, host });
  return getIC;
}

async function cmdList(canId: string, host?: string, idSecret?: string) {
  const getIC = await getClient(host, idSecret);
  const actor = await getIC(canId);
  if (!(actor as any).$idlFactory) {
    console.error("No idlFactory found on actor");
    Deno.exit(2);
  }
  const service = (actor as any).$idlFactory({ IDL });
  const methods = [...service._fields].map(([n, f]: [string, any]) => {
    const ann: string[] = (f && f.annotations) || [];
    let kind: "query" | "update" | "oneway" = "update";
    if (ann.includes("query") || ann.includes("composite_query")) kind = "query";
    else if (ann.includes("oneway")) kind = "oneway";
    return { name: n, kind };
  });
  for (const m of methods) {
    const nameCol = bold(cyan(m.name));
    const kindCol = m.kind === "query"
      ? green("query")
      : m.kind === "oneway"
      ? red("oneway")
      : magenta("update"); // update = pink (magenta)
    console.log(`${nameCol} ${kindCol}`);
  }
}

async function cmdCall(canId: string, method: string, argsJson?: string, host?: string, idSecret?: string) {
  const getIC = await getClient(host, idSecret);
  const actor = await getIC(canId);
  const fn = (actor as any)[method];
  if (typeof fn !== "function") {
    console.error(`Method not found: ${method}`);
    Deno.exit(3);
  }
  let args: any[] = [];
  if (argsJson) {
    try { args = JSON.parse(argsJson); } catch (e) { console.error("Invalid JSON args:", e); Deno.exit(4); }
    if (!Array.isArray(args)) { console.error("args_json must be a JSON array"); Deno.exit(4); }
  }
  const out = await fn(...args);
  console.log(JSON.stringify(toState(out), null, 2));
}

async function cmdSchema(canId: string, method: string, host?: string, idSecret?: string) {
  const getIC = await getClient(host, idSecret);
  const actor = await getIC(canId);
  const schema = explainMethodSchema(actor, method);
  console.log(JSON.stringify(schema, null, 2));
}

async function cmdValidate(canId: string, method: string, argsJson?: string, host?: string, idSecret?: string) {
  const getIC = await getClient(host, idSecret);
  const actor = await getIC(canId);
  const schema = explainMethodSchema(actor, method);
  const ajv = new Ajv2020({ allErrors: true, strict: false });

  let args: any[] = [];
  if (argsJson) {
    try { args = JSON.parse(argsJson); } catch (e) { console.error("Invalid JSON args:", e); Deno.exit(4); }
    if (!Array.isArray(args)) { console.error("args_json must be a JSON array"); Deno.exit(4); }
  }

  const vin = ajv.compile(schema.input as any);
  const inOk = vin(args);
  if (!inOk) {
    console.error("Input validation failed:", vin.errors);
    Deno.exit(5);
  }

  const fn = (actor as any)[method];
  if (typeof fn !== "function") { console.error(`Method not found: ${method}`); Deno.exit(3); }
  const out = await fn(...args);
  const outNorm = toState(out);

  const vout = ajv.compile(schema.output as any);
  const outOk = vout(outNorm);
  if (!outOk) {
    console.error("Output validation failed:", vout.errors);
    Deno.exit(6);
  }

  console.log(JSON.stringify({ ok: true, inputValid: true, outputValid: true }, null, 2));
}

// duckdb-related functionality removed

if (import.meta.main) {
  const { opts, rest } = parseOptions(Deno.args);
  const [cmd, ...params] = rest;
  try {
    switch (cmd) {
      case "help":
      case undefined:
        console.log(usage());
        break;
      case "scan":
        if (params.length < 1) { console.log(usage()); Deno.exit(1); }
        await cmdList(params[0], opts.host as string | undefined, (opts as any).id as string | undefined);
        break;
      case "call":
        if (params.length < 2) { console.log(usage()); Deno.exit(1); }
        await cmdCall(params[0], params[1], params[2], opts.host as string | undefined, (opts as any).id as string | undefined);
        break;
      case "schema":
        if (params.length < 2) { console.log(usage()); Deno.exit(1); }
        await cmdSchema(params[0], params[1], opts.host as string | undefined, (opts as any).id as string | undefined);
        break;
      case "validate":
        if (params.length < 2) { console.log(usage()); Deno.exit(1); }
        await cmdValidate(params[0], params[1], params[2], opts.host as string | undefined, (opts as any).id as string | undefined);
        break;
      default:
        console.log(usage());
        Deno.exit(1);
    }
  } catch (e) {
    console.error(e);
    Deno.exit(1);
  }
}
