import { AxiosResponse, AxiosRequestHeaders, AxiosHeaders } from "axios";
import { ZillaRawResponse, ZillaRawResponseHeaderArray } from "./types.js";
import FormData from "form-data";

export const headerName = (h: string): string =>
  h.replace(/[^a-z0-9]/gi, "_").toLowerCase();

export const firstHeader = (
  headers: ZillaRawResponseHeaderArray,
  name: string
) => headers.find((h) => h.name === name)?.value ?? null;

export const toHeaderArray = (h: Headers): ZillaRawResponseHeaderArray =>
  [...h.entries()].map(([name, value]) => ({ name, value }));

export const parseResponse = async (
  res: Response
): Promise<ZillaRawResponse> => {
  const resHeadersArr = toHeaderArray(res.headers);
  const resBody: object | string = (
    res.headers.get("content-type") ?? ""
  ).includes("application/json")
    ? await res.json()
    : await res.text();
  return {
    status: res.status,
    statusText: res.statusText,
    headers: resHeadersArr,
    body: resBody,
  };
};

export const parseAxiosResponse = async <T = unknown>(
  res: AxiosResponse<T>
): Promise<ZillaRawResponse> => {
  const headers: ZillaRawResponseHeaderArray = Object.entries(res.headers).map(
    ([name, value]: [string, string]): { name: string; value: string } => ({
      name,
      value,
    })
  );

  const contentType: string = res.headers["content-type"] ?? "";
  const body: object | string = contentType.includes("application/json")
    ? (res.data as object)
    : String(res.data);

  return {
    status: res.status,
    statusText: res.statusText,
    headers,
    body,
  };
};

export const toAxiosHeaders = (
  h: Headers,
  formHeaders: FormData.Headers,
  omit: string[]
): AxiosRequestHeaders => {
  const result: AxiosRequestHeaders = new AxiosHeaders();
  omit = omit ? omit.map((o) => o.toLowerCase()) : [];
  for (const [name, value] of h.entries()) {
    if (omit.includes(name.toLowerCase())) {
      continue;
    }
    result[name] = value;
  }
  Object.entries(formHeaders).forEach(([name, value]) => {
    result[name] = value;
  });
  return result;
};
