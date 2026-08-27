export type MethodSchema = { input: Record<string, unknown>; output: Record<string, unknown> };
export type MethodSchemaMap = Record<string, MethodSchema>;
export type MethodInputValidation = {
  ok: boolean;
  schema: Record<string, unknown>;
  errors?: unknown;
};

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
  ic(opts?: IcblastOptions): Promise<(canister: string) => Promise<any>>;
  hashIdentity(passOrId?: unknown): Promise<any>;
  loadExistingIdentity(id?: number): Promise<ExistingIcblastIdentity>;
  toState(x: unknown): unknown;
  explainMethodSchema(source: any, method: string, options?: Pick<IcblastOptions, 'allowNumberedPrincipals'>): MethodSchema;
  explainServiceSchema(source: any, options?: Pick<IcblastOptions, 'allowNumberedPrincipals'>): MethodSchemaMap;
  validateMethodInput(source: any, method: string, args?: unknown[], options?: Pick<IcblastOptions, 'allowNumberedPrincipals'>): MethodInputValidation;
  validateMethodInputSchema(methodSchema: MethodSchema, args?: unknown[]): MethodInputValidation;
};

export function ic(opts?: IcblastOptions): Promise<(canister: string) => Promise<any>>;
export function hashIdentity(passOrId?: unknown): Promise<any>;
export function loadExistingIdentity(id?: number): Promise<ExistingIcblastIdentity>;
export function toState(x: unknown): unknown;
export function explainMethodSchema(source: any, method: string, options?: Pick<IcblastOptions, 'allowNumberedPrincipals'>): MethodSchema;
export function explainServiceSchema(source: any, options?: Pick<IcblastOptions, 'allowNumberedPrincipals'>): MethodSchemaMap;
export function validateMethodInput(source: any, method: string, args?: unknown[], options?: Pick<IcblastOptions, 'allowNumberedPrincipals'>): MethodInputValidation;
export function validateMethodInputSchema(methodSchema: MethodSchema, args?: unknown[]): MethodInputValidation;
export function idlFactoryFromCandid(
  candid: string,
  options?: Pick<IcblastOptions, 'didcWasm'>
): Promise<(context: { IDL: unknown }) => unknown>;

export default icblast;
