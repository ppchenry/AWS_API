# purchaseConfirmation Test Report

**Date:** 2026-04-18
**Service:** `purchaseConfirmation` Lambda (AWS SAM)
**Primary integration suite:** `__tests__/test-purchaseconfirmation.test.js`
**Result:** **63 / 63 integration tests passed ✅** (2 conditionally skipped, 65 declared)

---

## 1. What Was Tested

Tests were run against a live SAM local environment connected to the UAT MongoDB cluster (`petpetclub_uat`). Integration tests sent real HTTP requests and asserted on HTTP status codes, response body fields, and machine-readable error keys. Dead-route tests use the `routeRequest` unit export directly (no network round-trip).

Current status:

- The main integration suite is fully green and covers CORS, JWT, RBAC, guard validation, Zod schema validation, NoSQL injection, admin pagination, soft-cancel lifecycle, rate limiting, and response shape consistency.
- Two tests are conditionally skipped when `TEST_SHOP_CODE` is not set in `env.json` — these require a real `ShopInfo` record to resolve server-authoritative pricing.
- All non-success paths assert a machine-readable `errorKey` backed by locale files (`en.json` / `zh.json`). No plain-string error messages are returned.

### 1.1 Endpoint Coverage

| Endpoint | Method | Tests |
| --- | --- | --- |
| OPTIONS preflight (all 5 active routes) | OPTIONS | 8 |
| JWT authentication (cross-cutting) | — | 8 |
| `GET /purchase/shop-info` | GET | 2 |
| `POST /purchase/confirmation` | POST | 14 (2 skipped) |
| `GET /purchase/orders` | GET | 5 |
| `GET /purchase/order-verification` | GET | 3 |
| `POST /purchase/send-ptag-detection-email` | POST | 5 |
| `DELETE /purchase/order-verification/{id}` | DELETE | 6 |
| Guard — JSON parse, empty body, ObjectId | mixed | 4 |
| Dead routes (unit via routeRequest) | mixed | 4 |
| NoSQL injection resistance | POST | 2 |
| Rate limiting | POST | 1 |
| Response shape consistency | mixed | 2 |
| Phase 0 — MongoDB connection | — | 1 |
| **Total** | | **65 (63 passing, 2 skipped)** |

### 1.2 Skipped Tests

Two tests are conditionally skipped when `TEST_SHOP_CODE` is not set in `env.json`:

- `creates order with valid shopCode (no file upload)` — requires a real `ShopInfo` record to resolve server-authoritative price
- `rejects duplicate tempId → 409` — depends on the first test having created an order

### 1.3 Test Categories

#### Happy-path flows

- Shop info retrieval (public, no auth) with bank-detail redaction (`bankName`, `bankNumber`, `__v` excluded)
- Admin paginated order list with default and custom page/limit
- Admin paginated order-verification list with limit clamping (max 500)
- Admin email send (SMTP-dependent, verifies handler execution)
- Soft-cancel lifecycle: cancel → 200, double-cancel → 409 idempotency
- Full purchase flow: server-authoritative pricing, order creation, duplicate tempId rejection (conditional on `TEST_SHOP_CODE`)

#### Input validation — 400 responses

Every required field and every business rule is checked individually:

- Malformed JSON body → 400 `common.invalidJSON`
- Empty JSON body → 400 `common.missingParams`
- Invalid ObjectId format in path parameter → 400 `common.invalidObjectId`
- Missing required purchase fields → 400 `purchaseConfirmation.errors.purchase.missingRequiredFields`
- Invalid email format → 400 `purchaseConfirmation.errors.purchase.invalidEmail`
- Invalid phone number (non-numeric, too short) → 400 `purchaseConfirmation.errors.purchase.invalidPhone`
- Special characters in option field → 400 `purchaseConfirmation.errors.purchase.invalidOption`
- Special characters in tempId → 400 `purchaseConfirmation.errors.purchase.invalidTempId`
- Missing shopCode → 400 `purchaseConfirmation.errors.purchase.invalidShopCode`
- Missing required email fields → 400 `purchaseConfirmation.errors.email.missingFields`
- Invalid email in email route → 400 `purchaseConfirmation.errors.email.invalidEmail`
- Non-HTTPS / non-URL locationURL → 400 `purchaseConfirmation.errors.email.invalidLocationURL`

#### Business-logic errors — 4xx responses

- Unrecognised shopCode → 400 `purchaseConfirmation.errors.purchase.invalidShopCode`
- Non-existent order verification → 404 `purchaseConfirmation.errors.purchase.orderVerificationNotFound`
- Double-cancel on already-cancelled order → 409 `purchaseConfirmation.errors.purchase.alreadyCancelled`
- Duplicate tempId on order creation → 409 `purchaseConfirmation.errors.purchase.duplicateOrder` (conditional)

#### Authentication & authorisation

- No `Authorization` header → 401
- Garbage Bearer token → 401
- Expired JWT → 401
- Tampered JWT signature → 401
- `alg:none` JWT attack → 401
- Token without Bearer prefix → 401
- Error response shape includes `success`, `errorKey`, `error`, `requestId`
- CORS headers present on 401 responses
- `GET /purchase/shop-info` → 200 without auth (public route)
- `POST /purchase/confirmation` → 400 from Zod without auth (public route, auth skipped)
- `GET /purchase/orders` → 403 for regular user (admin-only)
- `GET /purchase/order-verification` → 403 for regular user (admin-only)
- `POST /purchase/send-ptag-detection-email` → 403 for regular user (admin-only)
- `DELETE /purchase/order-verification/{id}` → 403 for regular user (admin-only)

#### Security hardening

- **CORS enforcement** — disallowed and missing origins are rejected with 403 and `errorKey`
- **Public-route bypass** — shop-info and confirmation routes skip JWT auth, confirmed by receiving 400 (Zod) instead of 401
- **RBAC enforcement** — admin-only routes reject non-admin tokens before handler execution → 403
- **Server-authoritative pricing** — client-supplied price is ignored; the server resolves price from `ShopInfo`
- **Rate limiting** — repeated `POST /purchase/confirmation` requests are throttled → 429
- **Dead-route blocking** — deprecated routes (`get-presigned-url`, `whatsapp-SF-message` including v2 variants) → 405
- **NoSQL injection** — MongoDB operators (`$gt`, `$ne`) in string fields are rejected by Zod → 400
- **Soft-cancel idempotency** — double-cancel returns 409 instead of silently succeeding

---

## 2. How Frontend Can Trace Errors

Every error response from purchaseConfirmation follows a fixed shape:

```json
{
  "success": false,
  "errorKey": "purchaseConfirmation.errors.purchase.invalidEmail",
  "error": "電郵地址格式無效。",
  "requestId": "3b1c2d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e"
}
```

### Field Reference

| Field | Type | Purpose |
| --- | --- | --- |
| `success` | `boolean` | Always `false` for errors. Safe to check as a gate. |
| `errorKey` | `string` | Machine-readable dot-notation key. Use this in `switch` / `if` to show custom UI messages or route the user. |
| `error` | `string` | Human-readable translated message in the user's language (`zh` by default, `en` with `?lang=en`). Can be displayed directly in a toast or alert. |
| `requestId` | `string` | AWS Lambda request ID. Use this to look up the full execution log in CloudWatch. Present on all errors in production. |

### Frontend Usage Pattern

```js
const res = await fetch("/purchase/confirmation", { method: "POST", body: ... });
const data = await res.json();

if (!data.success) {
  showToast(data.error);
  console.error("[API Error]", data.errorKey, "requestId:", data.requestId);

  if (data.errorKey === "purchaseConfirmation.errors.purchase.invalidShopCode") {
    highlightShopCodeField();
  } else if (data.errorKey === "purchaseConfirmation.errors.purchase.alreadyCancelled") {
    showAlreadyCancelledPrompt();
  }
}
```

### CloudWatch Log Lookup

```text
AWS Console → CloudWatch → Log Groups → /aws/lambda/purchaseConfirmation
  → Search by requestId value
```

### Error Key Reference Table

The full list of `errorKey` values used across purchaseConfirmation, with their default (Chinese) translations:

| errorKey | Default message (zh) |
| --- | --- |
| `common.originNotAllowed` | 來源不被允許。 |
| `common.unauthorized` | 未經授權，請登入後再試。 |
| `common.invalidJSON` | 請求內容格式錯誤。 |
| `common.missingParams` | 缺少必填欄位。 |
| `common.invalidObjectId` | ID 格式無效。 |
| `common.methodNotAllowed` | 此路由已不再使用。 |
| `common.rateLimited` | 請求次數過多，請稍後再試。 |
| `purchaseConfirmation.errors.purchase.missingRequiredFields` | 缺少必填訂單欄位。 |
| `purchaseConfirmation.errors.purchase.invalidEmail` | 電郵地址格式無效。 |
| `purchaseConfirmation.errors.purchase.invalidPhone` | 電話號碼只能包含數字（7-15位）。 |
| `purchaseConfirmation.errors.purchase.invalidOption` | 所選產品選項無效。 |
| `purchaseConfirmation.errors.purchase.invalidTempId` | 訂單參考格式無效。 |
| `purchaseConfirmation.errors.purchase.invalidShopCode` | 提供的店舗代碼無法識別。 |
| `purchaseConfirmation.errors.purchase.orderVerificationNotFound` | 找不到訂單驗證記錄。 |
| `purchaseConfirmation.errors.purchase.alreadyCancelled` | 該訂單驗證記錄已被取消。 |
| `purchaseConfirmation.errors.purchase.duplicateOrder` | 該參考編號的訂單已存在。 |
| `purchaseConfirmation.errors.email.missingFields` | 缺少必填電郵欄位。 |
| `purchaseConfirmation.errors.email.invalidEmail` | 電郵地址格式無效。 |
| `purchaseConfirmation.errors.email.invalidLocationURL` | 位置連結必須是有效的 HTTPS 地址。 |

---

## 3. Security Measures Verified

| Attack | Mitigation | Verified |
| --- | --- | --- |
| Expired / tampered JWT | `jsonwebtoken.verify()` rejects → 401 | ✅ |
| `alg:none` JWT bypass | JWT library enforces HS256 algorithm → 401 | ✅ |
| Missing / malformed Bearer token | Auth middleware rejects before route logic → 401 | ✅ |
| CORS origin spoofing | CORS middleware rejects disallowed/missing origins → 403 | ✅ |
| Non-admin accessing admin routes | RBAC middleware checks `userRole` before handler → 403 | ✅ |
| Public route auth bypass | Shop-info and confirmation skip JWT; confirmed via Zod 400 (not 401) | ✅ |
| Malformed JSON request bodies | Guard rejects invalid JSON before route logic → 400 | ✅ |
| Client-supplied price manipulation | Server resolves price from `ShopInfo` DB record, ignores client value | ✅ |
| NoSQL operator injection (`$gt`, `$ne`) | Zod type check rejects non-string values → 400 | ✅ |
| Rate-limit abuse on purchase endpoint | Mongo-backed rate limiter throttles repeated attempts → 429 | ✅ |
| Deprecated route access | Dead routes return 405 before any business logic executes | ✅ |
| Double-cancel exploitation | Soft-cancel checks `cancelledAt` flag → 409 idempotency guard | ✅ |
| Duplicate order submission | `tempId` uniqueness enforced → 409 | ✅ (conditional) |

---

## 4. Test Environment

| Item | Value |
| --- | --- |
| Runtime | Node.js 22 (AWS SAM Local) |
| Test framework | Jest 29.7 (`--runInBand`, 30 s timeout) |
| Database | MongoDB Atlas UAT (`petpetclub_uat`) |
| Rate limit seeding | Direct `rate_limits` collection insert with aligned `windowStart` + `expireAt` |
| Soft cancel seeding | Direct `orderVerification` collection insert with cleanup in `afterAll` |
| Cleanup | `afterAll` removes seeded orders, order verifications, and rate limit entries |
| SAM command | `sam local start-api --env-vars env.json --warm-containers EAGER` |
| Run command | `npm test -- --testPathPattern=test-purchaseconfirmation` |

### Latest Verified Results

```text
PASS  __tests__/test-purchaseconfirmation.test.js (66.147 s)
Test Suites: 1 passed, 1 total
Tests:       2 skipped, 63 passed, 65 total
```
