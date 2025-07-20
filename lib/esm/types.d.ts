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
    raw?: boolean;
    status: number;
    statusText?: string;
    headers: ZillaRawResponseHeaderArray;
    body: string | object | Buffer;
};
export type ZillaScriptVars = Record<string, unknown | null>;
export type ZillaScriptResponseHandlerFunc = (response: ZillaRawResponse | undefined, args: Record<string, unknown>, vars: ZillaScriptVars, step: ZillaScriptStep) => ZillaRawResponse | undefined | Promise<ZillaRawResponse> | Promise<undefined>;
export type ZillaHandlerArgType = "string" | "number" | "boolean" | "object" | "undefined" | "function" | "symbol" | "bigint";
export type ZillaHandlerArg = {
    type?: ZillaHandlerArgType;
    default?: unknown;
    required?: boolean;
    opaque?: boolean;
};
export type ZillaScriptResponseHandler = {
    args?: Record<string, ZillaHandlerArg>;
    func: ZillaScriptResponseHandlerFunc;
};
export type ZillaScriptInitHandlers = Record<string, ZillaScriptResponseHandler>;
export type StepContext = {
    step: ZillaScriptStep;
    stack: ZillaScriptStep[];
    vars: ZillaScriptVars;
    sessions: Record<string, string>;
    response?: ZillaRawResponse;
    headers?: Record<string, string>;
};
export type StepContextFunc = (ctx: StepContext) => void;
export type ZillaScriptInit = {
    servers?: ZillaScriptServer[];
    session?: ZillaScriptSendSession;
    sessions?: Record<string, string>;
    vars?: ZillaScriptVars;
    handlers?: ZillaScriptInitHandlers;
    beforeStep?: StepContextFunc;
    afterStep?: StepContextFunc;
};
export type ZillaScriptHeader = {
    name: string;
    value: string;
};
export declare enum ZillaRequestMethod {
    Get = "GET",
    Head = "HEAD",
    Post = "POST",
    Put = "PUT",
    Patch = "PATCH",
    Delete = "DELETE",
    Options = "OPTIONS",
    Connect = "CONNECT",
    Trace = "TRACE"
}
export type ZillaScriptRequest = {
    get?: string;
    head?: string;
    post?: string;
    put?: string;
    patch?: string;
    delete?: string;
    options?: string;
    connect?: string;
    trace?: string;
    uri?: string;
    method?: ZillaRequestMethod;
    query?: Record<string, string | number | boolean | null | undefined>;
    files?: Record<string, string | Buffer | Promise<string> | Promise<Buffer>>;
    session?: string;
    headers?: ZillaScriptHeader[];
    contentType?: string;
    body?: object | string | number | boolean;
    bodyVar?: string;
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
    parse?: boolean | number;
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
    capture?: ZillaCaptureVars;
    validate?: ZillaResponseValidation[];
};
export type ZillaScriptLoop = {
    items: unknown[] | string;
    varName: string;
    indexVarName?: string;
    start?: number;
    steps?: ZillaScriptStep[];
    include?: string;
};
export type ZillaStepHandlerParams = Record<string, unknown | unknown[]>;
export type ZillaStepHandler = {
    handler: string;
    comment?: string;
    delay?: number | string;
    params?: ZillaStepHandlerParams;
};
export type ZillaScriptStep = {
    step?: string;
    include?: string | ZillaScript;
    params?: ZillaScriptVars;
    delay?: number | string;
    comment?: string;
    server?: string;
    vars?: ZillaScriptVars;
    edits?: Record<string, unknown>;
    loop?: ZillaScriptLoop;
    request?: ZillaScriptRequest;
    response?: ZillaScriptResponse;
    handlers?: ZillaStepHandler[];
};
export type ZillaScriptParam = {
    required?: boolean;
    default?: unknown;
};
export type ZillaScriptParams = Record<string, ZillaScriptParam>;
export type ZillaScript = {
    script: string;
    params?: ZillaScriptParams;
    sets?: {
        vars?: string[];
        sessions?: string[];
    };
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
    step: ZillaScriptStep;
    stack: ZillaScriptStep[];
    status?: number;
    headers?: ZillaScriptHeader[];
    body?: object | string | number | boolean;
    validation: ZillaResponseValidationResult;
    vars: ZillaScriptVars;
    sessions: Record<string, string>;
};
export type ZillaScriptResult = {
    script: ZillaScript;
    stepResults: ZillaStepResult[];
};
