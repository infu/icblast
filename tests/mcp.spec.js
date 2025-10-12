import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('MCP Server tools', () => {
  let client;
  let transport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: process.execPath,
      args: ['bin/blast.js', 'mcp'],
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' }
    });
    client = new Client({ name: 'icblast-tests', version: '0.0.0' });
    await client.connect(transport);
  }, 20000);

  afterAll(async () => {
    await client.close();
    await transport.close();
  });

  it('lists tools', async () => {
    const res = await client.listTools();
    const tools = res.tools.map(t => t.name);
    expect(tools).toContain('schema');
    expect(tools).toContain('scan');
    expect(tools).toContain('call');
    expect(tools).toContain('validate');
    expect(tools).toContain('principal');
  }, 20000);

  it('schema returns for dex_quote', async () => {
    const res = await client.callTool({ name: 'schema', arguments: { canister: 'togwv-zqaaa-aaaal-qr7aa-cai', method: 'dex_quote' } });
    expect(res.structuredContent).toBeTruthy();
    expect(res.structuredContent).toHaveProperty('input');
    expect(res.structuredContent).toHaveProperty('output');
  }, 40000);

  it('schema returns for add_supported_ledger', async () => {
    const res = await client.callTool({ name: 'schema', arguments: { canister: 'togwv-zqaaa-aaaal-qr7aa-cai', method: 'add_supported_ledger' } });
    expect(res.structuredContent).toBeTruthy();
    expect(res.structuredContent).toHaveProperty('input');
    expect(res.structuredContent).toHaveProperty('output');
  }, 40000);

  it('principal returns text for id 0', async () => {
    const res = await client.callTool({ name: 'principal', arguments: { id: 0 } });
    const text = res.content.find(c => c.type === 'text');
    expect(text?.text).toMatch(/^[a-z0-9-]+$/);
  }, 20000);

  it('call icrc1_balance_of with shorthand via MCP returns digits', async () => {
    const res = await client.callTool({ name: 'call', arguments: { canister: 'f54if-eqaaa-aaaaq-aacea-cai', method: 'icrc1_balance_of', args: ['0'] } });
    expect(typeof res.structuredContent?.result).toBe('string');
    expect(res.structuredContent?.result).toMatch(/^\d+$/);
  }, 40000);

  it('validate icrc1_balance_of ok via MCP', async () => {
    const res = await client.callTool({ name: 'validate', arguments: { canister: 'f54if-eqaaa-aaaaq-aacea-cai', method: 'icrc1_balance_of', args: ['0'] } });
    expect(res.structuredContent?.ok).toBe(true);
    expect(res.structuredContent?.inputValid).toBe(true);
    expect(res.structuredContent?.outputValid).toBe(true);
  }, 40000);

  it('call icrc1_balance_of with full icrc1 text account via MCP returns digits', async () => {
    const acct = 'togwv-zqaaa-aaaal-qr7aa-cai-oq7ilwi.2e10e7b42023f667a1db51ff9c7c88f08fb9022d6453bf0c5b0696666e41f048';
    const res = await client.callTool({ name: 'call', arguments: { canister: 'f54if-eqaaa-aaaaq-aacea-cai', method: 'icrc1_balance_of', args: [acct] } });
    expect(typeof res.structuredContent?.result).toBe('string');
    expect(res.structuredContent?.result).toMatch(/^\d+$/);
  }, 40000);
});
