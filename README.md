# How to Write API Tests That Don't Suck

## Introduction
I tried everything it all sucks. None of the API testing frameworks did what I wanted in all cases.

I need something that can run both in development environments and in CI.

I need a test suite that's easily versioned and committed to source control.

I need something that *just works*.

I couldn't find anything that scratched my itches just right, so **zilla-script** is my answer to these questions.

### Why Not Just Use [X]?

**Postman/Insomnia**: Great for manual testing, terrible for CI/CD. Version control is painful, no programmatic control.

**Supertest/Axios**: Imperative code. Every test becomes 50% boilerplate, 50% intent. State management is manual.

**GraphQL/gRPC test tools**: Domain-specific. zilla-script works with any HTTP/REST API.

**Cucumber/Gherkin**: Natural language is great for stakeholders, terrible for developers. BDD adds ceremony without adding value for API tests.

**Raw test code**: Maximum flexibility, maximum pain. You end up reinventing zilla-script badly.

### Philosophy

1. **Tests are documentation**: Your test suite should read like API documentation
2. **Declare intent, not implementation**: Describe what you're testing, not how to test it
3. **State is explicit**: Variables and sessions are first-class concepts
4. **Composition over inheritance**: Build complex tests from simple, reusable pieces
5. **Escape hatches everywhere**: Custom handlers for when declarative isn't enough
6. **Simplicity first**: Sensible defaults everywhere, facilitate minimalistic tests

### Community

- **GitHub**: [https://github.com/cobbzilla/zilla-script](https://github.com/cobbzilla/zilla-script)
- **Report [Issues](https://github.com/cobbzilla/zilla-script/issues)**
- **License**: [Apache License](LICENSE.txt)

# zilla-script
The rest of this README is a high-level overview of what zilla-script is trying to
solve and how it does it. There is a [full guide document](GUIDE.md) that describes all the features
of zilla-script in detail.

## The Problem

You're testing a REST API. You need to:
1. Make requests and validate things about the responses
2. Create/read/update/delete some resources
3. Authenticate, establish sessions, make requests from multiple sessions
4. Chain requests using captured session tokens and IDs
5. Upload files

Your options:
- **Postman collections**: Click-fest UI, version control nightmare, no real programming
- **Imperative test code**: 200 lines of boilerplate for what should be 20 lines of intent
- **Raw curl + bash**: Works until you need state management, then becomes spaghetti

There's a better way.

## The Solution: Declarative API Testing

**zilla-script** lets you write API tests as data structures. Your test describes *what* you want, not *how* to do it.

### Before (Imperative and Ugly)

```typescript
it('should authenticate and fetch user data', async () => {
  // Request auth code
  const authRes = await fetch('http://localhost:3030/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@example.com' })
  });
  expect(authRes.status).to.equal(200);

  // Simulate getting token from email (in real test: check mock mailbox)
  const token = await getMockEmailToken('user@example.com');

  // Verify token
  const verifyRes = await fetch('http://localhost:3030/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  expect(verifyRes.status).to.equal(200);
  const { session } = await verifyRes.json();
  expect(session).to.exist;

  // Use session to fetch account data
  const accountRes = await fetch('http://localhost:3030/api/account', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session=${session}`
    }
  });
  expect(accountRes.status).to.equal(200);
  const account = await accountRes.json();
  expect(account.email).to.equal('user@example.com');
});
```

### After (Declarative and Beautiful)

```typescript
export const AuthFlow: ZillaScript = {
  script: "auth-flow",
  init: { servers: [{ base: "http://localhost:3030/api/" }] },
  steps: [
    {
      step: "request auth code",
      request: { post: "auth", body: { email: "user@example.com" } },
      handlers: [{ handler: "get_email_token", params: { tokenVar: "token" } }]
    },
    {
      step: "verify and start session",
      request: { post: "auth/verify", body: { token: "{{token}}" } },
      response: { session: { name: "userSession", from: { body: "session" } } }
    },
    {
      step: "fetch account data",
      request: { session: "userSession", get: "account" },
      response: {
        validate: [{ id: "correct email", check: ["eq body.email 'user@example.com'"] }]
      }
    }
  ]
};

// Run it
await runZillaScript(AuthFlow);

// Or, if you're using a test framework like mocha:
describe("my API test", async () => {
    it("hits some endpoint and we get what we expect", async () => runZillaScript(AuthFlow))
})
```

**Result**: Half the code, zero boilerplate, 100% intent.

## Why This Rocks

### 1. **State Management Is Built-In**

Capture values from responses, use them in subsequent requests:

```typescript
{
  step: "create post",
  request: { post: "posts", body: { title: "Hello World" } },
  response: {
    capture: { postId: { body: "id" } }  // JSONPath with implied $.
  }
},
{
  step: "add comment",
  request: {
    post: "posts/{{postId}}/comments",  // Use captured value
    body: { text: "Great post!" }
  }
}
```

### 2. **Sessions Are Automatic**

Capture a session once, use it everywhere:

```typescript
response: {
  session: {
    name: "adminSession",
    from: { body: "session.token" }  // or header/cookie
  }
}

// Later...
request: {
  session: "adminSession",  // Automatically sent in header/cookie
  get: "admin/users"
}
```

### 3. **Validations Are Data**

```typescript
validate: [
    { id: "status is active", check: ["eq body.status 'active'"] },
    { id: "created recently", check: [`gt body.createdAt ${Date.now() - 5000}`] },
    { id: "has items", check: ["notEmpty body.items"] }
]
```

Available checks: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `empty`, `notEmpty`, `null`, `notNull`, `undefined`, `notUndefined`, `startsWith`, `endsWith`, `includes`

### 4. **Composition via Include**

Break complex flows into reusable modules:

```typescript
const SignUp: ZillaScript = {
  script: "sign-up",
  sets: {
      vars: ["user"],
      sessions: ["userSession"],
  },
  steps: [/* ... signup steps that establish userSession and set user var ... */]
};

const FullWorkflow: ZillaScript = {
  script: "full-workflow",
  steps: [
    {
        step: "sign up user",
        include: SignUp,
        params: { email: "test@example.com" }
    },
    { step: "do stuff", /* ... you can now send requests witht session: "userSession" and use the newly-defined 'user' variable */ }
  ]
};
```

### 5. **Custom Handlers for Complex Logic**

When you need programmatic control:

```typescript
handlers: [{
  handler: "check_database",
  params: {
    query: "SELECT count(*) FROM users WHERE email = ?",
    args: ["{{userEmail}}"],
    expectedCount: 1
  }
}]
```

Register handlers in your test setup:

```typescript
const options: ZillaScriptOptions = {
  init: {
    handlers: {
      check_database: async (ctx, params) => {
        const count = await db.query(params.query, params.args);
        if (count !== params.expectedCount) {
          throw new Error(`Expected ${params.expectedCount}, got ${count}`);
        }
      }
    }
  }
};
```

### 6. **Real-World Example: Guest Upload Flow**

This is a real test from our production API (simplified):

```typescript
export const VisitGuestScript: ZillaScript = {
  script: "visit-guest",
  steps: [
    {
      step: "visit location (scan QR code)",
      request: { get: "visit/location/{{locationShortName}}" },
      handlers: [{
        handler: "new_appGuest_key",
        params: { var: "guestKey", authVar: "guestAuth", location: "{{locationShortName}}" }
      }],
      response: {
        capture: { orgInfo: { body: null } },  // Capture entire body
        validate: [
          { id: "org found", check: ["eq body.org.id orgId"] },
          { id: "has logo", check: ["notEmpty body.assets.logo"] }
        ]
      }
    },
    {
      step: "start guest session as minor (under 13)",
      request: {
        post: "visit/location/{{locationShortName}}",
        body: {
          under13: true,
          publicKey: "{{guestAuth.publicKey}}",
          nonce: "{{guestAuth.nonce}}",
          token: "{{guestAuth.token}}"
        }
      },
      response: {
        session: { name: "guestSession", from: { body: "id" } }
      }
    },
    {
      step: "upload 3 photos as guest",
      loop: {
        items: ["photo1.jpg", "photo2.jpg", "photo3.jpg"],
        varName: "filename",
        steps: [{
          step: "upload {{filename}}",
          request: {
            session: "guestSession",
            post: "visit/location/{{locationShortName}}/asset",
            contentType: "multipart/form-data",
            body: { file: "{{filename}}" }
          }
        }]
      }
    },
    {
      step: "list uploaded photos",
      request: {
        session: "guestSession",
        get: "visit/location/{{locationShortName}}/asset"
      },
      response: {
        capture: { photos: { body: null } },
        validate: [{ id: "3 photos uploaded", check: ["eq body.length 3"] }]
      }
    },
    {
      step: "delete first photo",
      request: {
        session: "guestSession",
        delete: "visit/location/{{locationShortName}}/asset/{{photos.[0].id}}"
      }
    },
    {
      step: "verify deletion",
      request: {
        session: "guestSession",
        get: "visit/location/{{locationShortName}}/asset"
      },
      response: {
        validate: [{ id: "2 photos remain", check: ["eq body.length 2"] }]
      }
    }
  ]
};
```

This test:
- Simulates scanning a QR code
- Creates cryptographically signed guest credentials
- Starts a session for a minor
- Uploads files
- Lists and deletes assets
- Validates state throughout

Try writing this imperatively. I'll wait.

## Getting Started

### Installation

```bash
npm install zilla-script
```

### Basic Script

```typescript
import { ZillaScript, runZillaScript } from "zilla-script";

const MyTest: ZillaScript = {
  script: "my-first-test",
  init: {
    servers: [{
      base: "http://localhost:3000/api",
      session: { cookie: "sessionId" }
    }],
    vars: { username: "testuser", password: "{{env.TEST_PASSWORD}}" }
  },
  steps: [
    {
      step: "login",
      request: {
        post: "auth/login",
        body: { username: "{{username}}", password: "{{password}}" }
      },
      response: {
        session: { name: "userSession", from: { body: "token" } },
        validate: [{ id: "login success", check: ["eq body.success true"] }]
      }
    },
    {
      step: "get profile",
      request: { session: "userSession", get: "user/profile" },
      response: {
        validate: [{ id: "correct username", check: ["eq body.username username"] }]
      }
    }
  ]
};

// Run with Mocha
describe("API tests", () => {
  it("should login and fetch profile", async () => {
    await runZillaScript(MyTest, { env: process.env });
  });
});
```

## Advanced Features

**Read the [full guide](GUIDE.md) for an exhaustive review.**

### Multiple Servers

```typescript
init: {
  servers: [
    { name: "api", base: "http://localhost:3000/api", session: { cookie: "sid" } },
    { name: "cdn", base: "http://localhost:4000", session: { header: "X-Token" } }
  ]
}

// Use in steps
request: { server: "cdn", get: "images/logo.png" }
```

### Environment Variables in URLs

```typescript
servers: [{
  base: "http://{{env.API_HOST}}:{{env.API_PORT}}/api"
}]
```

### Extract from Headers/Cookies

```typescript
response: {
  capture: {
    rateLimitRemaining: { header: { name: "X-RateLimit-Remaining" } },
    sessionCookie: { cookie: { name: "connect.sid" } }
  }
}
```

### Validation with Variables

```typescript
response: {
  capture: { userId: { body: "id" } },
  validate: [
    { id: "user id matches", check: ["eq body.owner.id userId"] },
    { id: "header check", check: ["eq header.content_type 'application/json'"] }
  ]
}
```

### Error Validation

```typescript
response: {
  status: 422,
  validate: [
    { id: "validation error", check: ["includes body.error 'invalid email'"] }
  ]
}
```

### Loops

```typescript
{
  step: "create multiple users",
  loop: {
    items: [
      { name: "Alice", email: "alice@example.com" },
      { name: "Bob", email: "bob@example.com" }
    ],
    varName: "user",
    steps: [{
      step: "create {{user.name}}",
      request: {
        post: "users",
        body: { name: "{{user.name}}", email: "{{user.email}}" }
      }
    }]
  }
}
```

### Edit Variables

```typescript
{
  step: "update user object",
  edits: {
    user: {
      status: "active",
      lastLogin: "{{now}}"
    }
  },
  request: {
    post: "users/{{user.id}}",
    bodyVar: "user"  // Send entire modified user object
  }
}

```
```bash
npm install zilla-script
```

Your future self will thank you.

---

*Built by developers who got tired of API test boilerplate. Used in production to test a multi-tenant social platform with millions of API calls per day.*
