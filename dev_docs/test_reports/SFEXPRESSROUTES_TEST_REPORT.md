# SFExpressRoutes Test Report

**Date:** 2026-04-21
**Service:** `SFExpressRoutes` Lambda (AWS SAM)
**Primary integration suite:** `__tests__/test-sfexpressroutes.test.js`
**Additional unit suite:** `__tests__/test-sfexpressroutes-unit.test.js`
**Result:** **26 / 31 integration tests passed ✅**
**Additional unit coverage:** **15 / 15 tests passed ✅**

---

## 1. What Was Tested

Tests were run against a live SAM local environment on `http://localhost:3000` plus a focused unit suite with mocked SF upstream and mail/DB dependencies. The integration suite sent real HTTP requests, asserted on status codes, body shape, and stable `errorKey` values, and exercised the currently enabled live SF token flow.

Current status:

- Core `SFExpressRoutes` authentication, CORS, malformed-body handling, and route safety nets are fully green.
- The live `POST /sf-express-routes/get-token` flow is green and returns a real non-empty bearer token from the configured SF address API integration.
- Request validation for all currently exposed metadata/order/waybill endpoints is covered and green.
- Create-order abuse throttling is covered and returns `429` after repeated attempts from the same client IP.
- The focused unit suite is fully green and covers the major service-failure branches that are not practical to force through the live integration path.
- Five optional tests are intentionally skipped when the required env toggles or live fixture values are not enabled.
- `dev_docs/api_docs/SF_EXPRESS_API.md` and `functions/SFExpressRoutes/CHANGELOG.md` have been reconciled with the tested route map, validation behavior, rate limits, ownership checks, and SF-specific error keys.

### 1.1 Endpoint Coverage

| Endpoint | Method | Tests | Notes |
| --- | --- | --- | --- |
| `/sf-express-routes/get-token` | POST | 8 integration + 2 unit | Auth, response shape, live token retrieval, config failure, upstream failure |
| `/sf-express-routes/create-order` | POST | 5 integration + 2 unit | Validation, rate limiting, DB-owned tempId check skipped, SF API failure handling |
| `/sf-express-routes/get-area` | POST | 2 integration + 1 unit | Validation covered; optional live area-list test skipped |
| `/sf-express-routes/get-netCode` | POST | 3 integration + 1 unit | Validation covered; optional live netCode test skipped |
| `/sf-express-routes/get-pickup-locations` | POST | 2 integration + 1 unit | Validation covered; optional live pickup-location test skipped |
| `/v2/sf-express-routes/print-cloud-waybill` | POST | 2 integration + 3 unit | Validation covered; optional live waybill print skipped |
| Handler / router safety nets | OPTIONS / invalid method | 2 integration + 5 unit | CORS preflight, 405 fallback, authJWT and handler hardening |
| **Total** | | **31 integration + 15 unit** | |

### 1.1.1 Unit Coverage

| Suite | Scope | Tests | Result |
| --- | --- | --- | --- |
| `__tests__/test-sfexpressroutes-unit.test.js` | `functions/SFExpressRoutes/src/services/*`, middleware, handler | 15 | 15 / 15 passed |

### 1.2 Test Categories

#### Happy-path flows

- `POST /sf-express-routes/get-token` returns `200` and a non-empty SF address API bearer token
- Allowed-origin `OPTIONS` preflight returns `204` and does not open the DB connection
- Route safety net returns `405` for unmapped methods

#### Input validation — 400 responses

Every required field and every guard-level business rule currently covered in the suite is asserted individually:

- Malformed JSON body on `POST /sf-express-routes/get-area` → `400 common.invalidJSON`
- Empty body on:
  - `POST /sf-express-routes/create-order`
  - `POST /sf-express-routes/get-pickup-locations`
  - `POST /sf-express-routes/get-area`
  - `POST /sf-express-routes/get-netCode`
  - `POST /v2/sf-express-routes/print-cloud-waybill`
- Missing `lastName` on create-order → `400 sfExpressRoutes.errors.validation.lastNameRequired`
- Missing `phoneNumber` on create-order → `400 sfExpressRoutes.errors.validation.phoneNumberRequired`
- Missing `address` on create-order → `400 sfExpressRoutes.errors.validation.addressRequired`
- Empty `token` on get-area → `400 sfExpressRoutes.errors.validation.tokenRequired`
- Missing `typeId` on get-netCode → `400 sfExpressRoutes.errors.validation.typeIdRequired`
- Missing `areaId` on get-netCode → `400 sfExpressRoutes.errors.validation.areaIdRequired`
- Empty `netCode` array on get-pickup-locations → `400 sfExpressRoutes.errors.validation.netCodeListRequired`
- Empty `waybillNo` on cloud-waybill print → `400 sfExpressRoutes.errors.validation.waybillNoRequired`

#### Business-logic errors — 4xx responses

- Missing Authorization header → `401`
- Garbage Bearer token → `401`
- Expired JWT → `401`
- Tampered JWT signature → `401`
- `alg:none` JWT attack → `401`
- Disallowed CORS preflight origin → `403`
- Repeated create-order attempts from the same IP → `429 common.rateLimited`

#### Authentication & authorisation

- No `Authorization` header → `401`
- Garbage Bearer token → `401`
- Expired JWT → `401`
- Tampered JWT signature → `401`
- `alg:none` JWT attack → `401`
- Allowed-origin auth failures still include CORS headers
- Error responses include `success`, `errorKey`, `error`, and `requestId`
- Middleware attaches identity for valid Bearer tokens
- Middleware supports lowercase `authorization` header names
- JWT bypass is allowed only when explicitly enabled in non-production mode

#### Security hardening

- **CORS enforcement** — disallowed preflight origins are rejected with `403`
- **Malformed JSON rejection** — invalid request bodies are rejected before business logic executes
- **Mass-assignment / unknown field protection** — handler rejects invalid create-order body shape
- **Create-order abuse throttling** — repeated create-order requests are rate-limited with `429`
- **JWT algorithm hardening** — unsigned `alg:none` tokens are rejected with `401`
- **DB bootstrap failure path** — handler returns `500 common.internalError` when DB startup fails
- **Third-party config failure path** — missing `SF_ADDRESS_API_KEY` returns `500 common.internalError`
- **Upstream SF API hardening** — unit tests cover malformed upstream responses, missing waybill data, and cloud-print file absence
- **Email side-effect failure handling** — cloud-waybill email-send failure returns controlled `500`

---

## 2. How Frontend Can Trace Errors

Every error response from SFExpressRoutes follows a fixed shape:

```json
{
  "success": false,
  "errorKey": "common.unauthorized",
  "error": "需要身份驗證，請登入",
  "requestId": "3b1c2d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e"
}
```

### Field Reference

| Field | Type | Purpose |
| --- | --- | --- |
| `success` | `boolean` | Always `false` for errors. Safe to check as a gate. |
| `errorKey` | `string` | Machine-readable dot-notation key. Use this in `switch` / `if` to show custom UI messages or route the user. |
| `error` | `string` | Human-readable translated message in the user's language. Can be displayed directly in a toast or alert. |
| `requestId` | `string` | AWS Lambda request ID. Use this to look up the full execution log in CloudWatch. Present on all errors in production. |

### Frontend Usage Pattern

```js
const res = await fetch("/sf-express-routes/create-order", { method: "POST", body: ... });
const data = await res.json();

if (!data.success) {
  showToast(data.error);
  console.error("[API Error]", data.errorKey, "requestId:", data.requestId);

  if (data.errorKey === "common.unauthorized") {
    redirectToLogin();
  } else if (data.errorKey === "sfExpressRoutes.errors.validation.addressRequired") {
    highlightAddressField();
  }
}
```

### CloudWatch Log Lookup

```text
AWS Console -> CloudWatch -> Log Groups -> /aws/lambda/SFExpressRoutes
  -> Search by requestId value
```

### Error Key Reference Table

The main `errorKey` values verified in the current SFExpressRoutes suites:

| errorKey | Context |
| --- | --- |
| `common.unauthorized` | Missing, expired, malformed, or tampered JWT |
| `common.invalidJSON` | Malformed JSON body |
| `common.missingParams` | Empty or missing request body |
| `common.methodNotAllowed` | Unsupported method / router safety net |
| `common.rateLimited` | Create-order rate limit exhausted |
| `common.internalError` | Internal failure or missing service configuration |
| `sfExpressRoutes.errors.validation.lastNameRequired` | Missing `lastName` on create-order |
| `sfExpressRoutes.errors.validation.phoneNumberRequired` | Missing `phoneNumber` on create-order |
| `sfExpressRoutes.errors.validation.addressRequired` | Missing `address` on create-order |
| `sfExpressRoutes.errors.validation.tokenRequired` | Missing or empty metadata token |
| `sfExpressRoutes.errors.validation.typeIdRequired` | Missing `typeId` |
| `sfExpressRoutes.errors.validation.areaIdRequired` | Missing `areaId` |
| `sfExpressRoutes.errors.validation.netCodeListRequired` | Empty `netCode` array |
| `sfExpressRoutes.errors.validation.waybillNoRequired` | Missing or empty `waybillNo` |
| `sfExpressRoutes.errors.sfApiError` | Upstream SF order API failure |
| `sfExpressRoutes.errors.missingWaybill` | SF order response missing waybill data |
| `sfExpressRoutes.errors.invalidSfResponse` | Malformed SF cloud-waybill response |
| `sfExpressRoutes.errors.missingPrintFile` | Cloud-waybill response missing downloadable file |

---

## 3. Security Measures Verified

| Attack | Mitigation | Verified |
| --- | --- | --- |
| Missing / expired / tampered JWT | `jsonwebtoken.verify()` rejects -> `401` | ✅ |
| `alg:none` JWT bypass | JWT verification rejects unsigned token -> `401` | ✅ |
| Disallowed CORS origin | OPTIONS preflight returns `403` | ✅ |
| Malformed JSON request bodies | Guard rejects invalid JSON before route logic -> `400` | ✅ |
| Empty-body abuse | Guard rejects empty POST bodies -> `400` | ✅ |
| Unknown-field / mass-assignment attempt | Handler rejects invalid create-order payload shape | ✅ |
| Create-order brute-force / abuse | Rate limiter throttles repeated attempts -> `429` | ✅ |
| DB bootstrap failure | Handler returns controlled `500 common.internalError` | ✅ |
| Missing third-party service config | Service returns controlled `500 common.internalError` | ✅ |
| Upstream SF API malformed payload | Service returns structured SF-specific `500` errors | ✅ |
| Cloud-waybill missing file response | Service rejects invalid print payload | ✅ |
| Email side-effect failure in waybill flow | Service returns controlled `500 common.internalError` | ✅ |
| JWT bypass misuse in production | Bypass works only in non-production mode | ✅ |

---

## 4. Test Environment

| Item | Value |
| --- | --- |
| Runtime | Node.js 22 (AWS SAM Local) |
| Test framework | Jest 29.7 (`--runInBand`) |
| Database | Optional MongoDB Atlas integration for specific gated tests |
| External APIs | Live SF address token flow enabled; other live SF metadata / waybill tests gated by env flags |
| SAM command | `sam local start-api --env-vars env.json --warm-containers EAGER` |
| Run command | `npm test -- --runTestsByPath __tests__/test-sfexpressroutes.test.js` and `npm test -- --runTestsByPath __tests__/test-sfexpressroutes-unit.test.js` |

### Latest Verified Results

```text
PASS  __tests__/test-sfexpressroutes.test.js (80.488 s)
Test Suites: 1 passed, 1 total
Tests:       5 skipped, 26 passed, 31 total

PASS  __tests__/test-sfexpressroutes-unit.test.js
Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
```

### Skipped Integration Tests in This Run

The following tests were skipped by design because their enabling env toggles or live fixture values were not active:

- `rejects tempId owned by a different email -> 403`
  Requires `RUN_SFEXPRESS_DB_TESTS=true` and MongoDB-backed fixture setup.
- `returns area list -> 200`
  Requires `RUN_SFEXPRESS_LIVE_TESTS=true`.
- `returns netCode list -> 200`
  Requires `RUN_SFEXPRESS_LIVE_TESTS=true`, `TEST_SF_TYPE_ID`, and `TEST_SF_AREA_ID`.
- `returns pickup locations -> 200`
  Requires `RUN_SFEXPRESS_LIVE_TESTS=true` and `TEST_SF_NET_CODE`.
- `prints configured waybill -> 200`
  Requires `RUN_SFEXPRESS_LIVE_TESTS=true` and `TEST_SF_WAYBILL_NO`.

---

## 5. Documentation Cross-References

- API contract: `dev_docs/api_docs/SF_EXPRESS_API.md`
- Refactor changelog: `functions/SFExpressRoutes/CHANGELOG.md`
- Monorepo refactor reports: `dev_docs/refactor_reports/EN_REFACTOR_REPORT.md` and `dev_docs/refactor_reports/CN_REFACTOR_REPORT.md`
- Refactor inventory status: `dev_docs/LAMBDA_REFACTOR_INVENTORY.md`
