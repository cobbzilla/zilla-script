export type Ctx = Record<string, unknown>;
export declare const evalTpl: (tpl: string, ctx: Ctx) => string;
export declare const walk: (v: unknown, ctx: Ctx) => unknown;
export declare const evalArg: (val: unknown, ctx: Ctx) => unknown;
export declare const evalArgWithType: (val: unknown, ctx: Ctx, requiredType: string | undefined, errorPrefix: string) => unknown;
