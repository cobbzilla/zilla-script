import { deepGet } from "zilla-util";
import { JSONPath } from "jsonpath-plus";
import { ZillaCaptureVarSource, ZillaRawResponseHeaderArray } from "./types.js";
import { firstHeader } from "./util.js";

export const extract = (
  varName: string,
  src: ZillaCaptureVarSource,
  body: object | string,
  hdrs: ZillaRawResponseHeaderArray,
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

  if (src.header) {
    return firstHeader(hdrs, src.header.name) ?? null;
  }

  if (src.cookie) {
    const raw = firstHeader(hdrs, "set-cookie") ?? "";
    const match = raw.match(new RegExp(`${src.cookie.name}=([^;]+)`));
    return match ? match[1] : null;
  }

  throw new Error(`extract: var=${varName} error=invalid_capture_source`);
};
