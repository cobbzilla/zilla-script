import { ZillaScript, ZillaScriptOptions, ZillaScriptResult } from "./types.js";
export declare const toHeaderArray: (h: Headers) => {
    name: string;
    value: string;
}[];
export declare const runZillaScript: (script: ZillaScript, opts?: ZillaScriptOptions) => Promise<ZillaScriptResult>;
