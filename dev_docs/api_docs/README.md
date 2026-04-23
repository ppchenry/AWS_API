# PetPetClub API Docs — Index

This directory contains domain-based API reference documentation for the PetPetClub Lambda monorepo. Each doc is scoped to a business domain so that frontend engineers (and their LLM assistants) can pick up exactly the endpoints they need without wading through the entire platform.

All docs follow the same conventions (see [Global Conventions](#global-conventions) below).

## Base URLs

| Environment | URL |
| --- | --- |
| **Development (AWS API Gateway)** | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev` |
| **Production (AWS API Gateway)** | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production` |
| **Local SAM Testing** | `http://localhost:3000` |

All deployed endpoints are in region `ap-southeast-1`. Refresh-token cookie `Path` attributes are stage-aware (`/auth/refresh` locally, `/Dev/auth/refresh` or `/Production/auth/refresh` when deployed).

## Domain Docs

| Doc | Scope |
| --- | --- |
| [AUTH_FLOW_API.md](./AUTH_FLOW_API.md) | Verification-first login / register / refresh |
| [ACCOUNT_API.md](./ACCOUNT_API.md) | User profile CRUD, image updates, self-delete |
| [NGO_ADMIN_API.md](./NGO_ADMIN_API.md) | NGO registration, user-list, NGO profile editing |
| [PET_PROFILE_API.md](./PET_PROFILE_API.md) | Pet creation, basic info, pet lists, tag lookup, eye-log |
| [PET_DETAIL_INFO_API.md](./PET_DETAIL_INFO_API.md) | Detail info, transfers, NGO transfer, source/origin records |
| [PET_ADOPTION_API.md](./PET_ADOPTION_API.md) | Owner-side adoption placement records + public adoption listing |
| [PET_HEALTH_API.md](./PET_HEALTH_API.md) | Medical, medication, deworm, vaccine, blood test records |
| [PET_LOST_FOUND_API.md](./PET_LOST_FOUND_API.md) | Lost / found posts and user notifications |
| [MEDIA_UPLOAD_API.md](./MEDIA_UPLOAD_API.md) | Image uploads, pet-with-image creation, eye analysis, breed analysis |
| [PET_BIOMETRICS_API.md](./PET_BIOMETRICS_API.md) | Face/nose biometric registration and verification |
| [PURCHASE_ORDER_API.md](./PURCHASE_ORDER_API.md) | PTag purchase checkout, shop info, order-verification admin + supplier flows |
| [SF_EXPRESS_API.md](./SF_EXPRESS_API.md) | SF Express order creation, address / pickup, cloud waybill printing |

---

## Global Conventions

The following rules apply to every endpoint across all domain docs. Only deviations from these rules are documented per-endpoint.

### API Gateway Requirements

Every request to a deployed stage must include a valid API Gateway API key:

```http
x-api-key: <api-gateway-api-key>
```

Missing / invalid key → API Gateway returns `403 Forbidden` **before** the Lambda runs. Local SAM does not enforce this header.

### Required Request Headers

| Scenario | Headers |
| --- | --- |
| Deployed API Gateway | `Content-Type: application/json` + `x-api-key: <key>` |
| Local SAM | `Content-Type: application/json` |
| Protected route | Add `Authorization: Bearer <access-token>` |
| Multipart upload | Replace `Content-Type` with `multipart/form-data; boundary=...` (framework-set) |
| Refresh token | `Cookie: refreshToken=<token>` (no Bearer needed) |

### Authentication

| Type | Mechanism |
| --- | --- |
| **Public** | No `Authorization` needed. If a valid JWT is present, `event.userId` is populated (used for optional linking/ownership flows). |
| **Protected** | `Authorization: Bearer <access-token>` required. Missing/invalid token → `401` with `errorKey: "common.unauthorized"`. |
| **Refresh** | Authenticates via `Cookie: refreshToken=...` only. |

Access tokens use HS256, 15-minute expiry. JWT payload attaches `userId`, `userEmail`, `userRole`, optionally `ngoId` onto the Lambda event.

**Roles**: `user`, `ngo`, `admin`, `developer`. `admin` and `developer` are **privileged roles** and bypass most ownership checks.

### Success Response Shape

All 2xx responses are JSON objects starting with `success: true`. Additional fields are endpoint-specific.

```json
{
  "success": true,
  "message": "optional localized success message",
  "...": "endpoint-specific fields (e.g., form, pets, userId)"
}
```

### Error Response Shape

All 4xx / 5xx responses share this shape:

```json
{
  "success": false,
  "errorKey": "<domain>.errors.<specificError>",
  "error": "Localized message (zh by default)",
  "requestId": "aws-lambda-request-id"
}
```

| Field | Purpose |
| --- | --- |
| `success` | Always `false` |
| `errorKey` | Machine-readable dot-notation key for UI branching / test assertions. **Stable across localizations.** |
| `error` | Localized message (zh default, en via `?lang=en`) |
| `requestId` | `context.awsRequestId` — use for CloudWatch lookup |

#### errorKey naming convention

All errorKeys follow the namespaced dot-notation scheme introduced in the locale standardization refactor:

| Scope | Shape | Example |
| --- | --- | --- |
| Cross-cutting | `common.<leaf>` | `common.unauthorized`, `common.invalidJSON` |
| Endpoint-specific error | `<lambdaDomainCamel>.errors.<leaf>` | `emailVerification.errors.codeExpired`, `petDetailInfo.errors.petNotFound` |
| Endpoint-specific success | `<lambdaDomainCamel>.success.<leaf>` | `petBasicInfo.success.retrievedSuccessfully`, `petVaccineRecords.success.created` |

`<lambdaDomainCamel>` is the camelCase form of the Lambda's name (e.g., `PetDetailInfo` → `petDetailInfo`, `SFExpressRoutes` → `sfExpressRoutes`, `purchaseConfirmation` stays `purchaseConfirmation`). UserRoutes groups its verification-related keys under `userRoutes.errors.verification.*` and `userRoutes.errors.phoneRegister.*` for nested concerns.

### Common Error Keys (cross-cutting)

| `errorKey` | Typical Status | Meaning |
| --- | --- | --- |
| `common.unauthorized` | 401 / 403 | Missing / invalid JWT, or self-access / role check failed |
| `common.forbidden` | 403 | Non-owner access to a protected resource |
| `common.invalidJSON` | 400 | Request body is not valid JSON |
| `common.missingParams` | 400 | Required body or required fields missing |
| `common.invalidInput` | 400 | Body failed Zod / schema validation |
| `common.invalidPathParam` | 400 | Path parameter failed format / length validation |
| `common.invalidObjectId` | 400 | Path parameter is not a valid Mongo ObjectId / UUID |
| `common.methodNotAllowed` | 405 | Route not configured for this method (disabled endpoint) |
| `common.rateLimited` | 429 | Rate limit exceeded for this action / user / IP |
| `common.originNotAllowed` | 403 | Request Origin is not in the CORS allowlist |
| `common.notFound` | 404 | Generic not-found (non-domain-specific) |
| `common.internalError` | 500 | Unhandled server error — inspect CloudWatch by `requestId` |
| `common.serviceUnavailable` | 503 | Upstream third-party service (SMS, FaceID, email, etc.) failed |

### Known Issues

- Some multipart/form-data routes in the refactored Lambda set do not yet normalize malformed multipart parse failures into a stable `400` error response. In those affected routes, a broken multipart body may currently fall through to `500` with `errorKey: "common.internalError"` instead of a client-facing parse error key.
- `SFExpressRoutes` also has a known upstream-response parsing gap: if SF returns invalid JSON in certain flows, the response may currently fall through to `500` with `errorKey: "common.internalError"` instead of `sfExpressRoutes.errors.invalidSfResponse`.
- The current tracked remediation list lives in [`dev_docs/TODO.md`](../TODO.md).

### Localization

Error / success messages are localized. Language selection priority:

1. Query param `?lang=en|zh`
2. `Cookie: language=en|zh`
3. Body field `lang` (POST/PUT)
4. Default: `zh` (Traditional Chinese)

`errorKey` is **always stable regardless of language** — use it for programmatic logic, not `error`.

### Dates

- Input date strings are in **`DD/MM/YYYY`** format unless noted otherwise (e.g., `/account/register` uses ISO for `birthday`).
- Stored / returned dates are ISO 8601 in JSON responses.

### Pagination

List endpoints follow these conventions unless explicitly overridden:

| Query Param | Default | Notes |
| --- | --- | --- |
| `page` | `1` | 1-indexed (floor at 1) |
| `limit` | varies per endpoint (10 / 30 / 50 / 100) | Some endpoints have a fixed page size |
| `search` | — | Case-insensitive regex across allowlisted fields |
| `sortBy` | `updatedAt` | Allowlisted fields only |
| `sortOrder` | `desc` | `asc` or `desc` |

Response envelope varies slightly per endpoint (`total` / `totalDocs` / `totalResult`, `currentPage` / `page`, `perPage` / `limit`, or a `pagination: { page, limit, total }` sub-object). Exact shape is documented per endpoint.

### Soft Deletes

Deletes are **soft** (set `deleted: true` / `isDeleted: true`). Deleted resources return `404` to clients — soft state is never exposed.

### CORS

Allowed origins are configured per-environment via `ALLOWED_ORIGINS`. Browsers must use one of the allowlisted origins. Preflight `OPTIONS` returns `204` with CORS headers. Disallowed origins on an `OPTIONS` request get `403`.

### Rate Limiting

Rate limits are per-endpoint and per-caller (keyed by `userId`, `email`, IP, or tag depending on the endpoint). When exceeded, the API returns `429 common.rateLimited`. Specific limits are documented per endpoint.

### Refresh Cookie

When a login / register endpoint issues tokens, it also sets an `HttpOnly`, `Secure`, `SameSite=Strict` cookie named `refreshToken`. See [AUTH_FLOW_API.md](./AUTH_FLOW_API.md#post-authrefresh) for full cookie contract.
