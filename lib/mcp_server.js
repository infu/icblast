import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import os from "node:os";
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { ic, hashIdentity, toState, explainMethodSchema } from "./icb_node.js";

function cacheBaseDir() {
  const home = os.homedir();
  if (process.platform === "darwin") return path.join(home, "Library", "Caches", "blast");
  const xdg = process.env.XDG_CACHE_HOME || path.join(home, ".cache");
  return path.join(xdg, "blast");
}
function schemaCachePath(canisterId) {
  return path.join(cacheBaseDir(), "schemas", `${canisterId}.json`);
}
async function loadSchemaCache(canisterId) {
  try { return JSON.parse(await readFile(schemaCachePath(canisterId), "utf8")); } catch { return null; }
}
async function saveSchemaCache(canisterId, payload) {
  const p = schemaCachePath(canisterId);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(payload, null, 2), "utf8");
}

async function getActor(canId, { host, idNum }) {
  const id = await hashIdentity(idNum ?? 0);
  const getIC = await ic({ identity: id, host, idNum, debug: false });
  return await getIC(canId);
}

export async function startMcpServer() {
  const mcpServer = new McpServer({ name: "icblast", version: "0.1.0" });

  // principal tool
  mcpServer.registerTool(
    'principal',
    {
      description: 'Return principal text for an id (0-65535).',
      inputSchema: { id: z.number().int().nonnegative().max(65535).optional() },
    },
    async ({ id }) => {
      const ident = await hashIdentity(id ?? 0);
      return { content: [{ type: 'text', text: ident.getPrincipal().toText() }] };
    }
  );

  // scan tool
  mcpServer.registerTool(
    'scan',
    {
      description: 'List methods and kinds for a canister. Tip: for local replicas set host to http://localhost:8080',
      inputSchema: { canister: z.string(), host: z.string().optional(), id: z.number().int().nonnegative().max(65535).optional() },
    },
    async ({ canister, host, id }) => {
      const actor = await getActor(canister, { host, idNum: id });
      const { IDL } = await import("@dfinity/candid");
      const service = actor.$idlFactory({ IDL });
      const methods = [...service._fields].map(([n, f]) => {
        const ann = (f && f.annotations) || [];
        let kind = "update";
        if (ann.includes("query") || ann.includes("composite_query")) kind = "query";
        else if (ann.includes("oneway")) kind = "oneway";
        return { name: n, kind };
      });
      // refresh cache
      try {
        const schemaMap = {};
        for (const m of methods) {
          try { schemaMap[m.name] = explainMethodSchema(actor, m.name); } catch {}
        }
        await saveSchemaCache(canister, { canister, updatedAt: new Date().toISOString(), methods: schemaMap });
      } catch {}
      const text = methods.map((m) => `${m.name} ${m.kind}`).join("\n");
      return { content: [{ type: 'text', text }] };
    }
  );

  // schema tool
  mcpServer.registerTool(
    'schema',
    {
      description: 'Return JSON schema for a method (uses cache if available).',
      inputSchema: { canister: z.string(), method: z.string(), host: z.string().optional(), id: z.number().int().nonnegative().max(65535).optional() },
    },
    async ({ canister, method, host, id }) => {
      const cache = await loadSchemaCache(canister);
      const schema = cache?.methods?.[method] ?? explainMethodSchema(await getActor(canister, { host, idNum: id ?? 0 }), method);
      return { content: [{ type: 'text', text: `schema ${canister}.${method}` }], structuredContent: schema };
    }
  );

  // call tool
  mcpServer.registerTool(
    'call',
    {
      description: 'Call a method with JSON args (array).',
      inputSchema: { canister: z.string(), method: z.string(), args: z.any().optional(), host: z.string().optional(), id: z.number().int().nonnegative().max(65535).optional() },
    },
    async ({ canister, method, args, host, id }) => {
      const actor = await getActor(canister, { host, idNum: id ?? 0 });
      const fn = actor[method];
      if (typeof fn !== 'function') throw new Error(`Method not found: ${method}`);
      const arr = Array.isArray(args) ? args : args == null ? [] : (() => { throw new Error('args must be array'); })();
      const out = await fn(...arr);
      const json = toState(out);
      return { content: [{ type: 'text', text: 'ok' }], structuredContent: { result: json } };
    }
  );

  // validate tool
  mcpServer.registerTool(
    'validate',
    {
      description: 'Validate I/O of a method using cached schema if available.',
      inputSchema: { canister: z.string(), method: z.string(), args: z.any().optional(), host: z.string().optional(), id: z.number().int().nonnegative().max(65535).optional() },
    },
    async ({ canister, method, args, host, id }) => {
      const actor = await getActor(canister, { host, idNum: id ?? 0 });
      const cache = await loadSchemaCache(canister);
      const schema = cache?.methods?.[method] ?? explainMethodSchema(actor, method);
      const Ajv2020 = (await import('ajv/dist/2020.js')).default;
      const ajv = new Ajv2020({ allErrors: true, strict: false });
      const arr = Array.isArray(args) ? args : args == null ? [] : (() => { throw new Error('args must be array'); })();
      const vin = ajv.compile(schema.input);
      const inOk = vin(arr);
      if (!inOk) return { content: [{ type: 'text', text: 'input invalid' }], structuredContent: { ok: false, inputValid: false, errors: vin.errors } };
      const fn = actor[method];
      if (typeof fn !== 'function') throw new Error(`Method not found: ${method}`);
      const out = await fn(...arr);
      const outNorm = toState(out);
      const vout = ajv.compile(schema.output);
      const outOk = vout(outNorm);
      return { content: [{ type: 'text', text: outOk ? 'ok' : 'output invalid' }], structuredContent: { ok: outOk, inputValid: true, outputValid: outOk, errors: outOk ? undefined : vout.errors } };
    }
  );

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}
