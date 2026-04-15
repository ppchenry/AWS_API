# New Lambda Baseline Guide

This document is the minimum standard for any new Lambda added to this repo.

It is intentionally not the full UserRoutes pattern.

The goal is simple:

- do not write new Lambdas in the old all-in-one style
- split the code into small modules
- use a router when one Lambda serves multiple endpoints

If you follow this document, we should not need another cleanup pass just to pull routing and business logic out of a giant legacy handler.

## What Is Required

For new Lambdas, the baseline is:

1. Keep `index.js` thin.
2. Put request orchestration in `src/handler.js`.
3. Put route matching in `src/router.js`.
4. Put business logic in `src/services/`.
5. Keep helper code in small focused files instead of one giant file.

That is the baseline.

You do **not** need to copy every extra pattern from `UserRoutes`.

## Why

The legacy pattern makes each Lambda harder to review, harder to test, and harder to change safely.

The problem is not only code size. The problem is mixed responsibilities:

- route matching
- input parsing
- database setup
- business logic
- response formatting

When all of that lives in one file, every later change becomes refactor work.

## Copy This Structure

For a new Lambda, start here:

```text
functions/MyNewLambda/
├── index.js
├── package.json
└── src/
    ├── handler.js
    ├── router.js
    ├── services/
    │   ├── createThing.js
    │   └── getThing.js
    ├── utils/
    │   └── response.js
    ├── config/
    │   └── db.js          # only if this Lambda needs DB access
    ├── models/            # only if this Lambda owns models
    └── locales/           # only if this Lambda uses i18n
```

Do not add folders just because another Lambda has them.

Add folders only when the Lambda actually needs them.

## Minimum Request Flow

Use this flow:

1. `index.js` delegates to `src/handler.js`
2. `handler.js` does the top-level request flow
3. `router.js` maps the route to a service
4. the service returns the response

That is enough structure to keep the Lambda readable.

That means:

- `index.js` should not contain business logic
- `handler.js` should not contain route-specific business logic
- `router.js` should not contain database queries
- `services/` should not become one new giant file

## File Responsibilities

### `index.js`

Keep it tiny.

```js
const { handleRequest } = require("./src/handler");

exports.handler = async (event, context) => {
  return handleRequest(event, context);
};
```

Nothing else belongs here.

### `src/handler.js`

This file is for top-level orchestration only.

Typical responsibilities:

- set `context.callbackWaitsForEmptyEventLoop = false`
- attach request metadata if needed
- open DB connection if needed
- call `routeRequest(...)`
- catch unexpected errors and return a consistent error response

What should not live here:

- route-specific branching with long `if/else` chains
- business logic for specific endpoints
- big inline database operations for one route
- hundreds of lines of mixed logic because it was faster in the moment

### `src/router.js`

If the Lambda serves multiple endpoints, use a route map.

Match on:

```text
${event.httpMethod} ${event.resource}
```

That is the pattern already used in `UserRoutes`.

Example:

```js
const { createErrorResponse } = require("./utils/response");

function lazyRoute(modulePath, exportName) {
  return async function routeHandler(ctx) {
    const service = require(modulePath);
    return await service[exportName](ctx);
  };
}

const routes = {
  "POST /things": lazyRoute("./services/createThing", "createThing"),
  "GET /things/{thingId}": lazyRoute("./services/getThing", "getThing"),
};

async function routeRequest(routeContext) {
  const { event } = routeContext;
  const routeKey = `${event.httpMethod} ${event.resource}`;
  const routeAction = routes[routeKey];

  if (!routeAction) {
    return createErrorResponse(405, "others.methodNotAllowed", event);
  }

  return await routeAction(routeContext);
}

module.exports = { routeRequest };
```

If the Lambda truly has only one endpoint and will stay that way, a router is optional.

If one Lambda handles multiple endpoints, use the router.

### `src/services/`

Each service file should own route behavior or one small domain area.

Good examples:

- `services/createThing.js`
- `services/getThing.js`
- `services/user.js`
- `services/register.js`

Bad examples:

- putting every endpoint into `handler.js`
- creating one `services/main.js` file that turns into another monolith

The point is not to create many files for no reason.

The point is to stop route logic and business logic from collapsing back into one place.

If a file is heading toward 1000 lines, the structure has already failed.

## Simple Starter Template

### `src/handler.js`

```js
const { createErrorResponse } = require("./utils/response");
const { routeRequest } = require("./router");

async function handleRequest(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  event.awsRequestId = context.awsRequestId;

  try {
    return await routeRequest({ event });
  } catch (error) {
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { handleRequest };
```

### `src/services/getThing.js`

```js
const { createSuccessResponse } = require("../utils/response");

async function getThing({ event }) {
  const thingId = event.pathParameters?.thingId;

  return createSuccessResponse(200, event, {
    success: true,
    thingId,
  });
}

module.exports = { getThing };
```

### `src/utils/response.js`

```js
function createSuccessResponse(statusCode, event, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  };
}

function createErrorResponse(statusCode, errorKey, event) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      success: false,
      errorKey,
      requestId: event?.awsRequestId,
    }),
  };
}

module.exports = {
  createSuccessResponse,
  createErrorResponse,
};
```

## Rules That Matter Most

Follow these rules even if you ignore everything else:

1. Do not put all endpoints in one handler file.
2. Do not do route matching with giant `if/else` blocks when a Lambda has multiple routes.
3. Do not bury business logic inside `index.js` or `handler.js`.
4. Do not mix unrelated workflows in one huge service file if they can be split cleanly.
5. If the same Lambda owns multiple endpoints, route first, then run the service for that route.

## What Is Optional

Anything beyond the core `index.js` / `handler.js` / `router.js` / `services/` split is optional.

Add extra modules only when they actually help keep the Lambda small and readable.

The required part is the structure.

## Use UserRoutes As The Reference

When in doubt, follow the overall shape of `functions/UserRoutes`:

- thin entrypoint
- handler for orchestration
- router for dispatch
- services for route behavior
- small supporting modules only where needed

Do not copy all of UserRoutes blindly.

Copy the separation of responsibilities.

## PR Check Before Merge

Before opening or merging a PR for a new Lambda, confirm:

1. Is `index.js` only delegating to the real handler?
2. If the Lambda has multiple endpoints, is there a `src/router.js` route map?
3. Is route-specific logic living in `src/services/` instead of the handler?
4. Are helper functions grouped into small focused modules instead of one giant file?
5. Is the Lambda still obviously modular, or is it quietly turning back into a monolith?

If the answer is yes, the Lambda meets the baseline.