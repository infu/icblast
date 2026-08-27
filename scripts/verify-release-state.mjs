import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  });
}

const status = git([
  "status",
  "--porcelain=v1",
  "--untracked-files=all",
]);
if (status.length !== 0) {
  throw new Error(
    "Refusing to publish icblast from a dirty tree; commit the exact reviewed release bytes first.",
  );
}

const currentManifest = await readFile(path.join(ROOT, "package.json"), "utf8");
const committedManifest = git(["show", "HEAD:package.json"]);
if (currentManifest !== committedManifest) {
  throw new Error(
    "Refusing to publish icblast because package.json differs from the committed release.",
  );
}

const manifest = JSON.parse(currentManifest);
if (manifest.version !== "4.3.3" || manifest.license !== "Apache-2.0") {
  throw new Error(
    "Refusing to publish an unexpected icblast release identity.",
  );
}

const head = git(["rev-parse", "HEAD"]).trim();
process.stdout.write(
  `Verified clean icblast@${manifest.version} release commit ${head}.\n`,
);
