import { AxiosHeaders } from "axios";
export const headerName = (h) => h.replace(/[^a-z0-9]/gi, "_").toLowerCase();
export const firstHeader = (headers, name) => headers.find((h) => h.name === name)?.value ?? null;
export const toHeaderArray = (h) => [...h.entries()].map(([name, value]) => ({ name, value }));
export const parseResponse = async (res) => {
    const resHeadersArr = toHeaderArray(res.headers);
    const contentType = res.headers.get("content-type") ?? "";
    const resBody = await (contentType.includes("application/json")
        ? res.json()
        : contentType.startsWith("text/")
            ? res.text()
            : res.bytes());
    return {
        status: res.status,
        statusText: res.statusText,
        headers: resHeadersArr,
        body: resBody,
    };
};
export const parseAxiosResponse = async (res) => {
    const headers = Object.entries(res.headers).map(([name, value]) => ({
        name,
        value,
    }));
    const contentType = res.headers["content-type"] ?? "";
    const body = contentType.includes("application/json")
        ? res.data
        : contentType.includes("text/")
            ? String(res.data)
            : Buffer.from(res.data);
    return {
        status: res.status,
        statusText: res.statusText,
        headers,
        body,
    };
};
export const toAxiosHeaders = (h, formHeaders, omit) => {
    const result = new AxiosHeaders();
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
//# sourceMappingURL=util.js.map