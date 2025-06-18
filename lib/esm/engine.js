import Handlebars from "handlebars";
import { ZillaRequestMethod, } from "./types.js";
import { evalTpl, walk } from "./helpers.js";
import { DEFAULT_LOGGER, isEmpty, parseSimpleTime, sleep, } from "zilla-util";
import { headerName, parseAxiosResponse, parseResponse } from "./util.js";
import { extract } from "./extract.js";
import { upload } from "./upload.js";
const processStep = (step, handlers) => {
    // translate method properties (get/post/etc) into uri + method
    let methodPropFound = false;
    for (const method of Object.values(ZillaRequestMethod)) {
        const propName = method.toLowerCase();
        if (propName in step.request) {
            if (methodPropFound) {
                throw new Error(`Multiple method properties found in step: ${JSON.stringify(step)}`);
            }
            step.request.uri = step.request[propName];
            step.request.method = method;
            methodPropFound = true;
        }
    }
    if (!methodPropFound && isEmpty(step.request.uri)) {
        // if we still don't have a URI, that's an error
        throw new Error(`ERROR No URI specified for step.request=${JSON.stringify(step.request)}`);
    }
    else if (!methodPropFound && isEmpty(step.request.method)) {
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
                throw new Error(`ERROR handler=${h} not found for step=${JSON.stringify(step)}`);
            }
        }
    }
    return step;
};
export const runZillaScript = async (script, opts = {}) => {
    const logger = opts.logger ?? DEFAULT_LOGGER;
    const env = opts.env ?? {};
    // merge init blocks -- runtime init overrides script init
    const init = Object.assign({}, script.init || {}, opts.init || {});
    if (!init.servers) {
        throw new Error(`script=${script.script} has no servers defined in init`);
    }
    const vars = { ...init.vars };
    const handlers = {
        ...init.handlers,
    };
    const sessions = init.sessions || {};
    const servers = init.servers.map((s, i) => ({
        ...s,
        name: s.server ?? `default-${i}`,
        base: evalTpl(s.base, { env }),
    }));
    const defServer = servers[0].name;
    const stepResults = [];
    logger.info(`***** [SCRIPT ${script.script}] starting`);
    const steps = script.steps.map((step) => processStep(step, handlers));
    let stepPrefix = "";
    for (const step of steps) {
        stepPrefix = `*** [STEP "${step.step ?? "(unnamed)"}"] `;
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
            const srv = servers.find((s) => s.name === (step.server ?? defServer));
            if (!srv) {
                const msg = `server not found for step ${step.step ?? "?"}`;
                logger.error(`${stepPrefix}: ${msg}`);
                throw new Error(msg);
            }
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
                for (const [varName, val] of Object.entries(step.edits)) {
                    if (typeof vars[varName] === "undefined") {
                        throw new Error(`step=${step.step} var=${varName} is undefined`);
                    }
                    if (typeof val === "number" ||
                        typeof val === "string" ||
                        typeof val === "boolean" ||
                        val == null) {
                        vars[varName] = val;
                    }
                    else {
                        vars[varName] = Object.assign({}, vars[varName], val);
                    }
                }
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
                if (!srv.session) {
                    throw new Error(`step=${step.step ?? "?no step name"} session not supported by server=${srv.name}`);
                }
                const tok = sessions[step.request.session];
                if (tok) {
                    if (srv.session.cookie)
                        headers.append("Cookie", `${srv.session.cookie}=${tok}`);
                    if (srv.session.header)
                        headers.set(srv.session.header, tok);
                }
            }
            const body = step.request.body !== undefined
                ? JSON.stringify(walk(step.request.body, ctx))
                : undefined;
            logger.info(`${stepPrefix} → ${method} ${url}`, {
                headers: [...headers.entries()],
                body: body ? JSON.parse(body) : undefined,
            });
            /* ---------- send request ------------------------------------- */
            const useAxios = step.request.files;
            const res = useAxios
                ? await upload(url, step, headers)
                : await fetch(url, { method, headers, body });
            let raw = await (useAxios
                ? parseAxiosResponse(res)
                : parseResponse(res));
            logger.info(`${stepPrefix} ← ${res.status} ${method} ${url}`, raw);
            /* ---------- capture session ---------------------------------- */
            if (step.response?.session) {
                if (!srv.session) {
                    throw new Error(`step=${step.step ?? "?no step name"} session not supported by server=${srv.name}`);
                }
                const strategy = step.response.session.from ?? {
                    body: undefined,
                    header: srv.session.header ? { name: srv.session.header } : undefined,
                    cookie: srv.session.cookie ? { name: srv.session.cookie } : undefined,
                };
                const tok = extract("session", strategy, raw.body, raw.headers, {});
                if (typeof tok === "string") {
                    sessions[step.response.session.name] = tok;
                    logger.trace(`${stepPrefix} captured session "${step.response.session.name}"`, tok);
                }
                else {
                    logger.warn(`${stepPrefix} session capture for "${step.response.session.name}" returned non-string token`, tok);
                }
            }
            /* ---------- capture vars ------------------------------------- */
            if (step.response?.vars) {
                for (const [v, src] of Object.entries(step.response.vars)) {
                    const val = extract(v, src, raw.body, raw.headers, vars);
                    vars[v] = val;
                    logger.trace(`${stepPrefix} captured var ${v}`, val);
                }
            }
            /* ---------- set handlebars context ---------------------------- */
            const hdrMap = {};
            raw.headers.forEach(({ name, value }) => {
                hdrMap[headerName(name)] = value;
            });
            const cx = {
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
                        logger.error(`${stepPrefix} handler not found: ${h}`);
                    }
                    const args = handlerParts.length > 1 ? handlerParts.slice(1) : [];
                    const varsForHandler = { ...vars, ...sessions };
                    const origKeys = Object.keys(varsForHandler);
                    raw = await handler(raw, args.map((a) => evalTpl(a, cx)), varsForHandler, step);
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
            }
            else {
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
                const msg = `validation failed in step ${step.step ?? "?"}: ${JSON.stringify(checkDetails, null, 2)}\n
        cx=${JSON.stringify(cx, null, 2)}`;
                if (!opts.continueOnInvalid)
                    throw new Error(msg);
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
            logger.info(`${stepPrefix} complete`);
        }
        catch (err) {
            logger.info(`${stepPrefix} ERROR`);
            if (!opts.continueOnError) {
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
    logger.info(`***** [SCRIPT ${script.script}] finished`);
    return { script, stepResults };
};
//# sourceMappingURL=engine.js.map