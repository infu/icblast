# Blast (icblast)

<img width="219" height="246" alt="Screenshot from 2025-10-11 15-16-15" src="https://github.com/user-attachments/assets/f16034f3-ddd4-415d-bb10-fe82958a8bcd" />

Explore Internet Computer canisters from your terminal at velocity.

Blast is a small Node.js CLI that discovers a canister’s Candid interface on the fly, lets you inspect methods, call them with JSON, and validate I/O against generated JSON Schemas. It’s distributed as an npm package with a global `blast` command.

## Features
- Discover Candid via canister metadata; compile to an `idlFactory` locally
- List methods and their kinds: query, update, or oneway
- Call methods with JSON arguments; normalized JSON output
- Generate JSON Schema for a method’s input/output
- Validate inputs and outputs using Ajv 2020
- Deterministic Ed25519 identity derived from a local secret + numeric id

## Install

Audit: https://chatgpt.com/share/68ebd325-f31c-8003-9556-9d7aeab49d6b

- Global (from npm registry): `npm i -g icblast` (once published)
- Global (from a local checkout): `npm i -g .`

This installs a `blast` executable on your PATH. You can also run it via `npx icblast` once published.

## Codex integration

Add to Codex config
```
[mcp_servers.blast]
command = "blast"
args = ["mcp"]
```

## CLI Usage

```
blast scan <canister_id> [--host <url>] [--id <0-65535>]
blast call <canister_id> <method> [args_json] [--host <url>] [--id <0-65535>]
blast schema <canister_id> <method> [--host <url>] [--id <0-65535>]
blast validate <canister_id> <method> [args_json] [--host <url>] [--id <0-65535>]
blast principal [--id <0-65535>]
blast mcp    # start MCP server on stdio
```

Examples
- List methods: `./blast scan togwv-zqaaa-aaaal-qr7aa-cai`
- Call with args: `./blast call r7inp-6aaaa-aaaaa-aaabq-cai config_get`
- Call with JSON: `./blast call r7... some_method '[{"foo":1}, 2, "bar"]'`
- Inspect schema: `./blast schema togwv-zqaaa-aaaal-qr7aa-cai icrc55_get_pylon_meta`
- Validate I/O: `./blast validate togwv-zqaaa-aaaal-qr7aa-cai icrc55_get_pylon_meta '[1,2,3]'`

Notes
- JSON arguments must be a JSON array; wrap single args too, e.g. `'[123]'`.
- Output is normalized for readability: bigints as strings, byte arrays as hex, etc.
- Principals: anywhere a Principal is expected, you can pass a number 0–65535.
  - `0` resolves to the current run’s principal (derived from `--id`), `n>0` resolves to principal for id `n`.
- ICRC‑1 accounts (input and output) are strings:
  - Pass full ICRC‑1 text (e.g., `"aaaaa-...-cai-<sub>"`) or the shorthand `"id[-sub]"`, where `sub` is a decimal encoded as a 32‑byte big‑endian subaccount.
  - Responses also show account records as ICRC‑1 text.

## Identity and Host
- Identity: derived deterministically from a local secret + an `--id` number.
  - On first run, Blast creates a random hex secret in (Linux) `~/.config/blast/secret` or (macOS) `~/Library/Application Support/blast/secret`.
  - You pass `--id <n>` where `n` is 0–65535. Blast takes a deterministic slice of the secret based on `n`, concatenates `n`, hashes with SHA‑256, and derives an Ed25519 identity from that hash. Omitted `--id` defaults to `0`.
- Host: defaults to `https://icp0.io`; override with `--host`.

Environment override
- Set `SECRET=<string>` (min 32 chars) to override the local secret file for identity derivation. Useful for ephemeral or CI contexts. If `SECRET` is present and shorter than 32 characters, Blast will error.

## How it works (high level)
- Discovers Candid via canister metadata (`CanisterStatus`) only.
- Uses an embedded WASM (`didc_wasm_pkg/didc_rust_bg.bin`) and JS glue to compile Candid to JS locally, extract an `idlFactory`, and wrap an actor with light input/output converters.
- JSON Schema is synthesized from the Candid types and validated via Ajv 2020.

## Schema Cache
- `scan` refreshes and writes a full schema cache per canister.
- `schema`/`validate` read from cache and only fall back to live generation if missing.
- Locations:
  - Linux: `~/.cache/blast/schemas/<canister>.json`
  - macOS: `~/Library/Caches/blast/schemas/<canister>.json`

## MCP Usage
- Start server: `blast mcp` (stdio transport). Tools exposed:
  - `principal({ id? })` → text principal
  - `scan({ canister, host?, id? })` → text list, refreshes schema cache
  - `schema({ canister, method, host?, id? })` → structuredContent: JSON schema
  - `call({ canister, method, args?, host?, id? })` → structuredContent: `{ result: ... }`
  - `validate({ canister, method, args?, host?, id? })` → structuredContent: `{ ok, inputValid, outputValid, errors? }`

- Example (Node MCP client using SDK):
```
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'blast', args: ['mcp'] });
const client = new Client({ name: 'demo', version: '0.0.0' });
await client.connect(transport);
const res = await client.callTool({ name: 'schema', arguments: { canister: 'f54if-eqaaa-aaaaq-aacea-cai', method: 'icrc1_balance_of' } });
console.log(res.structuredContent);
```

## Library Usage (import)
- ESM (Node 18+):
```
import icblast from 'icblast';

// Identity
const p = await icblast.principal(0);

// Discover + cache
const methods = await icblast.scan('f54if-eqaaa-aaaaq-aacea-cai', { id: 0 });

// Schemas (uses cache; falls back to live)
const sch = await icblast.schema('f54if-eqaaa-aaaaq-aacea-cai', 'icrc1_balance_of', { id: 0 });

// Calls (principal shorthand + ICRC-1 accounts supported)
const bal1 = await icblast.call('f54if-eqaaa-aaaaq-aacea-cai', 'icrc1_balance_of', ['0'], { id: 0 });
const acct = 'togwv-zqaaa-aaaal-qr7aa-cai-oq7ilwi.2e10e7b42023f667a1db51ff9c7c88f08fb9022d6453bf0c5b0696666e41f048';
const bal2 = await icblast.call('f54if-eqaaa-aaaaq-aacea-cai', 'icrc1_balance_of', [acct], { id: 0 });

// Validate I/O
const v = await icblast.validate('f54if-eqaaa-aaaaq-aacea-cai', 'icrc1_balance_of', ['0'], { id: 0 });
```

## Examples
- Query balance with shorthand account:
  - `blast call f54if-eqaaa-aaaaq-aacea-cai icrc1_balance_of '["0"]' --id 0`
- Query balance with full ICRC‑1 text account:
  - `blast call f54if-eqaaa-aaaaq-aacea-cai icrc1_balance_of '["togwv-zqaaa-aaaal-qr7aa-cai-oq7ilwi.2e10e7b42023f667a1db51ff9c7c88f08fb9022d6453bf0c5b0696666e41f048"]' --id 0`



## CI and Releases
- CI packs the npm tarball on tag pushes matching `v*` and attaches it to the GitHub Release.
  - Tag: `git tag v0.1.0 && git push origin v0.1.0`

## Development
- Run the CLI locally: `node bin/blast.js ...`
- Debug conversions: `--debug` flag or `BLAST_DEBUG=1`.

## Limitations
- Minimal actor wrapping; complex types are mapped best-effort.
- Some canisters may not expose Candid metadata; in such cases discovery can fail.
