export type MethodSchema = { input: Record<string, unknown>; output: Record<string, unknown> };

export interface ScanMethod {
  name: string;
  kind: 'query' | 'update' | 'oneway';
}

export interface IcblastOptions {
  host?: string;
  id?: number;
  debug?: boolean;
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
  toState(x: unknown): unknown;
  explainMethodSchema(source: any, method: string): MethodSchema;
};

export default icblast;

