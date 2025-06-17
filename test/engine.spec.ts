import { expect } from "chai";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import {
  runZillaScript,
  ZillaRawResponse,
  ZillaScript,
  ZillaScriptOptions,
  ZillaScriptResult,
  ZillaScriptVars,
} from "../src/index.js";
import { createServerHarness } from "./harness.js";

// a 1-pixel PNG
const getMinimalPng = (): Buffer => {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x60, 0x00, 0x00, 0x00,
    0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
};

const getMinimalPngAsync = async (): Promise<Buffer> => {
  return getMinimalPng();
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
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  });

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
                  "eq body.ok true",
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
        handlers: {
          add_42_to_number: (
            raw: ZillaRawResponse,
            args: string[],
            vars: ZillaScriptVars
          ) => {
            vars.new_var = 42 + parseInt(args[0]);
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
          handler: "add_42_to_number {{addend}}",
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
      init: {
        servers: [
          {
            server: "local",
            base: baseUrl,
          },
        ],
      },
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
    const step1 = result.stepResults[0];
    expect(step1.status).to.equal(200);
    expect(step1.validation.result).to.be.true;
  });
});
