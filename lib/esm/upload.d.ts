import FormData from "form-data";
import { AxiosResponse } from "axios";
import { ZillaScriptStep } from "./types.js";
export declare const formDataForFiles: (files: Record<string, string | Buffer | Promise<string> | Promise<Buffer>>) => Promise<FormData>;
export declare const upload: (url: string, step: ZillaScriptStep, headers: Headers) => Promise<AxiosResponse>;
