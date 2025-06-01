import Handlebars from "handlebars";
import { evalTpl, extract, headerName, walk } from "./helpers.js";
export const toHeaderArray = (h) => [...h.entries()].map(([name, value]) => ({ name, value }));
export const runZillaScript = async (script, opts = {}) => {
    const env = opts.env ?? {};
    const vars = { ...script.init.vars };
    const sessions = {};
    const servers = script.init.servers.map((s, i) => ({
        ...s,
        name: s.name ?? `default-${i}`,
        base: evalTpl(s.base, { env }),
    }));
    const defServer = servers[0].name;
    const stepResults = [];
    for (const step of script.steps) {
        try {
            const srv = servers.find((s) => s.name === (step.server ?? defServer));
            if (!srv)
                throw new Error(`server not found for step ${step.name ?? "?"}`);
            const ctx = { ...vars, env };
            const rawUrl = new URL(step.request.uri, srv.base).toString();
            const url = rawUrl.includes("{{") ? evalTpl(rawUrl, ctx) : rawUrl;
            const method = step.request.method ?? "GET";
            const headers = new Headers();
            headers.set("Content-Type", step.request.contentType ?? "application/json");
            step.request.headers?.forEach((h) => headers.set(evalTpl(h.name, ctx), evalTpl(h.value, ctx)));
            if (step.request.session) {
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
            const res = await fetch(url, { method, headers, body });
            const resHeadersArr = toHeaderArray(res.headers);
            const resBody = (res.headers.get("content-type") ?? "").includes("application/json")
                ? await res.json()
                : await res.text();
            /* ---------- capture ------------------------------------------------ */
            if (step.response?.session) {
                const tok = extract(step.response.session.from, resBody, res.headers);
                if (typeof tok === "string")
                    sessions[step.response.session.name] = tok;
            }
            if (step.response?.vars)
                for (const [v, src] of Object.entries(step.response.vars))
                    vars[v] = extract(src, resBody, res.headers);
            /* ---------- validation -------------------------------------------- */
            const hdrMap = {};
            resHeadersArr.forEach(({ name, value }) => {
                hdrMap[headerName(name)] = value;
            });
            const expectedStatus = step.response?.status ?? 200;
            const expectedClass = step.response?.statusClass ?? "2xx";
            const statusOk = res.status === expectedStatus ||
                `${Math.floor(res.status / 100)}xx` === expectedClass;
            const details = [
                { check: "status", result: statusOk },
            ];
            let overall = statusOk;
            step.response?.validate?.forEach((val) => val.check.forEach((c) => {
                const rendered = Handlebars.compile(`{{${c}}}`, {
                    noEscape: true,
                })({
                    ...vars,
                    body: resBody,
                    header: hdrMap,
                });
                const pass = rendered.trim().toLowerCase() === "true";
                details.push({ check: c, result: pass });
                overall &&= pass;
            }));
            const validation = {
                name: step.response?.validate?.[0]?.name ?? "validation",
                result: overall,
                details,
            };
            if (!overall && !opts.continueOnInvalid)
                throw new Error(`validation failed in step ${step.name ?? "?"}`);
            stepResults.push({
                status: res.status,
                headers: resHeadersArr,
                body: resBody,
                validation,
                vars: { ...vars },
                sessions: { ...sessions },
            });
        }
        catch (err) {
            if (!opts.continueOnError)
                throw err;
            stepResults.push({
                status: 0,
                headers: [],
                body: "",
                validation: {
                    name: "error",
                    result: false,
                    details: [{ check: err.message, result: false }],
                },
                vars: { ...vars },
                sessions: { ...sessions },
            });
        }
    }
    return { script, stepResults };
};
//# sourceMappingURL=engine.js.map