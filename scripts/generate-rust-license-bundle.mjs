import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CARGO_ROOT = path.join(ROOT, "didc_rust");
const OUTPUT_PARENT = path.join(ROOT, "third_party", "licenses");
const OUTPUT_ROOT = path.join(ROOT, "third_party", "licenses", "rust");
const PREVIOUS_OUTPUT_ROOT = path.join(
  ROOT,
  "third_party",
  "licenses",
  ".rust-previous",
);
let activeOutputRoot = OUTPUT_ROOT;
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const MAX_MATERIAL_BYTES = 2 * 1024 * 1024;
const MAX_DOWNLOAD_ATTEMPTS = 5;
const LEGAL_BASENAME = /^(?:licen[cs]e|copying|notice|unlicense|copyright)(?:[._-].*)?$/iu;

const VCS_FALLBACKS = Object.freeze({
  "binread@2.2.0": [
    {
      revision: "a97e944149f2b4093d19327a2492d88dc71a43b2",
      path: "LICENSE",
      sha256: "08159509fe99d146416fe110053a7360ddfccbba5f0c8f955bdbda025d4d2a20",
      url: "https://raw.githubusercontent.com/jam1garner/binread/a97e944149f2b4093d19327a2492d88dc71a43b2/LICENSE",
    },
  ],
  "binread_derive@2.1.0": [
    {
      revision: "a97e944149f2b4093d19327a2492d88dc71a43b2",
      path: "LICENSE",
      sha256: "08159509fe99d146416fe110053a7360ddfccbba5f0c8f955bdbda025d4d2a20",
      url: "https://raw.githubusercontent.com/jam1garner/binread/a97e944149f2b4093d19327a2492d88dc71a43b2/LICENSE",
    },
  ],
  "codespan-reporting@0.11.1": [
    {
      revision: "fd389a13f5bb6d625b71e2e4694b26e127f393f9",
      path: "LICENSE",
      sha256: "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4",
      url: "https://raw.githubusercontent.com/brendanzab/codespan/fd389a13f5bb6d625b71e2e4694b26e127f393f9/LICENSE",
    },
  ],
  "logos@0.13.0": [
    {
      revision: "cd6d40a79a23a3d88250cefd4600f78f1a2ab465",
      path: "LICENSE-APACHE",
      sha256: "f30735c11407534952947e1c7b7457ddf28847000bb038402495ad66f3d020a4",
      url: "https://raw.githubusercontent.com/maciejhirsz/logos/cd6d40a79a23a3d88250cefd4600f78f1a2ab465/LICENSE-APACHE",
    },
    {
      revision: "cd6d40a79a23a3d88250cefd4600f78f1a2ab465",
      path: "LICENSE-MIT",
      sha256: "112fcdb9f4935988cc2313e4cc38faaeccfff53eb1296499e618932d472908e0",
      url: "https://raw.githubusercontent.com/maciejhirsz/logos/cd6d40a79a23a3d88250cefd4600f78f1a2ab465/LICENSE-MIT",
    },
  ],
  "logos-codegen@0.13.0": "logos@0.13.0",
  "logos-derive@0.13.0": "logos@0.13.0",
  "winapi-i686-pc-windows-gnu@0.4.0": "winapi@0.3.9",
  "winapi-x86_64-pc-windows-gnu@0.4.0": "winapi@0.3.9",
});

const LINKED_RUNTIME_CRATES = Object.freeze([
  {
    name: "compiler_builtins",
    version: "0.1.160",
    checksum: "6376049cfa92c0aa8b9ac95fae22184b981c658208d4ed8a1dc553cd83612895",
    declared_license:
      "MIT AND Apache-2.0 WITH LLVM-exception AND (MIT OR Apache-2.0)",
  },
  {
    name: "dlmalloc",
    version: "0.2.9",
    checksum: "d01597dde41c0b9da50d5f8c219023d63d8f27f39a27095070fd191fddc83891",
    declared_license: "MIT/Apache-2.0",
  },
  {
    name: "hashbrown",
    version: "0.15.4",
    checksum: "5971ac85611da7067dbfcabef3c70ebb5606018acd9e2a3903a0da507521e0d5",
    declared_license: "MIT OR Apache-2.0",
  },
  {
    name: "rustc-demangle",
    version: "0.1.25",
    checksum: "989e6739f80c4ad5b13e0fd7fe89531180375b18520cc8c82080e4dc4035b84f",
    declared_license: "MIT/Apache-2.0",
  },
]);

const GENERATED_CODE_CRATES = Object.freeze([
  {
    name: "wasm-bindgen-cli-support",
    version: "0.2.100",
    checksum: "21e1a4a49abe9cd6f762fc65fac2ef5732afeeb66be369d2f71a85b165a533cf",
    declared_license: "MIT OR Apache-2.0",
    selected_license: "MIT",
    revision: "2405ec2b4bcd1cc4e3bd1562c373e9d5f0cbdcb5",
    path_in_revision: "crates/cli-support",
  },
]);

const RUST_REVISION = "29483883eed69d5fb4db01964cdf2af4d86e9cb2";
const RUST_SOURCE_MATERIALS = Object.freeze([
  ["LICENSE-APACHE", "62c7a1e35f56406896d7aa7ca52d0cc0d272ac022b5d2796e7d6905db8a3636a"],
  ["LICENSE-MIT", "b71bd43a069ca0641a9ecfe585ca7b3c53b5cc1608f8b68321168698e28b5ea1"],
  ["COPYRIGHT", "172020dbfd5b53a226dfde77616190a48dcff519b0bc0e6deb91a8450782c4af"],
  ["LICENSES/Unicode-3.0.txt", "f5062c9a188d81dfe66b56db4182dcf9e4b17c0d9b0d311a8e20b3a1b075c443"],
  ["library/compiler-builtins/LICENSE.txt", "ab6eec6caf0fa5775e411c7a8bc6a45c4ef2956b0980b157ab74fc5cd62a928b"],
  ["library/compiler-builtins/libm/LICENSE.txt", "3823dda7cf046602f4b4e77ec8e227863dc4736037cc85bb33d9f19febe16bb7"],
  ["library/compiler-builtins/libm/src/math/log2.rs", "b68ef2ab36c010ae7a63756d07f34e36054ed4574a3b0f09b778e29dd9706a91"],
]);
const RUST_DISTRIBUTION = Object.freeze({
  url: "https://static.rust-lang.org/dist/2025-08-07/rustc-1.89.0-x86_64-unknown-linux-gnu.tar.xz",
  sha256: "b42c254e1349df86bd40bc28fdf386172a1a46f2eeabe3c7a08a75cf1fb60e27",
  entry:
    "rustc-1.89.0-x86_64-unknown-linux-gnu/rustc/share/doc/rust/COPYRIGHT-library.html",
  material_sha256:
    "9934873304420fc1720c09cd92ad272240508da2ea69279d638a7820db4415ff",
});

const VENDORED_PATCHES = Object.freeze([
  {
    name: "pretty",
    version: "0.12.4",
    checksum: "ac98773b7109bc75f475ab5a134c9b64b87e59d776d31098d8f346922396a477",
    declared_license: "MIT",
    selected_license: "MIT",
    authors: [
      "Jonathan Sterling <jon@jonmsterling.com>",
      "Darin Morrison <darinmorrison+git@gmail.com>",
      "Markus Westerlind <marwes91@gmail.com>",
    ],
    repository: "https://github.com/Marwes/pretty.rs",
    source_revision: "bd138e503ee3f679b26c838c9f148fbdaf6d2b7c",
    path: "didc_rust/vendor/pretty-0.12.4",
    files: [
      {
        path: "didc_rust/vendor/pretty-0.12.4/Cargo.toml",
        status: "modified",
        upstream_path: "Cargo.toml.orig",
        upstream_sha256:
          "dce1dc27b2c006ec081737e57811db186e401bb952bbb75207980886dca6b503",
      },
      {
        path: "didc_rust/vendor/pretty-0.12.4/LICENSE",
        status: "unchanged",
        upstream_path: "LICENSE",
        upstream_sha256:
          "1f95f905a449519d5ce48bc994c01aa033375046bca261c44270e0e131adb0ef",
      },
      {
        path: "didc_rust/vendor/pretty-0.12.4/PATCH.md",
        status: "added",
      },
      {
        path: "didc_rust/vendor/pretty-0.12.4/src/block.rs",
        status: "unchanged",
        upstream_path: "src/block.rs",
        upstream_sha256:
          "3eb483202171f737e94a3bae2ec18b6afa3b6ca53ae9b19c4a7140963aad860b",
      },
      {
        path: "didc_rust/vendor/pretty-0.12.4/src/lib.rs",
        status: "modified",
        upstream_path: "src/lib.rs",
        upstream_sha256:
          "203f8aa1949a4594fb89ac32cc31958d732e9ad6f4a84f13c3de537b2a59d87e",
      },
      {
        path: "didc_rust/vendor/pretty-0.12.4/src/render.rs",
        status: "unchanged",
        upstream_path: "src/render.rs",
        upstream_sha256:
          "b8622e3bdc7c8963c4922f013d34b2151a6e92f08a8a2e2343dd9db04bfbc643",
      },
    ],
  },
]);

const RELEASE_FILE_PATHS = Object.freeze([
  "didc_rust/Cargo.lock",
  "didc_rust/Cargo.toml",
  "didc_rust/src/lib.rs",
  "didc_wasm_pkg/didc_rust.js",
  "didc_wasm_pkg/didc_rust_bg.bin",
  ...VENDORED_PATCHES.flatMap(({ files }) => files.map(({ path: file }) => file)),
].sort());

const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

function parseCargoPackages(text) {
  return text
    .split(/\n\[\[package\]\]\n/u)
    .slice(1)
    .map((block) => ({
      name: block.match(/^name = "([^"]+)"$/mu)?.[1],
      version: block.match(/^version = "([^"]+)"$/mu)?.[1],
      source: block.match(/^source = "([^"]+)"$/mu)?.[1],
      checksum: block.match(/^checksum = "([a-f0-9]{64})"$/mu)?.[1],
    }))
    .map((entry) => {
      if (entry.name === undefined || entry.version === undefined) {
        throw new Error("Malformed package in didc_rust/Cargo.lock");
      }
      return entry;
    })
    .sort((left, right) =>
      `${left.name}@${left.version}`.localeCompare(
        `${right.name}@${right.version}`,
      ),
    );
}

function parseRegistryCargoPackages(packages) {
  return packages
    .filter(({ source }) => source?.startsWith("registry+"))
    .map((entry) => {
      if (entry.checksum === undefined) {
        throw new Error(
          `Registry package lacks checksum: ${entry.name}@${entry.version}`,
        );
      }
      return entry;
    });
}

function cargoMetadata() {
  const raw = execFileSync(
    "cargo",
    ["metadata", "--locked", "--format-version", "1"],
    {
      cwd: CARGO_ROOT,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  return JSON.parse(raw);
}

async function download(url, expectedSha256) {
  let lastError;
  for (let attempt = 0; attempt < MAX_DOWNLOAD_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        headers: { "user-agent": "icblast-license-bundle/1" },
        redirect: "follow",
      });
    } catch (error) {
      lastError = error;
      if (attempt === MAX_DOWNLOAD_ATTEMPTS - 1) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 500 * (2 ** attempt)),
      );
      continue;
    }
    if (!response.ok) {
      lastError = new Error(
        `Failed to download ${url}: HTTP ${response.status}`,
      );
      try {
        await response.body?.cancel();
      } catch {
        // The status and bounded retry remain authoritative.
      }
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === MAX_DOWNLOAD_ATTEMPTS - 1) {
        throw lastError;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, 500 * (2 ** attempt)),
      );
      continue;
    }
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_ARCHIVE_BYTES) {
      throw new Error(`Download exceeds byte limit: ${url}`);
    }
    if (response.body === null) {
      throw new Error(`Download has no response body: ${url}`);
    }
    const chunks = [];
    let totalBytes = 0;
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_ARCHIVE_BYTES) {
        await reader.cancel();
        throw new Error(`Download exceeds byte limit: ${url}`);
      }
      chunks.push(Buffer.from(value));
    }
    const bytes = Buffer.concat(chunks, totalBytes);
    const actual = sha256(bytes);
    if (actual !== expectedSha256) {
      throw new Error(
        `Checksum mismatch for ${url}: expected ${expectedSha256}, got ${actual}`,
      );
    }
    return bytes;
  }
  throw lastError;
}

async function cachedCrateArchive(name, version, expectedSha256) {
  const cargoHome = process.env.CARGO_HOME === undefined
    ? path.join(homedir(), ".cargo")
    : path.resolve(process.env.CARGO_HOME);
  const cacheRoot = path.join(cargoHome, "registry", "cache");
  let registryDirectories;
  try {
    registryDirectories = await readdir(cacheRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
  const filename = `${name}-${version}.crate`;
  for (const directory of registryDirectories
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const candidate = path.join(cacheRoot, directory.name, filename);
    try {
      const bytes = await readFile(candidate);
      const actualSha256 = sha256(bytes);
      if (actualSha256 !== expectedSha256) {
        throw new Error(
          `Cargo cache checksum mismatch for ${candidate}: expected ${expectedSha256}, got ${actualSha256}`,
        );
      }
      return bytes;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return undefined;
}

async function crateArchive(name, version, expectedSha256) {
  const encodedName = encodeURIComponent(name);
  const encodedVersion = encodeURIComponent(version);
  const url =
    `https://crates.io/api/v1/crates/${encodedName}/${encodedVersion}/download`;
  const cached = await cachedCrateArchive(name, version, expectedSha256);
  return {
    bytes: cached ?? await download(url, expectedSha256),
    url,
  };
}

function archiveLegalPaths(archivePath) {
  return execFileSync("tar", ["-tzf", archivePath], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean)
    .filter((entry) => !entry.endsWith("/"))
    .filter((entry) => LEGAL_BASENAME.test(path.posix.basename(entry)))
    .sort();
}

function readArchiveEntry(archivePath, entry) {
  const bytes = execFileSync("tar", ["-xOzf", archivePath, "--", entry], {
    encoding: "buffer",
    maxBuffer: MAX_MATERIAL_BYTES,
  });
  if (bytes.length === 0 || bytes.length > MAX_MATERIAL_BYTES) {
    throw new Error(`Invalid legal material size for ${entry}`);
  }
  return bytes;
}

function readXzArchiveEntry(archivePath, entry) {
  const bytes = execFileSync("tar", ["-xOJf", archivePath, "--", entry], {
    encoding: "buffer",
    maxBuffer: MAX_MATERIAL_BYTES,
  });
  if (bytes.length === 0 || bytes.length > MAX_MATERIAL_BYTES) {
    throw new Error(`Invalid legal material size for ${entry}`);
  }
  return bytes;
}

async function collectCrateLegalMaterials(component, temporaryRoot) {
  const { bytes: archive, url } = await crateArchive(
    component.name,
    component.version,
    component.checksum,
  );
  const archivePath = path.join(
    temporaryRoot,
    `${component.name}-${component.version}.crate`,
  );
  await writeFile(archivePath, archive);
  const materials = [];
  for (const archiveEntry of archiveLegalPaths(archivePath)) {
    materials.push({
      kind: "crate-archive",
      archive_path: archiveEntry,
      ...(await storeMaterial(readArchiveEntry(archivePath, archiveEntry))),
    });
  }
  if (materials.length === 0) {
    throw new Error(
      `Outside-lock Rust component has no archived legal material: ${component.name}@${component.version}`,
    );
  }
  return {
    ...component,
    crate_archive_url: url,
    materials,
  };
}

async function storeMaterial(bytes) {
  const digest = sha256(bytes);
  const relativePath = path.posix.join("material", `${digest}.txt`);
  const materialPath = path.join(activeOutputRoot, relativePath);
  await writeFile(materialPath, bytes, { flag: "wx" })
    .catch(async (error) => {
      if (error?.code !== "EEXIST") throw error;
      const existing = await readFile(materialPath);
      if (!existing.equals(bytes)) {
        throw new Error(`Content-address collision at ${relativePath}`);
      }
    });
  await chmod(materialPath, 0o644);
  return { bundled_path: relativePath, sha256: digest, bytes: bytes.length };
}

async function localFileEvidence(relativePath) {
  const bytes = await readFile(path.join(ROOT, ...relativePath.split("/")));
  return {
    path: relativePath,
    sha256: sha256(bytes),
    bytes: bytes.length,
  };
}

async function localFileTree(relativeRoot) {
  const absoluteRoot = path.join(ROOT, ...relativeRoot.split("/"));
  if ((await lstat(absoluteRoot)).isSymbolicLink()) {
    throw new Error(`Vendored package root may not be a symlink: ${relativeRoot}`);
  }
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Vendored package may not contain symlinks: ${target}`);
      }
      if (entry.isDirectory()) {
        await visit(target);
      } else if (entry.isFile()) {
        files.push(path.relative(ROOT, target).split(path.sep).join("/"));
      } else {
        throw new Error(`Unsupported vendored package entry: ${target}`);
      }
    }
  }
  await visit(absoluteRoot);
  return files.sort();
}

async function collectVendoredPatch(component, temporaryRoot) {
  const { bytes: archive, url } = await crateArchive(
    component.name,
    component.version,
    component.checksum,
  );
  const archivePath = path.join(
    temporaryRoot,
    `${component.name}-${component.version}.crate`,
  );
  await writeFile(archivePath, archive);
  const archiveRoot = `${component.name}-${component.version}`;
  const vcsInfoArchivePath = `${archiveRoot}/.cargo_vcs_info.json`;
  const vcsInfoBytes = readArchiveEntry(archivePath, vcsInfoArchivePath);
  let vcsInfo;
  try {
    vcsInfo = JSON.parse(vcsInfoBytes.toString("utf8"));
  } catch (error) {
    throw new Error(
      `Invalid VCS metadata for ${component.name}@${component.version}`,
      { cause: error },
    );
  }
  if (vcsInfo?.git?.sha1 !== component.source_revision) {
    throw new Error(
      `VCS revision mismatch for ${component.name}@${component.version}: expected ${component.source_revision}, got ${vcsInfo?.git?.sha1}`,
    );
  }
  const materials = [];
  for (const archiveEntry of archiveLegalPaths(archivePath)) {
    materials.push({
      kind: "crate-archive",
      archive_path: archiveEntry,
      ...(await storeMaterial(readArchiveEntry(archivePath, archiveEntry))),
    });
  }
  const files = [];
  for (const file of component.files) {
    if (file.upstream_path !== undefined) {
      const upstreamBytes = readArchiveEntry(
        archivePath,
        `${archiveRoot}/${file.upstream_path}`,
      );
      const upstreamDigest = sha256(upstreamBytes);
      if (upstreamDigest !== file.upstream_sha256) {
        throw new Error(
          `Upstream source mismatch for ${file.path}: expected ${file.upstream_sha256}, got ${upstreamDigest}`,
        );
      }
    }
    const evidence = { ...file, ...(await localFileEvidence(file.path)) };
    if (
      file.status === "unchanged" &&
      evidence.sha256 !== file.upstream_sha256
    ) {
      throw new Error(`Unmodified vendor file differs upstream: ${file.path}`);
    }
    if (
      file.status === "modified" &&
      evidence.sha256 === file.upstream_sha256
    ) {
      throw new Error(`Modified vendor file unexpectedly matches upstream: ${file.path}`);
    }
    files.push(evidence);
  }
  const actualFiles = await localFileTree(component.path);
  const expectedFiles = files.map(({ path: file }) => file).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `Vendored package file closure differs: ${JSON.stringify(actualFiles)}`,
    );
  }
  const localLicense = files.find(({ path: file }) => file.endsWith("/LICENSE"));
  if (
    localLicense === undefined ||
    !materials.some(({ sha256: digest }) => digest === localLicense.sha256)
  ) {
    throw new Error(`Vendored license differs from ${component.name} archive`);
  }
  return {
    name: component.name,
    version: component.version,
    path: component.path,
    declared_license: component.declared_license,
    selected_license: component.selected_license,
    authors: component.authors,
    repository: component.repository,
    source_revision: component.source_revision,
    source_revision_evidence: {
      archive_path: vcsInfoArchivePath,
      sha256: sha256(vcsInfoBytes),
      bytes: vcsInfoBytes.length,
    },
    crate_archive_url: url,
    crate_archive_sha256: component.checksum,
    files,
    file_tree_sha256: sha256(Buffer.from(
      files
        .map(({ path: file, sha256: digest, bytes }) =>
          `${file}\0${digest}\0${bytes}\n`)
        .join(""),
      "utf8",
    )),
    file_tree_hash_format: "path\\0sha256\\0bytes\\n",
    materials,
  };
}

async function generateBundle() {
  const cargoLock = await readFile(path.join(CARGO_ROOT, "Cargo.lock"));
  const cargoPackages = parseCargoPackages(cargoLock.toString("utf8"));
  const locked = parseRegistryCargoPackages(cargoPackages);
  const localPackages = cargoPackages
    .filter(({ source }) => source === undefined)
    .map(({ name, version }) => ({ name, version }));
  const unsupportedPackages = cargoPackages
    .filter(
      ({ source }) =>
        source !== undefined && !source.startsWith("registry+"),
    )
    .map(({ name, version, source }) => ({ name, version, source }));
  if (unsupportedPackages.length > 0) {
    throw new Error(
      `Unsupported non-registry Cargo packages: ${JSON.stringify(unsupportedPackages)}`,
    );
  }
  const expectedLocalPackages = [
    { name: "didc_rust", version: "0.1.0" },
    ...VENDORED_PATCHES.map(({ name, version }) => ({ name, version })),
  ].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(
      `${right.name}@${right.version}`,
    ),
  );
  if (JSON.stringify(localPackages) !== JSON.stringify(expectedLocalPackages)) {
    throw new Error(
      `Unexpected local Cargo packages: ${JSON.stringify(localPackages)}`,
    );
  }
  const metadata = cargoMetadata();
  const metadataLocalPackages = metadata.packages
    .filter(({ source }) => source === null)
    .map(({ name, version, manifest_path: manifestPath }) => ({
      name,
      version,
      manifest_path: path.resolve(manifestPath),
    }))
    .sort((left, right) =>
      `${left.name}@${left.version}`.localeCompare(
        `${right.name}@${right.version}`,
      ),
    );
  const expectedMetadataLocalPackages = expectedLocalPackages.map(
    ({ name, version }) => ({
      name,
      version,
      manifest_path: name === "didc_rust"
        ? path.join(CARGO_ROOT, "Cargo.toml")
        : path.join(
            ROOT,
            ...VENDORED_PATCHES.find((component) => component.name === name)
              .path.split("/"),
            "Cargo.toml",
          ),
    }),
  );
  if (
    JSON.stringify(metadataLocalPackages) !==
    JSON.stringify(expectedMetadataLocalPackages)
  ) {
    throw new Error(
      `Cargo metadata resolves unexpected local packages: ${JSON.stringify(metadataLocalPackages)}`,
    );
  }
  for (const component of VENDORED_PATCHES) {
    const manifestPath = path.join(
      ROOT,
      ...component.path.split("/"),
      "Cargo.toml",
    );
    const resolved = metadata.packages.find(
      ({ source, manifest_path: resolvedManifestPath }) =>
        source === null && path.resolve(resolvedManifestPath) === manifestPath,
    );
    if (
      resolved?.license !== component.declared_license ||
      resolved.repository !== component.repository ||
      JSON.stringify(resolved.authors) !== JSON.stringify(component.authors)
    ) {
      throw new Error(
        `Vendored Cargo metadata differs from legal inventory: ${component.name}@${component.version}`,
      );
    }
  }
  const metadataById = new Map(
    metadata.packages
      .filter(({ source }) => source?.startsWith("registry+"))
      .map((pkg) => [`${pkg.name}@${pkg.version}`, pkg]),
  );
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "icblast-licenses-"));
  const packages = [];
  const vendoredPatches = [];

  try {
    for (const entry of locked) {
      const id = `${entry.name}@${entry.version}`;
      const metadataEntry = metadataById.get(id);
      if (metadataEntry === undefined) {
        throw new Error(`Cargo metadata omits locked package ${id}`);
      }
      const { bytes: archive, url } = await crateArchive(
        entry.name,
        entry.version,
        entry.checksum,
      );
      const archivePath = path.join(
        temporaryRoot,
        `${entry.name}-${entry.version}.crate`,
      );
      await writeFile(archivePath, archive);
      const archivePaths = archiveLegalPaths(archivePath);
      const materials = [];
      for (const archiveEntry of archivePaths) {
        materials.push({
          kind: "crate-archive",
          archive_path: archiveEntry,
          ...(await storeMaterial(readArchiveEntry(archivePath, archiveEntry))),
        });
      }
      packages.push({
        name: entry.name,
        version: entry.version,
        cargo_checksum_sha256: entry.checksum,
        crate_archive_url: url,
        declared_license: metadataEntry.license ?? null,
        authors: [...metadataEntry.authors],
        repository: metadataEntry.repository ?? null,
        materials,
      });
    }

    const packagesById = new Map(
      packages.map((pkg) => [`${pkg.name}@${pkg.version}`, pkg]),
    );
    for (const pkg of packages) {
      if (pkg.materials.length > 0) continue;
      const id = `${pkg.name}@${pkg.version}`;
      const fallback = VCS_FALLBACKS[id];
      if (!Array.isArray(fallback) || fallback.length === 0) continue;
      for (const material of fallback) {
        const bytes = await download(material.url, material.sha256);
        pkg.materials.push({
          kind: "vcs-fallback",
          source_url: material.url,
          source_revision: material.revision,
          source_path: material.path,
          ...(await storeMaterial(bytes)),
        });
      }
    }
    for (const pkg of packages) {
      if (pkg.materials.length > 0) continue;
      const id = `${pkg.name}@${pkg.version}`;
      const fallback = VCS_FALLBACKS[id];
      if (typeof fallback !== "string") continue;
      const shared = packagesById.get(fallback);
      if (shared === undefined || shared.materials.length === 0) {
        throw new Error(`Invalid shared legal-material mapping ${id} -> ${fallback}`);
      }
      pkg.materials = shared.materials.map((material) => ({
        ...material,
        kind: "shared-package",
        shared_from: fallback,
      }));
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  const missing = packages
    .filter(({ materials }) => materials.length === 0)
    .map(({ name, version }) => `${name}@${version}`);
  if (missing.length > 0) {
    throw new Error(
      `Locked crates without archived legal material: ${missing.join(", ")}`,
    );
  }

  const vendoredTemporaryRoot = await mkdtemp(
    path.join(tmpdir(), "icblast-vendored-licenses-"),
  );
  try {
    for (const component of VENDORED_PATCHES) {
      vendoredPatches.push(
        await collectVendoredPatch(component, vendoredTemporaryRoot),
      );
    }
  } finally {
    await rm(vendoredTemporaryRoot, { recursive: true, force: true });
  }

  const linkedRuntimeCrates = [];
  const runtimeTemporaryRoot = await mkdtemp(
    path.join(tmpdir(), "icblast-runtime-licenses-"),
  );
  try {
    for (const component of LINKED_RUNTIME_CRATES) {
      linkedRuntimeCrates.push(
        await collectCrateLegalMaterials(component, runtimeTemporaryRoot),
      );
    }
  } finally {
    await rm(runtimeTemporaryRoot, { recursive: true, force: true });
  }

  const generatedCodeComponents = [];
  const generatedCodeTemporaryRoot = await mkdtemp(
    path.join(tmpdir(), "icblast-generated-code-licenses-"),
  );
  try {
    for (const component of GENERATED_CODE_CRATES) {
      generatedCodeComponents.push(
        await collectCrateLegalMaterials(component, generatedCodeTemporaryRoot),
      );
    }
  } finally {
    await rm(generatedCodeTemporaryRoot, { recursive: true, force: true });
  }

  const rustSourceMaterials = [];
  for (const [sourcePath, expectedSha256] of RUST_SOURCE_MATERIALS) {
    const sourceUrl =
      `https://raw.githubusercontent.com/rust-lang/rust/${RUST_REVISION}/${sourcePath}`;
    const bytes = await download(sourceUrl, expectedSha256);
    rustSourceMaterials.push({
      source_path: sourcePath,
      source_url: sourceUrl,
      ...(await storeMaterial(bytes)),
    });
  }
  const rustDistributionBytes = await download(
    RUST_DISTRIBUTION.url,
    RUST_DISTRIBUTION.sha256,
  );
  const rustDistributionRoot = await mkdtemp(
    path.join(tmpdir(), "icblast-rust-distribution-"),
  );
  try {
    const rustDistributionPath = path.join(rustDistributionRoot, "rustc.tar.xz");
    await writeFile(rustDistributionPath, rustDistributionBytes);
    const copyrightLibrary = readXzArchiveEntry(
      rustDistributionPath,
      RUST_DISTRIBUTION.entry,
    );
    const copyrightDigest = sha256(copyrightLibrary);
    if (copyrightDigest !== RUST_DISTRIBUTION.material_sha256) {
      throw new Error(
        `Rust COPYRIGHT-library.html mismatch: expected ${RUST_DISTRIBUTION.material_sha256}, got ${copyrightDigest}`,
      );
    }
    rustSourceMaterials.push({
      source_path: RUST_DISTRIBUTION.entry,
      source_url: RUST_DISTRIBUTION.url,
      source_archive_sha256: RUST_DISTRIBUTION.sha256,
      ...(await storeMaterial(copyrightLibrary)),
    });
  } finally {
    await rm(rustDistributionRoot, { recursive: true, force: true });
  }

  const result = {
    schema: 2,
    cargo_lock_sha256: sha256(cargoLock),
    registry_package_count: packages.length,
    packages,
    vendored_package_count: vendoredPatches.length,
    vendored_packages: vendoredPatches,
    release_files: await Promise.all(
      RELEASE_FILE_PATHS.map((file) => localFileEvidence(file)),
    ),
    linked_runtime: {
      evidence: "didc_wasm_pkg/didc_rust_bg.bin producer and symbol metadata",
      rust: {
        version: "1.89.0",
        revision: RUST_REVISION,
        materials: rustSourceMaterials,
      },
      crates: linkedRuntimeCrates,
    },
    generated_code: {
      evidence: "wasm-bindgen templates incorporated into didc_wasm_pkg/didc_rust.js",
      components: generatedCodeComponents,
    },
  };
  const mapPath = path.join(activeOutputRoot, "map.json");
  await writeFile(mapPath, `${JSON.stringify(result, null, 2)}\n`);
  await chmod(mapPath, 0o644);
}

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function main() {
  await mkdir(OUTPUT_PARENT, { recursive: true });
  if (!(await exists(OUTPUT_ROOT)) && (await exists(PREVIOUS_OUTPUT_ROOT))) {
    await rename(PREVIOUS_OUTPUT_ROOT, OUTPUT_ROOT);
  }
  const stagedOutputRoot = await mkdtemp(
    path.join(OUTPUT_PARENT, ".rust-staging-"),
  );
  await chmod(stagedOutputRoot, 0o755);
  activeOutputRoot = stagedOutputRoot;
  await mkdir(path.join(stagedOutputRoot, "material"), { recursive: true });
  await chmod(path.join(stagedOutputRoot, "material"), 0o755);

  try {
    await generateBundle();
    await rm(PREVIOUS_OUTPUT_ROOT, { recursive: true, force: true });
    let movedPrevious = false;
    if (await exists(OUTPUT_ROOT)) {
      await rename(OUTPUT_ROOT, PREVIOUS_OUTPUT_ROOT);
      movedPrevious = true;
    }
    try {
      await rename(stagedOutputRoot, OUTPUT_ROOT);
    } catch (error) {
      if (movedPrevious && !(await exists(OUTPUT_ROOT))) {
        await rename(PREVIOUS_OUTPUT_ROOT, OUTPUT_ROOT);
      }
      throw error;
    }
    await rm(PREVIOUS_OUTPUT_ROOT, { recursive: true, force: true });
  } finally {
    activeOutputRoot = OUTPUT_ROOT;
    await rm(stagedOutputRoot, { recursive: true, force: true });
  }
}

await main();
