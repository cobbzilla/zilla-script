import { ZillaCaptureVarSource, ZillaRawResponseHeaderArray } from "./types.js";
export declare const extract: (varName: string, src: ZillaCaptureVarSource, body: object | string, hdrs: ZillaRawResponseHeaderArray, vars: Record<string, unknown | null>) => unknown;
