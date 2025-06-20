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

// a 1-pixel PNG
export const getMinimalPng = (): Buffer => {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x60, 0x00, 0x00, 0x00,
    0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
};

export const getMinimalPngAsync = async (): Promise<Buffer> => {
  return getMinimalPng();
};

export const createServerHarness = async (
  sessions: Map<string, Record<string, string>>
) => {
  const router = createRouter();

  /* original echo endpoint ---------------------------------------- */
  router.post(
    "/test",
    eventHandler(async (event) => {
      try {
        const body = await readBody(event);
        return { ok: true, echoed: body };
      } catch (err) {
        console.error(err);
      }
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

  router.get(
    "/image",
    eventHandler((event) => {
      const buf = getMinimalPng();
      setHeader(event, "Content-Type", "image/png");
      setHeader(event, "Content-Length", buf.length);
      return buf;
    })
  );

  /* wire up router ------------------------------------------------- */
  const app = createApp();
  app.use(router);
  return createServer(toNodeListener(app));
};
