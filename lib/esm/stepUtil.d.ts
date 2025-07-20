import { GenericLogger } from "zilla-util";
import { StepContextFunc, ZillaRawResponse, ZillaRequestMethod, ZillaScript, ZillaScriptInitHandlers, ZillaScriptLoop, ZillaScriptOptions, ZillaScriptRequest, ZillaScriptSendSession, ZillaScriptServer, ZillaScriptStep, ZillaScriptVars } from "./types.js";
import { Ctx } from "./helpers.js";
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
    stack: ZillaScriptStep[];
    servers: {
        server?: string;
        base: string;
        session?: ZillaScriptSendSession;
        name: string;
    }[];
    defServer: string;
    vars: Record<string, unknown>;
    sessions: Record<string, string>;
    handlers: ZillaScriptInitHandlers;
    scriptOpts: ZillaScriptOptions;
    beforeStep?: StepContextFunc;
    afterStep?: StepContextFunc;
};
export declare const processStep: (step: ZillaScriptStep, handlers: ZillaScriptInitHandlers) => ZillaScriptProcessedStep;
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
export declare const getBody: (step: ZillaScriptStep & {
    request: ZillaScriptProcessedRequest;
}, ctx: Ctx, vars: ZillaScriptVars) => string | undefined;
export declare const makeRequest: (step: ZillaScriptStep & {
    request: ZillaScriptProcessedRequest;
}, url: string, headers: Headers, method: ZillaRequestMethod | string, body?: unknown) => Promise<ZillaRawResponse>;
export declare const assignResponseSession: (srv: ZillaScriptServer, step: ZillaScriptStep & {
    request: ZillaScriptProcessedRequest;
}, res: ZillaRawResponse, sessions: Record<string, string>, logger: GenericLogger, stepPrefix: string) => void;
export declare const loadIncludeFile: (path: string) => Promise<ZillaScript>;
export declare const loadSubScriptSteps: (loop: ZillaScriptLoop) => Promise<ZillaScriptStep[]>;
