import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { stat, readFile } from 'node:fs/promises';
import { decodeIcrcAccount } from '@dfinity/ledger-icrc';

const execFileAsync = promisify(execFile);
const CLI = 'node';
const CLI_SCRIPT = 'bin/blast.js';

async function runCli(args, opts = {}) {
  const { stdout } = await execFileAsync(CLI, [CLI_SCRIPT, ...args], {
    env: { ...process.env, NO_COLOR: '1' },
    maxBuffer: 1024 * 1024,
    ...opts,
  });
  return stdout;
}

async function call(canister, method, argsJson, id = 0) {
  const stdout = await runCli(['call', canister, method, ...(argsJson != null ? [argsJson] : []), '--id', String(id)]);
  try { return JSON.parse(stdout); } catch { throw new Error('Non-JSON output: ' + stdout); }
}

async function schema(canister, method, id = 0) {
  const stdout = await runCli(['schema', canister, method, '--id', String(id)]);
  return JSON.parse(stdout);
}

describe('blast CLI against public canisters', () => {
  const LEDGER = 'f54if-eqaaa-aaaaq-aacea-cai';
  const GOVERNANCE = 'eqsml-lyaaa-aaaaq-aacdq-cai';
  const DEX = 'togwv-zqaaa-aaaal-qr7aa-cai';

  it('prints principal for id 0', async () => {
    const stdout = await runCli(['principal', '--id', '0']);
    expect(stdout.trim()).toMatch(/^[a-z0-9-]+$/);
  }, 30000);

  it('principal is deterministic across calls and varies by id', async () => {
    const p0a = (await runCli(['principal', '--id', '0'])).trim();
    const p0b = (await runCli(['principal', '--id', '0'])).trim();
    const p12 = (await runCli(['principal', '--id', '12'])).trim();
    expect(p0a).toBe(p0b);
    expect(p12).not.toBe(p0a);
  }, 30000);

  it('scan: ledger lists icrc1_balance_of', async () => {
    const stdout = await runCli(['scan', LEDGER, '--id', '0']);
    expect(stdout).toContain('icrc1_balance_of');
    expect(stdout).toContain('icrc1_minting_account');
  }, 30000);

  it('schema: ledger icrc1_balance_of accepts icrc1 account string', async () => {
    const s = await schema(LEDGER, 'icrc1_balance_of', 0);
    // input is array with one string (icrc1 account or shorthand)
    expect(s.input).toBeTruthy();
    expect(JSON.stringify(s.input)).toContain('icrc1 account');
  }, 30000);

  it('scan refreshes schema cache and file exists', async () => {
    await runCli(['scan', LEDGER, '--id', '0']);
    const base = process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Caches', 'blast')
      : path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'blast');
    const cachePath = path.join(base, 'schemas', `${LEDGER}.json`);
    const st = await stat(cachePath);
    expect(st.isFile()).toBe(true);
    const txt = await readFile(cachePath, 'utf8');
    expect(txt).toContain('icrc1_balance_of');
  }, 60000);

  it('call: ledger icrc1_balance_of with shorthand "0" returns a numeric string', async () => {
    const out = await call(LEDGER, 'icrc1_balance_of', '["0"]', 0);
    // out is a bigint rendered as string
    expect(typeof out).toBe('string');
    expect(out).toMatch(/^\d+$/);
  }, 30000);

  it('call: ledger icrc1_balance_of with shorthand "12-444" returns a numeric string', async () => {
    const out = await call(LEDGER, 'icrc1_balance_of', '["12-444"]', 0);
    expect(typeof out).toBe('string');
    expect(out).toMatch(/^\d+$/);
  }, 30000);

  it('call: ledger icrc1_balance_of with full icrc1 text account returns digits', async () => {
    const acct = 'togwv-zqaaa-aaaal-qr7aa-cai-oq7ilwi.2e10e7b42023f667a1db51ff9c7c88f08fb9022d6453bf0c5b0696666e41f048';
    const out = await call(LEDGER, 'icrc1_balance_of', JSON.stringify([acct]), 0);
    expect(typeof out).toBe('string');
    expect(out).toMatch(/^\d+$/);
  }, 40000);

  it('call: ledger icrc2_allowance with owner/spender shorthand returns allowance', async () => {
    const out = await call(LEDGER, 'icrc2_allowance', '[{"account":"0","spender":"12"}]', 0);
    expect(out).toHaveProperty('allowance');
    expect(out.allowance).toMatch(/^\d+$/);
  }, 40000);

  it('validate: ledger icrc2_allowance with shorthands returns ok', async () => {
    const stdout = await runCli(['validate', LEDGER, 'icrc2_allowance', '[{"account":"0","spender":"12"}]', '--id', '0']);
    const res = JSON.parse(stdout);
    expect(res.ok).toBe(true);
    expect(res.inputValid).toBe(true);
    expect(res.outputValid).toBe(true);
  }, 40000);

  it('call: ledger icrc1_minting_account returns icrc1 account or null', async () => {
    const out = await call(LEDGER, 'icrc1_minting_account', undefined, 0);
    if (out === null) {
      expect(out).toBeNull();
    } else {
      expect(typeof out).toBe('string');
      // ensure it decodes as a valid account
      const acc = decodeIcrcAccount(out);
      expect(acc.owner?.toText?.()).toMatch(/^[a-z0-9-]+-cai$/);
      if (acc.subaccount) expect(acc.subaccount.byteLength).toBe(32);
    }
  }, 40000);

  it('scan: governance lists get_running_sns_version', async () => {
    const stdout = await runCli(['scan', GOVERNANCE, '--id', '0']);
    expect(stdout).toContain('get_running_sns_version');
  }, 30000);

  it('call: governance get_running_sns_version works with empty record arg', async () => {
    const out = await call(GOVERNANCE, 'get_running_sns_version', '[{}]', 0);
    expect(out).toHaveProperty('deployed_version');
    const dv = out.deployed_version;
    expect(typeof dv.ledger_wasm_hash).toBe('string');
    expect(dv.ledger_wasm_hash).toMatch(/^[0-9a-f]{64}$/);
  }, 40000);

  it('call: dex icrc55_accounts returns array with icrc1 account strings', async () => {
    const out = await call(DEX, 'icrc55_accounts', '["0"]', 0);
    expect(Array.isArray(out)).toBe(true);
    if (out.length > 0) {
      const first = out[0];
      expect(first).toHaveProperty('endpoint');
      const acc = first?.endpoint?.ic?.account;
      expect(typeof acc).toBe('string');
      // should be principal text, possibly with subaccount suffix
      expect(acc).toMatch(/^[a-z0-9-]+-cai(.*)?$/);
    }
  }, 60000);
});
