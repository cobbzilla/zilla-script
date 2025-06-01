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

export type ZillaScriptInit = {
  servers?: ZillaScriptServer[];
  sessions?: Record<string, string>; // existing sessions, name->token
  vars?: Record<string, string | null>; // predefined vars
};

export type ZillaScriptHeader = {
  name: string;
  value: string;
};

export type ZillaRequestMethod =
  | "GET"
  | "HEAD"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "CONNECT"
  | "TRACE";

export type ZillaScriptRequest = {
  uri: string;
  method?: ZillaRequestMethod;
  session?: string; // name of a session to use. the session must have been captured in an earlier step
  headers?: ZillaScriptHeader[];
  contentType?: string; // default is application/json. This shortcut is equivalent to sending {name:"Content-Type", value:"..."} in the headers
  body?: object | string | number | boolean; // any JSON object
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
  vars?: ZillaCaptureVars;
  validate?: ZillaResponseValidation[];
};

export type ZillaScriptStep = {
  step?: string;
  comment?: string;
  server?: string;
  vars?: Record<string, unknown | null>;
  edits?: Record<string, unknown>;
  request: ZillaScriptRequest;
  response?: ZillaScriptResponse; // if response is omitted, we only validate that status must be 200
};

export type ZillaScript = {
  script: string;
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
  status: number;
  headers: ZillaScriptHeader[];
  body: object | string | number | boolean;
  validation: ZillaResponseValidationResult;
  vars: Record<string, unknown | null>; // current values for all vars
  sessions: Record<string, string>; // current session tokens for all sessions
};

export type ZillaScriptResult = {
  script: ZillaScript;
  stepResults: ZillaStepResult[];
};
