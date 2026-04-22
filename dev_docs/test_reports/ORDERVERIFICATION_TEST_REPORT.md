# OrderVerification Test Report

**Date:** 2026-04-21
**Service:** `OrderVerification` Lambda (AWS SAM)
**Primary integration suite:** `__tests__/test-orderverification.test.js`
**Result:** **39 / 39 tests passed**

---

## 1. What Was Tested

Tests were run against a live SAM local environment on port `3000` with the OrderVerification Lambda connected to the MongoDB environment configured in `env.json`. The suite sends real HTTP requests for the public route surface and asserts on HTTP status codes, CORS headers, response body fields, machine-readable `errorKey` values, and persisted MongoDB state. One focused handler-level test injects a DB initialization failure to verify `500` response shape and structured error logging.

Current status:

- The main OrderVerification suite is fully green.
- CORS behavior is verified for allowed and disallowed origins.
- JWT middleware rejects missing, expired, tampered, malformed, and `alg:none` tokens.
- `GET /v2/orderVerification/getAllOrders` is now verified as admin/developer-only.
- Supplier-facing flows are verified with DB-backed ownership checks, contact/tag fallback lookup, and `developer` bypass behavior.
- Both update routes now assert persisted DB changes, including normalized phone fields and stored `verifyDate`.
- The tag read flow verifies sanitized output by ensuring `discountProof` is not leaked.
- The frozen `DELETE /v2/orderVerification/{tagId}` route is verified to return `405`.
- Handler-level failure coverage proves `common.internalError` responses include `requestId` and emit structured JSON logs.
- DB-backed tests no longer false-pass on early return when MongoDB setup fails; a configured but unreachable DB now fails the suite.
- WhatsApp notification dispatch is only tested for graceful non-dispatch in this routine suite (`notificationDispatched: false` when the test environment does not provide the outbound token). Live provider delivery is not exercised here.
- `dev_docs/api_docs/PURCHASE_ORDER_API.md` and `functions/OrderVerification/CHANGELOG.md` have been reconciled with the tested route map, request bodies, ownership/RBAC behavior, sanitized response shape, notification behavior, and stable error keys.

### 1.1 Endpoint Coverage

| Endpoint / Area | Method | Tests | Notes |
| --- | --- | --- | --- |
| `/v2/orderVerification/{tagId}` | OPTIONS | 2 | Allowed/disallowed origin checks |
| JWT middleware | Cross-cutting | 8 | Missing, expired, malformed, tampered, `alg:none`, response shape, CORS-on-auth-error |
| Request guard and router | Cross-cutting | 4 | Invalid JSON, empty body, invalid `_id`, frozen delete route |
| `/v2/orderVerification/getAllOrders` | GET | 2 | Admin success plus non-admin rejection |
| `/v2/orderVerification/{tagId}` | GET | 2 | Success plus not-found |
| `/v2/orderVerification/{tagId}` | PUT | 4 | Success, persisted state, invalid date, duplicate orderId, not-found |
| `/v2/orderVerification/supplier/{orderId}` | GET | 6 | Owner success, contact fallback, tag fallback, developer bypass, stranger rejection, not-found |
| `/v2/orderVerification/supplier/{orderId}` | PUT | 4 | Empty multipart, success with persisted state, invalid pendingStatus, stranger rejection |
| `/v2/orderVerification/ordersInfo/{tempId}` | GET | 3 | Owner success, stranger rejection, not-found |
| `/v2/orderVerification/whatsapp-order-link/{_id}` | GET | 3 | Owner success, stranger rejection, not-found |
| Handler failure traceability | Cross-cutting | 1 | Injected DB-init failure -> `500` + structured log |
| **Total** |  | **39** |  |

### 1.2 Test Categories

#### Happy-path flows

- Admin retrieval of latest PTag orders
- Tag lookup by `tagId`
- Tag update with persisted DB verification
- Supplier retrieval by `orderId`
- Supplier retrieval fallback by `contact`
- Supplier retrieval fallback by `tagId`
- Supplier update with persisted DB verification on both `orderVerification` and linked `order`
- Order contact summary lookup
- WhatsApp order-link lookup
- `developer` role bypass on supplier-facing ownership checks

#### Input validation - 400 responses

- Malformed JSON body on `PUT /v2/orderVerification/{tagId}`
- Empty JSON body on `PUT /v2/orderVerification/{tagId}`
- Invalid `_id` format on WhatsApp order-link route, rejected before DB lookup
- Invalid `verifyDate`
- Invalid `pendingStatus` type
- Empty multipart body on supplier update

#### Business-logic errors - 4xx responses

- Non-admin caller on `GET /v2/orderVerification/getAllOrders` -> `403`
- Duplicate `orderId` on tag update -> `409`
- Unknown `tagId` -> `404`
- Unknown supplier identifier -> `404`
- Unknown `tempId` -> `404`
- Valid but non-existent ObjectId on WhatsApp route -> `404`

#### Authentication and authorization

- No `Authorization` header -> `401`
- Expired JWT -> `401`
- Garbage Bearer token -> `401`
- Token without `Bearer ` prefix -> `401`
- Tampered JWT signature -> `401`
- `alg:none` JWT attack -> `401`
- Auth error responses preserve CORS headers for allowed origins
- Non-owner access to supplier/ordersInfo/whatsapp routes -> `403`
- Admin/developer-only list access verified on `getAllOrders`

#### Traceability and failure handling

- Standard error response shape includes `success`, `errorKey`, `error`, and `requestId`
- Injected handler failure returns `500 common.internalError` with `requestId`
- Structured JSON error log is emitted with handler scope, API Gateway request ID, Lambda request ID, and serialized error message

---

## 2. How Frontend Can Trace Errors

Every error response from OrderVerification follows a fixed shape:

```json
{
  "success": false,
  "errorKey": "orderVerification.errors.notFound",
  "error": "Order verification not found",
  "requestId": "3b1c2d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e"
}
```

### Field Reference

| Field | Type | Purpose |
| --- | --- | --- |
| `success` | `boolean` | Always `false` for errors. Safe first gate for UI logic. |
| `errorKey` | `string` | Machine-readable key. Use this for conditional frontend handling. |
| `error` | `string` | Human-readable translated message. Safe to display directly in a toast or alert. |
| `requestId` | `string` | Lambda request ID. Use this to find the execution in CloudWatch. |

### Frontend Usage Pattern

```js
const res = await fetch("/v2/orderVerification/getAllOrders", {
  method: "GET",
  headers: { Authorization: token }
});

const data = await res.json();

if (!data.success) {
  showToast(data.error);
  console.error("[OrderVerification API]", data.errorKey, "requestId:", data.requestId);

  if (data.errorKey === "orderVerification.errors.invalidDate") {
    highlightVerifyDateField();
  } else if (data.errorKey === "common.unauthorized") {
    redirectToLogin();
  }
}
```

### CloudWatch Log Lookup

```text
AWS Console -> CloudWatch -> Log Groups -> /aws/lambda/OrderVerification
  -> Search by requestId value
```

### Error Key Reference Table

The current OrderVerification locale bundle defines the following error keys and English messages:

| errorKey | Default message (en) |
| --- | --- |
| `common.internalError` | Internal server error |
| `common.methodNotAllowed` | Method not allowed |
| `common.invalidJSON` | Invalid JSON body |
| `common.missingParams` | Required parameters are missing |
| `common.unauthorized` | Unauthorized |
| `common.originNotAllowed` | Origin not allowed |
| `common.invalidInput` | Invalid input |
| `orderVerification.errors.missingOrderId` | orderId is required |
| `orderVerification.errors.missingTagId` | tagId is required |
| `orderVerification.errors.missingTempId` | tempId is required |
| `orderVerification.errors.missingVerificationId` | _id is required |
| `orderVerification.errors.invalidVerificationId` | _id is invalid |
| `orderVerification.errors.notFound` | Order verification not found |
| `orderVerification.errors.orderNotFound` | Order info not found |
| `orderVerification.errors.noOrders` | No latest PTag orders found |
| `orderVerification.errors.duplicateOrderId` | Duplicated tag info with OrderId |
| `orderVerification.errors.invalidDate` | Invalid date format |
| `orderVerification.errors.invalidField` | Invalid field value |
| `orderVerification.errors.invalidPendingStatus` | pendingStatus must be a boolean |
| `orderVerification.errors.invalidStaffVerification` | staffVerification must be a boolean |

### Suite Hardening Applied

- DB-backed tests no longer log-and-return as false positives when MongoDB connection or seeding fails.
- The suite now verifies persisted state after both update routes instead of only checking `200` responses.
- The `verifyDate` persistence assertion compares the stored calendar date (`YYYY-MM-DD`) instead of a raw epoch timestamp, avoiding timezone false negatives.
- The local SAM artifact had to be rebuilt during this work so `sam local start-api` served the current `getAllOrders` authorization logic.

---

## 3. Security Measures Verified

| Attack / Risk | Mitigation | Verified |
| --- | --- | --- |
| Disallowed browser origin | CORS allowlist rejects preflight with `403 common.originNotAllowed` | Yes |
| Missing / expired / tampered JWT | `jsonwebtoken.verify()` rejects and returns `401` | Yes |
| `alg:none` JWT bypass | JWT verification pins `HS256` and rejects unsigned token | Yes |
| Unauthorized order list access | `GET /v2/orderVerification/getAllOrders` now rejects non-admin/non-developer callers with `403` | Yes |
| Cross-user supplier data access | DB-backed ownership checks reject non-owner callers with `403` | Yes |
| Overly broad privileged access | `developer` bypass works only on intended privileged path | Yes |
| Malformed JSON | Guard rejects request before service logic with `400 common.invalidJSON` | Yes |
| Invalid WhatsApp `_id` | Guard rejects invalid ObjectId before DB lookup with `400` | Yes |
| Duplicate tag/order linkage | Duplicate `orderId` update is blocked with `409 orderVerification.errors.duplicateOrderId` | Yes |
| Unsupported DELETE route use | Frozen route returns `405 common.methodNotAllowed` | Yes |
| Sensitive field leakage on read | `discountProof` is not exposed on tag lookup response | Yes |
| Silent operational failure | Handler `500` path returns `requestId` and emits structured JSON log entry | Yes |

---

## 4. Test Environment

| Item | Value |
| --- | --- |
| Runtime | Node.js 22 (AWS SAM Local) |
| Test framework | Jest 29.7 (`--runInBand`) |
| Database | MongoDB environment from `env.json` (`OrderVerification` / `OrderVerificationFunction`) |
| External notification | WhatsApp dispatch is not exercised live in this routine suite; test environment verifies graceful skip behavior |
| SAM command | `sam build OrderVerification` then `sam local start-api --env-vars env.json` |
| Run command | `npm.cmd test -- --runTestsByPath __tests__/test-orderverification.test.js` |

### Latest Verified Results

```text
PASS  __tests__/test-orderverification.test.js
Test Suites: 1 passed, 1 total
Tests:       39 passed, 39 total
Time:        67.989 s
```

---

## 5. Documentation Cross-References

- API contract: `dev_docs/api_docs/PURCHASE_ORDER_API.md`
- Refactor changelog: `functions/OrderVerification/CHANGELOG.md`
- Monorepo refactor reports: `dev_docs/refactor_reports/EN_REFACTOR_REPORT.md` and `dev_docs/refactor_reports/CN_REFACTOR_REPORT.md`
- Refactor inventory status: `dev_docs/LAMBDA_REFACTOR_INVENTORY.md`
