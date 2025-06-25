import { GenericLogger } from "zilla-util";
import { ZillaRawResponse, ZillaScriptInitHandlers, ZillaScriptStep } from "./types.js";
import { ZillaScriptProcessedRequest } from "./stepUtil.js";
export declare const runStepHandlers: <T>(step: ZillaScriptStep & {
    request: ZillaScriptProcessedRequest;
}, handlers: ZillaScriptInitHandlers, logger: GenericLogger, stepPrefix: string, cx: Record<string, unknown>, vars: Record<string, unknown>, sessions: Record<string, string>, res?: ZillaRawResponse) => Promise<T>;
