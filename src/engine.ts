import Handlebars from "handlebars";
import { AxiosResponse } from "axios";
import {
  ZillaRawResponse,
  ZillaResponseValidationResult,
  ZillaScript,
  ZillaScriptInit,
  ZillaScriptOptions,
  ZillaScriptRequest,
  ZillaScriptResponseHandler,
  ZillaScriptResult,
  ZillaScriptStep,
  ZillaStepResult,
} from "./types.js";
import { Ctx, evalTpl, walk } from "./helpers.js";
import {
  DEFAULT_LOGGER,
  GenericLogger,
  isEmpty,
  parseSimpleTime,
  sleep,
} from "zilla-util";
import { headerName, parseAxiosResponse, parseResponse } from "./util.js";
import { extract } from "./extract.js";
import { upload } from "./upload.js";

type ZillaScriptProcessedRequest = ZillaScriptRequest & {
  uri: string;
};

type ZillaScriptProcessedStep = ZillaScriptStep & {
  request: ZillaScriptProcessedRequest;
};

const processStep = (
  step: ZillaScriptStep,
  handlers: Record<string, ZillaScriptResponseHandler>
): ZillaScriptProcessedStep => {
  if (step.request.get) {
    step.request.uri = step.request.get;
    step.request.method = "GET";
  } else if (step.request.head) {
    step.request.uri = step.request.head;
    step.request.method = "HEAD";
  } else if (step.request.post) {
    step.request.uri = step.request.post;
    step.request.method = "POST";
  } else if (step.request.put) {
    step.request.uri = step.request.put;
    step.request.method = "PUT";
  } else if (step.request.patch) {
    step.request.uri = step.request.patch;
    step.request.method = "PATCH";
  } else if (step.request.delete) {
    step.request.uri = step.request.delete;
    step.request.method = "DELETE";
  } else if (isEmpty(step.request.uri)) {
    throw new Error(
      `ERROR No URI specified for step.request=${JSON.stringify(step.request)}`
    );
  } else if (isEmpty(step.request.method)) {
    step.request.method = "GET";
  }
  if (step.handler) {
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

export const runZillaScript = async (
  script: ZillaScript,
  opts: ZillaScriptOptions = {}
): Promise<ZillaScriptResult> => {
  const logger: GenericLogger = opts.logger ?? DEFAULT_LOGGER;

  const env = opts.env ?? {};
  const init = Object.assign(
    {},
    script.init || {},
    opts.init || {}
  ) as ZillaScriptInit;
  if (!init.servers) {
    throw new Error(`script=${script.script} has no servers defined in init`);
  }
  const vars: Record<string, unknown | null> = { ...init.vars };
  const handlers: Record<string, ZillaScriptResponseHandler> = {
    ...init.handlers,
  };
  const sessions: Record<string, string> = init.sessions || {};

  const servers = init.servers.map((s, i) => ({
    ...s,
    name: s.server ?? `default-${i}`,
    base: evalTpl(s.base, { env }),
  }));
  const defServer = servers[0].name;

  const stepResults: ZillaStepResult[] = [];

  logger.info(`starting script "${script.script}"`);

  const steps: ZillaScriptProcessedStep[] = script.steps.map((step) =>
    processStep(step, handlers)
  );
  for (const step of steps) {
    if (step.delay) {
      logger.info(`step "${step.step ?? "(unnamed)"}" delaying ${step.delay}`);
      await sleep(
        typeof step.delay === "number"
          ? step.delay
          : parseSimpleTime(step.delay)
      );
    }
    logger.info(`step "${step.step ?? "(unnamed)"}" begin`);

    /* create containers so we can still inspect them if an early error aborts */
    const checkDetails: ZillaResponseValidationResult["details"] = [];
    let overall = true;

    try {
      /* ---------- server resolution -------------------------------- */
      const srv = servers.find((s) => s.name === (step.server ?? defServer));
      if (!srv) {
        const msg = `server not found for step ${step.step ?? "?"}`;
        logger.error(msg);
        throw new Error(msg);
      }

      /* ---------- url / headers / body ----------------------------- */
      const ctx: Ctx = { ...vars, env };
      if (step.vars) {
        // add session IDs to context
        for (const sessName of Object.keys(sessions)) {
          ctx[sessName] = sessions[sessName];
        }
        // add variables to context
        for (const varName of Object.keys(step.vars)) {
          vars[varName] = ctx[varName] =
            typeof step.vars[varName] === "string"
              ? evalTpl(step.vars[varName], ctx)
              : step.vars[varName];
        }
      }
      if (step.edits) {
        for (const [varName, val] of Object.entries(step.edits)) {
          if (typeof vars[varName] === "undefined") {
            throw new Error(`step=${step.step} var=${varName} is undefined`);
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
      }
      const rawUrl =
        (srv.base.endsWith("/") ? srv.base : srv.base + "/") +
        (step.request.uri.startsWith("/")
          ? step.request.uri.substring(1)
          : step.request.uri);
      const url = rawUrl.includes("{{") ? evalTpl(rawUrl, ctx) : rawUrl;

      const method = step.request.method ?? "GET";
      const headers = new Headers();
      headers.set(
        "Content-Type",
        step.request.contentType ?? "application/json"
      );
      step.request.headers?.forEach((h) =>
        headers.set(evalTpl(h.name, ctx), evalTpl(h.value, ctx))
      );

      if (step.request.session) {
        if (!srv.session) {
          throw new Error(
            `step=${
              step.step ?? "?no step name"
            } session not supported by server=${srv.name}`
          );
        }
        const tok = sessions[step.request.session];
        if (tok) {
          if (srv.session.cookie)
            headers.append("Cookie", `${srv.session.cookie}=${tok}`);
          if (srv.session.header) headers.set(srv.session.header, tok);
        }
      }

      const body =
        step.request.body !== undefined
          ? JSON.stringify(walk(step.request.body, ctx))
          : undefined;

      logger.info(`→ ${method} ${url}`, {
        headers: [...headers.entries()],
        body: body ? JSON.parse(body) : undefined,
      });

      /* ---------- send request ------------------------------------- */
      const useAxios = step.request.files;
      const res = useAxios
        ? await upload(url, step, headers)
        : await fetch(url, { method, headers, body });
      let raw: ZillaRawResponse = await (useAxios
        ? parseAxiosResponse(res as AxiosResponse)
        : parseResponse(res as Response));

      logger.info(`← ${res.status} ${method} ${url}`, raw);

      /* ---------- capture session ---------------------------------- */
      if (step.response?.session) {
        if (!srv.session) {
          throw new Error(
            `step=${
              step.step ?? "?no step name"
            } session not supported by server=${srv.name}`
          );
        }
        const strategy = step.response.session.from ?? {
          body: undefined,
          header: srv.session.header ? { name: srv.session.header } : undefined,
          cookie: srv.session.cookie ? { name: srv.session.cookie } : undefined,
        };
        const tok = extract("session", strategy, raw.body, raw.headers, {});
        if (typeof tok === "string") {
          sessions[step.response.session.name] = tok;
          logger.info(`captured session "${step.response.session.name}"`, tok);
        } else {
          logger.warn(
            `session capture for "${step.response.session.name}" returned non-string token`,
            tok
          );
        }
      }

      /* ---------- capture vars ------------------------------------- */
      if (step.response?.vars) {
        for (const [v, src] of Object.entries(step.response.vars)) {
          const val = extract(v, src, raw.body, raw.headers, vars);
          vars[v] = val;
          logger.debug(`captured var ${v}`, val);
        }
      }

      /* ---------- set handlebars context ---------------------------- */
      const hdrMap: Record<string, string> = {};
      raw.headers.forEach(({ name, value }) => {
        hdrMap[headerName(name)] = value;
      });
      const cx: Record<string, unknown> = {
        ...ctx,
        ...vars,
        ...sessions,
        body: raw.body,
        header: hdrMap,
      };

      /* ---------- call handlers ------------------------------------ */
      if (step.handler) {
        for (const h of step.handler) {
          const handlerParts = h.split(" ");
          const handler = handlers[handlerParts[0]];
          if (!handler) {
            logger.error(`handler not found: ${h}`);
          }
          const args = handlerParts.length > 1 ? handlerParts.slice(1) : [];
          const varsForHandler = { ...vars, ...sessions };
          const origKeys = Object.keys(varsForHandler);
          raw = await handler(
            raw,
            args.map((a) => evalTpl(a, cx)),
            varsForHandler,
            step
          );
          for (const [k, v] of Object.entries(varsForHandler)) {
            if (!origKeys.includes(k)) {
              cx[k] = vars[k] = v;
            }
          }
        }
      }

      /* ---------- validation: status check first ------------------- */
      let statusPass;
      const expectedStatus = step.response?.status ?? null;
      if (expectedStatus) {
        statusPass = raw.status === expectedStatus;
      } else {
        const expectedClass = step.response?.statusClass ?? `2xx`;
        statusPass = `${Math.floor(raw.status / 100)}xx` === expectedClass;
      }

      overall &&= statusPass;
      checkDetails.push({
        name: "status",
        check: `status ${raw.status}`,
        result: statusPass,
      });

      /* ---------- validation: custom checks ------------------------ */
      step.response?.validate?.forEach((validation) =>
        validation.check.forEach((expr) => {
          let rendered: string | undefined = undefined;
          const validationId = evalTpl(validation.id, ctx);
          try {
            rendered = Handlebars.compile(`{{${expr}}}`, {
              noEscape: true,
            })(cx);
            const pass = rendered.trim().toLowerCase() === "true";
            if (!pass) {
              logger.debug(
                `FAILED step=${step.step} expr=${expr} cx=${JSON.stringify(cx)}`
              );
            }
            overall &&= pass;
            checkDetails.push({
              name: validationId,
              rendered,
              check: expr,
              result: pass,
            });
            logger.debug(`validation "${expr}" → ${pass}`);
          } catch (err) {
            overall = false;
            checkDetails.push({
              name: validationId,
              check: expr,
              rendered,
              error: (err as Error).message,
              result: false,
            });
            logger.error(`validation "${expr}" threw`, err);
          }
        })
      );

      const validation: ZillaResponseValidationResult = {
        name: "combined-validations",
        result: overall,
        details: checkDetails,
      };

      if (!overall) {
        const msg = `validation failed in step ${
          step.step ?? "?"
        }: ${JSON.stringify(checkDetails, null, 2)}\n
        cx=${JSON.stringify(cx, null, 2)}`;
        logger.error(msg);
        if (!opts.continueOnInvalid) throw new Error(msg);
      }

      /* ---------- assemble step result ----------------------------- */
      stepResults.push({
        status: raw.status,
        headers: raw.headers,
        body: raw.body,
        validation,
        vars: { ...vars },
        sessions: { ...sessions },
      });

      logger.info(`step "${step.step ?? "(unnamed)"}" complete`);
    } catch (err) {
      logger.error(`error in step "${step.step ?? "(unnamed)"}"`, err);

      if (!opts.continueOnError) throw err as Error;

      /* capture whatever we have so far + runtime error detail */
      checkDetails.push({
        name: "runtime",
        check: "<internal error>",
        error: (err as Error).message,
        result: false,
      });

      stepResults.push({
        status: 0,
        headers: [],
        body: "",
        validation: {
          name: "error",
          result: false,
          details: checkDetails,
        },
        vars: { ...vars },
        sessions: { ...sessions },
      });
    }
  }

  logger.info(`script "${script.script}" finished`);
  return { script, stepResults };
};
