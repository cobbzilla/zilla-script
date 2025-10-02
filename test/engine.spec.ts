import { assert, expect } from "chai";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import {
  runZillaScript,
  StepContext,
  ZillaRawResponse,
  ZillaScript,
  ZillaScriptInit,
  ZillaScriptResult,
  ZillaScriptVars,
} from "../src/index.js";
import {
  createServerHarness,
  getMinimalPng,
  getMinimalPngAsync,
} from "./harness.js";

let init: ZillaScriptInit;

const verifyAllStepsOK = async (
  script: ZillaScript,
  expectedLength?: number
) => {
  expectedLength ||= 1;
  const result = await runZillaScript(script);
  expect(result.stepResults).to.have.lengthOf(expectedLength);
  result.stepResults.forEach((step) => {
    if (step.status) {
      expect(step.status).to.equal(200);
    }
    expect(step.validation.result).to.be.true;
  });
  return result;
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
    const result = await verifyAllStepsOK(script);
    expect(result.stepResults[0].body).to.deep.equal({
      ok: true,
      echoed: { foo: "bar" },
    });
  });

  it("handles echos a variable in a key", async () => {
    const script: ZillaScript = {
      script: "post-echo",
      init,
      steps: [
        {
          step: "echo-var-in-key-step",
          vars: { fooVar: "quux" },
          request: {
            post: "test",
            body: { ["{{fooVar}}"]: "bar" },
          },
          response: {
            status: 200,
            capture: {
              bar: { body: "echoed.quux" },
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
            ],
          },
        },
      ],
    };
    const result = await verifyAllStepsOK(script);
    expect(result.stepResults[0].body).to.deep.equal({
      ok: true,
      echoed: { quux: "bar" },
    });
  });

  it("captures a value from an array element", async () => {
    const script: ZillaScript = {
      script: "capture-array",
      init,
      steps: [
        {
          step: "post-array",
          request: { post: "array" },
          response: {
            capture: {
              foo1: { body: "[0].foo" },
              foo2: { body: "[1].foo" },
              foo3: { body: "[2].foo" },
              firstFoo: { body: "[0]" },
              secondFoo: { body: "[1]" },
              thirdFoo: { body: "[2]" },
            },
            validate: [
              { id: "check foo1", check: ["eq foo1 1"] },
              { id: "check foo2", check: ["eq foo2 2"] },
              { id: "check foo3", check: ["eq foo3 3"] },
              { id: "check firstFoo", check: ["eq firstFoo.foo 1"] },
              { id: "check secondFoo", check: ["eq secondFoo.foo 2"] },
              { id: "check thirdFoo", check: ["eq thirdFoo.foo 3"] },
            ],
          },
        },
      ],
    };
    await verifyAllStepsOK(script);
  });

  it("sends a query properly", async () => {
    const script: ZillaScript = {
      script: "echo-query",
      init,
      steps: [
        {
          step: "echo-query",
          request: {
            post: "query",
            query: { foo: "bar", baz: 2, quux: "must/be escaped!" },
          },
          response: {
            validate: [
              { id: "check foo", check: ["eq body.foo 'bar'"] },
              { id: "check bar", check: ["eq body.baz 2"] },
              { id: "check baz", check: ["eq body.quux 'must/be escaped!'"] },
            ],
          },
        },
      ],
    };
    await verifyAllStepsOK(script);
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
              raw: ZillaRawResponse | undefined,
              args: Record<string, unknown>,
              vars: ZillaScriptVars
            ) => {
              vars.new_var = 42 + (args.addend as number);
              return raw;
            },
          },
          takes_an_object: {
            args: {
              some_object: { required: true, type: "object" },
              opaque_arg: { required: true, opaque: true },
            },
            func: (
              raw: ZillaRawResponse | undefined,
              args: Record<string, unknown>,
              vars: ZillaScriptVars
            ) => {
              vars.obj_result =
                "echo:" + (args.some_object as Record<string, string>).value;
              vars.obj_opaque_result = `echo:${args.opaque_arg}`;
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
            body: {
              a: "1",
              b: "2",
              c: "3",
              jsonAsString: '"{\\"json\\":1,\\"as-a-string\\":\\"w00t\\"}"',
            },
          },
          response: { status: 200 },
        },
        /* retrieve and validate */
        {
          step: "get-session-one",
          vars: {
            sessionRef: "session-one",
            testVar1: "abc",
            testVar2: 123,
            testVar3: { foo: "bar", baz: "quux" },
            testVar4: "{{testVar1}}def",
            testVar5: { a: 1, b: 2, c: 3 },
          },
          // edit testVar3
          edits: {
            testVar3: { baz: "snarf", fish: 42, nest: "{{testVar5}}" },
          },
          request: {
            get: "session",
            session: "{{sessionRef}}",
          },
          response: {
            status: 200,
            capture: {
              parsed: { body: "jsonAsString", parse: 2 },
            },
            validate: [
              {
                id: "dataCheck",
                check: [
                  "compare body.a '==' '1'",
                  "compare body.b '==' '2'",
                  "compare body.c '==' '3'",
                  "compare parsed.json '==' 1",
                  "compare parsed.as-a-string '==' 'w00t'",
                  "compare testVar1 '==' 'abc'",
                  "compare testVar2 '==' 123",
                  "compare testVar3.foo '==' 'bar'",
                  "compare testVar3.baz '==' 'snarf'", // edited, not quux!
                  "compare testVar3.fish '==' 42", // edited, added
                  "compare testVar3.nest.a '==' 1", // edited, added nested object
                  "compare testVar3.nest.b '==' 2", // edited, added nested object
                  "compare testVar3.nest.c '==' 3", // edited, added nested object
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
          handlers: [
            { handler: "add_42_to_number", params: { addend: "{{addend}}" } },
            {
              handler: "takes_an_object",
              params: {
                some_object: { value: "{{addend}}" },
                opaque_arg: "{{addend}}",
              },
            },
          ],
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
                  "compare obj_result '==' 'echo:11'", // handler takes_an_object creates this
                  "compare obj_opaque_result '==' 'echo:{{addend}}'", // handler takes_an_object creates this
                ],
              },
            ],
          },
        },
      ],
    };

    const result: ZillaScriptResult = await verifyAllStepsOK(script, 5);

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

    await verifyAllStepsOK(script, 2);
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

    const result = await verifyAllStepsOK(script, 4);
    const step0 = result.stepResults[0];
    expect((step0.body as any).echoed.foo).to.be.eq("bar-one");
    const step1 = result.stepResults[1];
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
    const result = await verifyAllStepsOK(script, 2);
    expect((result.stepResults[0].body as any).echoed.foo).to.be.eq("foobar");
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
    await verifyAllStepsOK(script);
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
    await verifyAllStepsOK(script);
  });

  it("calls a afterStep handler with new variable defined", async () => {
    let callCount = 0;
    let sawVar: string | undefined = undefined;
    const newVarName = "NEW_VAR";
    const script: ZillaScript = {
      script: "afterScript",
      init: {
        ...init,
        afterStep: (ctx: StepContext) => {
          if (callCount === 0 && !sawVar && ctx.vars[newVarName]) {
            sawVar = `${ctx.vars[newVarName]}`;
          }
          callCount++;
        },
      },
      steps: [
        {
          step: "sends a dummy request",
          request: {
            post: "test",
            body: { foo: "foo" },
          },
          response: {
            capture: { [newVarName]: { body: "echoed.foo" } },
          },
        },
      ],
    };
    await verifyAllStepsOK(script);
    expect(callCount).to.be.eq(1);
    expect(sawVar).to.be.eq("foo");
  });
});
