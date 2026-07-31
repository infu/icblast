import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Ed25519KeyIdentity } from "@dfinity/identity";

const MAX_IDENTITY_ID = 65_535;
const MIN_FILE_SECRET_LENGTH = 64;
const MAX_SECRET_BYTES = 1024 * 1024;

function validateIdentityId(idNum) {
  if (!Number.isInteger(idNum) || idNum < 0 || idNum > MAX_IDENTITY_ID) {
    throw new Error("--id must be an integer in [0,65535]");
  }
}

export function resolveSecretPath(env = process.env) {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "blast", "secret");
  }
  if (process.platform === "win32") {
    const base = env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(base, "blast", "secret");
  }
  const xdg = env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(xdg, "blast", "secret");
}

function deriveSeedFromSecret(secretStr, idNum) {
  const length = secretStr.length;
  const window = Math.min(128, length);
  const index = length > 0 ? idNum % length : 0;
  const part = (secretStr + secretStr).substring(index, index + window);
  return createHash("sha256").update(part + String(idNum)).digest();
}

function deriveIdentity(secret, idNum) {
  validateIdentityId(idNum);
  const seed = deriveSeedFromSecret(secret, idNum);
  return Ed25519KeyIdentity.generate(new Uint8Array(seed));
}

async function ensureSecretString() {
  const secretPath = resolveSecretPath();
  try {
    const cleaned = (await readFile(secretPath, "utf8")).trim();
    if (cleaned.length >= MIN_FILE_SECRET_LENGTH) return cleaned;
  } catch (_) {
    // Preserve hashIdentity's existing behavior: generate after a failed read.
  }
  const hex = randomBytes(512).toString("hex");
  await mkdir(path.dirname(secretPath), { recursive: true });
  await writeFile(secretPath, hex + "\n", { mode: 0o600 });
  return hex;
}

/**
 * Existing icblast identity behavior. This remains permissive for compatibility:
 * it accepts SECRET and creates the configured secret when one does not exist.
 */
export async function hashIdentity(idNum = 0) {
  validateIdentityId(idNum);
  const envSecret = process.env.SECRET;
  let secretSource;
  if (envSecret != null) {
    if (envSecret.length < 32) {
      throw new Error("SECRET env must be at least 32 characters long");
    }
    secretSource = envSecret;
  } else {
    secretSource = await ensureSecretString();
  }
  return deriveIdentity(secretSource, idNum);
}

/**
 * Load a numbered identity from the already-configured icblast secret, or fail.
 * Unlike hashIdentity, this API never accepts SECRET and never creates a key.
 */
export async function loadExistingIdentity(idNum = 0) {
  validateIdentityId(idNum);
  if (process.env.SECRET !== undefined) {
    throw new Error(
      "Refusing the SECRET environment override; an existing icblast secret file is required",
    );
  }
  if (typeof constants.O_NOFOLLOW !== "number") {
    throw new Error("This platform cannot safely open an existing icblast secret without following symlinks");
  }

  const secretPath = resolveSecretPath();
  let handle;
  try {
    handle = await open(secretPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    throw new Error(
      `Cannot safely open existing icblast secret ${secretPath}; refusing to generate or replace it`,
      { cause: error },
    );
  }

  let secret;
  try {
    const file = await handle.stat();
    if (!file.isFile() || file.nlink !== 1) {
      throw new Error(
        `icblast secret ${secretPath} must be one regular, non-hard-linked file`,
      );
    }
    if ((file.mode & 0o077) !== 0) {
      throw new Error(
        `icblast secret ${secretPath} must not be accessible by group or other users`,
      );
    }
    const uid = typeof process.getuid === "function" ? process.getuid() : null;
    if (uid !== null && file.uid !== uid) {
      throw new Error(`icblast secret ${secretPath} is not owned by the current user`);
    }
    if (file.size > MAX_SECRET_BYTES) {
      throw new Error(`icblast secret ${secretPath} is unexpectedly large`);
    }

    // Read through the verified descriptor. Reopening by pathname here would
    // reintroduce a check/use race and could derive a different identity.
    secret = (await handle.readFile("utf8")).trim();
    if (secret.length < MIN_FILE_SECRET_LENGTH) {
      throw new Error(`icblast secret ${secretPath} is malformed or too short`);
    }
  } finally {
    await handle.close();
  }

  const identity = deriveIdentity(secret, idNum);
  return {
    identity,
    id: idNum,
    principal: identity.getPrincipal().toText(),
    secretPath,
  };
}
