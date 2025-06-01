import { ZillaCaptureSource } from "./types.js";
import { JSONPath } from "jsonpath-plus";

const isComparable = (v: unknown): v is string | number =>
  typeof v === "string" || typeof v === "number";

Handlebars.registerHelper("compare", (l: unknown, op: string, r: unknown) => {
  /* plain equality always works (covers booleans too) */
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
  };

  const fn = typeof l === "number" ? numericOps[op] : stringOps[op]; // types match now

  if (!fn) throw new Error(`unsupported operator ${op}`);

  return fn(l as never, r as never);
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
  src: ZillaCaptureSource,
  body: object | string,
  hdrs: Headers
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

  if (src.header) return hdrs.get(src.header.name) ?? null;

  if (src.cookie) {
    const raw = hdrs.get("set-cookie") ?? "";
    const match = raw.match(new RegExp(`${src.cookie.name}=([^;]+)`));
    return match ? match[1] : null;
  }

  throw new Error("invalid capture source");
};
