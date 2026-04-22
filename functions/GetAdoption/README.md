# GetAdoption Lambda

This Lambda owns public adoption listing and adoption detail retrieval.

## Current Status

The active AWS entrypoint is `index.js`, which delegates to `src/handler.js`.

Request lifecycle:

```text
API Gateway event
  -> index.js
  -> src/handler.js              (OPTIONS, public-route gate, guard, DB, router, catch-all)
  -> src/cors.js                 (OPTIONS preflight)
  -> src/middleware/authJWT.js   (loaded for future protected routes, not invoked for current public routes)
  -> src/middleware/guard.js     (locale, page/search validation, ObjectId validation)
  -> src/config/db.js
  -> src/router.js
  -> src/services/adoption.js    (list/detail reads)
  -> src/utils/response.js
```

## Folder Structure

```text
GetAdoption/
├── index.js
├── package.json
├── API.md
├── CHANGELOG.md
├── README.md
├── models/
│   ├── Adoption.js
│   └── AdoptionRecord.js
└── src/
    ├── handler.js
    ├── router.js
    ├── cors.js
    ├── config/
    │   ├── db.js
    │   └── env.js
    ├── locales/
    │   ├── en.json
    │   └── zh.json
    ├── middleware/
    │   ├── authJWT.js
    │   └── guard.js
    ├── services/
    │   └── adoption.js
    ├── utils/
    │   ├── i18n.js
    │   ├── logger.js
    │   ├── response.js
    │   ├── sanitize.js
    │   └── validators.js
    └── zodSchema/
        └── envSchema.js
```

## Active Modules

### `src/config/`

- `env.js`: validates `NEW_MONGODB_URI`, `JWT_SECRET`, `JWT_BYPASS`, `ALLOWED_ORIGINS`, and `NODE_ENV` at startup via Zod
- `db.js`: singleton Mongoose connection with `maxPoolSize: 1`; registers the `Adoption` model against the `adoption_list` collection

### `src/middleware/`

- `authJWT.js`: retained for future protected routes, with HS256-pinned verification and non-production `JWT_BYPASS`; current public routes do not call it
- `guard.js`: validates locale, adoption id format, pagination, search length, and list filter normalization before the DB connection opens

### `src/services/`

- `adoption.js`: builds list filters, performs paginated list aggregation, performs detail lookup by `_id`, and returns standardized success or error responses

### `src/utils/`

- `response.js`: `createErrorResponse()` translates error keys server-side and merges CORS headers; `createSuccessResponse()` returns the success envelope and merges CORS headers
- `sanitize.js`: removes `__v` and temporary computed fields from response payloads as defense in depth
- `validators.js`: ObjectId validation, CSV normalization, positive integer parsing, and regex escaping
- `logger.js`: structured JSON logging
- `i18n.js`: locale loading and translation lookup

## Routing Model

`src/router.js` dispatches by exact `{HTTP_METHOD} {event.resource}` key.

Supported routes:

| Method | Resource | Handler |
| --- | --- | --- |
| `GET` | `/adoption` | `adoption.getAdoptionList` |
| `GET` | `/adoption/{id}` | `adoption.getAdoptionById` |

All other method/resource combinations return `405 others.methodNotAllowed`.

## Current Behavior Notes

- Both supported routes are public and read-only
- The handler skips JWT middleware entirely for current public resources, so bearer tokens and `JWT_BYPASS=true` do not mutate `event.user` or `event.userId`
- Validation runs before MongoDB access, so malformed ids and invalid list filters fail without touching the database
- Public read queries now use explicit field projection instead of relying only on response sanitization
- List responses preserve the website-facing fields `_id`, `Name`, `Age`, `Sex`, `Breed`, `Image_URL`, `maxPage`, and `totalResult`
- Detail responses preserve the website-facing fields `_id`, `Name`, `Age`, `Sex`, `Breed`, `Image_URL`, `Remark`, `AdoptionSite`, and `URL`
- Disallowed or missing preflight origins return `403 others.originNotAllowed` through the shared translated error-response path
- Error responses include translated `error` text and `requestId` when available

## Testing Baseline

Focused unit suite: `__tests__/test-getadoption-unit.test.js`

Current focused coverage:

- CORS preflight allow/deny behavior
- Guard handling for invalid id, invalid page, and normalized list filters
- Router `405` for removed POST behavior
- Handler confirmation that public routes bypass JWT middleware entirely
- Service-level query building, list response shaping, and detail `404`

Verified on `2026-04-22`:

- `10 passed` in `__tests__/test-getadoption-unit.test.js`

To run:

```bash
npm test -- --runInBand __tests__/test-getadoption-unit.test.js
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `NEW_MONGODB_URI` | Yes | MongoDB connection string used by the current GetAdoption deployment |
| `JWT_SECRET` | Yes | Required by the retained JWT middleware module, even though current public routes do not invoke it |
| `ALLOWED_ORIGINS` | Yes | Comma-separated list of allowed CORS origins |
| `JWT_BYPASS` | No | Non-production JWT bypass flag for future protected routes; no effect on current public routes |
| `NODE_ENV` | No | `development`, `production`, or `test`; defaults to `development` |

## Deferred Follow-Up

- Reconcile `models/Adoption.js` with the actual field shape queried from `adoption_list`
- Plan a compatibility-reviewed rename from `NEW_MONGODB_URI` to the monorepo baseline `MONGODB_URI`