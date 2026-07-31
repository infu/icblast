import { describe, expect, it } from 'vitest';
import {
  convertBack,
  explainMethodSchema as explainBrowserMethodSchema,
  explainer,
  toState as browserToState,
} from '../lib/browser.js';
import {
  convertBack as convertNodeBack,
  explainMethodSchema as explainNodeMethodSchema,
  explainer as nodeExplainer,
  toState as nodeToState,
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
