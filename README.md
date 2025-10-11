# Blast (icblast)

<img width="219" height="246" alt="Screenshot from 2025-10-11 15-16-15" src="https://github.com/user-attachments/assets/f16034f3-ddd4-415d-bb10-fe82958a8bcd" />

Explore Internet Computer canisters from your terminal at velocity.

Blast is a small Deno-powered CLI that discovers a canister’s Candid interface on the fly, lets you inspect methods, call them with JSON, and validate I/O against generated JSON Schemas. Binaries are produced via `deno compile` and shipped for Linux and macOS.

## Features
- Discover Candid via canister metadata; compile to an `idlFactory` locally
- List methods and their kinds: query, update, or oneway
- Call methods with JSON arguments; normalized JSON output
- Generate JSON Schema for a method’s input/output
- Validate inputs and outputs using Ajv 2020
- Deterministic Ed25519 identity derived from a passphrase

## Install
- From Releases: download the binary for your OS from the repo’s Releases page (files are named like `blast-linux-x64`, `blast-macos-arm64`).
- From source (requires Deno 1.x):
  - `deno --version` should be 1.x
  - Build: `deno task build:blast`
  - Binary: `./dist/blast`

The build uses `deno compile` with embedded `didc_wasm_pkg/*` assets so no network fetch is needed at runtime for DID→JS compilation.

## Usage
```
blast scan <canister_id> [--host <url>] [--id <secret>]
blast call <canister_id> <method> [args_json] [--host <url>] [--id <secret>]
blast schema <canister_id> <method> [--host <url>] [--id <secret>]
blast validate <canister_id> <method> [args_json] [--host <url>] [--id <secret>]
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

## Identity and Host
- Identity: derived from a passphrase using SHA-256 → Ed25519.
  - Order of sources: `--id <secret>` flag, then `ICB_ID`, then `HASH_SEED`, else `"demo-pass"`.
- Host: defaults to `https://icp0.io`; override with `--host`.

Security
- The passphrase is used to deterministically derive a key; treat it like a secret.
- Prefer setting it via env var in shells/history-safe ways: `ICB_ID=$(pass show my/secret) ./blast ...`.

## How it works (high level)
- Discovers Candid via `CanisterStatus` metadata, with fallbacks.
- Uses an embedded WASM (`didc_wasm_pkg/didc_rust_bg.bin`) and JS glue to compile Candid to JS locally, extract an `idlFactory`, and wrap an actor with light input/output converters.
- JSON Schema is synthesized from the Candid types and validated via Ajv 2020.

## Building
- Prerequisite: Deno 1.x
- Build command: `deno task build:blast`
- Output: `dist/blast`

The `deno.json` task ensures the `didc_wasm_pkg` assets are embedded:
```
"deno compile ... --include=didc_wasm_pkg/didc_rust.js --include=didc_wasm_pkg/didc_rust_bg.bin -o dist/blast src/icb_cli.ts"
```

## CI and Releases
- CI builds on Linux and macOS for tag pushes matching `v*`.
- Artifacts are attached to a GitHub Release automatically with generated notes.

Release flow
1. `git tag v0.1.0 && git push origin v0.1.0`
2. GitHub Actions builds matrix binaries and publishes them to the `v0.1.0` release.

## Development
- Run without compiling: `deno run -A src/icb_cli.ts ...`
- Useful env vars: `ICB_ID` or `HASH_SEED` for identity; `HTTPS_PROXY` if your network requires it.

## Limitations
- Minimal actor wrapping; complex types are mapped best-effort.
- Some canisters may not expose Candid metadata; in such cases discovery can fail.

---

Made with Deno; binaries include local DID→JS compilation via embedded WASM for portability.
