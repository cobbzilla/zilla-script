zilla-script
============
A simple framework for sending JSON requests to servers and verifying responses.

# Declarative tests
Tests are simply objects with values. They can be declared using TypeScript, JavaScript or JSON.

# State management
Requests can capture variables, use any open session, or capture a new session.

# Validations
Responses can be validated for a variety of conditions

# Example

```typescript
import { ZillaScript, runZillaScript } from "zilla-script";

export const exampleScript: ZillaScript = {
    script: "example-script",
    // the init section describes configuration and initialization
    // init data can also be passed on the opts object
    init: {
        // the "servers" array describes servers that we can interact with
        // each server must have a 'base' property to describe its base URL.
        // if there is only one server defined, the "name" field is optional.
        // if there are multiple servers defined, the first server is the "default" server.
        servers: [
            {
                server: "my-server", // a symbolic name for the server. optional.

                // the "base" property describes the base URI to use for all requests to the server
                // The base URI can be a literal value, like http://127.0.0.1/myapi/ or
                // can contain environment variables, referenced as handlebars expressions, where env
                // is a map of all environment variables
                base: "http://{{env.PRIMARY_HOST}}:{{env.PRIMARY_PORT}}/mapi/", // references two env vars to construct base

                // the "session" section describes how sessions are handled
                // A new session is created when the "response" section of a step contains a "newSession" property
                session: {
                    // Use this named cookie as the session cookie
                    cookie: "session-cookie-name",
                    // Use this HTTP header as the session cookie
                    header: "session-header",
                },
            },
            {
                name: "second-server",
                base: "http://{{env.SECOND_SERVER_HOST}}:4040/mapi/",
                session: {cookie: "other-session-cookie"},
            },
        ],

        // the "vars" map is a Record<string, string | null> of variables and values
        // a value can be a literal value, or if the value contains {{ it is a handlebars expression
        vars: {
            username: "some-user",
            password: "{{env.USER_PASSWORD}}", // grab value from env
            locale: null, // value not set, error if used before assignment
        },
    },
    steps: [
        {
            // name of the step
            step: "auth-account",
            // a comment that describes the step
            comment: "authenticate with login and password",
            server: "my-server", // could be omitted since my-server is the default
            request: {
                // Use the HTTP method as the property name and the URI as the value
                // Supported methods: 
                post: "auth/login", 
                method: "POST", // default method is GET, method can be omitted for GET
                uri: "auth/login", // resulting fetch URL will be http://{{env.PRIMARY_HOST}}:{{env.PRIMARY_PORT}}/mapi/auth/login
                contentType: "application/json", // could be omitted, application/json is the default
                body: {
                    username: "{{username}}", // handlebars syntax for referencing vars declared in init block
                    password: "{{password}}",
                },
            },
            response: {
                status: 200, // could be omitted, 2xx is the default,
                statusClass: "2xx", // enforces that status code is Nxx where 1>=N>=5
                // when the session block is present, a new session will be tracked
                session: {
                    name: "my-session", // required, every session is named
                    // the "from" block says where to extract the session token
                    from: {
                        // although all 3 "from" options shown here,
                        // only one of body, header, cookie can be specified.

                        // find the session token within a JSON response body.
                        // the value here is a JSONPath expression with an implied prefix of $.
                        // so the "session.id" would actually be $.session.id and would grab
                        // a value of "foo" from a response object like { session: { id: "foo" } }
                        body: "session.id",

                        // find the session token in an HTTP response header
                        header: {
                            name: "some-response-header", // name of the response header containing the session token
                        },

                        cookie: {
                            name: "some-cookie-name", // name of the cookie within the Cookie header
                        },
                    },
                },
                // when "vars" block is present, capture variables from response
                vars: {
                    // this is the name of the variable to capture into.
                    // it must be declared above in the init.vars section
                    locale: {
                        // like session.body above, this is a JSONPath expression with an implied $. prefix
                        // the "locale" value below would capture the value "es" from a response body
                        // like { ... , locale: "es", ... }
                        body: "locale",

                        // or could capture from header:
                        // header: {name: "header-name"}

                        // or could capture from cookie:
                        // cookie: {name: "cookie-name"}
                    },
                    account: {
                        // The special body: null means the "account" var will contain the entire body object
                        body: null,
                    },
                },
                // validations occur AFTER variables are captured, so we can use variables
                // in our handlebars expressions. See details description of check evaluation in
                // the next step
                validate: [
                    {
                        id: "captured-correct-locale",
                        check: ["compare locale '==' 'es'"],
                    },
                ],
            },
        },
        {
            step: "get-acct-data",
            comment: "request account data",
            request: {
                // "server" is omitted, first server is default server, that is used
                // "method" is omitted, GET is default

                // the session property below says that the session token captured above
                // as my-session should be used to send the session to the server.
                // the server above declares both 'header' and 'cookie' names, so the request
                // that is ultimately sent will have the session token both in the appropriately
                // named header (session-header) and the other appropriately named cookie (session-cookie-name)
                session: "my-session",

                // a uri is always evaluated as handlebars expression. here we substitute the account.id property
                // from the account object captured above into the uri.
                // If the value of account.id is "foobar", then the final URL for this request will be:
                // http://{{env.PRIMARY_HOST}}:{{env.PRIMARY_PORT}}/mapi/accounts/foobar/info
                uri: "accounts/{{account.id}}/info",
            },
            response: {
                // status and statusClass are omitted, we expect 2xx by default

                // validate section contains an array of validations
                validate: [
                    {
                        // name of the validation check
                        id: "check username is correct",

                        // check is an array of handlebars expressions, the enclosing {{ }} are implied for each.
                        // When evaluated by the engine the check below would be
                        // {{compare body.username '==' username}}
                        // Our handlebars engine does a few things:
                        // The handlebars context is populated with:
                        // 1. the vars declared in the init section, with their current names and values
                        // 2. a "body" variable which is the JSON returned in the response
                        // 3. a "header" object which is a map of response headers as a Record<string, string>
                        //      where any non-alphanumeric characters in the header names are omitted, so
                        //      for example Content-Length becomes ContentLength.
                        //      If the same-named header appears multiple times in the same response, only one of the values will be chosen and the other values ignored.
                        // Further, we add a handlebars helper named compare, that takes 3 arguments:
                        // a first operand, an operator, and a second operand. the helper compares the
                        // first and second operands according to the operator, which can be one of:
                        // == != >= > < <=
                        // As you can see in the second check, an operand can be a literal value.
                        // As you can see in the third check, an operand can be a var name value.
                        // As you can see in the fourth check, an operand can be a header.
                        check: [
                            "compare body.username '==' username",
                            "compare body.locale '==' 'es'",
                            "compare body.locale '==' locale",
                            "compare header.ContentType '==' 'application/json'",
                        ],
                    },
                ],
            },
        },
    ],
};

const results = runZillaScript(exampleScript, {
    env: process.env, // supply environment variables
    init: {} // override init declared within script
});
console.log(`Script results: ${JSON.stringify(results)}`);
```
