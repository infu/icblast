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
- Deterministic Ed25519 identity derived from a passphrase

## Install
- Global (from npm registry): `npm i -g icblast` (once published)
- Global (from a local checkout): `npm i -g .`

This installs a `blast` executable on your PATH. You can also run it via `npx icblast` once published.

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
- Identity: derived deterministically from a local secret + an `--id` number.
  - The CLI stores a random hex secret in a config file (Linux: `~/.config/blast/secret`; macOS: `~/Library/Application Support/blast/secret`; Windows: `%APPDATA%/blast/secret`).
  - You pass `--id <n>` where `n` is 0–65535. Blast takes a slice of the secret based on `n`, concatenates `n`, hashes with SHA-256, and derives an Ed25519 identity from that hash.
  - If `--id` is omitted, `0` is used.
- Host: defaults to `https://icp0.io`; override with `--host`.

Security
- The passphrase is used to deterministically derive a key; treat it like a secret.
- Prefer setting it via env var in shells/history-safe ways: `ICB_ID=$(pass show my/secret) ./blast ...`.

## How it works (high level)
- Discovers Candid via `CanisterStatus` metadata, with fallbacks.
- Uses an embedded WASM (`didc_wasm_pkg/didc_rust_bg.bin`) and JS glue to compile Candid to JS locally, extract an `idlFactory`, and wrap an actor with light input/output converters.
- JSON Schema is synthesized from the Candid types and validated via Ajv 2020.

## Building
- Prerequisite: Node.js 18+
- Local package tarball: `npm pack`

## CI and Releases
- CI packs the npm tarball on tag pushes matching `v*`.
- The `*.tgz` tarball is attached to the GitHub Release automatically with generated notes.

Release flow
1. `git tag v0.1.0 && git push origin v0.1.0`
2. GitHub Actions builds matrix binaries and publishes them to the `v0.1.0` release.

## Development
- Run the CLI locally: `node bin/blast.js ...`
- Useful env vars: `ICB_ID` or `HASH_SEED` for identity; `HTTPS_PROXY` if your network requires it.

## Limitations
- Minimal actor wrapping; complex types are mapped best-effort.
- Some canisters may not expose Candid metadata; in such cases discovery can fail.
