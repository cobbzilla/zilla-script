import { expect } from "chai";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import {
  runZillaScript,
  ZillaScript,
  ZillaScriptInit,
  ZillaScriptResponseHandler,
} from "../src/index.js";
import { createServerHarness } from "./harness.js";

/**
 * Tests based on examples from GUIDE.md
 * This ensures all documentation examples actually work
 */
describe("GUIDE.md examples", function () {
  let server: ReturnType<typeof createServer>;
  let baseUrl = "";
  let init: ZillaScriptInit;

  /* in-memory session store */
  const sessions = new Map<string, Record<string, string>>();

  before(async () => {
    server = await createServerHarness(sessions);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/`;
    init = {
      servers: [{ base: baseUrl }],
    };
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  });

  describe("Quick Start example", () => {
    it("runs minimal hello-world test", async () => {
      const MyTest: ZillaScript = {
        script: "hello-world",
        init: {
          servers: [{ base: baseUrl }],
        },
        steps: [
          {
            step: "post test",
            request: { post: "test", body: { message: "hello" } },
            response: {
              validate: [{ id: "status ok", check: ["eq body.ok true"] }],
            },
          },
        ],
      };

      const result = await runZillaScript(MyTest, { env: process.env });
      expect(result.stepResults).to.have.lengthOf(1);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });
  });

  describe("Basic Validations", () => {
    it("validates simple equality", async () => {
      const script: ZillaScript = {
        script: "simple-equality",
        init,
        steps: [
          {
            step: "test equality",
            request: {
              post: "test",
              body: { status: "ok", id: 123, active: true },
            },
            response: {
              validate: [
                { id: "status is ok", check: ["eq body.echoed.status 'ok'"] },
                { id: "id is 123", check: ["eq body.echoed.id 123"] },
                { id: "flag is true", check: ["eq body.echoed.active true"] },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });

    it("validates with variables", async () => {
      const script: ZillaScript = {
        script: "variable-comparison",
        init: {
          ...init,
          vars: {
            expectedStatus: "ok",
            expectedId: 42,
          },
        },
        steps: [
          {
            step: "capture and compare",
            request: { post: "test", body: { status: "ok", id: 42 } },
            response: {
              capture: {
                actualStatus: { body: "echoed.status" },
                actualId: { body: "echoed.id" },
              },
              validate: [
                {
                  id: "status matches",
                  check: ["eq actualStatus expectedStatus"],
                },
                { id: "id matches", check: ["eq actualId expectedId"] },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });

    it("validates multiple checks per validation", async () => {
      const script: ZillaScript = {
        script: "multiple-checks",
        init,
        steps: [
          {
            step: "test email",
            request: { post: "test", body: { email: "test@example.com" } },
            response: {
              validate: [
                {
                  id: "email validation",
                  check: [
                    "notEmpty body.echoed.email",
                    "endsWith body.echoed.email '@example.com'",
                  ],
                },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });
  });

  describe("String Operations", () => {
    it("validates startsWith and endsWith", async () => {
      const script: ZillaScript = {
        script: "string-validation",
        init,
        steps: [
          {
            step: "test strings",
            request: {
              post: "test",
              body: { email: "admin@example.com", url: "http://test.com" },
            },
            response: {
              validate: [
                {
                  id: "email starts with admin",
                  check: ["startsWith body.echoed.email 'admin'"],
                },
                {
                  id: "email ends with domain",
                  check: ["endsWith body.echoed.email '@example.com'"],
                },
                {
                  id: "url starts with http",
                  check: ["startsWith body.echoed.url 'http://'"],
                },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });

    it("validates includes", async () => {
      const script: ZillaScript = {
        script: "includes-validation",
        init,
        steps: [
          {
            step: "test includes",
            request: {
              post: "test",
              body: { description: "urgent task", tags: ["urgent", "todo"] },
            },
            response: {
              validate: [
                {
                  id: "description contains urgent",
                  check: ["includes body.echoed.description 'urgent'"],
                },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });
  });

  describe("Numeric Operations", () => {
    it("validates greater than and less than", async () => {
      const script: ZillaScript = {
        script: "numeric-validation",
        init,
        steps: [
          {
            step: "test numbers",
            request: { post: "test", body: { count: 5, price: 50, age: 25 } },
            response: {
              validate: [
                { id: "count gt 0", check: ["gt body.echoed.count 0"] },
                { id: "count gte 5", check: ["gte body.echoed.count 5"] },
                { id: "price lt 100", check: ["lt body.echoed.price 100"] },
                { id: "price lte 50", check: ["lte body.echoed.price 50"] },
                { id: "age gt 18", check: ["gt body.echoed.age 18"] },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });

    it("validates type coercion", async () => {
      const script: ZillaScript = {
        script: "type-coercion",
        init,
        steps: [
          {
            step: "test coercion",
            request: { post: "test", body: { count: 42 } },
            response: {
              validate: [
                {
                  id: "number equals number",
                  check: ["eq body.echoed.count 42"],
                },
                {
                  id: "number equals string number",
                  check: ["eq body.echoed.count '42'"],
                },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });
  });

  describe("Collection Operations", () => {
    it("validates length checks on arrays", async () => {
      const script: ZillaScript = {
        script: "length-arrays",
        init,
        steps: [
          {
            step: "test array length",
            request: { post: "test", body: { items: ["a", "b", "c"] } },
            response: {
              validate: [
                {
                  id: "exactly 3 items",
                  check: ["length body.echoed.items '==' 3"],
                },
                {
                  id: "at least 1 item",
                  check: ["length body.echoed.items '>=' 1"],
                },
                {
                  id: "less than 10 items",
                  check: ["length body.echoed.items '<' 10"],
                },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });

    it("validates length checks on strings", async () => {
      const script: ZillaScript = {
        script: "length-strings",
        init,
        steps: [
          {
            step: "test string length",
            request: { post: "test", body: { name: "Alice" } },
            response: {
              validate: [
                {
                  id: "name is 5 chars",
                  check: ["length body.echoed.name '==' 5"],
                },
                {
                  id: "name at least 3 chars",
                  check: ["length body.echoed.name '>=' 3"],
                },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });

    it("validates length checks on objects", async () => {
      const script: ZillaScript = {
        script: "length-objects",
        init,
        steps: [
          {
            step: "test object length",
            request: { post: "test", body: { metadata: { foo: 1, bar: 2 } } },
            response: {
              validate: [
                {
                  id: "metadata has 2 keys",
                  check: ["length body.echoed.metadata '==' 2"],
                },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });
  });

  describe("Existence Checks", () => {
    it("validates empty and notEmpty", async () => {
      const script: ZillaScript = {
        script: "empty-checks",
        init,
        steps: [
          {
            step: "test empty",
            request: {
              post: "test",
              body: { emptyStr: "", nonEmpty: "value", emptyArr: [] },
            },
            response: {
              validate: [
                { id: "empty string", check: ["empty body.echoed.emptyStr"] },
                {
                  id: "not empty string",
                  check: ["notEmpty body.echoed.nonEmpty"],
                },
                { id: "empty array", check: ["empty body.echoed.emptyArr"] },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });

    it("validates null and notNull", async () => {
      const script: ZillaScript = {
        script: "null-checks",
        init,
        steps: [
          {
            step: "test null",
            request: {
              post: "test",
              body: { deletedAt: null, createdAt: 1234567890 },
            },
            response: {
              validate: [
                {
                  id: "deletedAt is null",
                  check: ["null body.echoed.deletedAt"],
                },
                {
                  id: "createdAt is not null",
                  check: ["notNull body.echoed.createdAt"],
                },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });
  });

  describe("Complex Validations", () => {
    it("validates nested object access", async () => {
      const script: ZillaScript = {
        script: "nested-objects",
        init,
        steps: [
          {
            step: "test nested",
            request: {
              post: "test",
              body: {
                user: { profile: { name: "Alice" } },
                items: [{ id: 123 }],
              },
            },
            response: {
              validate: [
                {
                  id: "nested name",
                  check: ["eq body.echoed.user.profile.name 'Alice'"],
                },
                {
                  id: "first item id",
                  check: ["eq body.echoed.items.[0].id 123"],
                },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });

    it("validates headers", async () => {
      const script: ZillaScript = {
        script: "header-validation",
        init,
        steps: [
          {
            step: "test headers",
            request: { post: "test", body: {} },
            response: {
              validate: [
                {
                  id: "content type",
                  check: ["eq header.content_type 'application/json'"],
                },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });
  });

  describe("Session Management", () => {
    it("captures and uses session from cookie", async () => {
      const script: ZillaScript = {
        script: "session-test",
        init: {
          servers: [
            {
              base: baseUrl,
              session: { cookie: "sess" },
            },
          ],
        },
        steps: [
          {
            step: "create session",
            request: { put: "session" },
            response: {
              session: { name: "userSession" },
            },
          },
          {
            step: "use session",
            request: {
              session: "userSession",
              post: "session",
              body: { foo: "bar" },
            },
            response: {
              validate: [{ id: "session saved", check: ["eq body.ok true"] }],
            },
          },
          {
            step: "verify session",
            request: {
              session: "userSession",
              get: "session",
            },
            response: {
              validate: [
                { id: "data persisted", check: ["eq body.foo 'bar'"] },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults).to.have.lengthOf(3);
      result.stepResults.forEach((step) => {
        expect(step.validation.result).to.be.true;
      });
    });

    it("captures session from body", async () => {
      const script: ZillaScript = {
        script: "session-body",
        init: {
          servers: [{ base: baseUrl, session: { cookie: "sess" } }],
        },
        steps: [
          {
            step: "login",
            request: { post: "test", body: { token: "abc123" } },
            response: {
              session: { name: "userSession", from: { body: "echoed.token" } },
              capture: { token: { body: "echoed.token" } },
              validate: [
                { id: "token captured", check: ["eq token 'abc123'"] },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });
  });

  describe("Variables", () => {
    it("captures variables from response", async () => {
      const script: ZillaScript = {
        script: "variable-capture",
        init: {
          ...init,
          vars: {
            userId: null,
            userEmail: null,
          },
        },
        steps: [
          {
            step: "create user",
            request: {
              post: "test",
              body: { id: 123, contact: { email: "test@example.com" } },
            },
            response: {
              capture: {
                userId: { body: "echoed.id" },
                userEmail: { body: "echoed.contact.email" },
              },
              validate: [
                { id: "userId captured", check: ["eq userId 123"] },
                {
                  id: "email captured",
                  check: ["eq userEmail 'test@example.com'"],
                },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });

    it("uses variables in requests", async () => {
      const script: ZillaScript = {
        script: "variable-usage",
        init: {
          ...init,
          vars: {
            userId: 42,
            username: "alice",
          },
        },
        steps: [
          {
            step: "use variables",
            request: {
              post: "test",
              body: {
                id: "{{userId}}",
                name: "{{username}}",
              },
            },
            response: {
              validate: [
                { id: "id used", check: ["eq body.echoed.id '42'"] },
                { id: "name used", check: ["eq body.echoed.name 'alice'"] },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });
  });

  describe("Custom Handlers", () => {
    it("runs custom handler", async () => {
      const myHandler: ZillaScriptResponseHandler = {
        args: {
          setValue: { type: "string", required: true },
        },
        func: async (response, args, vars) => {
          vars.customValue = args.setValue;
          return response;
        },
      };

      const script: ZillaScript = {
        script: "handler-test",
        init: {
          ...init,
          handlers: { myHandler },
        },
        steps: [
          {
            step: "test handler",
            request: { post: "test", body: {} },
            handlers: [
              {
                handler: "myHandler",
                params: { setValue: "success" },
              },
            ],
            response: {
              validate: [
                {
                  id: "handler set value",
                  check: ["eq customValue 'success'"],
                },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });
  });

  describe("Query Parameters", () => {
    it("sends query parameters", async () => {
      const script: ZillaScript = {
        script: "query-test",
        init,
        steps: [
          {
            step: "test query",
            request: {
              post: "query",
              query: {
                page: 1,
                limit: 10,
                sort: "name",
              },
            },
            response: {
              validate: [
                { id: "page param", check: ["eq body.page '1'"] },
                { id: "limit param", check: ["eq body.limit '10'"] },
                { id: "sort param", check: ["eq body.sort 'name'"] },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });
  });

  describe("Status Validation", () => {
    it("validates exact status code", async () => {
      const script: ZillaScript = {
        script: "status-test",
        init,
        steps: [
          {
            step: "test status",
            request: { post: "test", body: {} },
            response: {
              status: 200,
              validate: [{ id: "response ok", check: ["eq body.ok true"] }],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.status).to.equal(200);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });

    it("validates status class", async () => {
      const script: ZillaScript = {
        script: "status-class-test",
        init,
        steps: [
          {
            step: "test status class",
            request: { post: "test", body: {} },
            response: {
              statusClass: "2xx", // redundant, 2xx is the default
              validate: [{ id: "response ok", check: ["eq body.ok true"] }],
            },
          },
        ],
      };

      const result = await runZillaScript(script);
      expect(result.stepResults[0]!.status).to.equal(200);
      expect(result.stepResults[0]!.validation.result).to.be.true;
    });
  });

  describe("Loops", () => {
    it("loops over a simple array", async () => {
      const script: ZillaScript = {
        script: "loop-example",
        init,
        steps: [
          {
            step: "test-multiple-items",
            loop: {
              items: ["apple", "banana", "orange"],
              varName: "fruit",
              steps: [
                {
                  request: {
                    post: "test",
                    body: { name: "{{fruit}}" },
                  },
                  response: {
                    validate: [
                      {
                        id: "echo matches input",
                        check: ["eq body.echoed.name fruit"],
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
      expect(result.stepResults).to.have.lengthOf(4);
      expect(result.stepResults[0]!.validation.result).to.be.true;
      expect(result.stepResults[1]!.validation.result).to.be.true;
      expect(result.stepResults[2]!.validation.result).to.be.true;
      expect((result.stepResults[0]!.body as any).echoed.name).to.equal(
        "apple"
      );
      expect((result.stepResults[1]!.body as any).echoed.name).to.equal(
        "banana"
      );
      expect((result.stepResults[2]!.body as any).echoed.name).to.equal(
        "orange"
      );
    });

    it("loops over API response data", async () => {
      const script: ZillaScript = {
        script: "loop-over-api-data",
        init,
        steps: [
          {
            step: "fetch-array",
            request: { post: "array" },
            response: {
              capture: {
                itemList: { body: null },
              },
            },
          },
          {
            step: "process-each-item",
            loop: {
              items: "itemList",
              varName: "item",
              indexVarName: "itemIndex",
              steps: [
                {
                  request: {
                    post: "test",
                    body: { foo: "{{item.foo}}", index: "{{itemIndex}}" },
                  },
                  response: {
                    validate: [
                      {
                        id: "item matches",
                        check: ["eq body.echoed.foo item.foo"],
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
      // fetch + 3 loop iterations + loop container = 5 total
      expect(result.stepResults).to.have.lengthOf(5);
      // stepResults[0] is fetch, [1-3] are loop iterations, [4] is loop container
      expect((result.stepResults[1].body as any).echoed.foo).to.equal(1);
      expect((result.stepResults[2].body as any).echoed.foo).to.equal(2);
      expect((result.stepResults[3].body as any).echoed.foo).to.equal(3);
      expect((result.stepResults[1].body as any).echoed.index).to.equal(0);
      expect((result.stepResults[2].body as any).echoed.index).to.equal(1);
      expect((result.stepResults[3].body as any).echoed.index).to.equal(2);
    });
  });

  describe("Script Inclusion", () => {
    const createEntityScript: ZillaScript = {
      script: "create-entity",
      params: {
        entityName: { required: true },
        entityType: { default: "widget" },
      },
      sets: {
        vars: ["entityId"],
      },
      steps: [
        {
          request: {
            post: "test",
            body: {
              name: "{{entityName}}",
              type: "{{entityType}}",
            },
          },
          response: {
            capture: {
              entityId: { body: "echoed.name" },
            },
            validate: [
              {
                id: "entity created successfully",
                check: ["eq body.ok true"],
              },
            ],
          },
        },
      ],
    };

    it("includes a script with parameters", async () => {
      const mainScript: ZillaScript = {
        script: "test-entity",
        init,
        steps: [
          {
            step: "create-first-entity",
            include: createEntityScript,
            params: {
              entityName: "Widget A",
              entityType: "widget",
            },
          },
        ],
      };

      const result = await runZillaScript(mainScript);
      // inner step + include container = 2 total
      expect(result.stepResults).to.have.lengthOf(2);
      expect(result.stepResults[0]!.validation.result).to.be.true;
      expect((result.stepResults[0]!.body as any).echoed.name).to.equal(
        "Widget A"
      );
      expect((result.stepResults[0]!.body as any).echoed.type).to.equal(
        "widget"
      );
      expect(result.stepResults[0]!.vars.entityId).to.equal("Widget A");
    });

    it("includes a script multiple times with different parameters", async () => {
      const mainScript: ZillaScript = {
        script: "test-multiple-entities",
        init,
        steps: [
          {
            step: "create-first-entity",
            include: createEntityScript,
            params: {
              entityName: "Widget A",
              entityType: "widget",
            },
          },
          {
            step: "create-second-entity",
            include: createEntityScript,
            params: {
              entityName: "Gadget B",
              entityType: "gadget",
            },
          },
          {
            step: "verify-entity-exists",
            request: {
              post: "test",
              body: { name: "{{entityId}}" },
            },
            response: {
              validate: [
                {
                  id: "entity found",
                  check: ["eq body.echoed.name 'Gadget B'"],
                },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(mainScript);
      // Two includes + their inner steps + verify step
      expect(result.stepResults).to.have.lengthOf(5);
      expect(result.stepResults[0]!.validation.result).to.be.true;
      expect(result.stepResults[2]!.validation.result).to.be.true;
      expect(result.stepResults[4]!.validation.result).to.be.true;
      expect((result.stepResults[0]!.body as any).echoed.name).to.equal(
        "Widget A"
      );
      expect((result.stepResults[2]!.body as any).echoed.name).to.equal(
        "Gadget B"
      );
      expect((result.stepResults[4]!.body as any).echoed.name).to.equal(
        "Gadget B"
      );
    });

    it("uses variables created by included script", async () => {
      const loginScript: ZillaScript = {
        script: "login",
        params: {
          username: { required: true },
        },
        sets: {
          vars: ["userId"],
        },
        steps: [
          {
            request: {
              post: "test",
              body: { username: "{{username}}" },
            },
            response: {
              capture: {
                userId: { body: "echoed.username" },
              },
            },
          },
        ],
      };

      const mainScript: ZillaScript = {
        script: "main-test",
        init,
        steps: [
          {
            step: "perform-login",
            include: loginScript,
            params: {
              username: "testuser@example.com",
            },
          },
          {
            step: "use-userId",
            request: {
              post: "test",
              body: { user: "{{userId}}" },
            },
            response: {
              validate: [
                {
                  id: "userId preserved",
                  check: ["eq body.echoed.user 'testuser@example.com'"],
                },
              ],
            },
          },
        ],
      };

      const result = await runZillaScript(mainScript);
      // 1 include + 1 inner + 1 use-userId = 3 total
      expect(result.stepResults).to.have.lengthOf(3);
      expect(result.stepResults[1]!.vars.userId).to.equal(
        "testuser@example.com"
      );
      expect(result.stepResults[2]!.vars.userId).to.equal(
        "testuser@example.com"
      );
      expect(result.stepResults[2]!.validation.result).to.be.true;
    });
  });

  describe("Error Handling", () => {
    it("requires at least one server", async () => {
      const script: ZillaScript = {
        script: "no-servers",
        steps: [{ step: "test", request: { get: "test" } }],
      };

      try {
        await runZillaScript(script);
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.include("no servers defined");
      }
    });
  });
});
