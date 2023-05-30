import esbuild from "esbuild";
import fs from "fs/promises";

const pkg = JSON.parse(await fs.readFile("./package.json"));

const config = {
  entryPoints: ["./src/browser.js"],
  outfile: "./esm/browser.js",
  bundle: true,
  minify: true,
  external: [...Object.keys(pkg.peerDependencies || {})],
  format: "esm",
  plugins: [],
  platform: "browser",
};

esbuild.build(config).catch(() => process.exit(1));

esbuild
  .build({
    ...config,
    entryPoints: ["./src/index.js"],
    platform: "node",
    format: "esm",
    outfile: "./esm/index.js",
  })
  .catch(() => process.exit(1));

esbuild
  .build({
    ...config,
    entryPoints: ["./src/index.js"],
    platform: "node",
    format: "cjs",
    outfile: "./cjs/index.js",
  })
  .catch(() => process.exit(1));

esbuild
  .build({
    ...config,
    entryPoints: ["./src/browser.js"],
    platform: "browser",
    format: "cjs",
    outfile: "./cjs/browser.js",
  })
  .catch(() => process.exit(1));
