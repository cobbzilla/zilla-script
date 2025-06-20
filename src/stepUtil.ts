import { readFileSync } from "fs";
import { AxiosResponse } from "axios";
import { GenericLogger, isEmpty } from "zilla-util";
import {
  ZillaRawResponse,
  ZillaRequestMethod,
  ZillaScript,
  ZillaScriptLoop,
  ZillaScriptOptions,
  ZillaScriptRequest,
  ZillaScriptResponseHandler,
  ZillaScriptSendSession,
  ZillaScriptServer,
  ZillaScriptStep,
  ZillaScriptVars,
} from "./types.js";
import { upload } from "./upload.js";
import { parseAxiosResponse, parseResponse } from "./util.js";
import { extract } from "./extract.js";
import { Ctx, walk } from "./helpers.js";

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
  handlers: Record<
    string,
    (
      response: ZillaRawResponse,
      args: string[],
      vars: ZillaScriptVars,
      step: ZillaScriptStep
    ) => ZillaRawResponse | Promise<ZillaRawResponse>
  >;
  scriptOpts: ZillaScriptOptions;
};

export const processStep = (
  step: ZillaScriptStep,
  handlers: Record<string, ZillaScriptResponseHandler>
): ZillaScriptProcessedStep => {
  if (step.loop) {
    if (!step.loop.items) {
      throw new Error(`ERROR No items property for loop in step=${step.step}`);
    }
    return step as ZillaScriptProcessedStep;
  }
  if (step.include) {
    return step as ZillaScriptProcessedStep;
  }
  if (!step.request) {
    throw new Error(`ERROR No request property for step=${step.step}`);
  }
  // translate method properties (get/post/etc) into uri + method
  let methodPropFound = false;
  for (const method of Object.values(ZillaRequestMethod)) {
    const propName = method.toLowerCase() as keyof ZillaScriptRequest;
    if (propName in step.request) {
      if (methodPropFound) {
        throw new Error(
          `Multiple method properties found in step: ${JSON.stringify(step)}`
        );
      }
      step.request.uri = step.request[propName] as string;
      step.request.method = method;
      methodPropFound = true;
    }
  }

  if (!methodPropFound && isEmpty(step.request.uri)) {
    // if we still don't have a URI, that's an error
    throw new Error(
      `ERROR No URI specified for step.request=${JSON.stringify(step.request)}`
    );
  } else if (!methodPropFound && isEmpty(step.request.method)) {
    // if we still don't have a method, assume GET
    step.request.method = ZillaRequestMethod.Get;
  }
  if (step.handler) {
    // if the step has a handler, verify that the handler has been defined (in init)
    if (typeof step.handler === "string") {
      step.handler = [step.handler];
    }
    for (const h of step.handler) {
      if (!Object.keys(handlers).includes(h.split(" ")[0])) {
        throw new Error(
          `ERROR handler=${h} not found for step=${JSON.stringify(step)}`
        );
      }
    }
  }
  return step as ZillaScriptProcessedStep;
};

export const resolveServer = (
  servers: {
    server?: string;
    base: string;
    session?: ZillaScriptSendSession;
    name: string;
  }[],
  step: ZillaScriptStep & {
    request: ZillaScriptProcessedRequest;
  },
  defServer: string,
  logger: GenericLogger,
  stepPrefix: string
) => {
  const srv = servers.find((s) => s.name === (step.server ?? defServer));
  if (!srv) {
    const msg = `server not found for step ${step.step ?? "?"}`;
    logger.error(`${stepPrefix}: ${msg}`);
    throw new Error(msg);
  }
  return srv;
};

export const editVars = (
  step: ZillaScriptStep & { request: ZillaScriptProcessedRequest },
  vars: Record<string, unknown>
) => {
  for (const [varName, val] of Object.entries(step.edits!)) {
    if (typeof vars[varName] === "undefined") {
      // throw new Error(`step=${step.step} var=${varName} is undefined`);
    }
    if (
      typeof val === "number" ||
      typeof val === "string" ||
      typeof val === "boolean" ||
      val == null
    ) {
      vars[varName] = val;
    } else {
      vars[varName] = Object.assign({}, vars[varName], val);
    }
  }
};

export const setRequestSession = (
  srv: {
    server?: string;
    base: string;
    session?: ZillaScriptSendSession;
    name: string;
  },
  sessions: Record<string, string>,
  step: ZillaScriptStep & {
    request: ZillaScriptProcessedRequest;
  },
  headers: Headers
) => {
  if (!srv.session) {
    throw new Error(
      `step=${step.step ?? "?no step name"} session not supported by server=${
        srv.name
      }`
    );
  }
  const tok = sessions[step.request.session!];
  if (tok) {
    if (srv.session.cookie)
      headers.append("Cookie", `${srv.session.cookie}=${tok}`);
    if (srv.session.header) headers.set(srv.session.header, tok);
  }
};

export const getBody = (
  step: ZillaScriptStep & {
    request: ZillaScriptProcessedRequest;
  },
  ctx: Ctx,
  vars: ZillaScriptVars
) => {
  if (step.request.body) {
    return JSON.stringify(walk(step.request.body, ctx));
  } else if (step.request.bodyVar) {
    if (typeof vars[step.request.bodyVar] !== "undefined") {
      return JSON.stringify(vars[step.request.bodyVar]);
    } else {
      throw new Error(`getBody: bodyVar not defined: ${step.request.bodyVar}`);
    }
  }
  return undefined;
};

export const makeRequest = async (
  step: ZillaScriptStep & {
    request: ZillaScriptProcessedRequest;
  },
  url: string,
  headers: Headers,
  method: ZillaRequestMethod | string,
  body?: unknown
): Promise<ZillaRawResponse> => {
  const useAxios = step.request.files;
  const res = useAxios
    ? await upload(url, step, headers)
    : await fetch(url, { method, headers, body: body as BodyInit | undefined });
  return useAxios
    ? parseAxiosResponse(res as AxiosResponse)
    : parseResponse(res as Response);
};

export const assignResponseSession = (
  srv: ZillaScriptServer,
  step: ZillaScriptStep & {
    request: ZillaScriptProcessedRequest;
  },
  res: ZillaRawResponse,
  sessions: Record<string, string>,
  logger: GenericLogger,
  stepPrefix: string
) => {
  if (!srv.session) {
    throw new Error(
      `step=${step.step ?? "?no step name"} session not supported by server=${
        srv.server
      }`
    );
  }
  const responseSession = step.response!.session!;
  const strategy = responseSession.from ?? {
    body: undefined,
    header: srv.session.header ? { name: srv.session.header } : undefined,
    cookie: srv.session.cookie ? { name: srv.session.cookie } : undefined,
  };
  const tok = extract("session", strategy, res.body, res.headers, {});
  if (typeof tok === "string") {
    sessions[responseSession.name] = tok;
    logger.trace(
      `${stepPrefix} captured session "${responseSession.name}"`,
      tok
    );
  } else {
    logger.warn(
      `${stepPrefix} session capture for "${responseSession.name}" returned non-string token`,
      tok
    );
  }
};

export const loadIncludeFile = async (path: string): Promise<ZillaScript> => {
  return JSON.parse(readFileSync(path, "utf8")) as ZillaScript;
};

export const loadSubScriptSteps = async (
  loop: ZillaScriptLoop
): Promise<ZillaScriptStep[]> => {
  if (loop.steps) return loop.steps;
  if (loop.include) {
    const json = await loadIncludeFile(loop.include);
    if (json.script && json.steps) {
      return json.steps;
    }
    throw new Error(
      `loadSubScriptSteps: include=${loop.include} expected 'steps' property in JSON`
    );
  }
  throw new Error(`loadSubScriptSteps: neither steps nor include specified`);
};
