import { ZillaCaptureSource } from "./types.js";
export type Ctx = Record<string, unknown>;
export declare const evalTpl: (tpl: string, ctx: Ctx) => string;
export declare const walk: (v: unknown, ctx: Ctx) => unknown;
export declare const headerName: (h: string) => string;
export declare const extract: (src: ZillaCaptureSource, body: object | string, hdrs: Headers) => unknown;
