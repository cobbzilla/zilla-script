import { GenericLogger } from "zilla-util";
import { ZillaRawResponse, ZillaRequestMethod, ZillaScript, ZillaScriptLoop, ZillaScriptOptions, ZillaScriptRequest, ZillaScriptResponseHandler, ZillaScriptSendSession, ZillaScriptServer, ZillaScriptStep, ZillaScriptVars } from "./types.js";
export type ZillaScriptProcessedRequest = ZillaScriptRequest & {
    uri: string;
};
export type ZillaScriptProcessedStep = ZillaScriptStep & {
    request: ZillaScriptProcessedRequest;
};
export type ZillaScriptStepOptions = {
    logger: GenericLogger;
    env?: Record<string, string>;
    steps: ZillaScriptStep[];
    servers: {
        server?: string;
        base: string;
        session?: ZillaScriptSendSession;
        name: string;
    }[];
    defServer: string;
    vars: Record<string, unknown>;
    sessions: Record<string, string>;
    handlers: Record<string, (response: ZillaRawResponse, args: string[], vars: ZillaScriptVars, step: ZillaScriptStep) => ZillaRawResponse | Promise<ZillaRawResponse>>;
    scriptOpts: ZillaScriptOptions;
};
export declare const processStep: (step: ZillaScriptStep, handlers: Record<string, ZillaScriptResponseHandler>) => ZillaScriptProcessedStep;
export declare const resolveServer: (servers: {
    server?: string;
    base: string;
    session?: ZillaScriptSendSession;
    name: string;
}[], step: ZillaScriptStep & {
    request: ZillaScriptProcessedRequest;
}, defServer: string, logger: GenericLogger, stepPrefix: string) => {
    server?: string;
    base: string;
    session?: ZillaScriptSendSession;
    name: string;
};
export declare const editVars: (step: ZillaScriptStep & {
    request: ZillaScriptProcessedRequest;
}, vars: Record<string, unknown>) => void;
export declare const setRequestSession: (srv: {
    server?: string;
    base: string;
    session?: ZillaScriptSendSession;
    name: string;
}, sessions: Record<string, string>, step: ZillaScriptStep & {
    request: ZillaScriptProcessedRequest;
}, headers: Headers) => void;
export declare const makeRequest: (step: ZillaScriptStep & {
    request: ZillaScriptProcessedRequest;
}, url: string, headers: Headers, method: ZillaRequestMethod | string, body?: string) => Promise<ZillaRawResponse>;
export declare const assignResponseSession: (srv: ZillaScriptServer, step: ZillaScriptStep & {
    request: ZillaScriptProcessedRequest;
}, res: ZillaRawResponse, sessions: Record<string, string>, logger: GenericLogger, stepPrefix: string) => void;
export declare const loadIncludeFile: (path: string) => Promise<ZillaScript>;
export declare const loadSubScriptSteps: (loop: ZillaScriptLoop) => Promise<ZillaScriptStep[]>;
