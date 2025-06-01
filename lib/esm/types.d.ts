import { GenericLogger } from "zilla-util";
export type ZillaScriptSendSession = {
    cookie?: string;
    header?: string;
};
export type ZillaScriptServer = {
    name?: string;
    base: string;
    session?: ZillaScriptSendSession;
};
export type ZillaScriptInit = {
    servers: ZillaScriptServer[];
    vars?: Record<string, string | null>;
};
export type ZillaScriptHeader = {
    name: string;
    value: string;
};
export type ZillaRequestMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "CONNECT" | "TRACE";
export type ZillaScriptRequest = {
    uri: string;
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
    name: string;
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
    name?: string;
    comment?: string;
    server?: string;
    vars?: Record<string, unknown | null>;
    request: ZillaScriptRequest;
    response?: ZillaScriptResponse;
};
export type ZillaScript = {
    name: string;
    init: ZillaScriptInit;
    steps: ZillaScriptStep[];
};
export type ZillaScriptOptions = {
    logger?: GenericLogger;
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
    vars: Record<string, unknown | null>;
    sessions: Record<string, string>;
};
export type ZillaScriptResult = {
    script: ZillaScript;
    stepResults: ZillaStepResult[];
};
