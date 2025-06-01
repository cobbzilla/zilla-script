import Handlebars from "handlebars";
import { JSONPath } from "jsonpath-plus";
import { isEmpty } from "zilla-util";
const isComparable = (v) => typeof v === "string" || typeof v === "number";
Handlebars.registerHelper("compare", (l, op, r) => {
    /* plain equality always works (covers booleans too) */
    if (op === "empty")
        return isEmpty(l);
    if (op === "undefined")
        return typeof l === "undefined";
    if (op === "null")
        return l == null;
    if (op === "==" || op === "!=")
        return op === "==" ? l == r : l != r;
    /* the rest require strictly comparable operands */
    if (!isComparable(l) || !isComparable(r))
        throw new Error(`operator ${op} requires string | number operands`);
    if (typeof l !== typeof r)
        throw new Error(`operator ${op} requires operands of the same type`);
    const numericOps = {
        ">": (a, b) => a > b,
        ">=": (a, b) => a >= b,
        "<": (a, b) => a < b,
        "<=": (a, b) => a <= b,
    };
    const stringOps = {
        ">": (a, b) => a > b,
        ">=": (a, b) => a >= b,
        "<": (a, b) => a < b,
        "<=": (a, b) => a <= b,
    };
    const fn = typeof l === "number" ? numericOps[op] : stringOps[op]; // types match now
    if (!fn)
        throw new Error(`unsupported operator ${op}`);
    return fn(l, r);
});
export const evalTpl = (tpl, ctx) => Handlebars.compile(tpl, { noEscape: true })(ctx);
export const walk = (v, ctx) => {
    if (typeof v === "string" && v.includes("{{"))
        return evalTpl(v, ctx);
    if (Array.isArray(v))
        return v.map((x) => walk(x, ctx));
    if (v && typeof v === "object")
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [
            k,
            walk(x, ctx),
        ]));
    return v;
};
export const headerName = (h) => h.replace(/[^a-z0-9]/gi, "");
export const extract = (src, body, hdrs) => {
    if (src.body !== undefined) {
        /* full-body capture (object or raw text) */
        if (src.body === null)
            return body;
        /* JSONPath capture */
        return JSONPath({
            path: `$.${src.body}`,
            json: body,
            wrap: false,
        });
    }
    if (src.header)
        return hdrs.get(src.header.name) ?? null;
    if (src.cookie) {
        const raw = hdrs.get("set-cookie") ?? "";
        const match = raw.match(new RegExp(`${src.cookie.name}=([^;]+)`));
        return match ? match[1] : null;
    }
    throw new Error("invalid capture source");
};
//# sourceMappingURL=helpers.js.map