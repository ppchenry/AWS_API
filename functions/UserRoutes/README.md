# UserRoutes Lambda

This Lambda handles user, authentication, SMS verification, and NGO-related routes for the application.

## Purpose

The function currently serves multiple API Gateway routes from a single Lambda entry point. The long-term goal is to keep the AWS entry point thin and move business logic into clearly separated modules under `src/`.

## Current State

- `index.js` is still the active Lambda handler and contains most route logic.
- Shared utilities and helpers have started to move into `src/helpers/`, `src/utils/`, and `src/config/`.
- `src/handler.js` and `src/router.js` exist as scaffolding for the next refactor stage, but are not yet wired in.

## High-Level Architecture

The intended architecture for this Lambda is:

1. `index.js` remains the AWS Lambda entry point.
2. `src/handler.js` becomes the thin request orchestrator.
3. `src/router.js` maps API Gateway resource paths and HTTP methods to controllers.
4. Controllers handle request parsing and response shaping.
5. Services contain business logic and database workflows.
6. Helpers and utils provide shared, reusable support functions.

## Folder Structure

```text
UserRoutes/
├── index.js
├── package.json
├── README.md
└── src/
    ├── handler.js
    ├── router.js
    ├── cors.js
    ├── config/
    ├── controllers/
    ├── helpers/
    ├── locales/
    ├── middleware/
    ├── models/
    ├── services/
    └── utils/
```

## Folder Responsibilities

### `src/config/`

Application configuration that should be initialized once and reused.

Current contents:

- `db.js`: MongoDB connection setup, singleton connection reuse, and model registration.

### `src/helpers/`

Shared application helpers that are not business workflows.

Current contents:

- `i18n.js`: loads translations and resolves translation keys.
- `response.js`: standardized HTTP response helpers.
- `duplicateCheck.js`: duplicate detection across Mongoose models.
- `objectUtils.js`: utilities for flattening and filtering update payloads.

### `src/utils/`

Small stateless utilities used across routes.

Current contents:

- `token.js`: refresh token hashing, refresh token generation, and access token generation.
- `validators.js`: email, phone number, date, and image URL validation.

### `src/middleware/`

Cross-cutting request concerns that may be reused by multiple controllers.

Recommended usage:

- auth token parsing and verification
- role checks
- common request normalization

This folder should stay small. Route-specific logic does not belong here.

### `src/models/`

Mongoose schema definitions for the Lambda domain.

Current models:

- `User.js`
- `NGO.js`
- `NgoCounters.js`
- `NgoUserAccess.js`
- `RefreshToken.js`

Models should contain schema definitions, defaults, validation, and indexes. They should not contain route logic.

### `src/controllers/`

HTTP-facing request handlers.

Controllers should:

- read request input from API Gateway events
- validate required request fields
- call services
- return success or error responses using shared response helpers

Controllers should not contain long database workflows.

### `src/services/`

Business logic and multi-step workflows.

Services should:

- talk to Mongoose models
- coordinate multiple model operations
- call external providers such as Twilio
- apply business rules
- return plain data to controllers

Services should not build raw Lambda response objects.

## Request Flow

Target request flow:

```text
API Gateway event
  -> index.js
  -> src/handler.js
  -> src/router.js
  -> controller
  -> service
  -> model/helper/util
  -> standardized response
```

Current request flow is simpler but less maintainable:

```text
API Gateway event
  -> index.js
  -> large if/else route branching
  -> inline business logic
  -> Mongoose models / Twilio / helpers
```

## Shared Patterns Already Introduced

### Database access

- MongoDB uses a singleton Mongoose connection in `src/config/db.js`.
- The connection is reused across warm Lambda invocations in the same runtime.
- `maxPoolSize: 1` is set because each Lambda instance processes one request at a time.

Important note:

The singleton connection only prevents multiple connections inside one warm Lambda runtime. It does not limit total connections across concurrent Lambda instances. Reserved concurrency should be used at the infrastructure level if total connection count must be capped.

### Response handling

- Shared error response handling lives in `src/helpers/response.js`.
- Shared CORS logic lives in `src/cors.js`.
- Future success response standardization should also live in `src/helpers/response.js`.

### Localization

- Translation files live in `src/locales/`.
- `src/helpers/i18n.js` handles language loading and key lookup.

## Route Domains Inside This Lambda

This Lambda currently mixes several domains:

- authentication and registration
- user profile management
- SMS verification
- NGO registration and NGO management

That is why the next refactor step should group logic by domain into controllers and services rather than continuing to grow `index.js`.

## Recommended Refactor Direction

Refactor incrementally instead of rewriting everything at once.

Recommended order:

1. Move common response builders into `src/helpers/response.js`.
2. Move Twilio integration into `src/services/sms.service.js`.
3. Create controller files by domain.
4. Move route workflows from `index.js` into service files.
5. Reduce `index.js` to handler and routing only.
6. Optionally split this monolithic Lambda into multiple Lambdas once boundaries are clear.

## Suggested Domain Split

Recommended controller and service grouping:

- `auth.controller.js` / `auth.service.js`
- `user.controller.js` / `user.service.js`
- `ngo.controller.js` / `ngo.service.js`
- `verification.controller.js` / `sms.service.js`
- `token.service.js` for refresh-token persistence logic

## Development Principles For This Lambda

- Keep the Lambda entry point thin.
- Keep business logic out of controllers.
- Keep helpers stateless where possible.
- Use models only for schema concerns.
- Prefer standardized response builders over inline response objects.
- Add unique indexes in MongoDB for fields that must be globally unique.
- Refactor route-by-route so behavior remains stable during cleanup.

## Environment Variables

This Lambda currently depends on these environment variables:

- `MONGODB_URI`
- `JWT_SECRET`
- `ALLOWED_ORIGINS`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`

## Notes For New Contributors

- Do not add new route logic directly into shared helpers.
- Do not place HTTP response formatting into services.
- Do not place business workflows into models.
- If a new route touches multiple models, it almost certainly belongs in a service.
- If logic depends on `event`, headers, cookies, or status codes, it belongs in a controller or response helper.

## Status

This Lambda is mid-refactor.

The shared support layer is being standardized first so route extraction can happen with lower risk and less duplication.