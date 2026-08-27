export type MethodSchema = { input: Record<string, unknown>; output: Record<string, unknown> };
export type MethodSchemaMap = Record<string, MethodSchema>;
export type MethodInputValidation = {
  ok: boolean;
  schema: Record<string, unknown>;
  errors?: unknown;
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface PreparedCall<Result = unknown> {
  /** Canonical, detached, deeply frozen JSON arguments for review. */
  readonly args: readonly JsonValue[];
  /** Dispatches the privately snapshotted Candid arguments exactly once. */
  readonly invoke: () => Promise<Result>;
}

export interface IcblastMethod<Result = unknown> {
  (...args: unknown[]): Promise<Result>;
  prepare(...args: unknown[]): Promise<PreparedCall<Result>>;
  encodeArgs?: (...args: unknown[]) => Promise<number[]>;
  decodeResult?: (bytes: ArrayLike<number>) => Result;
}

export interface IcblastMethodTable {
  readonly size: number;
  get(name: string): IcblastMethod | undefined;
  has(name: string): boolean;
  entries(): IterableIterator<[string, IcblastMethod]>;
  keys(): IterableIterator<string>;
  values(): IterableIterator<IcblastMethod>;
  [Symbol.iterator](): IterableIterator<[string, IcblastMethod]>;
}

export interface IcblastActor {
  [key: string]: any;
  readonly $methods: IcblastMethodTable;
}

export interface ScanMethod {
  name: string;
  kind: 'query' | 'update' | 'oneway';
}

export interface IcblastOptions {
  host?: string;
  local?: boolean;
  local_host?: string;
  id?: number;
  debug?: boolean;
  identity?: any;
  agentOptions?: Record<string, unknown>;
  actorOptions?: Record<string, unknown>;
  /**
   * Browser Wasm source accepted by the packaged wasm-bindgen initializer.
   * Bundlers may pass an emitted asset URL; tests may pass bytes directly.
   */
  didcWasm?: unknown;
  /** Maximum UTF-8 bytes accepted for a Candid source. Defaults to 128 KiB. */
  maxCandidSourceBytes?: number;
  /** Maximum UTF-8 bytes accepted for generated JavaScript. Defaults to 2 MiB. */
  maxGeneratedJavaScriptBytes?: number;
  /** Maximum bytes accepted for an HTTP response before Agent decode. Defaults to 4 MiB. */
  maxHttpResponseBytes?: number;
  /** Maximum Candid wire elements accepted per reply, including blob bytes. Defaults to 100,000. */
  maxDecodedCandidItems?: number;
  /** Maximum nested Candid decode depth. Defaults to 256. */
  maxDecodedCandidDepth?: number;
  /** Maximum structural items in a generated Candid type graph. Defaults to 100,000. */
  maxCandidTypeItems?: number;
  /** Maximum depth of a generated Candid type graph. Defaults to maxDecodedCandidDepth. */
  maxCandidTypeDepth?: number;
  /** Disable numeric Principal and numeric ICRC-account conveniences. */
  allowNumberedPrincipals?: boolean;
}

export interface ExistingIcblastIdentity {
  identity: any;
  id: number;
  principal: string;
  secretPath: string;
}

declare const icblast: {
  principal(id?: number): Promise<string>;
  scan(canister: string, opts?: IcblastOptions): Promise<ScanMethod[]>;
  schema(canister: string, method: string, opts?: IcblastOptions & { useCache?: boolean }): Promise<MethodSchema>;
  call(canister: string, method: string, args?: unknown[], opts?: IcblastOptions): Promise<unknown>;
  validate(
    canister: string,
    method: string,
    args?: unknown[],
    opts?: IcblastOptions & { useCache?: boolean }
  ): Promise<{ ok: boolean; inputValid: boolean; outputValid: boolean; errors?: unknown }>;
  ic(opts?: IcblastOptions): Promise<(canister: string) => Promise<IcblastActor>>;
  hashIdentity(passOrId?: unknown): Promise<any>;
  loadExistingIdentity(id?: number): Promise<ExistingIcblastIdentity>;
  toState(x: unknown): unknown;
  explainMethodSchema(source: any, method: string, options?: Pick<IcblastOptions, 'allowNumberedPrincipals'>): MethodSchema;
  explainServiceSchema(source: any, options?: Pick<IcblastOptions, 'allowNumberedPrincipals'>): MethodSchemaMap;
  validateMethodInput(source: any, method: string, args?: unknown[], options?: Pick<IcblastOptions, 'allowNumberedPrincipals'>): MethodInputValidation;
  validateMethodInputSchema(methodSchema: MethodSchema, args?: unknown[]): MethodInputValidation;
};

export function ic(opts?: IcblastOptions): Promise<(canister: string) => Promise<IcblastActor>>;
export function hashIdentity(passOrId?: unknown): Promise<any>;
export function loadExistingIdentity(id?: number): Promise<ExistingIcblastIdentity>;
export function toState(x: unknown): unknown;
export function explainMethodSchema(source: any, method: string, options?: Pick<IcblastOptions, 'allowNumberedPrincipals'>): MethodSchema;
export function explainServiceSchema(source: any, options?: Pick<IcblastOptions, 'allowNumberedPrincipals'>): MethodSchemaMap;
export function validateMethodInput(source: any, method: string, args?: unknown[], options?: Pick<IcblastOptions, 'allowNumberedPrincipals'>): MethodInputValidation;
export function validateMethodInputSchema(methodSchema: MethodSchema, args?: unknown[]): MethodInputValidation;
export function idlFactoryFromCandid(
  candid: string,
  options?: Pick<
    IcblastOptions,
    'didcWasm' | 'maxCandidSourceBytes' | 'maxGeneratedJavaScriptBytes'
  >
): Promise<(context: { IDL: unknown }) => unknown>;

export default icblast;
