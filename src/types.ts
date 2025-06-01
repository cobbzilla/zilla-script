export type ZillaScriptServer = {
  name: string;
  base: string;
  session: {
    // how to send session cookie. one of these is required
    cookie?: string;
    header?: string;
  };
};

export type ZillaScriptInit = {
  servers: ZillaScriptServer[];
  vars: Record<string, string | null>;
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

  // from must not be an empty object, even though all ZillaCaptureSource properties are optional, one must be specified
  from: ZillaCaptureSource;
};

export type ZillaCaptureVars = {
  // the value for each varName must not be an empty object, even though all ZillaCaptureSource properties are optional, one must be specified
  [varName: string]: ZillaCaptureSource;
};

export type ZillaResponseValidation = {
  name: string;
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
  name?: string;
  comment?: string;
  server?: string;
  request: ZillaScriptRequest;
  response?: ZillaScriptResponse; // if response is omitted, we only validate that status must be 200
};

export type ZillaScript = {
  name: string;
  init: ZillaScriptInit;
  steps: ZillaScriptStep[];
};

export type ZillaScriptOptions = {
  continueOnInvalid?: boolean; // if true, keep running steps even if a validation fails
  continueOnError?: boolean; // if true, keep running steps even if a non-validation error occurs
  env?: Record<string, string>; // environment variables, so we do not use process.env. If omitted, use {} and no env vars are defined.
};

export type ZillaResponseValidationResult = {
  name: string;
  result: boolean; // overall result, only true if all checks were true
  details: { check: string; result: boolean }[]; // all check results
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
