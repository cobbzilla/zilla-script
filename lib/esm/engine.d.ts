import { ZillaRawResponseHeaderArray, ZillaScript, ZillaScriptOptions, ZillaScriptResult } from "./types.js";
export declare const toHeaderArray: (h: Headers) => ZillaRawResponseHeaderArray;
export declare const runZillaScript: (script: ZillaScript, opts?: ZillaScriptOptions) => Promise<ZillaScriptResult>;
