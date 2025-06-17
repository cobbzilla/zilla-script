export type Ctx = Record<string, unknown>;
export declare const evalTpl: (tpl: string, ctx: Ctx) => string;
export declare const walk: (v: unknown, ctx: Ctx) => unknown;
