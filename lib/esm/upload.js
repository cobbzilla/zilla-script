import FormData from "form-data";
import { Readable } from "stream";
import axios from "axios";
import { toAxiosHeaders } from "./util.js";
const bufferToStream = (buffer, chunkSize = 32 * 1024) => {
    return new Readable({
        read() {
            let offset = 0;
            while (offset < buffer.length) {
                const end = Math.min(offset + chunkSize, buffer.length);
                this.push(buffer.subarray(offset, end));
                offset = end;
            }
            this.push(null);
        },
    });
};
export const formDataForFiles = async (files) => {
    const formData = new FormData();
    for (const [filename, dataOrPromise] of Object.entries(files)) {
        const data = await dataOrPromise;
        const value = typeof data === "string" ? data : bufferToStream(data);
        formData.append("files", value, {
            filename,
            contentType: "application/octet-stream",
        });
    }
    return formData;
};
export const upload = async (url, step, method, headers) => {
    const formData = await formDataForFiles(step.request.files);
    let meth;
    switch (method) {
        case "POST":
            meth = axios.post;
            break;
        case "PUT":
            meth = axios.put;
            break;
        case "PATCH":
            meth = axios.patch;
            break;
        default:
            throw new Error(`upload: unsupported method=${method}`);
    }
    return await meth(url, formData, {
        method,
        headers: toAxiosHeaders(headers, formData.getHeaders(), [
            "Content-Type",
            "Content-Length",
        ]),
    });
};
//# sourceMappingURL=upload.js.map