import FormData from "form-data";
import { Readable } from "stream";
import axios, { AxiosResponse } from "axios";
import { toAxiosHeaders } from "./util.js";
import { ZillaScriptStep } from "./types.js";

const bufferToStream = (
  buffer: Buffer,
  chunkSize: number = 32 * 1024
): Readable => {
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

export const formDataForFiles = (
  files: Record<string, string | Buffer>
): FormData => {
  const formData = new FormData();

  for (const [filename, data] of Object.entries(files)) {
    const value =
      typeof data === "string" ? data : bufferToStream(data as Buffer);
    formData.append("files", value, {
      filename,
      contentType: "application/octet-stream",
    });
  }

  return formData;
};

export const upload = async (
  url: string,
  step: ZillaScriptStep,
  headers: Headers
): Promise<AxiosResponse> => {
  const formData = formDataForFiles(step.request.files!);
  return await axios.post(url, formData, {
    method: step.request.method || "POST",
    headers: toAxiosHeaders(headers, formData.getHeaders(), [
      "Content-Type",
      "Content-Length",
    ]),
  });
};
