import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmod, link, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { hashIdentity, loadExistingIdentity } from "../lib/index.js";

describe.sequential("strict existing identity API", () => {
  let root;
  let previousConfig;
  let previousSecret;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "icblast-identity-"));
    previousConfig = process.env.XDG_CONFIG_HOME;
    previousSecret = process.env.SECRET;
    process.env.XDG_CONFIG_HOME = root;
    delete process.env.SECRET;
  });

  afterEach(async () => {
    if (previousConfig === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousConfig;
    if (previousSecret === undefined) delete process.env.SECRET;
    else process.env.SECRET = previousSecret;
    await rm(root, { recursive: true, force: true });
  });

  async function writeSecret(secret = "ab".repeat(512)) {
    const file = path.join(root, "blast", "secret");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${secret}\n`, { mode: 0o600 });
    return file;
  }

  it("loads the same numbered identity as hashIdentity without changing the file", async () => {
    const secretPath = await writeSecret();
    const strict = await loadExistingIdentity(17);
    const compatible = await hashIdentity(17);

    expect(strict.id).toBe(17);
    expect(strict.secretPath).toBe(secretPath);
    expect(strict.principal).toBe(compatible.getPrincipal().toText());
    expect(strict.identity.getPrincipal().toText()).toBe(strict.principal);
  });

  it("fails rather than generating a missing secret", async () => {
    await expect(loadExistingIdentity(0)).rejects.toThrow(/refusing to generate/i);
  });

  it("rejects SECRET instead of changing which identity is used", async () => {
    await writeSecret();
    process.env.SECRET = "x".repeat(64);
    await expect(loadExistingIdentity(0)).rejects.toThrow(/SECRET environment override/);
  });

  it("rejects group-readable secret files", async () => {
    const file = await writeSecret();
    await chmod(file, 0o640);
    await expect(loadExistingIdentity(0)).rejects.toThrow(/group or other users/);
  });

  it("rejects symlinks and hard-linked secrets", async () => {
    const target = path.join(root, "target-secret");
    await writeFile(target, `${"ab".repeat(512)}\n`, { mode: 0o600 });
    await mkdir(path.join(root, "blast"), { recursive: true });
    await symlink(target, path.join(root, "blast", "secret"));
    await expect(loadExistingIdentity(0)).rejects.toThrow(/safely open/);

    await rm(path.join(root, "blast", "secret"));
    await link(target, path.join(root, "blast", "secret"));
    await expect(loadExistingIdentity(0)).rejects.toThrow(/non-hard-linked/);
  });
});
