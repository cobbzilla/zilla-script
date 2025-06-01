import Handlebars from "handlebars";
import { ZillaCaptureVarSource } from "./types.js";
import { JSONPath } from "jsonpath-plus";
import { deepGet, isEmpty } from "zilla-util";

const isComparable = (v: unknown): v is string | number =>
  typeof v === "string" || typeof v === "number";

Handlebars.registerHelper("compare", (l: unknown, op: string, r: unknown) => {
  /* plain equality always works (covers booleans too) */
  if (op === "empty") return isEmpty(l);
  if (op === "undefined") return typeof l === "undefined";
  if (op === "null") return l == null;
  if (op === "==" || op === "!=") return op === "==" ? l == r : l != r;

  /* the rest require strictly comparable operands */
  if (!isComparable(l) || !isComparable(r))
    throw new Error(`operator ${op} requires string | number operands`);
  if (typeof l !== typeof r)
    throw new Error(`operator ${op} requires operands of the same type`);

  const numericOps: Record<string, (a: number, b: number) => boolean> = {
    ">": (a, b) => a > b,
    ">=": (a, b) => a >= b,
    "<": (a, b) => a < b,
    "<=": (a, b) => a <= b,
  };

  const stringOps: Record<string, (a: string, b: string) => boolean> = {
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

  if (!fn) throw new Error(`unsupported operator ${op}`);

  return fn(l as never, r as never);
});

Handlebars.registerHelper("length", (l: unknown, op: string, r: unknown) => {
  const len = typeof l === "string" || Array.isArray(l) ? l.length : -1;
  if (len === -1) {
    throw new Error(`cannot get length for type ${typeof l}`);
  }

  if (typeof r !== "number" || r < 0) {
    throw new Error(`right operand expected to be a positive number`);
  }

  const numericOps: Record<string, (a: number, b: number) => boolean> = {
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

export type Ctx = Record<string, unknown>;

export const evalTpl = (tpl: string, ctx: Ctx): string =>
  Handlebars.compile(tpl, { noEscape: true })(ctx);

export const walk = (v: unknown, ctx: Ctx): unknown => {
  if (typeof v === "string" && v.includes("{{")) return evalTpl(v, ctx);
  if (Array.isArray(v)) return v.map((x) => walk(x, ctx));
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [
        k,
        walk(x, ctx),
      ])
    );
  return v;
};

export const headerName = (h: string): string => h.replace(/[^a-z0-9]/gi, "");

export const extract = (
  varName: string,
  src: ZillaCaptureVarSource,
  body: object | string,
  hdrs: Headers,
  vars: Record<string, unknown | null>
): unknown => {
  if (src.body !== undefined) {
    /* full-body capture (object or raw text) */
    if (src.body === null) return body;

    /* JSONPath capture */
    return JSONPath({
      path: `$.${src.body}`,
      json: body,
      wrap: false,
    }) as unknown;
  }

  if (src.assign) {
    if (typeof vars[src.assign] !== "undefined") {
      const dotPos = src.assign.indexOf(".");
      const bracketPos = src.assign.indexOf("[");
      if (bracketPos === -1 && dotPos === -1) {
        return vars[src.assign];
      }
      if (bracketPos === -1 || dotPos < bracketPos) {
        const srcObj = src.assign.substring(0, dotPos);
        const srcPath = src.assign.substring(dotPos + 1);
        return deepGet(srcObj, srcPath);
      }
      const srcObj = src.assign.substring(0, bracketPos);
      const srcPath = src.assign.substring(bracketPos + 1);
      return deepGet(srcObj, srcPath);
    }
    throw new Error(
      `extract: var=${varName} error=undefined_variable assign=${src.assign}`
    );
  }

  if (src.header) return hdrs.get(src.header.name) ?? null;

  if (src.cookie) {
    const raw = hdrs.get("set-cookie") ?? "";
    const match = raw.match(new RegExp(`${src.cookie.name}=([^;]+)`));
    return match ? match[1] : null;
  }

  throw new Error(`extract: var=${varName} error=invalid_capture_source`);
};
