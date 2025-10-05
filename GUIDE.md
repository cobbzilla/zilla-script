# ZillaScript Complete Guide

A comprehensive guide to writing declarative API tests with zilla-script.

## Table of Contents

### Core Concepts
- [Quick Start](#quick-start)
- [Script Structure](#script-structure)
- [Steps](#steps)
- [Requests](#requests)
- [Responses](#responses)

### Validation
- [Validation Overview](#validation-overview)
- [Basic Validations](#basic-validations)
- [Comparison Operators](#comparison-operators)
- [String Operations](#string-operations)
- [Numeric Operations](#numeric-operations)
- [Collection Operations](#collection-operations)
- [Existence Checks](#existence-checks)
- [Complex Validations](#complex-validations)
- [Real-World Validation Examples](#real-world-validation-examples)
- [Validation Operator Reference](#validation-operator-reference)

### Init Configuration
- [Init Overview](#init-overview)
- [Servers Configuration](#servers-configuration)
- [Session Management](#session-management)
- [Variables](#variables)
- [Custom Handlers](#custom-handlers)
- [Lifecycle Hooks](#lifecycle-hooks)
- [Runtime Options](#runtime-options)

### Examples & Best Practices
- [Complete Examples](#complete-examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Summary](#summary)

---

## Quick Start

The absolute minimum zilla-script test:

```typescript
import { ZillaScript, runZillaScript } from "zilla-script";

const MyTest: ZillaScript = {
  script: "hello-world",
  init: {
    servers: [{ base: "http://localhost:3030/api" }]
  },
  steps: [
    {
      step: "get hello",
      request: { get: "hello" },
      response: {
        validate: [{ id: "status ok", check: ["eq body.status 'ok'"] }]
      }
    }
  ]
};

await runZillaScript(MyTest, { env: process.env });
```

That's it. No boilerplate, no manual fetch calls, no manual assertions. Just describe what you want to test.

---

## Script Structure

Every zilla-script has three parts:

```typescript
const MyScript: ZillaScript = {
  script: "my-test-name",              // Required: descriptive name
  init: {                               // Required: must define at least servers
    servers: [{ base: "http://..." }]  // Required: at least one server
    // Optional: vars, sessions, handlers
  },
  steps: [ /* test steps */ ]          // Required: array of test steps
};
```

**`script`**: A descriptive name for logging/debugging (required)

**`init`**: Configuration block (required, but can be provided at runtime)
- **`servers`**: **Required** - At least one server must be defined (either in script or runtime options)
- `vars`: Optional - Variable declarations
- `sessions`: Optional - Pre-existing session tokens
- `handlers`: Optional - Custom handler functions

**`steps`**: Array of test steps executed sequentially (required)

### Important: Server Requirement

**At least one server MUST be defined** - either in the script's `init` block OR in the runtime options:

```typescript
// ✅ Option 1: Define in script
const MyScript: ZillaScript = {
  script: "my-test",
  init: {
    servers: [{ base: "http://localhost:3030/api" }]
  },
  steps: [/* ... */]
};

await runZillaScript(MyScript);

// ✅ Option 2: Define at runtime
const MyScript: ZillaScript = {
  script: "my-test",
  steps: [/* ... */]
};

await runZillaScript(MyScript, {
  init: {
    servers: [{ base: "http://localhost:3030/api" }]
  }
});

// ❌ ERROR: No servers defined
const MyScript: ZillaScript = {
  script: "my-test",
  steps: [/* ... */]
};

await runZillaScript(MyScript);
// Throws: "script=my-test has no servers defined in init"
```

**Why servers are required:** Every HTTP request needs to know where to send it. Without a server definition, zilla-script cannot construct URLs.

---

## Steps

Steps are the building blocks of your test. Each step can:
- Make an HTTP request
- Capture values from the response
- Validate the response
- Run custom handlers
- Loop over data
- Include other scripts

### Basic Step

```typescript
{
  step: "create user",
  comment: "Optional description for documentation",
  request: { /* HTTP request */ },
  response: { /* validation, capture */ }
}
```

### Step with Delay

```typescript
{
  step: "wait for async processing",
  delay: "5s",  // sleep for 5 seconds. valid suffixes for numbers: s=seconds m=minutes, h=hours, d=days. a bare number is milliseconds
  request: { get: "status" }
}
```

### Step with Handlers

```typescript
{
  step: "complex operation",
  handlers: [{
    handler: "checkDatabase",
    params: { table: "users", expectedCount: 1 }
  }],
  request: { get: "users" }
}
```

---

## Requests

Requests describe HTTP calls. Use HTTP method as shorthand property:

```typescript
request: {
  get: "users"           // GET /users
  post: "users"          // POST /users
  put: "users/123"       // PUT /users/123
  delete: "users/123"    // DELETE /users/123
  patch: "users/123"     // PATCH /users/123
}
```

### With Body

```typescript
request: {
  post: "users",
  body: {
    name: "Alice",
    email: "alice@example.com"
  }
}
```

### With Query Parameters

```typescript
request: {
  get: "users",
  query: {
    page: 1,
    limit: 10,
    sort: "name"
  }
}
// GET /users?page=1&limit=10&sort=name
```

### With Headers

```typescript
request: {
  get: "users",
  headers: [
    { name: "X-Custom-Header", value: "custom-value" },
    { name: "Accept-Language", value: "en-US" }
  ]
}
```

### With Session

```typescript
request: {
  session: "userSession",  // Use previously captured session
  get: "profile"
}
```

### With Variables

```typescript
request: {
  get: "users/{{userId}}/posts/{{postId}}",
  body: {
    title: "Post by {{username}}",
    published: "{{timestamp}}"
  }
}
```

### Full Request Object

```typescript
request: {
  server: "api",              // Which server (if multiple defined)
  session: "userSession",     // Session to use
  get: "users/{{userId}}",    // URI with variables
  query: { include: "posts" },
  headers: [{ name: "X-Custom", value: "{{customValue}}" }],
  contentType: "application/json"  // Default
}
```

---

## Responses

Responses describe what to expect and what to capture.

### Status Validation

```typescript
response: {
  status: 200  // Expect exactly 200
}

response: {
  statusClass: "2xx"  // Any 2xx status
}

response: {
  status: 404  // Expect 404 Not Found
}
```

### Capture Session

```typescript
response: {
  session: { name: "userSession", from: { body: "token" } }
}
```

### Capture Variables

```typescript
response: {
  capture: {
    userId: { body: "id" },
    userName: { body: "name" },
    userEmail: { body: "contact.email" }
  }
}
```

### Validate Response

```typescript
response: {
  validate: [
    { id: "user has correct name", check: ["eq body.name 'Alice'"] },
    { id: "user has email", check: ["notEmpty body.email"] }
  ]
}
```

### Complete Response

```typescript
response: {
  status: 201,
  session: { name: "userSession", from: { body: "session.token" } },
  capture: {
    userId: { body: "id" },
    user: { body: null }  // Capture entire body
  },
  validate: [
    { id: "user created", check: ["notEmpty body.id"] },
    { id: "user has correct email", check: ["eq body.email 'alice@example.com'"] }
  ]
}
```

---

# Validation (Detailed)

## Validation Overview

Validations are the heart of testing. They verify that responses meet expectations.

**Structure:**

```typescript
validate: [
  {
    id: "descriptive name",
    check: [
      "operator operand1 operand2",
      "operator operand1 operand2"
    ]
  }
]
```

Each validation has:
- **`id`**: Descriptive name (for logging/errors)
- **`check`**: Array of check expressions

**Check expressions** are evaluated as Handlebars templates with a special syntax:

```
operator leftOperand rightOperand
```

**Context available in checks:**
- `body`: Response body (parsed JSON)
- `header`: Response headers (normalized: `Content-Type` → `content_type`)
- All variables from `init.vars` and captured in previous steps
- All sessions

---

## Basic Validations

### Simple Equality

```typescript
validate: [
  { id: "status is ok", check: ["eq body.status 'ok'"] },
  { id: "user id is 123", check: ["eq body.id 123"] },
  { id: "flag is true", check: ["eq body.active true"] }
]
```

### Variable Comparison

```typescript
validate: [
  { id: "user id matches", check: ["eq body.id userId"] },
  { id: "email matches", check: ["eq body.email expectedEmail"] }
]
```

### Multiple Checks per Validation

All checks in a validation must pass:

```typescript
validate: [
  {
    id: "email validation",
    check: [
      "notEmpty body.email",               // Must not be empty
      "endsWith body.email '@example.com'" // Must end with domain
    ]
  }
]
```

---

## Comparison Operators

### Equality/Inequality

```typescript
check: ["eq body.status 'active'"]   // Equal (==)
check: ["neq body.status 'deleted'"] // Not equal (!=)
```

**Works with:**
- Strings: `'active'`, `"hello"`
- Numbers: `123`, `45.67`
- Booleans: `true`, `false`
- Variables: `userId`, `expectedStatus`

**Type coercion:** If one operand is a number and the other is a numeric string, zilla-script converts the string to a number:

```typescript
// These all pass:
check: ["eq body.count 42"]    // body.count = 42 (number)
check: ["eq body.count '42'"]  // body.count = 42, "42" → 42
```

---

## String Operations

### Starts With / Ends With

```typescript
check: ["startsWith body.email 'admin'"]
check: ["endsWith body.email '@example.com'"]
check: ["notStartsWith body.name 'test'"]
check: ["notEndsWith body.url '.html'"]
```

### Contains

```typescript
check: ["includes body.description 'urgent'"]
check: ["notIncludes body.tags 'deprecated'"]
```

**Also works on arrays:**

```typescript
// Check if array includes a value
check: ["includes body.roles 'admin'"]

// Check nested array elements (not recommended, use JSONPath)
check: ["includes body.users.[0].name 'Alice'"]
```

---

## Numeric Operations

### Greater Than / Less Than

```typescript
check: ["gt body.count 0"]           // Greater than
check: ["gte body.count 0"]          // Greater than or equal
check: ["lt body.price 100"]         // Less than
check: ["lte body.price 100"]        // Less than or equal
```

**Works with numbers and numeric strings:**

```typescript
check: ["gt body.age 18"]            // age = 19 ✓
check: ["gte body.count '5'"]        // count = 5 ✓ (string coerced)
```

**String lexicographic comparison:**

If both operands are strings, comparison is lexicographic:

```typescript
check: ["gt body.name 'Alice'"]      // "Bob" > "Alice" ✓
check: ["lt body.date '2024-01-01'"] // "2023-12-31" < "2024-01-01" ✓
```

---

## Collection Operations

### Length Checks

Check the length of strings, arrays, or objects:

```typescript
check: ["length body.items '==' 3"]       // Exactly 3 items
check: ["length body.name '>' 0"]         // Non-empty string
check: ["length body.tags '>=' 1"]        // At least 1 tag
check: ["length body.results '<' 100"]    // Less than 100 results
```

**What counts as length:**
- **String**: character count
- **Array**: element count
- **Object**: key count

```typescript
// Examples:
body.items = ["a", "b", "c"]           // length = 3
body.name = "Alice"                    // length = 5
body.metadata = { foo: 1, bar: 2 }     // length = 2
```

---

## Existence Checks

### Empty / Not Empty

```typescript
check: ["empty body.description"]      // null, undefined, "", or []
check: ["notEmpty body.description"]   // Has a value
```

**What is "empty":**
- `null`
- `undefined`
- `""` (empty string)
- `[]` (empty array)

**What is "notEmpty":**
- Everything else, including `0`, `false`, `{}`

### Null / Not Null

```typescript
check: ["null body.deletedAt"]         // null
check: ["notNull body.createdAt"]      // not null
```

**Note:** `null` uses loose equality (`==`), so `undefined == null` is `true`.

### Undefined / Not Undefined

```typescript
check: ["undefined body.optionalField"]
check: ["notUndefined body.requiredField"]
```

---

## Complex Validations

### Nested Object Access

Use JSONPath-style dot notation (arrays use `[index]`):

```typescript
check: ["eq body.user.profile.name 'Alice'"]
check: ["eq body.items.[0].id 123"]
check: ["notEmpty body.data.results.[0].title"]
```

**Important:** In check expressions, array indices use **dot notation** within Handlebars: `.[0]`, `.[1]`, etc.

### Header Validation

Headers are normalized (non-alphanumeric removed, lowercase):

```typescript
// "Content-Type" → "content_type"
// "X-RateLimit-Remaining" → "x_ratelimit_remaining"

check: ["eq header.content_type 'application/json'"]
check: ["gt header.x_ratelimit_remaining 0"]
check: ["startsWith header.content_type 'image/'"]
```

### Multiple Validations

Each validation can have multiple checks, and you can have multiple validations:

```typescript
validate: [
  {
    id: "user object structure",
    check: [
      "notEmpty body.id",
      "notEmpty body.email",
      "notEmpty body.createdAt"
    ]
  },
  {
    id: "user has correct email",
    check: ["eq body.email expectedEmail"]
  },
  {
    id: "user is active",
    check: ["eq body.status 'active'"]
  }
]
```

If any check fails, the step fails and reports which validation and which check failed.

---

## Real-World Validation Examples

### Example 1: API Response Structure

```typescript
{
  step: "fetch user profile",
  request: { get: "users/{{userId}}" },
  response: {
    validate: [
      {
        id: "user object exists",
        check: [
          "notEmpty body.id",
          "notEmpty body.email",
          "notEmpty body.createdAt"
        ]
      },
      {
        id: "user has correct id",
        check: ["eq body.id userId"]
      },
      {
        id: "timestamp is recent",
        check: ["gt body.createdAt 1704067200000"]
      }
    ]
  }
}
```

### Example 2: List Response

```typescript
{
  step: "fetch user list",
  request: { get: "users", query: { page: 1, limit: 10 } },
  response: {
    capture: { users: { body: null } },
    validate: [
      {
        id: "response is an array",
        check: ["length body '>=' 0"]
      },
      {
        id: "at most 10 results",
        check: ["length body '<=' 10"]
      },
      {
        id: "first user has required fields",
        check: [
          "notEmpty body.[0].id",
          "notEmpty body.[0].email"
        ]
      }
    ]
  }
}
```

### Example 3: Error Response

```typescript
{
  step: "create user with invalid email",
  request: {
    post: "users",
    body: { email: "not-an-email" }
  },
  response: {
    status: 422,  // Validation error
    capture: {
      errors: { body: "errors", parse: true }
    },
    validate: [
      {
        id: "email validation failed",
        check: [
          "length errors '==' 1",
          "includes errors.email.[0] 'invalid'"
        ]
      }
    ]
  }
}
```

### Example 4: Activity Feed

```typescript
{
  step: "check user activity",
  request: { session: "userSession", get: "activity" },
  response: {
    capture: { firstActivity: { body: "[0]" } },
    validate: [
      {
        id: "activity feed not empty",
        check: ["length body '>=' 1"]
      },
      {
        id: "first activity has correct event type",
        check: ["eq firstActivity.event 'PostFromFollowedProfile'"]
      },
      {
        id: "first activity references correct post",
        check: ["eq firstActivity.post.id expectedPostId"]
      },
      {
        id: "first activity is from correct profile",
        check: ["eq firstActivity.post.profile expectedProfileId"]
      }
    ]
  }
}
```

### Example 5: File Upload Response

```typescript
{
  step: "upload file",
  request: {
    post: "uploads",
    contentType: "multipart/form-data",
    files: { file: "./test-data/image.png" }
  },
  response: {
    capture: { uploadId: { body: "fileId" } },
    validate: [
      {
        id: "upload successful",
        check: [
          "notEmpty body.fileId",
          "notEmpty body.url"
        ]
      },
      {
        id: "correct file type",
        check: ["startsWith body.mimeType 'image/'"]
      },
      {
        id: "file size reasonable",
        check: ["gt body.sizeBytes 0", "lt body.sizeBytes 10000000"]
      }
    ]
  }
}
```

### Example 6: Guest Asset Review

```typescript
{
  step: "review guest uploaded pic",
  request: {
    session: "admin",
    post: "visit/location/{{locationId}}/review/asset/{{assetId}}",
    body: {
      createProfile: {
        animalName: "Fluffy Cat",
        animalType: "cat"
      },
      caption: "Such a cutie!",
      decision: "Post"
    }
  },
  response: {
    capture: { recommendation: { body: "recommendation" } },
    validate: [
      {
        id: "recommendation created",
        check: [
          "notEmpty body.recommendation.id",
          "eq body.recommendation.createProfile.animalName 'Fluffy Cat'"
        ]
      },
      {
        id: "asset decision recorded",
        check: [
          "length body.recommendation.assetDecisions '==' 1",
          "eq body.recommendation.post.assets.[0].postCaption 'Such a cutie!'"
        ]
      }
    ]
  }
}
```

---

## Validation Operator Reference

### All Available Operators

| Operator | Arguments | Description                                                        | Example |
|----------|-----------|--------------------------------------------------------------------|---------|
| `eq` | 2 | Equal (`==`)                                                       | `eq body.status 'ok'` |
| `neq` | 2 | Not equal (`!=`)                                                   | `neq body.id 0` |
| `gt` | 2 | Greater than (`>`)                                                 | `gt body.count 5` |
| `gte` | 2 | Greater than or equal (`>=`)                                       | `gte body.age 18` |
| `lt` | 2 | Less than (`<`)                                                    | `lt body.price 100` |
| `lte` | 2 | Less than or equal (`<=`)                                          | `lte body.score 10` |
| `startsWith` | 2 (strings) | String starts with                                                 | `startsWith body.url 'https://'` |
| `notStartsWith` | 2 (strings) | String does not start with                                         | `notStartsWith body.name 'test'` |
| `endsWith` | 2 (strings) | String ends with                                                   | `endsWith body.email '@example.com'` |
| `notEndsWith` | 2 (strings) | String does not end with                                           | `notEndsWith body.file '.tmp'` |
| `includes` | 2 (string/array) | Contains substring or element                                      | `includes body.tags 'urgent'` |
| `notIncludes` | 2 (string/array) | Does not contain                                                   | `notIncludes body.roles 'banned'` |
| `empty` | 1 | `null` or `undefined` or `""` (empty string) or `[]` (empty array) | `empty body.deletedAt` |
| `notEmpty` | 1 | Has value                                                          | `notEmpty body.id` |
| `null` | 1 | `null` or `undefined`                                              | `null body.optionalField` |
| `notNull` | 1 | Not `null`                                                         | `notNull body.createdAt` |
| `undefined` | 1 | `undefined`                                                        | `undefined body.missingField` |
| `notUndefined` | 1 | Defined (not `undefined`)                                          | `notUndefined body.requiredField` |
| `length` | 3 (target, op, num) | Length comparison                                                  | `length body.items '==' 3` |

### Length Operator Details

The `length` operator is special - it takes 3 arguments:

```typescript
length <target> <operator> <number>
```

**Operators for length:**
- `'=='` - Equal
- `'!='` - Not equal
- `'>'` - Greater than
- `'>='` - Greater than or equal
- `'<'` - Less than
- `'<='` - Less than or equal

**Examples:**

```typescript
check: ["length body.items '==' 5"]      // Exactly 5 items
check: ["length body.name '>=' 3"]       // At least 3 characters
check: ["length body.errors '==' 0"]     // No errors
check: ["length body.tags '>' 0"]        // Has at least one tag
```

---

## Init Overview

The `init` block is where you configure the foundation of your API test: servers, sessions, variables, and custom handlers. Think of it as your test's "constructor" – everything starts here.

## Basic Structure

The `init` block can appear in two places:

1. **In your ZillaScript definition** (embedded)
2. **In ZillaScriptOptions at runtime** (overrides embedded)

```typescript
import { ZillaScript, runZillaScript } from "zilla-script";

// 1. Embedded in script
const MyScript: ZillaScript = {
  script: "my-test",
  init: {
    servers: [/* ... */],
    vars: { /* ... */ },
    // ... other init properties
  },
  steps: [/* ... */]
};

// 2. Runtime override
await runZillaScript(MyScript, {
  env: process.env,
  init: {
    // These override the embedded init
    servers: [/* ... */],
    vars: { /* ... */ }
  }
});
```

**Init merge behavior:**
- Runtime `init` properties **override** script `init` properties
- Use embedded `init` for script-specific configuration
- Use runtime `init` for environment-specific configuration (like server URLs, credentials)

---

## Servers Configuration

### Single Server (Simple Case)

Most APIs need just one server:

```typescript
init: {
  servers: [{
    base: "http://localhost:3030/api"
  }]
}
```

The first server is the **default server** – all requests go there unless you specify otherwise.

### Multiple Servers

For microservices or CDN scenarios:

```typescript
init: {
  servers: [
    {
      server: "api",  // Symbolic name (optional, but recommended for multiple servers)
      base: "http://localhost:3030/api"
    },
    {
      server: "cdn",
      base: "http://localhost:4000"
    },
    {
      server: "auth",
      base: "http://localhost:5000/oauth"
    }
  ]
}
```

Use in steps:

```typescript
steps: [
  {
    step: "create user",
    request: { post: "users", body: { name: "Alice" } }  // Uses default (api)
  },
  {
    step: "upload avatar",
    request: {
      server: "cdn",  // Explicitly use CDN server
      post: "uploads/avatar",
      body: { /* ... */ }
    }
  }
]
```

### Environment Variables in Server URLs

**Do not hardcode URLs.** Use environment variables:

```typescript
init: {
  servers: [{
    base: "http://{{env.API_HOST}}:{{env.API_PORT}}/{{env.API_PATH}}"
  }]
}
```

Then pass `env` at runtime:

```typescript
await runZillaScript(MyScript, {
  env: process.env  // Or { API_HOST: "localhost", API_PORT: "3030", API_PATH: "api" }
});
```

The `base` URL is evaluated as a **Handlebars template** with `env` as the context.

### Server Session Configuration

Configure how sessions are sent for each server:

```typescript
init: {
  servers: [{
    base: "http://localhost:3030/api",
    session: {
      cookie: "sessionId"  // Send session as cookie named "sessionId"
    }
  }]
}
```

Or use a header:

```typescript
session: {
  header: "X-Session-Token"  // Send session in this header
}
```

Or both (session will be sent in both places):

```typescript
session: {
  cookie: "connect.sid",
  header: "Authorization"
}
```

**Default behavior:** If `session` is not specified, sessions won't be sent automatically. You'll need to specify session capture and usage explicitly in each step.

---

## Session Management

### Pre-existing Sessions

If you already have session tokens (e.g., an admin session), provide them:

```typescript
init: {
  sessions: {
    admin: "admin-token-12345",
    testUser: "user-token-67890"
  }
}
```

Use in steps:

```typescript
{
  step: "admin: delete user",
  request: {
    session: "admin",
    delete: "users/{{userId}}"
  }
}
```

### Capturing New Sessions

**Simplest case – use server's default session configuration:**

```typescript
init: {
  servers: [{
    base: "http://localhost:3030/api",
    session: { cookie: "sessionId" }  // Define how sessions are sent/captured
  }]
}

steps: [
  {
    step: "login",
    request: {
      post: "auth/login",
      body: { username: "{{username}}", password: "{{password}}" }
    },
    response: {
      session: { name: "userSession" }  // Just name it - uses server's session config
    }
  }
]
```

This will automatically look for the `sessionId` cookie in the response. **This is the recommended approach** for standard cookie/header-based sessions.

**Explicit capture (override server defaults):**

When the session token is in a different location or format, specify `from`:

```typescript
response: {
  session: {
    name: "userSession",
    from: { body: "session.token" }  // JSONPath ($ is implied)
  }
}
```

**Where to capture from:**

```typescript
// From response body (JSONPath, $ is implied)
from: { body: "session.token" }       // Extracts $.session.token
from: { body: "data.auth.sessionId" } // Extracts $.data.auth.sessionId
from: { body: null }                  // Entire body is the session token (string)

// From response header
from: { header: { name: "X-Session-Token" } }

// From response cookie (specific cookie name)
from: { cookie: { name: "connect.sid" } }
```

**What happens if no session config exists?**

If you try to capture a session without `from` and the server has no `session` config:

```typescript
// ❌ This will fail if server has no session config
init: {
  servers: [{ base: "http://localhost:3030/api" }]  // No session config!
}

response: {
  session: { name: "mySession" }  // ERROR: No capture strategy defined
}
```

**The code behavior:**
- If `from` is omitted, zilla-script constructs a capture strategy from `server.session.header` and `server.session.cookie`
- If **both** are undefined (no session config), the capture strategy has `body: undefined`, `header: undefined`, `cookie: undefined`
- The `extract()` function will throw an error: `"invalid_capture_source"`

**Solution:** Either define server session config OR always specify `from` explicitly:

```typescript
// ✅ Option 1: Define server session config
init: {
  servers: [{
    base: "http://localhost:3030/api",
    session: { cookie: "sessionId" }
  }]
}

// ✅ Option 2: Always use explicit 'from'
response: {
  session: {
    name: "mySession",
    from: { body: "token" }  // Explicit capture
  }
}
```

### Session Lifecycle

1. **Capture** a session in a response
2. **Reference** it by name in subsequent requests
3. Session is **automatically sent** according to server's session config

```typescript
steps: [
  {
    step: "login",
    response: {
      session: { name: "userSession", from: { body: "token" } }
    }
  },
  {
    step: "get profile",
    request: {
      session: "userSession",  // Automatically sends token
      get: "profile"
    }
  },
  {
    step: "update profile",
    request: {
      session: "userSession",  // Same session
      post: "profile",
      body: { bio: "Updated bio" }
    }
  }
]
```

---

## Variables

### Declaring Variables

Variables must be declared before use:

```typescript
init: {
  vars: {
    username: "testuser",           // Literal string
    password: "{{env.TEST_PASSWORD}}", // From environment (evaluated at runtime)
    userId: null,                   // Will be assigned later (null = uninitialized)
    count: 0,                       // Numeric
    isAdmin: false                  // Boolean
  }
}
```

**Variable values are Handlebars templates.** If the value contains `{{`, it's evaluated:

```typescript
vars: {
  apiKey: "{{env.API_KEY}}",           // Evaluated: pulls from env
  timestamp: "{{env.TIMESTAMP}}",      // Evaluated: pulls from env
  literal: "not-a-{{template}}",       // Evaluated: contains {{, but likely fails unless "template" var exists
  plain: "just-a-string"               // Not evaluated: no {{
}
```

### Using Variables

Reference variables in **any Handlebars context** (requests, validations, etc.):

```typescript
{
  step: "create post",
  request: {
    post: "users/{{userId}}/posts",
    body: {
      title: "Post by {{username}}",
      publishedAt: "{{timestamp}}"
    }
  }
}
```

### Capturing Variables from Responses

```typescript
{
  step: "create user",
  request: { post: "users", body: { name: "Alice" } },
  response: {
    capture: {
      userId: { body: "id" },              // JSONPath: $.id
      userEmail: { body: "contact.email" }, // JSONPath: $.contact.email
      rateLimit: { header: { name: "X-RateLimit-Remaining" } },
      csrfToken: { cookie: { name: "XSRF-TOKEN" } }
    }
  }
}
```

**Capture entire body:**

```typescript
capture: {
  user: { body: null }  // user = entire response body
}
```

**Parse JSON strings:**

```typescript
capture: {
  metadata: { body: "data.metadata", parse: true }  // If metadata is a JSON string, parse it
}
```

**Assign computed values:**

Variables can be assigned expressions (evaluated as Handlebars):

```typescript
capture: {
  fullName: { assign: "{{user.firstName}} {{user.lastName}}" }
}
```

### Editing Variables

Update existing variables mid-script:

```typescript
{
  step: "update user object",
  edits: {
    user: {
      status: "active",             // Set/update field
      lastLogin: "{{now}}",         // Use other variables
      tags: ["premium", "verified"] // Arrays work too
    }
  }
}
```

Then use the modified variable:

```typescript
{
  step: "save changes",
  request: {
    post: "users/{{user.id}}",
    bodyVar: "user"  // Send entire user object
  }
}
```

---

## Custom Handlers

Handlers are functions that run **after a request** and **after response variables are captured** but **before response validation checks**.
Handlers perform custom logic that can't be expressed declaratively.
Handlers can define new variables for use in subsequent validation checks and script steps.

### Registering Handlers

```typescript
import { ZillaScriptResponseHandler } from "zilla-script";

const myHandler: ZillaScriptResponseHandler = {
  args: {
    // Define expected arguments. Every argument must either be required, or have a default value
    requiredArg: { type: "string", required: true },
    optionalArg: { type: "number", default: 42 }
  },
  func: async (response, args, vars, step) => {
    // response: The HTTP response (or undefined if handler runs before request)
    // args: Handler params from the step
    // vars: Current variable state
    // step: Current step definition

    // Do custom logic
    if (args.requiredArg === "special") {
      vars.specialFlag = true; // define new variable
    }

    // Return modified response (or undefined)
    return response;
  }
};

// Register in init
init: {
  handlers: {
    myHandler  // Name must match handler key
  }
}
```

### Using Handlers in Steps

```typescript
{
  step: "do something special",
  request: { get: "data" },
  handlers: [{
    // defines specialFlag var
    handler: "myHandler",
    params: {
      requiredArg: "special",
      optionalArg: 100
    }
  }],
  validations: [{ "id": "specialFlag is now defined", checks: ["eq {{specialFlag}} true"] }]
}
```

### Common Handler Patterns

**1. Database checks:**

```typescript
const checkDatabase: ZillaScriptResponseHandler = {
  args: {
    query: { type: "string", required: true },
    expectedCount: { type: "number", required: true }
  },
  func: async (response, args, vars) => {
    const result = await db.query(args.query);
    if (result.rowCount !== args.expectedCount) {
      throw new Error(`Expected ${args.expectedCount} rows, got ${result.rowCount}`);
    }
    return response;
  }
};
```

**2. Mock email/SMS token extraction:**

```typescript
const getMockToken: ZillaScriptResponseHandler = {
  args: {
    email: { type: "string", required: true },
    tokenVar: { type: "string", required: true }
  },
  func: async (response, args, vars) => {
    // Read from mock mailbox
    const token = await mockMailbox.getLatestToken(args.email);
    vars[args.tokenVar] = token;
    return response;
  }
};
```

**3. Crypto operations (like generating guest keys):**

```typescript
const generateGuestKey: ZillaScriptResponseHandler = {
  args: {
    keyVar: { type: "string", required: true },
    authVar: { type: "string", required: true },
    location: { type: "string", required: true }
  },
  func: async (response, args, vars) => {
    const keypair = await generateKeypair();
    vars[args.keyVar] = keypair.publicKey;

    const auth = await createGuestAuth(
      keypair.publicKey,
      keypair.privateKey,
      args.location
    );
    vars[args.authVar] = auth;

    return response;
  }
};
```

**4. Response transformation:**

```typescript
const parseCustomFormat: ZillaScriptResponseHandler = {
  func: async (response) => {
    if (response && response.body) {
      // Transform proprietary format to JSON
      response.body = parseProprietaryFormat(response.body);
    }
    return response;
  }
};
```

### Handler Execution Order

Handlers run in the order specified:

```typescript
handlers: [
  { handler: "beforeRequest" },   // Runs first
  { handler: "transformRequest" }, // Runs second
  { handler: "afterResponse" }     // Runs third
]
```

---

## Lifecycle Hooks

Hooks let you observe or modify state before/after each step:

```typescript
init: {
  beforeStep: (ctx: StepContext) => {
    console.log(`About to run: ${ctx.step.step}`);
    console.log(`Current vars:`, ctx.vars);
    console.log(`Current sessions:`, ctx.sessions);
  },

  afterStep: (ctx: StepContext) => {
    console.log(`Completed: ${ctx.step.step}`);
    if (ctx.response) {
      console.log(`Status: ${ctx.response.status}`);
    }
    if (ctx.error) {
      console.error(`Error:`, ctx.error);
    }
  }
}
```

**StepContext properties:**

```typescript
type StepContext = {
  step: ZillaScriptStep;           // Current step definition
  stack: ZillaScriptStep[];        // Call stack (for includes/loops)
  vars: Record<string, unknown>;   // Current variables
  sessions: Record<string, string>; // Current sessions
  response?: ZillaRawResponse;     // HTTP response (afterStep only)
  headers?: Record<string, string>; // Normalized headers (afterStep only)
  error?: Error;                   // Error if step failed (afterStep only)
};
```

**Use cases:**
- **Debugging:** Log every step and response
- **Metrics:** Track test timing
- **Assertions:** Global assertions that apply to all steps
- **Breakpoints:** Conditional breakpoints based on state

---

## Runtime Options

When calling `runZillaScript()`, you can pass additional options:

```typescript
await runZillaScript(MyScript, {
  // Environment variables (for server URLs and var substitution)
  env: process.env,

  // Logger (must implement GenericLogger interface)
  logger: myLogger,

  // Init overrides (merges with script.init)
  init: {
    servers: [/* ... */],
    sessions: { admin: "admin-token" },
    vars: { /* ... */ },
    handlers: { /* ... */ },
    beforeStep: (ctx) => { /* ... */ },
    afterStep: (ctx) => { /* ... */ }
  },

  // Continue even if validations fail
  continueOnInvalid: false,

  // Continue even if errors occur
  continueOnError: false
});
```

**Option precedence:**
1. Runtime `options.init` (highest)
2. Script `script.init`
3. Defaults (lowest)

**Best practice:** Use script `init` for test-specific config, runtime `init` for environment-specific config.

---

## Complete Examples

### Example 1: Simple Single-Server Test

```typescript
const SimpleTest: ZillaScript = {
  script: "simple-test",
  init: {
    servers: [{
      base: "http://{{env.API_HOST}}:{{env.API_PORT}}/api",
      session: { cookie: "sessionId" }
    }],
    vars: {
      email: "test@example.com",
      password: "{{env.TEST_PASSWORD}}"
    }
  },
  steps: [
    {
      step: "login",
      request: {
        post: "auth/login",
        body: { email: "{{email}}", password: "{{password}}" }
      },
      response: {
        session: { name: "userSession", from: { body: "token" } },
        capture: { userId: { body: "user.id" } }
      }
    },
    {
      step: "get profile",
      request: {
        session: "userSession",
        get: "users/{{userId}}"
      },
      response: {
        validate: [
          { id: "email matches", check: ["eq body.email email"] }
        ]
      }
    }
  ]
};

await runZillaScript(SimpleTest, { env: process.env });
```

### Example 2: Multi-Server with Handlers

```typescript
const AdvancedTest: ZillaScript = {
  script: "advanced-test",
  init: {
    servers: [
      {
        server: "api",
        base: "http://{{env.API_HOST}}:{{env.API_PORT}}/api",
        session: { header: "Authorization" }
      },
      {
        server: "storage",
        base: "http://{{env.STORAGE_HOST}}:{{env.STORAGE_PORT}}"
      }
    ],
    sessions: {
      admin: "{{env.ADMIN_TOKEN}}"
    },
    vars: {
      testUser: null,
      uploadedFileId: null
    },
    handlers: {
      createTestUser: {
        func: async (response, args, vars) => {
          const user = await testHelpers.createRandomUser();
          vars.testUser = user;
          return response;
        }
      },
      checkFileExists: {
        args: {
          fileId: { type: "string", required: true }
        },
        func: async (response, args) => {
          const exists = await storage.fileExists(args.fileId);
          if (!exists) throw new Error(`File ${args.fileId} not found`);
          return response;
        }
      }
    }
  },
  steps: [
    {
      step: "create test user",
      handlers: [{ handler: "createTestUser" }]
    },
    {
      step: "login as test user",
      request: {
        post: "auth/login",
        body: {
          email: "{{testUser.email}}",
          password: "{{testUser.password}}"
        }
      },
      response: {
        session: { name: "testSession", from: { body: "token" } }
      }
    },
    {
      step: "upload file",
      request: {
        server: "storage",
        session: "testSession",
        post: "upload",
        contentType: "multipart/form-data",
        files: { file: "./test-data/sample.pdf" }
      },
      response: {
        capture: { uploadedFileId: { body: "fileId" } }
      }
    },
    {
      step: "verify file exists in storage",
      handlers: [{
        handler: "checkFileExists",
        params: { fileId: "{{uploadedFileId}}" }
      }]
    },
    {
      step: "admin: view uploaded files",
      request: {
        server: "api",
        session: "admin",
        get: "admin/files"
      },
      response: {
        validate: [
          { id: "uploaded file in list", check: ["includes body.[*].id uploadedFileId"] }
        ]
      }
    }
  ]
};

await runZillaScript(AdvancedTest, {
  env: process.env,
  logger: testLogger
});
```

### Example 3: Pre-loaded Sessions (No Login Required)

```typescript
// Useful for testing scenarios where you already have session tokens
const QuickTest: ZillaScript = {
  script: "quick-test",
  steps: [
    {
      step: "fetch data as admin",
      request: {
        session: "admin",
        get: "admin/stats"
      }
    },
    {
      step: "fetch data as user",
      request: {
        session: "user",
        get: "user/profile"
      }
    }
  ]
};

await runZillaScript(QuickTest, {
  env: process.env,
  init: {
    servers: [{
      base: "http://localhost:3030/api",
      session: { header: "Authorization" }
    }],
    sessions: {
      admin: process.env.ADMIN_TOKEN,
      user: await getTestUserToken()
    }
  }
});
```

---

## Best Practices

### 1. **Use Environment Variables for URLs and Secrets**

❌ **Bad:**
```typescript
servers: [{ base: "http://localhost:3030/api" }]
vars: { password: "test123" }
```

✅ **Good:**
```typescript
servers: [{ base: "http://{{env.API_HOST}}:{{env.API_PORT}}/api" }]
vars: { password: "{{env.TEST_PASSWORD}}" }
```

### 2. **Declare All Variables Upfront**

❌ **Bad:**
```typescript
init: { vars: {} }
// Later: vars.userId = ... (undeclared variable)
```

✅ **Good:**
```typescript
init: {
  vars: {
    userId: null,  // Declare but don't initialize
    userName: null
  }
}
```

### 3. **Name Your Servers in Multi-Server Scenarios**

❌ **Bad:**
```typescript
servers: [
  { base: "http://api.example.com" },
  { base: "http://cdn.example.com" }
]
```

✅ **Good:**
```typescript
servers: [
  { server: "api", base: "http://api.example.com" },
  { server: "cdn", base: "http://cdn.example.com" }
]
```

### 4. **Use Runtime Init for Test Harness Setup**

Keep test setup logic separate from test definitions:

```typescript
// testHelper.ts
export const zillaTestOptions = () => ({
  env: process.env,
  logger: testLogger,
  init: {
    servers: [{ base: testConfig.apiUrl }],
    sessions: { admin: testConfig.adminToken },
    handlers: {
      createTestData,
      cleanupTestData,
      checkDatabase
    }
  }
});

// myTest.spec.ts
await runZillaScript(MyTestScript, zillaTestOptions());
```

### 5. **Document Your Handlers**

Handlers are code – document them:

```typescript
/**
 * Creates a test user with random credentials and stores in vars.testUser
 */
const createTestUser: ZillaScriptResponseHandler = { /* ... */ };
```

---

## Troubleshooting

### "Variable not found: X"

You forgot to declare the variable. Add it to `init.vars`:

```typescript
init: { vars: { X: null } }
```

### "Server not found: cdn"

Server name doesn't match. Check your `servers` array:

```typescript
servers: [{ server: "cdn", base: "..." }]
```

### "Session not found: userSession"

Session wasn't captured or was misspelled. Check:
1. Did you capture it? `response: { session: { name: "userSession" } }`
2. Does the name match? `request: { session: "userSession" }`

### Handler Errors

If a handler throws, check:
1. Handler is registered: `init: { handlers: { myHandler } }`
2. Handler name matches: `handlers: [{ handler: "myHandler" }]`
3. Required args are provided: `params: { requiredArg: "value" }`

---

## Summary

The `init` block is your test foundation:

- **`servers`**: Define API endpoints and session config
- **`sessions`**: Pre-load existing session tokens
- **`vars`**: Declare variables (use `null` for uninitialized)
- **`handlers`**: Register custom functions for complex logic
- **`beforeStep`/`afterStep`**: Observe or modify state during execution

**Key principles:**
1. Declare everything upfront
2. Use environment variables for flexibility
3. Runtime init overrides script init
4. Handlers are your escape hatch when declarative isn't enough

Now go write some tests! 🚀
