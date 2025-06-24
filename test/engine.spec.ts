import { assert, expect } from "chai";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import {
  runZillaScript,
  ZillaRawResponse,
  ZillaScript,
  ZillaScriptInit,
  ZillaScriptOptions,
  ZillaScriptResult,
  ZillaScriptVars,
} from "../src/index.js";
import {
  createServerHarness,
  getMinimalPng,
  getMinimalPngAsync,
} from "./harness.js";

let init: ZillaScriptInit;

const verifySingleStepOk = async (script: ZillaScript) => {
  const result = await runZillaScript(script);
  expect(result.stepResults).to.have.lengthOf(1);
  const step = result.stepResults[0];
  expect(step.status).to.equal(200);
  expect(step.validation.result).to.be.true;
  return step;
};

describe("ZillaScript engine", function () {
  let server: ReturnType<typeof createServer>;
  let baseUrl = "";

  /* in-memory session store: token → Record<string,string> */
  const sessions = new Map<string, Record<string, string>>();

  before(async () => {
    server = await createServerHarness(sessions);
    /* listen on a random free port for parallel CI friendliness ------ */
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/`;
    init = {
      servers: [
        {
          server: "local",
          base: baseUrl,
        },
      ],
    };
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  });

  it("handles a simple POST and passes validation", async () => {
    const script: ZillaScript = {
      script: "post-echo",
      init,
      steps: [
        {
          step: "post-step",
          request: {
            post: "test",
            body: { foo: "bar" },
          },
          response: {
            status: 200,
            capture: {
              bar: { body: "echoed.foo" },
              type: { header: { name: "Content-Type" } },
            },
            validate: [
              {
                id: "captured value of body.echoed.foo as variable named bar",
                check: ["eq bar 'bar'"],
              },
              {
                id: "captured content-type header into variable named type",
                check: ["eq type 'application/json'"],
              },
              {
                id: "bodyCheck",
                check: [
                  "eq body.ok true",
                  "compare body.echoed.foo '==' 'bar'",
                  "notEmpty body.echoed.foo",
                ],
              },
            ],
          },
        },
      ],
    };
    const step = await verifySingleStepOk(script);
    expect(step.body).to.deep.equal({ ok: true, echoed: { foo: "bar" } });
  });

  it("creates two independent sessions and manipulates data", async () => {
    const script: ZillaScript = {
      script: "session-manipulation",
      init: {
        servers: [
          {
            server: "local",
            base: baseUrl,
          },
        ],
        session: { cookie: "sess" },
        handlers: {
          add_42_to_number: {
            args: { addend: { required: true, type: "number" } },
            func: (
              raw: ZillaRawResponse,
              args: Record<string, unknown>,
              vars: ZillaScriptVars
            ) => {
              vars.new_var = 42 + (args.addend as number);
              return raw;
            },
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
            validate: [
              {
                id: "verify header cookie",
                check: ["includes header.set_cookie 'sess'"],
              },
            ],
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
                  // test comparison operators
                  "eq testVar3.fish 42",
                  "neq testVar3.fish 0",
                  "gt testVar3.fish 0",
                  "gte testVar3.fish 42",
                  "lt testVar3.fish 43",
                  "lte testVar3.fish 42",
                  "eq testVar4 'abcdef'",
                  "neq testVar4 'abcdefg'",
                  "lt testVar4 'abcdefg'",
                  "lte testVar4 'abcdefg'",
                  "startsWith testVar4 'abc'",
                  "notStartsWith testVar4 'bc'",
                  "endsWith testVar4 'def'",
                  "notEndsWith testVar4 'de'",
                  "includes testVar4 'cde'",
                  "notIncludes testVar4 'z'",
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
          vars: { addend: 11 },
          request: {
            get: "session",
            session: "session-two",
          },
          handlers: { add_42_to_number: { addend: "addend" } },
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
                  "compare new_var '==' 53", // handler add_42_to_number creates this
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

  it("uploads some files", async () => {
    const script: ZillaScript = {
      script: "upload-files",
      init,
      steps: [
        {
          step: "upload-step",
          request: {
            post: "upload",
            files: { "first-file.png": getMinimalPng() },
          },
          response: {
            status: 200,
            validate: [
              {
                id: "bodyCheck",
                check: [
                  "length body.files '==' 1",
                  "eq body.files.[0].filename 'first-file.png'",
                ],
              },
            ],
          },
        },
        {
          step: "upload-step-with-async-function",
          request: {
            post: "upload",
            files: { "async-file.png": getMinimalPngAsync() },
          },
          response: {
            status: 200,
            validate: [
              {
                id: "bodyCheck",
                check: [
                  "length body.files '==' 1",
                  "eq body.files.[0].filename 'async-file.png'",
                ],
              },
            ],
          },
        },
      ],
    };

    const result = await runZillaScript(script);
    expect(result.stepResults).to.have.lengthOf(2);
    const step0 = result.stepResults[0];
    expect(step0.status).to.equal(200);
    expect(step0.validation.result).to.be.true;
    const step1 = result.stepResults[1];
    expect(step1.status).to.equal(200);
    expect(step1.validation.result).to.be.true;
  });

  it("runs several requests in a loop", async () => {
    const script: ZillaScript = {
      script: "loop-requests",
      init,
      steps: [
        {
          step: "loop-step",
          loop: {
            items: ["one", "two", "three"],
            varName: "itemIndex",
            steps: [
              {
                request: {
                  post: "test",
                  body: { foo: "bar-{{itemIndex}}" },
                },
                response: {
                  validate: [
                    {
                      id: "index-check",
                      check: ["endsWith body.echoed.foo itemIndex"],
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    };

    const result = await runZillaScript(script);
    expect(result.stepResults).to.have.lengthOf(3);
    const step0 = result.stepResults[0];
    expect(step0.status).to.equal(200);
    expect(step0.validation.result).to.be.true;
    expect((step0.body as any).echoed.foo).to.be.eq("bar-one");
    const step1 = result.stepResults[1];
    expect(step1.status).to.equal(200);
    expect(step1.validation.result).to.be.true;
    expect((step1.body as any).echoed.foo).to.be.eq("bar-two");
  });

  const include: ZillaScript = {
    script: "script-to-include",
    params: {
      dummyParam: { required: true },
    },
    steps: [
      {
        request: {
          post: "test",
          body: { foo: "{{dummyParam}}" },
        },
        response: {
          validate: [
            {
              id: "index-check",
              check: ["endsWith body.echoed.foo dummyParam"],
            },
          ],
        },
      },
    ],
  };

  it("fails when including another script without a required parameter", async () => {
    const script: ZillaScript = {
      script: "includes other script",
      init,
      steps: [
        {
          step: "include-step",
          include,
        },
      ],
    };

    try {
      await runZillaScript(script);
      assert.fail(
        "expected script to fail when required param was not provided"
      );
    } catch (error) {
      expect((error as Error).message).to.include("dummyParam");
    }
  });

  it("includes another script with a required parameter", async () => {
    const script: ZillaScript = {
      script: "includes other script",
      init,
      steps: [
        {
          step: "include-step",
          include,
          params: {
            dummyParam: "foobar",
          },
        },
      ],
    };
    const step = await verifySingleStepOk(script);
    expect((step.body as any).echoed.foo).to.be.eq("foobar");
  });

  it("downloads a binary file", async () => {
    const script: ZillaScript = {
      script: "binary file",
      init,
      steps: [
        {
          step: "download image",
          request: { get: "image" },
          response: {
            validate: [
              {
                id: "content length is greater than zero",
                check: ["gt header.content_length 0"],
              },
              {
                id: "content type starts with image/",
                check: ["startsWith header.content_type 'image/'"],
              },
            ],
          },
        },
      ],
    };
    await verifySingleStepOk(script);
  });

  it("sends a variable as a request body", async () => {
    const script: ZillaScript = {
      script: "variable body",
      init: { ...init, vars: { foo: { bar: ["baz", "quux"], snarf: 42 } } },
      steps: [
        {
          step: "sends variable foo as a JSON object",
          request: {
            post: "test",
            bodyVar: "foo",
          },
          response: {
            validate: [
              {
                id: "got foo object back",
                check: [
                  "eq body.echoed.bar.[0] 'baz'",
                  "eq body.echoed.bar.[1] 'quux'",
                  "length body.echoed.bar '==' 2",
                  "eq body.echoed.snarf 42",
                ],
              },
            ],
          },
        },
      ],
    };
    await verifySingleStepOk(script);
  });
});
