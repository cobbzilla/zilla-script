import Handlebars from "handlebars";
import {
  ZillaResponseValidationResult,
  ZillaScript,
  ZillaScriptOptions,
  ZillaScriptResult,
  ZillaStepResult,
} from "./types.js";
import { Ctx, evalTpl, extract, headerName, walk } from "./helpers.js";
import { DEFAULT_LOGGER, GenericLogger } from "zilla-util";

export const toHeaderArray = (h: Headers): { name: string; value: string }[] =>
  [...h.entries()].map(([name, value]) => ({ name, value }));

export const runZillaScript = async (
  script: ZillaScript,
  opts: ZillaScriptOptions = {}
): Promise<ZillaScriptResult> => {
  const logger: GenericLogger = opts.logger ?? DEFAULT_LOGGER;

  const env = opts.env ?? {};
  const vars: Record<string, unknown | null> = { ...script.init.vars };
  const sessions: Record<string, string> = {};

  const servers = script.init.servers.map((s, i) => ({
    ...s,
    name: s.name ?? `default-${i}`,
    base: evalTpl(s.base, { env }),
  }));
  const defServer = servers[0].name;

  const stepResults: ZillaStepResult[] = [];

  logger.info(`starting script "${script.name}"`);

  for (const step of script.steps) {
    logger.info(`step "${step.name ?? "(unnamed)"}" begin`);

    /* create containers so we can still inspect them if an early error aborts */
    const checkDetails: ZillaResponseValidationResult["details"] = [];
    let overall = true;

    try {
      /* ---------- server resolution -------------------------------- */
      const srv = servers.find((s) => s.name === (step.server ?? defServer));
      if (!srv) {
        const msg = `server not found for step ${step.name ?? "?"}`;
        logger.error(msg);
        throw new Error(msg);
      }

      /* ---------- url / headers / body ----------------------------- */
      const ctx: Ctx = { ...vars, env };
      if (step.vars) {
        for (const varName of Object.keys(step.vars)) {
          vars[varName] = ctx[varName] =
            typeof step.vars[varName] === "string"
              ? evalTpl(step.vars[varName], ctx)
              : step.vars[varName];
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
              step.name ?? "?no step name"
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
      const res = await fetch(url, { method, headers, body });

      const resHeadersArr = toHeaderArray(res.headers);
      const resBody: object | string = (
        res.headers.get("content-type") ?? ""
      ).includes("application/json")
        ? await res.json()
        : await res.text();

      logger.info(`← ${res.status} ${method} ${url}`, {
        headers: resHeadersArr,
        body: resBody,
      });

      /* ---------- capture session ---------------------------------- */
      if (step.response?.session) {
        if (!srv.session) {
          throw new Error(
            `step=${
              step.name ?? "?no step name"
            } session not supported by server=${srv.name}`
          );
        }
        const strategy = step.response.session.from ?? {
          body: undefined,
          header: srv.session.header ? { name: srv.session.header } : undefined,
          cookie: srv.session.cookie ? { name: srv.session.cookie } : undefined,
        };
        const tok = extract("session", strategy, resBody, res.headers, {});
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
          const val = extract(v, src, resBody, res.headers, vars);
          vars[v] = val;
          logger.debug(`captured var ${v}`, val);
        }
      }

      /* ---------- validation: status check first ------------------- */
      let statusPass;
      const expectedStatus = step.response?.status ?? null;
      if (expectedStatus) {
        statusPass = res.status === expectedStatus;
      } else {
        const expectedClass = step.response?.statusClass ?? `2xx`;
        statusPass = `${Math.floor(res.status / 100)}xx` === expectedClass;
      }

      overall &&= statusPass;
      checkDetails.push({
        name: "status",
        check: `status ${res.status}`,
        result: statusPass,
      });

      /* ---------- validation: custom checks ------------------------ */
      const hdrMap: Record<string, string> = {};
      resHeadersArr.forEach(({ name, value }) => {
        hdrMap[headerName(name)] = value;
      });

      step.response?.validate?.forEach((validation) =>
        validation.check.forEach((expr) => {
          let rendered: string | undefined = undefined;
          try {
            rendered = Handlebars.compile(`{{${expr}}}`, {
              noEscape: true,
            })({
              ...vars,
              body: resBody,
              header: hdrMap,
            });
            const pass = rendered.trim().toLowerCase() === "true";
            overall &&= pass;
            checkDetails.push({
              name: evalTpl(validation.name, ctx),
              rendered,
              check: expr,
              result: pass,
            });
            logger.debug(`validation "${expr}" → ${pass}`);
          } catch (err) {
            overall = false;
            checkDetails.push({
              name: evalTpl(validation.name, ctx),
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
          step.name ?? "?"
        }: ${JSON.stringify(checkDetails, null, 2)}`;
        logger.error(msg);
        if (!opts.continueOnInvalid) throw new Error(msg);
      }

      /* ---------- assemble step result ----------------------------- */
      stepResults.push({
        status: res.status,
        headers: resHeadersArr,
        body: resBody,
        validation,
        vars: { ...vars },
        sessions: { ...sessions },
      });

      logger.info(`step "${step.name ?? "(unnamed)"}" complete`);
    } catch (err) {
      logger.error(`error in step "${step.name ?? "(unnamed)"}"`, err);

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

  logger.info(`script "${script.name}" finished`);
  return { script, stepResults };
};
