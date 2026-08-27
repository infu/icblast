import { describe, expect, it } from 'vitest';
import { Principal } from '@dfinity/principal';
import {
  convert as convertBrowser,
  convertBack,
  explainMethodSchema as explainBrowserMethodSchema,
  explainer,
  toState as browserToState,
  validateMethodInputSchema as validateBrowserMethodInputSchema,
} from '../lib/browser.js';
import {
  convert as convertNode,
  convertBack as convertNodeBack,
  explainMethodSchema as explainNodeMethodSchema,
  explainer as nodeExplainer,
  toState as nodeToState,
  validateMethodInputSchema as validateNodeMethodInputSchema,
} from '../lib/icb_node.js';

const service = ({ IDL: Candid }) => Candid.Service({
  account: Candid.Func([], [Candid.Record({
    owner: Candid.Principal,
    subaccount: Candid.Opt(Candid.Vec(Candid.Nat8)),
  })], ['query']),
  owner_record: Candid.Func([], [Candid.Record({
    owner: Candid.Principal,
    ledgers: Candid.Vec(Candid.Text),
  })], ['query']),
  extended_account: Candid.Func([], [Candid.Record({
    owner: Candid.Principal,
    subaccount: Candid.Opt(Candid.Vec(Candid.Nat8)),
    label: Candid.Text,
  })], ['query']),
});

const nullableService = ({ IDL: Candid }) => Candid.Service({
  nullable: Candid.Func([], [Candid.Record({
    explicit: Candid.Null,
    absent: Candid.Opt(Candid.Text),
    present_null: Candid.Opt(Candid.Null),
  })], ['query']),
});

const resultService = ({ IDL: Candid }) => Candid.Service({
  lower_result: Candid.Func([], [Candid.Variant({
    ok: Candid.Record({ value: Candid.Nat }),
    err: Candid.Variant({
      conflict: Candid.Record({ expected: Candid.Nat, actual: Candid.Nat }),
    }),
  })], ['query']),
});

const multipleOutputService = ({ IDL: Candid }) => Candid.Service({
  values: Candid.Func([], [Candid.Nat, Candid.Opt(Candid.Text)], ['query']),
});

const principalInputService = ({ IDL: Candid }) => Candid.Service({
  principal: Candid.Func([Candid.Principal], [], []),
  account: Candid.Func([Candid.Record({
    owner: Candid.Principal,
    subaccount: Candid.Opt(Candid.Vec(Candid.Nat8)),
  })], [], []),
  nested: Candid.Func([Candid.Record({
    owners: Candid.Vec(Candid.Opt(Candid.Principal)),
  })], [], []),
});

const recursiveService = ({ IDL: Candid }) => {
  const tree = Candid.Rec();
  tree.fill(Candid.Variant({
    branch: Candid.Record({ left: tree, right: tree }),
    leaf: Candid.Nat,
  }));
  return Candid.Service({
    tree: Candid.Func([tree], [tree], ['query']),
  });
};

describe('browser numbered-Principal policy', () => {
  it('can reject numeric Principal conveniences without touching browser storage', async () => {
    const methods = explainer(principalInputService);
    await expect(
      convertBrowser([7], methods.principal.input, {
        allowNumberedPrincipals: false,
      }),
    ).rejects.toContain('numbered principals disabled');
    await expect(
      convertBrowser(['7-1'], methods.account.input, {
        allowNumberedPrincipals: false,
      }),
    ).rejects.toContain('numbered principals disabled');
  });

  it('emits validation schemas that match the disabled shorthand policy', () => {
    const principal = explainBrowserMethodSchema(
      principalInputService,
      'principal',
      { allowNumberedPrincipals: false },
    );
    const account = explainBrowserMethodSchema(
      principalInputService,
      'account',
      { allowNumberedPrincipals: false },
    );
    const nested = explainBrowserMethodSchema(
      principalInputService,
      'nested',
      { allowNumberedPrincipals: false },
    );

    expect(validateBrowserMethodInputSchema(principal, [7]).ok).toBe(false);
    expect(validateBrowserMethodInputSchema(principal, ['2vxsx-fae']).ok).toBe(true);
    expect(validateBrowserMethodInputSchema(account, ['7-1']).ok).toBe(false);
    expect(validateBrowserMethodInputSchema(account, ['2vxsx-fae']).ok).toBe(true);
    expect(validateBrowserMethodInputSchema(nested, [{ owners: [7] }]).ok).toBe(false);
    expect(
      validateBrowserMethodInputSchema(
        nested,
        [{ owners: ['2vxsx-fae', null] }],
      ).ok,
    ).toBe(true);
  });
});

describe.each([
  [
    'browser',
    convertBrowser,
    { idNum: 0, selfPrincipal: Principal.anonymous() },
  ],
  ['node', convertNode, {}],
])('%s ICRC shorthand subaccount bounds', (_name, convertInput, ctx) => {
  it('accepts 2^256 - 1 and rejects 2^256 without truncation', async () => {
    const signature = (_name === 'browser' ? explainer : nodeExplainer)(
      principalInputService,
    ).account;
    const max = (1n << 256n) - 1n;
    const overflow = 1n << 256n;

    const [account] = await convertInput(
      [`0-${max}`],
      signature.input,
      ctx,
    );
    expect(account.subaccount).toHaveLength(1);
    expect([...account.subaccount[0]]).toEqual(new Array(32).fill(255));
    await expect(
      convertInput([`0-${overflow}`], signature.input, ctx),
    ).rejects.toContain('subaccount exceeds 32 bytes');
  });
});

describe.each([
  ['node', explainNodeMethodSchema, validateNodeMethodInputSchema],
  ['browser', explainBrowserMethodSchema, validateBrowserMethodInputSchema],
])('%s numbered-Principal schema compatibility', (_name, explain, validate) => {
  it('keeps numeric shorthand enabled by default', () => {
    expect(validate(explain(principalInputService, 'principal'), [7]).ok).toBe(true);
  });
});

describe.each([
  ['node', explainNodeMethodSchema, validateNodeMethodInputSchema],
  ['browser', explainBrowserMethodSchema, validateBrowserMethodInputSchema],
])('%s recursive Candid schemas', (_name, explain, validate) => {
  it('uses local references for a valid recursive signature', () => {
    const methodSchema = explain(recursiveService, 'tree');
    const root = methodSchema.input.prefixItems[0];
    const branch = root.oneOf.find((item) => item.required[0] === 'branch');

    expect(methodSchema.input.$defs.candidType1).toEqual(root);
    expect(branch.properties.branch.properties.left).toEqual({
      $ref: '#/$defs/candidType1',
    });
    expect(branch.properties.branch.properties.right).toEqual({
      $ref: '#/$defs/candidType1',
    });
    expect(validate(methodSchema, [{
      branch: {
        left: { leaf: '1' },
        right: { branch: {
          left: { leaf: '2' },
          right: { leaf: '3' },
        } },
      },
    }]).ok).toBe(true);
    expect(validate(
      { input: methodSchema.output },
      { branch: {
        left: { leaf: '4' },
        right: { leaf: '5' },
      } },
    ).ok).toBe(true);
    expect(methodSchema.output).toEqual(expect.objectContaining({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $defs: {
        candidType1: expect.any(Object),
      },
    }));
  });

  it('bounds acyclic schema depth and type items', () => {
    const deepService = ({ IDL: Candid }) => Candid.Service({
      deep: Candid.Func(
        [Candid.Vec(Candid.Vec(Candid.Vec(Candid.Vec(Candid.Text))))],
        [],
        ['query'],
      ),
    });
    const wideService = ({ IDL: Candid }) => Candid.Service({
      wide: Candid.Func(
        [Candid.Tuple(Candid.Text, Candid.Text, Candid.Text)],
        [],
        ['query'],
      ),
    });

    expect(() => explain(deepService, 'deep', {
      maxCandidTypeDepth: 4,
    })).toThrow('Candid type graph exceeds 4 depth');
    expect(() => explain(wideService, 'wide', {
      maxCandidTypeItems: 3,
    })).toThrow('Candid type table exceeds 3 items');
  });
});

it('keeps recursive schema generation identical in Node and browsers', () => {
  const nodeSchema = explainNodeMethodSchema(recursiveService, 'tree');
  const browserSchema = explainBrowserMethodSchema(recursiveService, 'tree');

  expect(browserSchema).toEqual(nodeSchema);
  expect(() => JSON.stringify(browserSchema)).not.toThrow();
});

describe.each([
  ['node', explainNodeMethodSchema],
  ['browser', explainBrowserMethodSchema],
])('%s ICRC account schema detection', (_name, explain) => {
  it('uses shorthand only for the exact owner/subaccount record', () => {
    expect(explain(service, 'account').output).toMatchObject({
      type: 'string',
      description: expect.stringMatching(/icrc.?1 account/i),
    });
    expect(explain(service, 'owner_record').output).toMatchObject({
      type: 'object',
      properties: {
        owner: expect.any(Object),
        ledgers: expect.any(Object),
      },
    });
    expect(explain(service, 'extended_account').output).toMatchObject({
      type: 'object',
      properties: {
        owner: expect.any(Object),
        subaccount: expect.any(Object),
        label: expect.any(Object),
      },
    });
  });
});

describe('browser Candid result conversion', () => {
  it('preserves null and omits only absent options', () => {
    const signature = explainer(nullableService).nullable;
    expect(convertBack({
      explicit: null,
      absent: [],
      present_null: [null],
    }, signature.output)).toEqual({
      explicit: null,
      present_null: null,
    });
  });
});

describe.each([
  ['node', nodeExplainer, convertNodeBack],
  ['browser', explainer, convertBack],
])('%s Candid Result conversion', (_name, explain, convertResult) => {
  it('unwraps lowercase Motoko results and throws JSON-safe error details', () => {
    const signature = explain(resultService).lower_result;
    expect(convertResult({ ok: { value: 7n } }, signature.output)).toEqual({
      value: '7',
    });

    let thrown;
    try {
      convertResult({
        err: { conflict: { expected: 2n, actual: 3n } },
      }, signature.output);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toEqual({
      conflict: { expected: '2', actual: '3' },
    });
  });

  it('generates the JSON schema for the unwrapped lowercase success value', () => {
    expect(
      (_name === 'node' ? explainNodeMethodSchema : explainBrowserMethodSchema)(
        resultService,
        'lower_result',
      ).output,
    ).toMatchObject({
      type: 'object',
      properties: {
        value: { type: 'string', description: 'bigint as string' },
      },
      required: ['value'],
    });
  });
});

describe.each([
  ['node', nodeExplainer, convertNodeBack, explainNodeMethodSchema],
  ['browser', explainer, convertBack, explainBrowserMethodSchema],
])('%s multiple Candid return conversion', (_name, explain, convertResult, explainMethod) => {
  it('returns the fixed JSON array described by the generated schema', () => {
    const signature = explain(multipleOutputService).values;
    const output = convertResult([7n, []], signature.output);

    expect(output).toEqual(['7', null]);
    expect(explainMethod(multipleOutputService, 'values').output).toMatchObject({
      type: 'array',
      minItems: 2,
      maxItems: 2,
    });
  });
});

describe.each([
  ['node', nodeToState],
  ['browser', browserToState],
])('%s JSON state normalization', (_name, toState) => {
  it('omits absent record options and normalizes absent array values', () => {
    expect(toState({
      present: 'value',
      explicitNull: null,
      absent: undefined,
      nested: [{ absent: undefined, present: 1n }],
      tuple: [undefined, 'value'],
    })).toEqual({
      present: 'value',
      explicitNull: null,
      nested: [{ present: '1' }],
      tuple: [null, 'value'],
    });
  });

  it('rejects numbers that JSON cannot represent', () => {
    expect(() => toState(Number.POSITIVE_INFINITY)).toThrow(
      'Non-finite numbers are not JSON-compatible',
    );
  });
});
