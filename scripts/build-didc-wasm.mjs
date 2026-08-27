import { execFileSync } from "node:child_process";
import {
  access,
  chmod,
  copyFile,
  mkdtemp,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CARGO_ROOT = path.join(ROOT, "didc_rust");
const OUTPUT_ROOT = path.join(ROOT, "didc_wasm_pkg");
const PREVIOUS_OUTPUT_ROOT = path.join(ROOT, ".didc-wasm-previous");
const RUST_TOOLCHAIN = "1.89.0";
const RUST_VERSION = "rustc 1.89.0 (29483883e 2025-08-04)";
const WASM_BINDGEN_VERSION = "wasm-bindgen 0.2.100";
const checkOnly = process.argv.slice(2).includes("--check");

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
    ...options,
  }).trim();
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

if (!(await exists(OUTPUT_ROOT)) && (await exists(PREVIOUS_OUTPUT_ROOT))) {
  await rename(PREVIOUS_OUTPUT_ROOT, OUTPUT_ROOT);
}

const rustc = run("rustup", ["which", "--toolchain", RUST_TOOLCHAIN, "rustc"]);
const rustdoc = run("rustup", ["which", "--toolchain", RUST_TOOLCHAIN, "rustdoc"]);
const cargo = run("rustup", ["which", "--toolchain", RUST_TOOLCHAIN, "cargo"]);
const rustVersion = run(rustc, ["--version"]);
if (rustVersion !== RUST_VERSION) {
  throw new Error(`Expected ${RUST_VERSION}, got ${rustVersion}`);
}

const wasmBindgen = process.env.ICBLAST_WASM_BINDGEN ?? "wasm-bindgen";
const wasmBindgenVersion = run(wasmBindgen, ["--version"]);
if (wasmBindgenVersion !== WASM_BINDGEN_VERSION) {
  throw new Error(
    `Expected ${WASM_BINDGEN_VERSION}, got ${wasmBindgenVersion}`,
  );
}

const buildRoot = await mkdtemp(path.join(tmpdir(), "icblast-didc-build-"));
let nextOutputRoot;
try {
  const cargoHome = path.resolve(
    process.env.CARGO_HOME ?? path.join(homedir(), ".cargo"),
  );
  const rustupHome = path.resolve(
    process.env.RUSTUP_HOME ?? path.join(homedir(), ".rustup"),
  );
  const cargoTarget = path.join(buildRoot, "target");
  const generated = path.join(buildRoot, "generated");
  const env = { ...process.env };
  delete env.CARGO_ENCODED_RUSTFLAGS;
  env.CARGO_TARGET_DIR = cargoTarget;
  env.LC_ALL = "C";
  env.SOURCE_DATE_EPOCH = "0";
  env.TZ = "UTC";
  env.RUSTFLAGS = [
    `--remap-path-prefix=${ROOT}=/workspace/icblast`,
    `--remap-path-prefix=${cargoHome}=/cargo`,
    `--remap-path-prefix=${rustupHome}=/rustup`,
    `--remap-path-prefix=${buildRoot}=/build`,
  ].join(" ");
  env.RUSTC = rustc;
  env.RUSTDOC = rustdoc;

  run(
    cargo,
    [
      "build",
      "--manifest-path",
      path.join(CARGO_ROOT, "Cargo.toml"),
      "--release",
      "--target",
      "wasm32-unknown-unknown",
      "--locked",
    ],
    { env },
  );
  run(wasmBindgen, [
    "--target",
    "web",
    "--no-typescript",
    "--out-dir",
    generated,
    "--out-name",
    "didc_rust",
    path.join(
      cargoTarget,
      "wasm32-unknown-unknown",
      "release",
      "didc_rust.wasm",
    ),
  ]);

  const generatedFiles = [
    [path.join(generated, "didc_rust.js"), "didc_rust.js"],
    [path.join(generated, "didc_rust_bg.wasm"), "didc_rust_bg.bin"],
  ];
  const generatedWasm = await readFile(generatedFiles[1][0]);
  const generatedModule = await WebAssembly.compile(generatedWasm);
  const producerSections = WebAssembly.Module.customSections(
    generatedModule,
    "producers",
  );
  const producerEvidence = Buffer.concat(
    producerSections.map((section) => Buffer.from(section)),
  );
  for (const [producer, expected] of [
    ["rustc", RUST_VERSION.slice("rustc ".length)],
    ["wasm-bindgen", WASM_BINDGEN_VERSION.slice("wasm-bindgen ".length)],
  ]) {
    if (!producerEvidence.includes(Buffer.from(expected))) {
      throw new Error(
        `Generated Wasm ${producer} producer metadata does not contain ${expected}`,
      );
    }
  }
  if (checkOnly) {
    for (const [generatedPath, outputName] of generatedFiles) {
      const [actual, expected] = await Promise.all([
        readFile(generatedPath),
        readFile(path.join(OUTPUT_ROOT, outputName)),
      ]);
      if (!actual.equals(expected)) {
        throw new Error(`${outputName} is not reproducible from checked-in source`);
      }
    }
  } else {
    nextOutputRoot = await mkdtemp(path.join(ROOT, ".didc-wasm-next-"));
    await chmod(nextOutputRoot, 0o755);
    for (const [generatedPath, outputName] of generatedFiles) {
      const nextOutput = path.join(nextOutputRoot, outputName);
      await copyFile(generatedPath, nextOutput);
      await chmod(nextOutput, 0o644);
    }
    await rm(PREVIOUS_OUTPUT_ROOT, { recursive: true, force: true });
    if (await exists(OUTPUT_ROOT)) await rename(OUTPUT_ROOT, PREVIOUS_OUTPUT_ROOT);
    try {
      await rename(nextOutputRoot, OUTPUT_ROOT);
      nextOutputRoot = undefined;
    } catch (error) {
      if (await exists(PREVIOUS_OUTPUT_ROOT)) {
        await rename(PREVIOUS_OUTPUT_ROOT, OUTPUT_ROOT);
      }
      throw error;
    }
    await rm(PREVIOUS_OUTPUT_ROOT, { recursive: true, force: true });
  }
} finally {
  if (nextOutputRoot !== undefined) {
    await rm(nextOutputRoot, { recursive: true, force: true });
  }
  await rm(buildRoot, { recursive: true, force: true });
}

process.stdout.write(
  checkOnly
    ? "Verified reproducible Candid Wasm artifacts.\n"
    : "Rebuilt Candid Wasm artifacts.\n",
);
