import Busboy from "busboy";
import {
  createApp,
  createRouter,
  eventHandler,
  getHeader,
  readBody,
  setHeader,
  toNodeListener,
} from "h3";
import { uuidv4 } from "zilla-util";
import { createServer } from "http";

export const createServerHarness = async (
  sessions: Map<string, Record<string, string>>
) => {
  const router = createRouter();

  /* original echo endpoint ---------------------------------------- */
  router.post(
    "/test",
    eventHandler(async (event) => {
      const body = await readBody<{ foo: string }>(event);
      return { ok: true, echoed: body };
    })
  );

  /* PUT /session  -> new session ---------------------------------- */
  router.put(
    "/session",
    eventHandler(async (event) => {
      const token = uuidv4();
      sessions.set(token, {});
      /* send session token via Set-Cookie */
      setHeader(event, "Set-Cookie", `sess=${token}; Path=/`);
      return {};
    })
  );

  /* POST /session  -> add data to session -------------------------- */
  router.post(
    "/session",
    eventHandler(async (event) => {
      const token =
        getHeader(event, "cookie")?.match(/sess=([^;]+)/)?.[1] ?? "";
      const payload = await readBody<Record<string, string>>(event);
      if (!sessions.has(token)) sessions.set(token, {});
      Object.assign(sessions.get(token)!, payload);
      return { ok: true };
    })
  );

  /* GET /session  -> return session data --------------------------- */
  router.get(
    "/session",
    eventHandler((event) => {
      const token =
        getHeader(event, "cookie")?.match(/sess=([^;]+)/)?.[1] ?? "";
      return sessions.get(token) ?? {};
    })
  );

  /* POST /upload  -> handle upload -------------------------------- */
  router.post(
    "/upload",
    eventHandler(
      (event) =>
        new Promise<{
          files: Array<{
            fieldName: string;
            filename: string;
            mimeType: string;
            encoding: string;
            size: number;
          }>;
        }>((resolve, reject) => {
          const files: Array<{
            fieldName: string;
            filename: string;
            mimeType: string;
            encoding: string;
            size: number;
          }> = [];
          const busboy = Busboy({ headers: event.node.req.headers });

          busboy.on(
            "file",
            (
              fieldName: string,
              file: NodeJS.ReadableStream,
              fileInfo: { filename: string; encoding: string; mimeType: string }
            ) => {
              let size = 0;
              file.on("data", (chunk: Buffer) => {
                size += chunk.length;
              });
              file.on("end", () => {
                files.push({
                  fieldName,
                  filename: fileInfo.filename,
                  mimeType: fileInfo.mimeType,
                  encoding: fileInfo.encoding,
                  size,
                });
              });
              file.on("error", reject);
            }
          );

          busboy.on("error", reject);
          busboy.on("finish", () => resolve({ files }));
          event.node.req.pipe(busboy);
        })
    )
  );

  /* wire up router ------------------------------------------------- */
  const app = createApp();
  app.use(router);
  return createServer(toNodeListener(app));
};
