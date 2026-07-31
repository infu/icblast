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
  id?: number;
  debug?: boolean;
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
  explainMethodSchema(source: any, method: string): MethodSchema;
  explainServiceSchema(source: any): MethodSchemaMap;
  validateMethodInput(source: any, method: string, args?: unknown[]): MethodInputValidation;
  validateMethodInputSchema(methodSchema: MethodSchema, args?: unknown[]): MethodInputValidation;
};

export function ic(opts?: IcblastOptions): Promise<(canister: string) => Promise<any>>;
export function hashIdentity(passOrId?: unknown): Promise<any>;
export function loadExistingIdentity(id?: number): Promise<ExistingIcblastIdentity>;
export function toState(x: unknown): unknown;
export function explainMethodSchema(source: any, method: string): MethodSchema;
export function explainServiceSchema(source: any): MethodSchemaMap;
export function validateMethodInput(source: any, method: string, args?: unknown[]): MethodInputValidation;
export function validateMethodInputSchema(methodSchema: MethodSchema, args?: unknown[]): MethodInputValidation;

export default icblast;
