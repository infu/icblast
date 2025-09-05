import { spawnSync } from 'node:child_process';
import assert from 'node:assert';

const CAN = process.env.LEDGER_CANISTER || 'f54if-eqaaa-aaaaq-aacea-cai';

function run(argv, opts = {}) {
  const res = spawnSync('./blast', argv, { encoding: 'utf8', ...opts });
  if (res.error) throw res.error;
  return res;
}

function stripAnsi(s) { return s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, ''); }

// 1) scan lists key ICRC-1 methods
{
  const res = run(['scan', CAN]);
  assert.strictEqual(res.status, 0, res.stderr);
  const out = stripAnsi(res.stdout);
  assert(out.includes('icrc1_name'), 'scan: missing icrc1_name');
  assert(out.includes('icrc1_symbol'), 'scan: missing icrc1_symbol');
  assert(out.includes('icrc1_total_supply'), 'scan: missing icrc1_total_supply');
}

// 2) schema of icrc1_name has no inputs and string output
{
  const res = run(['schema', CAN, 'icrc1_name']);
  assert.strictEqual(res.status, 0, res.stderr);
  const j = JSON.parse(res.stdout);
  assert.strictEqual(j.input.type, 'array');
  assert.strictEqual(j.input.minItems, 0);
  assert.strictEqual(j.input.maxItems, 0);
  assert.strictEqual(j.output.type, 'string');
}

// 3) call icrc1_name returns a non-empty string
{
  const res = run(['call', CAN, 'icrc1_name']);
  assert.strictEqual(res.status, 0, res.stderr);
  const name = JSON.parse(res.stdout);
  assert.strictEqual(typeof name, 'string');
  assert(name.length > 0, 'empty name');
}

// 4) validate icrc1_name succeeds
{
  const res = run(['validate', CAN, 'icrc1_name']);
  assert.strictEqual(res.status, 0, res.stderr);
  const j = JSON.parse(res.stdout);
  assert.strictEqual(j.ok, true);
  assert.strictEqual(j.inputValid, true);
  assert.strictEqual(j.outputValid, true);
}

// 5) call and validate icrc1_symbol and icrc1_decimals
{
  const sym = JSON.parse(run(['call', CAN, 'icrc1_symbol']).stdout);
  assert.strictEqual(typeof sym, 'string');
  assert(sym.length > 0, 'empty symbol');
  const dec = JSON.parse(run(['call', CAN, 'icrc1_decimals']).stdout);
  assert.strictEqual(typeof dec, 'number');
  const v1 = JSON.parse(run(['validate', CAN, 'icrc1_symbol']).stdout);
  assert(v1.ok);
  const v2 = JSON.parse(run(['validate', CAN, 'icrc1_decimals']).stdout);
  assert(v2.ok);
}

// 6) validate total_supply (bigint as string)
{
  const res = run(['validate', CAN, 'icrc1_total_supply']);
  assert.strictEqual(res.status, 0, res.stderr);
  const j = JSON.parse(res.stdout);
  assert(j.ok);
}

console.log('ledger.cli tests passed for', CAN);

