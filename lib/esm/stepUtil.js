import { isEmpty } from "zilla-util";
import { ZillaRequestMethod, } from "./types.js";
import { upload } from "./upload.js";
import { parseAxiosResponse, parseResponse } from "./util.js";
import { extract } from "./extract.js";
import { readFileSync } from "fs";
export const processStep = (step, handlers) => {
    if (step.loop) {
        if (!step.loop.items) {
            throw new Error(`ERROR No items property for loop in step=${step.step}`);
        }
        return step;
    }
    if (step.include) {
        return step;
    }
    if (!step.request) {
        throw new Error(`ERROR No request property for step=${step.step}`);
    }
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
export const resolveServer = (servers, step, defServer, logger, stepPrefix) => {
    const srv = servers.find((s) => s.name === (step.server ?? defServer));
    if (!srv) {
        const msg = `server not found for step ${step.step ?? "?"}`;
        logger.error(`${stepPrefix}: ${msg}`);
        throw new Error(msg);
    }
    return srv;
};
export const editVars = (step, vars) => {
    for (const [varName, val] of Object.entries(step.edits)) {
        if (typeof vars[varName] === "undefined") {
            // throw new Error(`step=${step.step} var=${varName} is undefined`);
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
};
export const setRequestSession = (srv, sessions, step, headers) => {
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
};
export const makeRequest = async (step, url, headers, method, body) => {
    const useAxios = step.request.files;
    const res = useAxios
        ? await upload(url, step, headers)
        : await fetch(url, { method, headers, body });
    return useAxios
        ? parseAxiosResponse(res)
        : parseResponse(res);
};
export const assignResponseSession = (srv, step, res, sessions, logger, stepPrefix) => {
    if (!srv.session) {
        throw new Error(`step=${step.step ?? "?no step name"} session not supported by server=${srv.server}`);
    }
    const responseSession = step.response.session;
    const strategy = responseSession.from ?? {
        body: undefined,
        header: srv.session.header ? { name: srv.session.header } : undefined,
        cookie: srv.session.cookie ? { name: srv.session.cookie } : undefined,
    };
    const tok = extract("session", strategy, res.body, res.headers, {});
    if (typeof tok === "string") {
        sessions[responseSession.name] = tok;
        logger.trace(`${stepPrefix} captured session "${responseSession.name}"`, tok);
    }
    else {
        logger.warn(`${stepPrefix} session capture for "${responseSession.name}" returned non-string token`, tok);
    }
};
export const loadIncludeFile = async (path) => {
    return JSON.parse(readFileSync(path, "utf8"));
};
export const loadSubScriptSteps = async (loop) => {
    if (loop.steps)
        return loop.steps;
    if (loop.include) {
        const json = await loadIncludeFile(loop.include);
        if (json.script && json.steps) {
            return json.steps;
        }
        throw new Error(`loadSubScriptSteps: include=${loop.include} expected 'steps' property in JSON`);
    }
    throw new Error(`loadSubScriptSteps: neither steps nor include specified`);
};
//# sourceMappingURL=stepUtil.js.map