import { expect } from "chai";
import {
  createApp,
  createRouter,
  eventHandler,
  getHeader,
  readBody,
  setHeader,
  toNodeListener,
} from "h3";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { uuidv4 } from "zilla-util";
import {
  runZillaScript,
  ZillaRawResponse,
  ZillaScript,
  ZillaScriptOptions,
  ZillaScriptResult,
} from "../src/index.js";

describe("ZillaScript engine – basic h3 integration", function () {
  let server: ReturnType<typeof createServer>;
  let baseUrl = "";

  /* in-memory session store: token → Record<string,string> */
  const sessions = new Map<string, Record<string, string>>();

  /* ------------------------------------------------------------------ */
  before(async () => {
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

    /* wire up router ------------------------------------------------- */
    const app = createApp();
    app.use(router);
    server = createServer(toNodeListener(app));

    /* listen on a random free port for parallel CI friendliness ------ */
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/`;
  });

  /* ------------------------------------------------------------------ */
  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  });

  /* ------------------------------------------------------------------ */
  it("handles a simple POST and passes validation", async () => {
    const script: ZillaScript = {
      script: "post-echo",
      init: {
        servers: [
          {
            server: "local",
            base: baseUrl,
            session: { cookie: "sess" },
          },
        ],
        vars: {},
      },
      steps: [
        {
          step: "post-step",
          request: {
            post: "test",
            body: { foo: "bar" },
          },
          response: {
            status: 200,
            validate: [
              {
                id: "bodyCheck",
                check: [
                  "compare body.ok '==' true",
                  "compare body.echoed.foo '==' 'bar'",
                ],
              },
            ],
          },
        },
      ],
    };

    const result = await runZillaScript(script, {
      continueOnError: false,
    } as ZillaScriptOptions);

    expect(result.stepResults).to.have.lengthOf(1);
    const step = result.stepResults[0];
    expect(step.status).to.equal(200);
    expect(step.validation.result).to.be.true;
    expect(step.body).to.deep.equal({ ok: true, echoed: { foo: "bar" } });
  });

  /* ------------------------------------------------------------------ */
  it("creates two independent sessions and manipulates data", async () => {
    const script: ZillaScript = {
      script: "session-manipulation",
      init: {
        servers: [
          {
            server: "local",
            base: baseUrl,
            session: { cookie: "sess" },
          },
        ],
        vars: {},
        handlers: {
          define_new_variable: (step, vars, raw: ZillaRawResponse) => {
            vars.new_var = 42;
            return raw;
          },
        },
      },
      steps: [
        /* --- session-one starts ------------------------------------ */
        {
          step: "start-session-one",
          request: { put: "session" },
          response: {
            status: 200,
            session: {
              name: "session-one",
              from: { cookie: { name: "sess" } }, // redundant, but why not test it
            },
          },
        },
        /* add three items */
        {
          step: "add-to-session-one",
          request: {
            post: "session",
            session: "session-one",
            body: { a: "1", b: "2", c: "3" },
          },
          response: { status: 200 },
        },
        /* retrieve and validate */
        {
          step: "get-session-one",
          vars: {
            testVar1: "abc",
            testVar2: 123,
            testVar3: { foo: "bar", baz: "quux" },
            testVar4: "{{testVar1}}def",
          },
          // edit testVar3
          edits: {
            testVar3: { baz: "snarf", fish: 42 },
          },
          request: {
            get: "session",
            session: "session-one",
          },
          response: {
            status: 200,
            validate: [
              {
                id: "dataCheck",
                check: [
                  "compare body.a '==' '1'",
                  "compare body.b '==' '2'",
                  "compare body.c '==' '3'",
                  "compare testVar1 '==' 'abc'",
                  "compare testVar2 '==' 123",
                  "compare testVar3.foo '==' 'bar'",
                  "compare testVar3.baz '==' 'snarf'", // edited, not quux!
                  "compare testVar3.fish '==' 42", // edited, added
                  "compare testVar4 '==' 'abcdef'",
                ],
              },
            ],
          },
        },
        /* --- session-two starts ------------------------------------ */
        {
          step: "start-session-two",
          request: { put: "session" },
          response: {
            status: 200,
            session: { name: "session-two" }, // omitting capture method, we use the server's method
          },
        },
        /* retrieve, expect empty object */
        {
          step: "get-session-two",
          request: {
            get: "session",
            session: "session-two",
          },
          handler: "define_new_variable",
          response: {
            status: 200,
            validate: [
              {
                id: "emptyCheck",
                check: [
                  "compare body 'empty'", // body should be empty object
                  "compare body.a 'undefined'", // body.a is undefined
                  "compare body.b 'undefined'", // body.b is undefined
                  "compare body.c 'undefined'", // body.c is undefined
                  "compare new_var '==' 42", // handler define_new_variable creates this
                ],
              },
            ],
          },
        },
      ],
    };

    const result: ZillaScriptResult = await runZillaScript(script, {
      continueOnError: false,
    } as ZillaScriptOptions);

    /* verify all steps ran */
    expect(result.stepResults).to.have.lengthOf(5);

    /* final step (session-two retrieval) should have empty object body */
    const last = result.stepResults[4];
    expect(last.status).to.equal(200);
    expect(last.body).to.deep.equal({});
    expect(last.validation.result).to.be.true;
  });
});
