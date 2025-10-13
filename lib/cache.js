import os from 'node:os';
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

export function cacheBaseDir() {
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Caches', 'blast');
  const xdg = process.env.XDG_CACHE_HOME || path.join(home, '.cache');
  return path.join(xdg, 'blast');
}

export function schemaCachePath(canisterId) {
  return path.join(cacheBaseDir(), 'schemas', `${canisterId}.json`);
}

export async function loadSchemaCache(canisterId) {
  try {
    const txt = await readFile(schemaCachePath(canisterId), 'utf8');
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

export async function saveSchemaCache(canisterId, payload) {
  const p = schemaCachePath(canisterId);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(payload, null, 2), 'utf8');
}

