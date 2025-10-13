import { describe, it, expect } from 'vitest';
import icblast from '../lib/index.js';

describe('icblast library API', () => {
  const LEDGER = 'f54if-eqaaa-aaaaq-aacea-cai';
  const DEX = 'togwv-zqaaa-aaaal-qr7aa-cai';

  it('principal returns deterministic text', async () => {
    const p0 = await icblast.principal(0);
    const p0b = await icblast.principal(0);
    expect(p0).toMatch(/^[a-z0-9-]+$/);
    expect(p0).toBe(p0b);
  }, 30000);

  it('scan returns methods and refreshes cache', async () => {
    const methods = await icblast.scan(LEDGER, { id: 0 });
    expect(Array.isArray(methods)).toBe(true);
    expect(methods.find(m => m.name === 'icrc1_balance_of')).toBeTruthy();
  }, 60000);

  it('schema returns input/output', async () => {
    const sch = await icblast.schema(LEDGER, 'icrc1_balance_of', { id: 0 });
    expect(sch).toHaveProperty('input');
    expect(sch).toHaveProperty('output');
  }, 40000);

  it('call icrc1_balance_of with shorthand returns digits', async () => {
    const out = await icblast.call(LEDGER, 'icrc1_balance_of', ['0'], { id: 0 });
    expect(typeof out).toBe('string');
    expect(out).toMatch(/^\d+$/);
  }, 40000);

  it('validate icrc1_balance_of ok', async () => {
    const res = await icblast.validate(LEDGER, 'icrc1_balance_of', ['0'], { id: 0 });
    expect(res.ok).toBe(true);
    expect(res.inputValid).toBe(true);
    expect(res.outputValid).toBe(true);
  }, 40000);

  it('validate returns verbose errors for wrong input', async () => {
    // icrc1_balance_of expects an ICRC-1 account string; feed an object
    const badArgs = [{}];
    const res = await icblast.validate(LEDGER, 'icrc1_balance_of', badArgs, { id: 0 });
    expect(res.ok).toBe(false);
    expect(res.inputValid).toBe(false);
    expect(Array.isArray(res.errors)).toBe(true);
    // Ajv v8 error shape: items include message and instancePath
    const first = res.errors?.[0];
    expect(first).toBeTruthy();
    expect(typeof first.message).toBe('string');
    // instancePath like "/0" for first arg
    expect(typeof first.instancePath).toBe('string');
  }, 20000);

  it('DEX icrc55_accounts returns ICRC-1 account strings', async () => {
    const out = await icblast.call(DEX, 'icrc55_accounts', ['0'], { id: 0 });
    expect(Array.isArray(out)).toBe(true);
    if (out.length) {
      const acc = out[0]?.endpoint?.ic?.account;
      expect(typeof acc).toBe('string');
      expect(acc).toMatch(/^[a-z0-9-]+-cai(.*)?$/);
    }
  }, 60000);
});
