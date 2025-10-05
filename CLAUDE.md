# CLAUDE.md
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
zilla-script is a declarative REST API testing framework.
Tests are defined as JSON/TypeScript objects that describe HTTP requests, response validation, session management, and variable capture.

## Commands

### Build & Development
- `pnpm build` or `pnpm tsc` - Compile TypeScript to ESM in `lib/esm/`
- `pnpm lint` - Run ESLint on source files
- `pnpm lint:fix` - Auto-fix linting issues
- `pnpm prettier` - Check code formatting
- `pnpm prettier:fix` - Auto-fix formatting issues
- `pnpm test` - Run all tests with Mocha (skips if `SKIP_TESTS` env var is set)
- `pnpm release` - Full release pipeline: build, lint, and test

### Testing
Tests use Mocha with Chai assertions. Test files are in `test/` directory with `.spec.ts` extension.
- Run single test: `npx mocha test/specific.spec.ts`
- Tests use tsx for TypeScript execution

## Architecture

### Core Components

**Entry Point** (`src/index.ts`): Exports main types and the `runZillaScript` function.

**Script Engine** (`src/engine.ts`):
- `runZillaScript()` is the main execution entry point
- Merges init blocks from script definition and runtime options
- Evaluates server base URLs as Handlebars templates with env vars
- Delegates step execution to `runScriptSteps()`

**Step Processor** (`src/step.ts`, `src/stepUtil.ts`):
- Processes steps sequentially, handling loops, includes, delays
- Each step can define vars, make requests, capture sessions/vars, and validate responses
- Supports nested scripts via `include` property
- Manages execution context (vars, sessions, server resolution)

**Type System** (`src/types.ts`): Complete type definitions for:
- `ZillaScript`: Top-level script structure with init and steps
- `ZillaScriptStep`: Individual test step with request/response/validation
- `ZillaScriptInit`: Configuration for servers, sessions, vars, handlers
- `ZillaScriptResult`: Execution results with step-by-step outcomes

**Validation & Extraction**:
- `src/helpers.ts`: Handlebars helpers for validation checks (compare, eq, gt, includes, etc.)
- `src/extract.ts`: Extract values from response body (JSONPath), headers, or cookies
- Session and variable captures use JSONPath for body extraction with implied `$.` prefix
- Note: JSONPath expressions use dot-less array syntax (like: "object[index].property"), whereas:
- Validation checks employ handlebars paths where array have dot-ful "object.[index].property" syntax

**Request Handling** (`src/stepUtil.ts`):
- Supports all HTTP methods (GET, POST, PUT, DELETE, etc.)
- Session management via cookies or headers
- Body can be JSON, string, or FormData for file uploads
- Query string support

**Custom Handlers** (`src/handler.ts`, `src/extend.ts`):
- Response handlers can transform/validate responses programmatically
- `zillaHelper()` allows registering custom Handlebars helpers
- Handlers defined in init block, invoked in step's `handlers` array

### Key Concepts

**Variables**: Declared in `init.vars`, can be set/updated in steps, referenced in templates as `{{varName}}`

**Sessions**: Captured from response (body/header/cookie), sent in subsequent requests automatically when referenced

**Servers**: Multiple servers supported; first is default; referenced by name in steps

**Handlebars Templates**: Used throughout for dynamic values. Context includes vars, env, sessions, body, and normalized headers

**Validation Checks**: Array of check expressions evaluated against response. Built-in operators: eq, neq, gt, gte, lt, lte, startsWith, endsWith, includes, empty, null, undefined (and their negations)

**Loops**: Steps can loop over arrays using `loop` property with `items`, `varName`, and nested `steps`

**Includes**: Steps can include other ZillaScript definitions for modularity

### Module Structure
- ESM-only (`"type": "module"` in package.json)
- All imports use `.js` extensions (required for ESM)
- Compiled output: `lib/esm/`
- TypeScript strict mode enabled