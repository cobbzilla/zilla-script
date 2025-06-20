import Handlebars from "handlebars";
import { isEmpty } from "zilla-util";
const isComparable = (v) => typeof v === "string" || typeof v === "number";
const jsonNumberRegex = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
Handlebars.registerHelper("compare", (l, op, r) => {
    /* plain equality always works (covers booleans too) */
    if (op === "empty")
        return isEmpty(l);
    if (op === "notEmpty")
        return !isEmpty(l);
    if (op === "undefined")
        return typeof l === "undefined";
    if (op === "notUndefined")
        return typeof l !== "undefined";
    if (op === "null")
        return l == null;
    if (op === "notNull")
        return l != null;
    if (op === "==" || op === "!=")
        return op === "==" ? l == r : l != r;
    /* the rest require strictly comparable operands */
    if (!isComparable(l)) {
        throw new Error(`operator ${op} requires string | number operands: invalid left operand: ${l}`);
    }
    if (!isComparable(r)) {
        throw new Error(`operator ${op} requires string | number operands: invalid right operand: ${r}`);
    }
    if (typeof l !== typeof r) {
        if (typeof l === "number" && typeof r === "string") {
            // If left operand is a number and the right operand looks like a number, make the right operand a number
            const rString = `${r}`.toLowerCase();
            if (jsonNumberRegex.test(rString)) {
                if (rString.includes(".") || rString.includes("e")) {
                    r = parseFloat(rString);
                }
                else {
                    r = parseInt(rString);
                }
            }
        }
        else if (typeof r === "number" && typeof l === "string") {
            // If the right operand is a number and the left operand looks like a number, make the left operand a number
            const lString = `${l}`.toLowerCase();
            if (jsonNumberRegex.test(lString)) {
                if (lString.includes(".") || lString.includes("e")) {
                    l = parseFloat(lString);
                }
                else {
                    l = parseInt(lString);
                }
            }
        }
    }
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
        startsWith: (a, b) => a.startsWith(b),
        notStartsWith: (a, b) => !a.startsWith(b),
        endsWith: (a, b) => a.endsWith(b),
        notEndsWith: (a, b) => !a.endsWith(b),
        includes: (a, b) => a.includes(b),
        notIncludes: (a, b) => !a.includes(b),
    };
    const fn = typeof l === "number" ? numericOps[op] : stringOps[op]; // types match now
    if (!fn)
        throw new Error(`unsupported operator ${op}`);
    return fn(l, r);
});
const operatorHelpers = [
    ["eq", "=="],
    ["neq", "!="],
    ["gt", ">"],
    ["gte", ">="],
    ["lt", "<"],
    ["lte", "<="],
    ["startsWith", "startsWith"],
    ["notStartsWith", "notStartsWith"],
    ["endsWith", "endsWith"],
    ["notEndsWith", "notEndsWith"],
    ["includes", "includes"],
    ["notIncludes", "notIncludes"],
    ["empty", "empty"],
    ["notEmpty", "notEmpty"],
];
operatorHelpers.forEach(([name, op]) => Handlebars.registerHelper(name, (l, r) => Handlebars.helpers.compare(l, op, r)));
Handlebars.registerHelper("length", (l, op, r) => {
    const len = typeof l === "string" || Array.isArray(l) ? l.length : -1;
    if (len === -1) {
        throw new Error(`cannot get length for type ${typeof l}`);
    }
    if (typeof r !== "number" || r < 0) {
        throw new Error(`right operand expected to be a positive number`);
    }
    const numericOps = {
        "==": (a, b) => a == b,
        "!=": (a, b) => a != b,
        ">": (a, b) => a > b,
        ">=": (a, b) => a >= b,
        "<": (a, b) => a < b,
        "<=": (a, b) => a <= b,
    };
    const fn = numericOps[op];
    if (!fn) {
        throw new Error(`unsupported operator ${op}`);
    }
    return fn(len, r);
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
//# sourceMappingURL=helpers.js.map