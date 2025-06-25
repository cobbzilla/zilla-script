import { GenericLogger } from "zilla-util";

export type ZillaScriptSendSession = {
  // how to send session cookie. one of these is required
  cookie?: string;
  header?: string;
};

export type ZillaScriptServer = {
  server?: string;
  base: string;
  session?: ZillaScriptSendSession;
};

export type ZillaRawResponseHeaderArray = { name: string; value: string }[];

export type ZillaRawResponse = {
  raw?: boolean;
  status: number;
  statusText?: string;
  headers: ZillaRawResponseHeaderArray;
  body: string | object | Buffer;
};

export type ZillaScriptVars = Record<string, unknown | null>;

export type ZillaScriptResponseHandlerFunc = (
  response: ZillaRawResponse,
  args: Record<string, unknown>,
  vars: ZillaScriptVars,
  step: ZillaScriptStep
) => ZillaRawResponse | Promise<ZillaRawResponse>;

export type ZillaHandlerArgType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "undefined"
  | "function"
  | "symbol"
  | "bigint";

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

export type ZillaScriptInitHandlers = Record<
  string,
  ZillaScriptResponseHandler
>;

export type ZillaScriptInit = {
  servers?: ZillaScriptServer[];
  session?: ZillaScriptSendSession;
  sessions?: Record<string, string>; // existing sessions, name->token
  vars?: ZillaScriptVars; // predefined vars
  handlers?: ZillaScriptInitHandlers;
};

export type ZillaScriptHeader = {
  name: string;
  value: string;
};

export enum ZillaRequestMethod {
  Get = "GET",
  Head = "HEAD",
  Post = "POST",
  Put = "PUT",
  Patch = "PATCH",
  Delete = "DELETE",
  Options = "OPTIONS",
  Connect = "CONNECT",
  Trace = "TRACE",
}

export type ZillaScriptRequest = {
  // convenience properties, sets both uri + method.
  get?: string;
  head?: string;
  post?: string;
  put?: string;
  patch?: string;
  delete?: string;
  options?: string;
  connect?: string;
  trace?: string;

  // these will always be filled out after a step is processed
  uri?: string;
  method?: ZillaRequestMethod;

  // optional query string (can also be included in uri)
  query?: Record<string, string | number | boolean | null | undefined>;

  files?: Record<string, string | Buffer | Promise<string> | Promise<Buffer>>;
  session?: string; // name of a session to use. the session must have been captured in an earlier step
  headers?: ZillaScriptHeader[];
  contentType?: string; // default is application/json. This shortcut is equivalent to sending {name:"Content-Type", value:"..."} in the headers
  body?: object | string | number | boolean; // any JSON object
  bodyVar?: string;
};

export type ZillaStatusClass = "1xx" | "2xx" | "3xx" | "4xx" | "5xx";

// a ZillaCaptureSource must not be empty, even though all properties are optional, one must be specified
export type ZillaCaptureSource = {
  // a JSONPath expression with an implied leading $. prefix
  body?: string | null;
  header?: {
    // name of response header to grab value from
    name: string;
  };
  cookie?: {
    // name of cookie to grab value from
    name: string;
  };
};

export type ZillaCaptureSession = {
  // name of session to track (or overwrite)
  name: string;

  // if from is absent, the 'from' for the server.session is used
  // if from is present, it must not be an empty object, even though all ZillaCaptureSource properties are optional, one must be specified
  from?: ZillaCaptureSource;
};

export type ZillaCaptureVarSource = ZillaCaptureSource & { assign?: string };

export type ZillaCaptureVars = {
  // the value for each varName must not be an empty object, even though all ZillaCaptureSource properties are optional, one must be specified
  [varName: string]: ZillaCaptureVarSource;
};

export type ZillaResponseValidation = {
  id: string;
  check: string[];
};

export type ZillaScriptResponse = {
  status?: number; // default is 200
  statusClass?: ZillaStatusClass; // default is 2xx
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
  response?: ZillaScriptResponse; // if response is omitted, we only validate that status must be 200
  handlers?: ZillaStepHandler[]; // handlers to call before validation
};

export type ZillaScriptParam = { required?: boolean; default?: unknown };

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
  continueOnInvalid?: boolean; // if true, keep running steps even if a validation fails
  continueOnError?: boolean; // if true, keep running steps even if a non-validation error occurs
  env?: Record<string, string>; // environment variables, so we do not use process.env. If omitted, use {} and no env vars are defined.
};

export type ZillaResponseValidationResult = {
  name: string;
  result: boolean; // overall result, only true if all checks were true
  details: {
    name: string;
    check: string;
    rendered?: string;
    error?: string;
    result: boolean;
  }[]; // all check results
};

export type ZillaStepResult = {
  step?: string; // if this was done in a loop or include, this is the name of the loop/include step
  status: number;
  headers: ZillaScriptHeader[];
  body: object | string | number | boolean;
  validation: ZillaResponseValidationResult;
  vars: ZillaScriptVars; // current values for all vars
  sessions: Record<string, string>; // current session tokens for all sessions
};

export type ZillaScriptResult = {
  script: ZillaScript;
  stepResults: ZillaStepResult[];
};
