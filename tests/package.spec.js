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

function lockedCargoPackages(cargoLock) {
  return cargoLock
    .split(/\n\[\[package\]\]\n/u)
    .slice(1)
    .map((block) => ({
      name: block.match(/^name = "([^"]+)"$/mu)?.[1],
      version: block.match(/^version = "([^"]+)"$/mu)?.[1],
      source: block.match(/^source = "([^"]+)"$/mu)?.[1],
      checksum: block.match(/^checksum = "([a-f0-9]{64})"$/mu)?.[1],
    }))
    .sort((left, right) =>
      `${left.name}@${left.version}`.localeCompare(
        `${right.name}@${right.version}`,
      ),
    );
}

const vendoredPrettyFiles = [
  "didc_rust/vendor/pretty-0.12.4/Cargo.toml",
  "didc_rust/vendor/pretty-0.12.4/LICENSE",
  "didc_rust/vendor/pretty-0.12.4/PATCH.md",
  "didc_rust/vendor/pretty-0.12.4/src/block.rs",
  "didc_rust/vendor/pretty-0.12.4/src/lib.rs",
  "didc_rust/vendor/pretty-0.12.4/src/render.rs",
];

const exactDfinityDependencies = Object.freeze({
  "@dfinity/agent": "3.4.3",
  "@dfinity/auth-client": "3.4.3",
  "@dfinity/candid": "3.4.3",
  "@dfinity/cbor": "0.2.2",
  "@dfinity/identity": "3.4.3",
  "@dfinity/ledger-icrc": "4.1.0",
  "@dfinity/principal": "3.4.3",
  "@dfinity/utils": "3.2.0",
});

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
    const cargoLock = await readBytes("didc_rust/Cargo.lock");
    const license = await readFile(path.join(ROOT, "LICENSE"));
    const notices = await read("THIRD_PARTY_NOTICES.md");
    const wasmGlue = await readBytes("didc_wasm_pkg/didc_rust.js");
    const wasm = await readBytes("didc_wasm_pkg/didc_rust_bg.bin");
    const rustSource = await readBytes("didc_rust/src/lib.rs");

    expect(manifest).toMatchObject({
      name: "icblast",
      version: "4.3.3",
      license: "Apache-2.0",
      repository: {
        type: "git",
        url: "git+https://github.com/infu/icblast.git",
      },
      scripts: {
        "build:didc": "node scripts/build-didc-wasm.mjs",
        prepack: "npm run verify:didc && npm run verify:licenses",
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
        ...exactDfinityDependencies,
        "@modelcontextprotocol/sdk": "^1.30.0",
        ajv: "^8.20.0",
        "fast-uri": "^3.1.5",
      },
    });
    expect(lock.version).toBe("4.3.3");
    expect(lock.packages[""]).toMatchObject({
      name: "icblast",
      version: "4.3.3",
      license: "Apache-2.0",
      dependencies: {
        ...exactDfinityDependencies,
      },
    });
    for (const [dependency, version] of Object.entries(
      exactDfinityDependencies,
    )) {
      expect(lock.packages[`node_modules/${dependency}`].version).toBe(version);
    }
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
    expect(cargoManifest).toContain(
      'pretty = { path = "vendor/pretty-0.12.4" }',
    );
    expect(createHash("sha256").update(license).digest("hex")).toBe(
      "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
    );
    const evidence = [
      [
        wasmGlue,
        "02847c0d670b9291bdadb173de69285a14acec864f2d0f000bd232c465d5d8cd",
      ],
      [
        wasm,
        "4235e33cd96b3fde282514cfd73b96041c0290aea02e3e786ba715ac3eb01508",
      ],
      [
        rustSource,
        "86d0534c847ace34b213ea526b0a732f106f765f276afc859047a88b3946d8e5",
      ],
      [
        Buffer.from(cargoManifest, "utf8"),
        "63a0e3630ceef952f2936e5acf867c8b987353c26a68d0c8efeed7ab1182917f",
      ],
      [
        cargoLock,
        "b4b34b369d706fb199c320995c1a2c0c6287fa09925d670e5faffb1df2252e02",
      ],
    ];
    expect(wasm).toHaveLength(870_492);
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
    expect(rustSource.toString("utf8")).toContain(
      "bindings::javascript::compile",
    );
    expect(rustSource.toString("utf8")).not.toContain("bindings::typescript");
    expect(rustSource.toString("utf8")).not.toContain("bindings::motoko");
  });

  it("inventories every locked and vendored Rust package exactly once", async () => {
    const cargoLock = await readBytes("didc_rust/Cargo.lock");
    const cargoPackages = lockedCargoPackages(cargoLock.toString("utf8"));
    const locked = cargoPackages.filter(({ source }) =>
      source?.startsWith("registry+")
    );
    const local = cargoPackages
      .filter(({ source }) => source === undefined)
      .map(({ name, version }) => ({ name, version }));
    const unsupported = cargoPackages.filter(
      ({ source }) =>
        source !== undefined && !source.startsWith("registry+"),
    );
    const inventoried = noticeInventory(await read("THIRD_PARTY_NOTICES.md"));
    const licenseMap = JSON.parse(
      await read("third_party/licenses/rust/map.json"),
    );

    expect(locked).toHaveLength(123);
    expect(local).toEqual([
      { name: "didc_rust", version: "0.1.0" },
      { name: "pretty", version: "0.12.4" },
    ]);
    expect(unsupported).toEqual([]);
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
      schema: 2,
      cargo_lock_sha256: createHash("sha256")
        .update(cargoLock)
        .digest("hex"),
      registry_package_count: locked.length,
      vendored_package_count: 1,
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

    expect(licenseMap.vendored_packages).toHaveLength(1);
    const [vendoredPretty] = licenseMap.vendored_packages;
    expect(vendoredPretty).toMatchObject({
      name: "pretty",
      version: "0.12.4",
      path: "didc_rust/vendor/pretty-0.12.4",
      declared_license: "MIT",
      selected_license: "MIT",
      repository: "https://github.com/Marwes/pretty.rs",
      source_revision: "bd138e503ee3f679b26c838c9f148fbdaf6d2b7c",
      crate_archive_sha256:
        "ac98773b7109bc75f475ab5a134c9b64b87e59d776d31098d8f346922396a477",
      file_tree_hash_format: "path\\0sha256\\0bytes\\n",
    });
    expect(vendoredPretty.source_revision_evidence).toMatchObject({
      archive_path: "pretty-0.12.4/.cargo_vcs_info.json",
      sha256:
        "fc260a37012bfab8fb435d38602ce4ed35624d18ac1af79afc2808a939026c64",
      bytes: 94,
    });
    expect(vendoredPretty.files.map(({ path: file }) => file)).toEqual(
      vendoredPrettyFiles,
    );
    expect(
      vendoredPretty.files.map(({ path: file, status }) => [file, status]),
    ).toEqual([
      [vendoredPrettyFiles[0], "modified"],
      [vendoredPrettyFiles[1], "unchanged"],
      [vendoredPrettyFiles[2], "added"],
      [vendoredPrettyFiles[3], "unchanged"],
      [vendoredPrettyFiles[4], "modified"],
      [vendoredPrettyFiles[5], "unchanged"],
    ]);
    for (const evidence of vendoredPretty.files) {
      const bytes = await readBytes(evidence.path);
      expect(bytes).toHaveLength(evidence.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        evidence.sha256,
      );
    }
    const vendorTreeHash = createHash("sha256")
      .update(
        vendoredPretty.files
          .map(({ path: file, sha256, bytes }) =>
            `${file}\0${sha256}\0${bytes}\n`)
          .join(""),
      )
      .digest("hex");
    expect(vendorTreeHash).toBe(
      "653e18d0e6d1c04791f4d3c3d7483e42dbb1bebea343fe6f6581bfabb804ae09",
    );
    expect(vendoredPretty.file_tree_sha256).toBe(vendorTreeHash);
    expect(
      vendoredPretty.files.find(({ path: file }) => file.endsWith("/LICENSE")),
    ).toMatchObject({
      sha256: "1f95f905a449519d5ce48bc994c01aa033375046bca261c44270e0e131adb0ef",
      upstream_sha256:
        "1f95f905a449519d5ce48bc994c01aa033375046bca261c44270e0e131adb0ef",
    });

    const releaseFilePaths = [
      "didc_rust/Cargo.lock",
      "didc_rust/Cargo.toml",
      "didc_rust/src/lib.rs",
      "didc_wasm_pkg/didc_rust.js",
      "didc_wasm_pkg/didc_rust_bg.bin",
      ...vendoredPrettyFiles,
    ].sort();
    expect(licenseMap.release_files.map(({ path: file }) => file)).toEqual(
      releaseFilePaths,
    );
    for (const evidence of licenseMap.release_files) {
      const bytes = await readBytes(evidence.path);
      expect(bytes).toHaveLength(evidence.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        evidence.sha256,
      );
    }

    const materialByPath = new Map();
    for (const component of [
      ...licenseMap.packages,
      ...licenseMap.vendored_packages,
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
      ...licenseMap.vendored_packages,
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

    expect(packed).toMatchObject({ name: "icblast", version: "4.3.3" });
    expect(paths).toEqual(expect.arrayContaining([
      "LICENSE",
      "NOTICE",
      "README.md",
      "THIRD_PARTY_NOTICES.md",
      "didc_rust/Cargo.lock",
      "didc_rust/Cargo.toml",
      "didc_rust/src/lib.rs",
      ...vendoredPrettyFiles,
      "didc_wasm_pkg/didc_rust.js",
      "didc_wasm_pkg/didc_rust_bg.bin",
      "package.json",
      "scripts/build-didc-wasm.mjs",
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
    expect(paths.some((filePath) => filePath.startsWith("didc_rust/target/"))).toBe(
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
  }, 15_000);
});
