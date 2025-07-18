import Handlebars from "handlebars";
import { delay, nowAsYYYYMMDDHHmmSS, uuidv4 } from "zilla-util";
import {
  ZillaRawResponse,
  ZillaResponseValidationResult,
  ZillaStepResult,
} from "./types.js";
import { Ctx, evalTpl } from "./helpers.js";
import { headerName } from "./util.js";
import { extract } from "./extract.js";
import {
  assignResponseSession,
  editVars,
  getBody,
  loadIncludeFile,
  loadSubScriptSteps,
  makeRequest,
  processStep,
  resolveServer,
  setRequestSession,
  ZillaScriptProcessedStep,
  ZillaScriptStepOptions,
} from "./stepUtil.js";
import { runStepHandlers } from "./handler.js";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const DUMP_TEXT_LIMIT = 1000;

const dumpContext = (cx: Record<string, unknown>, spacing?: number) => {
  const dump = JSON.stringify(cx, null, spacing);
  if (dump.length > DUMP_TEXT_LIMIT) {
    const uniq = `${nowAsYYYYMMDDHHmmSS()}-${uuidv4(true)}`;
    const file: string = `${tmpdir()}/zilla-context-dump-${uniq}.json`;
    writeFileSync(file, JSON.stringify(cx, null, 2), "utf8");
    return file;
  } else {
    return dump;
  }
};

export const runScriptSteps = async (opts: ZillaScriptStepOptions) => {
  const {
    logger,
    env,
    servers,
    defServer,
    vars,
    sessions,
    handlers,
    scriptOpts,
    stack,
  } = opts;
  const steps: ZillaScriptProcessedStep[] = opts.steps.map((step) =>
    processStep(step, handlers)
  );
  let stepPrefix = "";
  const stepResults: ZillaStepResult[] = [];
  for (const step of steps) {
    const stepName = step.step
      ? evalTpl(step.step, { ...vars, env })
      : "(unnamed)";
    stepPrefix = `*** [STEP "${stepName}"] `;
    if (step.delay) {
      logger.info(
        `${stepPrefix} waiting for delay=${step.delay} before starting step`
      );
      await delay(step.delay);
    }
    logger.info(`${stepPrefix} begin`);

    /* create containers so we can still inspect them if an early error aborts */
    const checkDetails: ZillaResponseValidationResult["details"] = [];
    let overall = true;

    try {
      /* ---------- server resolution -------------------------------- */
      const srv = resolveServer(servers, step, defServer, logger, stepPrefix);

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
        editVars(step, vars);
      }

      let res: ZillaRawResponse | undefined = undefined;
      let hdrMap: Record<string, string> | undefined = undefined;

      if (step.include) {
        const include =
          typeof step.include === "string"
            ? await loadIncludeFile(step.include)
            : step.include;
        if (include.params) {
          for (const [name, cfg] of Object.entries(include.params)) {
            if (
              cfg.required &&
              (!step.params || typeof step.params[name] === "undefined")
            ) {
              throw new Error(
                `step=${stepName} param=${name} is required by included script`
              );
            } else if (
              cfg.default &&
              (!step.params || typeof step.params[name] === "undefined")
            ) {
              vars[name] = cfg.default;
            } else if (
              step.params &&
              typeof step.params[name] !== "undefined"
            ) {
              vars[name] =
                typeof step.params[name] === "string"
                  ? evalTpl(step.params[name], ctx)
                  : step.params[name];
            }
          }
        }
        const includeScriptOpts: ZillaScriptStepOptions = {
          ...opts,
          steps: include.steps,
        };
        stack.push(step);
        const results = await runScriptSteps(includeScriptOpts);
        stepResults.push(...results.map((r) => ({ ...r, step })));
        stack.pop();
      } else if (step.loop) {
        const subScriptSteps = await loadSubScriptSteps(step.loop);
        const items = Array.isArray(step.loop.items)
          ? step.loop.items
          : (vars[step.loop.items] as unknown[]);
        if (!Array.isArray(items)) {
          throw new Error(`step=${stepName} loop.items is not an array`);
        }
        stack.push(step);
        for (let i = step.loop.start ?? 0; i < items.length; ++i) {
          const item = items[i];
          const loopVars = { ...vars, [step.loop.varName]: item };
          if (step.loop.indexVarName) {
            loopVars[step.loop.indexVarName] = i;
          }
          const subScriptOpts: ZillaScriptStepOptions = {
            ...opts,
            vars: loopVars,
            steps: subScriptSteps,
          };
          const results = await runScriptSteps(subScriptOpts);
          stepResults.push(...results.map((r) => ({ ...r, step })));
        }
        stack.pop();
      } else {
        const rawUrl =
          (srv.base.endsWith("/") ? srv.base : srv.base + "/") +
          (step.request.uri.startsWith("/")
            ? step.request.uri.substring(1)
            : step.request.uri);
        const query = step.request.query
          ? "?" +
            Object.entries(step.request.query)
              .filter(([, v]) => typeof v !== "undefined")
              .map(
                ([k, v]) =>
                  encodeURIComponent(k) +
                  "=" +
                  (typeof v === "string"
                    ? encodeURIComponent(v.includes("{{") ? evalTpl(v, ctx) : v)
                    : v)
              )
              .join("&")
          : "";
        const url =
          (rawUrl.includes("{{") ? evalTpl(rawUrl, ctx) : rawUrl) + query;

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
          setRequestSession(srv, sessions, step, headers);
        }

        const body = getBody(step, ctx, vars);

        logger.info(`${stepPrefix} → ${method} ${url}`, {
          headers: [...headers.entries()],
          body,
        });

        /* ---------- send request ------------------------------------- */
        res = await makeRequest(step, url, headers, method, body);

        logger.info(`${stepPrefix} ← ${res.status} ${method} ${url}`, res);

        /* ---------- capture session ---------------------------------- */
        if (step.response?.session) {
          assignResponseSession(srv, step, res, sessions, logger, stepPrefix);
        }

        /* ---------- capture vars ------------------------------------- */
        if (step.response?.capture) {
          for (const [v, src] of Object.entries(step.response.capture)) {
            const val = extract(v, src, res.body, res.headers, vars);
            vars[v] = val;
            logger.trace(`${stepPrefix} captured var ${v}`, val);
          }
        }

        /* ---------- set headers ------------------------------------- */
        hdrMap = {};
        res.headers.forEach(({ name, value }) => {
          hdrMap![headerName(name)] = value;
        });
      }

      /* ---------- set handlebars context ---------------------------- */
      const cx: Record<string, unknown> = {
        ...ctx,
        ...vars,
        ...sessions,
        body: res && res.body ? res.body : undefined,
        header: hdrMap,
      };

      /* ---------- call handlers ------------------------------------ */
      res = await runStepHandlers(
        step,
        handlers,
        logger,
        stepPrefix,
        cx,
        vars,
        sessions,
        res
      );

      /* ---------- validation: status check first ------------------- */
      if (res) {
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
      }

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
              logger.warn(
                `${stepPrefix} FAILED expr=${expr} cx=${dumpContext(cx)}`
              );
            }
            overall &&= pass;
            checkDetails.push({
              name: validationId,
              rendered,
              check: expr,
              result: pass,
            });
            logger.trace(`${stepPrefix} validation "${expr}" → ${pass}`);
          } catch (err) {
            overall = false;
            checkDetails.push({
              name: validationId,
              check: expr,
              rendered,
              error: (err as Error).message,
              result: false,
            });
            logger.trace(`${stepPrefix} validation "${expr}" threw`, err);
          }
        })
      );

      const validation: ZillaResponseValidationResult = {
        name: "combined-validations",
        result: overall,
        details: checkDetails,
      };

      if (!overall) {
        const msg = `validation failed in step '${stepName}': ${JSON.stringify(
          checkDetails,
          null,
          2
        )}\n
        cx=${dumpContext(cx, 2)}`;
        if (!scriptOpts.continueOnInvalid) throw new Error(msg);
      }

      /* ---------- assemble step result ----------------------------- */
      stepResults.push({
        step,
        stack: [...stack],
        status: res ? res.status : undefined,
        headers: res ? res.headers : undefined,
        body: res ? res.body : undefined,
        validation,
        vars: { ...vars },
        sessions: { ...sessions },
      });

      logger.info(`${stepPrefix} complete`);
    } catch (err) {
      logger.info(`${stepPrefix} ERROR`);
      if (!scriptOpts.continueOnError) {
        throw err as Error;
      }

      /* capture whatever we have so far + runtime error detail */
      checkDetails.push({
        name: "runtime",
        check: "<internal error>",
        error: (err as Error).message,
        result: false,
      });

      stepResults.push({
        step,
        stack: [...stack],
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
    } finally {
      logger.info(`${stepPrefix} finished`);
    }
  }
  return stepResults;
};
