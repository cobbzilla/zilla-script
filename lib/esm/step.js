import Handlebars from "handlebars";
import { parseSimpleTime, sleep } from "zilla-util";
import { evalArgWithType, evalTpl } from "./helpers.js";
import { headerName } from "./util.js";
import { extract } from "./extract.js";
import { assignResponseSession, editVars, getBody, loadIncludeFile, loadSubScriptSteps, makeRequest, processStep, resolveServer, setRequestSession, } from "./stepUtil.js";
export const runScriptSteps = async (opts) => {
    const { logger, env, servers, defServer, vars, sessions, handlers, scriptOpts, } = opts;
    const steps = opts.steps.map((step) => processStep(step, handlers));
    let stepPrefix = "";
    const stepResults = [];
    for (const step of steps) {
        const stepName = step.step
            ? evalTpl(step.step, { ...vars, env })
            : "(unnamed)";
        stepPrefix = `*** [STEP "${stepName}"] `;
        if (step.delay) {
            logger.info(`${stepPrefix} delaying ${step.delay}`);
            await sleep(typeof step.delay === "number"
                ? step.delay
                : parseSimpleTime(step.delay));
        }
        logger.info(`${stepPrefix} begin`);
        /* create containers so we can still inspect them if an early error aborts */
        const checkDetails = [];
        let overall = true;
        try {
            /* ---------- server resolution -------------------------------- */
            const srv = resolveServer(servers, step, defServer, logger, stepPrefix);
            /* ---------- url / headers / body ----------------------------- */
            const ctx = { ...vars, env };
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
            if (step.include) {
                const include = typeof step.include === "string"
                    ? await loadIncludeFile(step.include)
                    : step.include;
                if (include.params) {
                    for (const [name, cfg] of Object.entries(include.params)) {
                        if (cfg.required &&
                            (!step.params || typeof step.params[name] === "undefined")) {
                            throw new Error(`step=${stepName} param=${name} is required by included script`);
                        }
                        else if (cfg.defaultValue &&
                            (!step.params || typeof step.params[name] === "undefined")) {
                            vars[name] = cfg.defaultValue;
                        }
                        else if (step.params &&
                            typeof step.params[name] !== "undefined") {
                            vars[name] = step.params[name];
                        }
                    }
                }
                const includeScriptOpts = {
                    ...opts,
                    steps: include.steps,
                };
                const results = await runScriptSteps(includeScriptOpts);
                stepResults.push(...results.map((r) => ({ ...r, step: stepName })));
                continue; // next step, everything after this handles a single request
            }
            if (step.loop) {
                const subScriptSteps = await loadSubScriptSteps(step.loop);
                const items = Array.isArray(step.loop.items)
                    ? step.loop.items
                    : vars[step.loop.items];
                if (!Array.isArray(items)) {
                    throw new Error(`step=${stepName} loop.items is not an array`);
                }
                for (let i = step.loop.start ?? 0; i < items.length; ++i) {
                    const item = items[i];
                    const loopVars = { ...vars, [step.loop.varName]: item };
                    if (step.loop.indexVarName) {
                        loopVars[step.loop.indexVarName] = i;
                    }
                    const subScriptOpts = {
                        ...opts,
                        vars: loopVars,
                        steps: subScriptSteps,
                    };
                    const results = await runScriptSteps(subScriptOpts);
                    stepResults.push(...results.map((r) => ({ ...r, step: stepName })));
                }
                continue; // next step, everything after this handles a single request
            }
            const rawUrl = (srv.base.endsWith("/") ? srv.base : srv.base + "/") +
                (step.request.uri.startsWith("/")
                    ? step.request.uri.substring(1)
                    : step.request.uri);
            const url = rawUrl.includes("{{") ? evalTpl(rawUrl, ctx) : rawUrl;
            const method = step.request.method ?? "GET";
            const headers = new Headers();
            headers.set("Content-Type", step.request.contentType ?? "application/json");
            step.request.headers?.forEach((h) => headers.set(evalTpl(h.name, ctx), evalTpl(h.value, ctx)));
            if (step.request.session) {
                setRequestSession(srv, sessions, step, headers);
            }
            const body = getBody(step, ctx, vars);
            logger.info(`${stepPrefix} → ${method} ${url}`, {
                headers: [...headers.entries()],
                body,
            });
            /* ---------- send request ------------------------------------- */
            let res = await makeRequest(step, url, headers, method, body);
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
            /* ---------- set handlebars context ---------------------------- */
            const hdrMap = {};
            res.headers.forEach(({ name, value }) => {
                hdrMap[headerName(name)] = value;
            });
            const cx = {
                ...ctx,
                ...vars,
                ...sessions,
                body: res.body,
                header: hdrMap,
            };
            /* ---------- call handlers ------------------------------------ */
            if (step.handlers) {
                for (const stepHandler of step.handlers) {
                    const hName = stepHandler.handler;
                    const stepHandlerParams = stepHandler.params ?? {};
                    const initHandler = handlers[hName];
                    if (!initHandler) {
                        logger.error(`${stepPrefix} handler not found: ${hName}`);
                    }
                    if (initHandler.args) {
                        for (const [field, config] of Object.entries(initHandler.args)) {
                            if (typeof stepHandlerParams[field] === "undefined") {
                                if (config.required) {
                                    throw new Error(`${stepPrefix} handler=${hName} missing required arg=${field}`);
                                }
                                else if (config.default) {
                                    stepHandlerParams[field] = config.default;
                                }
                            }
                        }
                    }
                    const args = Object.fromEntries(Object.entries(stepHandlerParams).map(([param, value]) => [
                        param,
                        evalArgWithType(value, cx, initHandler.args ? initHandler.args[param].type : undefined, `${stepPrefix} handler=${hName} wrong type for arg=${param}`),
                    ]));
                    const varsForHandler = { ...vars, ...sessions };
                    const origKeys = Object.keys(varsForHandler);
                    res = await initHandler.func(res, args, varsForHandler, step);
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
                statusPass = res.status === expectedStatus;
            }
            else {
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
            step.response?.validate?.forEach((validation) => validation.check.forEach((expr) => {
                let rendered = undefined;
                const validationId = evalTpl(validation.id, ctx);
                try {
                    rendered = Handlebars.compile(`{{${expr}}}`, {
                        noEscape: true,
                    })(cx);
                    const pass = rendered.trim().toLowerCase() === "true";
                    if (!pass) {
                        logger.warn(`${stepPrefix} FAILED expr=${expr} cx=${JSON.stringify(cx)}`);
                    }
                    overall &&= pass;
                    checkDetails.push({
                        name: validationId,
                        rendered,
                        check: expr,
                        result: pass,
                    });
                    logger.trace(`${stepPrefix} validation "${expr}" → ${pass}`);
                }
                catch (err) {
                    overall = false;
                    checkDetails.push({
                        name: validationId,
                        check: expr,
                        rendered,
                        error: err.message,
                        result: false,
                    });
                    logger.trace(`${stepPrefix} validation "${expr}" threw`, err);
                }
            }));
            const validation = {
                name: "combined-validations",
                result: overall,
                details: checkDetails,
            };
            if (!overall) {
                const msg = `validation failed in step ${stepName}: ${JSON.stringify(checkDetails, null, 2)}\n
        cx=${JSON.stringify(cx, null, 2)}`;
                if (!scriptOpts.continueOnInvalid)
                    throw new Error(msg);
            }
            /* ---------- assemble step result ----------------------------- */
            stepResults.push({
                status: res.status,
                headers: res.headers,
                body: res.body,
                validation,
                vars: { ...vars },
                sessions: { ...sessions },
            });
            logger.info(`${stepPrefix} complete`);
        }
        catch (err) {
            logger.info(`${stepPrefix} ERROR`);
            if (!scriptOpts.continueOnError) {
                throw err;
            }
            /* capture whatever we have so far + runtime error detail */
            checkDetails.push({
                name: "runtime",
                check: "<internal error>",
                error: err.message,
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
        finally {
            logger.info(`${stepPrefix} finished`);
        }
    }
    return stepResults;
};
//# sourceMappingURL=step.js.map