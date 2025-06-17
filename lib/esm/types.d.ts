import { GenericLogger } from "zilla-util";
export type ZillaScriptSendSession = {
    cookie?: string;
    header?: string;
};
export type ZillaScriptServer = {
    server?: string;
    base: string;
    session?: ZillaScriptSendSession;
};
export type ZillaRawResponseHeaderArray = {
    name: string;
    value: string;
}[];
export type ZillaRawResponse = {
    status: number;
    statusText?: string;
    headers: ZillaRawResponseHeaderArray;
    body: string | object;
};
export type ZillaScriptVars = Record<string, unknown | null>;
export type ZillaScriptResponseHandler = (response: ZillaRawResponse, args: string[], vars: ZillaScriptVars, step: ZillaScriptStep) => ZillaRawResponse | Promise<ZillaRawResponse>;
export type ZillaScriptInit = {
    servers?: ZillaScriptServer[];
    sessions?: Record<string, string>;
    vars?: Record<string, string | null>;
    handlers?: Record<string, ZillaScriptResponseHandler>;
};
export type ZillaScriptHeader = {
    name: string;
    value: string;
};
export type ZillaRequestMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "CONNECT" | "TRACE";
export type ZillaScriptRequest = {
    uri?: string;
    get?: string;
    head?: string;
    post?: string;
    put?: string;
    patch?: string;
    delete?: string;
    files?: Record<string, string | Buffer | Promise<string> | Promise<Buffer>>;
    method?: ZillaRequestMethod;
    session?: string;
    headers?: ZillaScriptHeader[];
    contentType?: string;
    body?: object | string | number | boolean;
};
export type ZillaStatusClass = "1xx" | "2xx" | "3xx" | "4xx" | "5xx";
export type ZillaCaptureSource = {
    body?: string | null;
    header?: {
        name: string;
    };
    cookie?: {
        name: string;
    };
};
export type ZillaCaptureSession = {
    name: string;
    from?: ZillaCaptureSource;
};
export type ZillaCaptureVarSource = ZillaCaptureSource & {
    assign?: string;
};
export type ZillaCaptureVars = {
    [varName: string]: ZillaCaptureVarSource;
};
export type ZillaResponseValidation = {
    id: string;
    check: string[];
};
export type ZillaScriptResponse = {
    status?: number;
    statusClass?: ZillaStatusClass;
    session?: ZillaCaptureSession;
    vars?: ZillaCaptureVars;
    validate?: ZillaResponseValidation[];
};
export type ZillaScriptStep = {
    step?: string;
    comment?: string;
    server?: string;
    vars?: ZillaScriptVars;
    edits?: Record<string, unknown>;
    request: ZillaScriptRequest;
    response?: ZillaScriptResponse;
    handler?: string | string[];
};
export type ZillaScript = {
    script: string;
    init?: ZillaScriptInit;
    steps: ZillaScriptStep[];
};
export type ZillaScriptOptions = {
    logger?: GenericLogger;
    init?: ZillaScriptInit;
    continueOnInvalid?: boolean;
    continueOnError?: boolean;
    env?: Record<string, string>;
};
export type ZillaResponseValidationResult = {
    name: string;
    result: boolean;
    details: {
        name: string;
        check: string;
        rendered?: string;
        error?: string;
        result: boolean;
    }[];
};
export type ZillaStepResult = {
    status: number;
    headers: ZillaScriptHeader[];
    body: object | string | number | boolean;
    validation: ZillaResponseValidationResult;
    vars: ZillaScriptVars;
    sessions: Record<string, string>;
};
export type ZillaScriptResult = {
    script: ZillaScript;
    stepResults: ZillaStepResult[];
};
