import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

async function readBytes(relativePath) {
  return readFile(path.join(ROOT, relativePath));
}

function lockedRegistryPackages(cargoLock) {
  return cargoLock
    .split(/\n\[\[package\]\]\n/u)
    .slice(1)
    .map((block) => ({
      name: block.match(/^name = "([^"]+)"$/mu)?.[1],
      version: block.match(/^version = "([^"]+)"$/mu)?.[1],
      source: block.match(/^source = "([^"]+)"$/mu)?.[1],
      checksum: block.match(/^checksum = "([a-f0-9]{64})"$/mu)?.[1],
    }))
    .filter(({ source }) => source?.startsWith("registry+"))
    .sort((left, right) =>
      `${left.name}@${left.version}`.localeCompare(
        `${right.name}@${right.version}`,
      ),
    );
}

function noticeInventory(notices) {
  return [...notices.matchAll(
    /^\| \[`([^`]+)`\]\([^)]+\) \| `([^`]+)` \| `([^`]+)` \| `([a-f0-9]{64})` \|$/gmu,
  )]
    .map(([, name, version, license, checksum]) => ({
      name,
      version,
      license,
      checksum,
    }))
    .sort((left, right) =>
      `${left.name}@${left.version}`.localeCompare(
        `${right.name}@${right.version}`,
      ),
    );
}

describe("npm release metadata", () => {
  it("pins the Apache-2.0 release identity and exact canonical license", async () => {
    const manifest = JSON.parse(await read("package.json"));
    const lock = JSON.parse(await read("package-lock.json"));
    const cargoManifest = await read("didc_rust/Cargo.toml");
    const license = await readFile(path.join(ROOT, "LICENSE"));
    const notices = await read("THIRD_PARTY_NOTICES.md");
    const wasmGlue = await readBytes("didc_wasm_pkg/didc_rust.js");
    const wasm = await readBytes("didc_wasm_pkg/didc_rust_bg.bin");
    const rustSource = await readBytes("didc_rust/src/lib.rs");

    expect(manifest).toMatchObject({
      name: "icblast",
      version: "4.3.1",
      license: "Apache-2.0",
      repository: {
        type: "git",
        url: "git+https://github.com/infu/icblast.git",
      },
      scripts: {
        prepack: "npm run verify:licenses",
        prepublishOnly:
          "npm test && node scripts/verify-release-state.mjs",
      },
      exports: {
        "./didc-wasm": {
          types: "./types/didc-wasm.d.ts",
          default: "./didc_wasm_pkg/didc_rust_bg.bin",
        },
      },
      dependencies: {
        "@modelcontextprotocol/sdk": "^1.30.0",
        ajv: "^8.20.0",
        "fast-uri": "^3.1.5",
      },
    });
    expect(lock.version).toBe("4.3.1");
    expect(lock.packages[""]).toMatchObject({
      name: "icblast",
      version: "4.3.1",
      license: "Apache-2.0",
    });
    expect(lock.packages["node_modules/@modelcontextprotocol/sdk"].version).toBe(
      "1.30.0",
    );
    expect(lock.packages["node_modules/ajv"].version).toBe("8.20.0");
    expect(lock.packages["node_modules/fast-uri"].version).toBe("3.1.6");
    expect(cargoManifest).toMatch(/^license = "Apache-2.0"$/mu);
    expect(cargoManifest).toMatch(/^publish = false$/mu);
    expect(cargoManifest).toContain(
      "Adapted from the Apache-2.0 Candid wasm-bindgen example manifest.",
    );
    expect(createHash("sha256").update(license).digest("hex")).toBe(
      "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
    );
    const evidence = [
      [
        wasmGlue,
        "e06df6dd916e5b1daf8b610a1f5a340c318b21c13e1ce203607419636663fc39",
      ],
      [
        wasm,
        "97a68d8a1e901b282fb04534d131363edd6ea4f7f6343fa15a9d93cab84e72b7",
      ],
      [
        rustSource,
        "4c35cf05162fad5b6ee31c78cb0aab57a1324737177d1696428b97dce7317be0",
      ],
      [
        Buffer.from(cargoManifest, "utf8"),
        "bbe6ee7ee79c15f87cae1f53f1f8776133df72398ffc6f24c6aed8c89e24330a",
      ],
    ];
    expect(wasm).toHaveLength(951_093);
    for (const [bytes, digest] of evidence) {
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest);
      expect(notices).toContain(digest);
    }
    for (const producer of [
      "rustc",
      "1.89.0 (29483883e 2025-08-04)",
      "walrus",
      "0.23.3",
      "wasm-bindgen",
      "0.2.100",
    ]) {
      expect(wasm.includes(Buffer.from(producer, "utf8"))).toBe(true);
      expect(notices).toContain(producer);
    }
    expect(rustSource.toString("utf8")).toContain(
      "ebc9c615db87aa26cf8e9c9716e1ac18d63763a4",
    );
  });

  it("inventories every locked Rust registry package exactly once", async () => {
    const cargoLock = await readBytes("didc_rust/Cargo.lock");
    const locked = lockedRegistryPackages(cargoLock.toString("utf8"));
    const inventoried = noticeInventory(await read("THIRD_PARTY_NOTICES.md"));
    const licenseMap = JSON.parse(
      await read("third_party/licenses/rust/map.json"),
    );

    expect(locked).toHaveLength(124);
    expect(inventoried).toHaveLength(locked.length);
    expect(
      inventoried.map(({ name, version, checksum }) => ({
        name,
        version,
        checksum,
      })),
    ).toEqual(
      locked.map(({ name, version, checksum }) => ({
        name,
        version,
        checksum,
      })),
    );
    expect(inventoried.every(({ license }) => license !== "(missing)")).toBe(
      true,
    );
    expect(licenseMap).toMatchObject({
      schema: 1,
      cargo_lock_sha256: createHash("sha256")
        .update(cargoLock)
        .digest("hex"),
      registry_package_count: locked.length,
    });
    expect(
      licenseMap.packages.map(({ name, version, cargo_checksum_sha256 }) => ({
        name,
        version,
        checksum: cargo_checksum_sha256,
      })),
    ).toEqual(
      locked.map(({ name, version, checksum }) => ({
        name,
        version,
        checksum,
      })),
    );
    expect(
      licenseMap.packages.map(({ name, version, declared_license }) => ({
        name,
        version,
        license: declared_license,
      })),
    ).toEqual(
      inventoried.map(({ name, version, license }) => ({
        name,
        version,
        license,
      })),
    );

    const materialByPath = new Map();
    for (const component of [
      ...licenseMap.packages,
      ...licenseMap.linked_runtime.crates,
      ...licenseMap.generated_code.components,
      licenseMap.linked_runtime.rust,
    ]) {
      expect(component.materials.length).toBeGreaterThan(0);
      for (const material of component.materials) {
        expect(material.bundled_path).toMatch(
          /^material\/[a-f0-9]{64}\.txt$/u,
        );
        const previous = materialByPath.get(material.bundled_path);
        if (previous !== undefined) {
          expect(previous).toEqual({
            sha256: material.sha256,
            bytes: material.bytes,
          });
          continue;
        }
        const bytes = await readBytes(
          path.posix.join("third_party/licenses/rust", material.bundled_path),
        );
        expect(bytes).toHaveLength(material.bytes);
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(
          material.sha256,
        );
        materialByPath.set(material.bundled_path, {
          sha256: material.sha256,
          bytes: material.bytes,
        });
      }
    }

    expect(licenseMap.linked_runtime).toMatchObject({
      rust: {
        version: "1.89.0",
        revision: "29483883eed69d5fb4db01964cdf2af4d86e9cb2",
      },
    });
    expect(
      licenseMap.linked_runtime.crates.map(({ name, version }) =>
        `${name}@${version}`,
      ),
    ).toEqual([
      "compiler_builtins@0.1.160",
      "dlmalloc@0.2.9",
      "hashbrown@0.15.4",
      "rustc-demangle@0.1.25",
    ]);
    expect(licenseMap.generated_code).toMatchObject({
      evidence:
        "wasm-bindgen templates incorporated into didc_wasm_pkg/didc_rust.js",
      components: [
        {
          name: "wasm-bindgen-cli-support",
          version: "0.2.100",
          checksum:
            "21e1a4a49abe9cd6f762fc65fac2ef5732afeeb66be369d2f71a85b165a533cf",
          declared_license: "MIT OR Apache-2.0",
          selected_license: "MIT",
          revision: "2405ec2b4bcd1cc4e3bd1562c373e9d5f0cbdcb5",
          path_in_revision: "crates/cli-support",
        },
      ],
    });
    expect(
      licenseMap.generated_code.components[0].materials.map(
        ({ sha256 }) => sha256,
      ),
    ).toEqual(expect.arrayContaining([
      "378f5840b258e2779c39418f3f2d7b2ba96f1c7917dd6be0713f88305dbda397",
    ]));
    const copyrightLibrary = licenseMap.linked_runtime.rust.materials.find(
      ({ source_path }) => source_path.endsWith("/COPYRIGHT-library.html"),
    );
    expect(copyrightLibrary).toMatchObject({
      sha256: "9934873304420fc1720c09cd92ad272240508da2ea69279d638a7820db4415ff",
      bytes: 360723,
    });
    const log2 = licenseMap.linked_runtime.rust.materials.find(
      ({ source_path }) => source_path.endsWith("/log2.rs"),
    );
    expect(log2).toBeDefined();
    expect(
      await read(
        path.posix.join("third_party/licenses/rust", log2.bundled_path),
      ),
    ).toContain("Copyright (C) 1993 by Sun Microsystems, Inc.");
    expect(
      (
        await readdir(
          path.join(ROOT, "third_party", "licenses", "rust", "material"),
        )
      ).sort(),
    ).toEqual(
      [...materialByPath.keys()]
        .map((materialPath) => path.posix.basename(materialPath))
        .sort(),
    );
  });

  it("packs the license, notices, Rust source, lock, and embedded outputs", async () => {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const { stdout } = await execFileAsync(
      npm,
      ["pack", "--dry-run", "--json", "--ignore-scripts"],
      { cwd: ROOT, maxBuffer: 4 * 1024 * 1024 },
    );
    const [packed] = JSON.parse(stdout);
    const paths = packed.files.map(({ path: filePath }) => filePath).sort();
    const licenseMap = JSON.parse(
      await read("third_party/licenses/rust/map.json"),
    );
    const components = [
      ...licenseMap.packages,
      ...licenseMap.linked_runtime.crates,
      ...licenseMap.generated_code.components,
      licenseMap.linked_runtime.rust,
    ];
    const mappedMaterialPaths = [...new Set(
      components.flatMap(({ materials }) =>
        materials.map(({ bundled_path: bundledPath }) =>
          path.posix.join("third_party/licenses/rust", bundledPath),
        ),
      ),
    )].sort();

    expect(packed).toMatchObject({ name: "icblast", version: "4.3.1" });
    expect(paths).toEqual(expect.arrayContaining([
      "LICENSE",
      "NOTICE",
      "README.md",
      "THIRD_PARTY_NOTICES.md",
      "didc_rust/Cargo.lock",
      "didc_rust/Cargo.toml",
      "didc_rust/src/lib.rs",
      "didc_wasm_pkg/didc_rust.js",
      "didc_wasm_pkg/didc_rust_bg.bin",
      "package.json",
      "scripts/generate-rust-license-bundle.mjs",
      "scripts/verify-release-state.mjs",
      "third_party/licenses/rust/map.json",
      "third_party/licenses/rust/material/ab6eec6caf0fa5775e411c7a8bc6a45c4ef2956b0980b157ab74fc5cd62a928b.txt",
      "third_party/licenses/rust/material/b68ef2ab36c010ae7a63756d07f34e36054ed4574a3b0f09b778e29dd9706a91.txt",
      "third_party/licenses/rust/material/9934873304420fc1720c09cd92ad272240508da2ea69279d638a7820db4415ff.txt",
      "types/didc-wasm.d.ts",
    ]));
    expect(paths).not.toContain("package-lock.json");
    expect(paths.some((filePath) => filePath.includes("node_modules"))).toBe(
      false,
    );
    expect(
      paths.filter((filePath) =>
        filePath.startsWith("third_party/licenses/rust/material/"),
      ),
    ).toEqual(mappedMaterialPaths);
    expect(
      paths.filter((filePath) =>
        filePath.startsWith("third_party/licenses/") &&
        !filePath.startsWith("third_party/licenses/rust/"),
      ),
    ).toEqual([]);
  });
});
